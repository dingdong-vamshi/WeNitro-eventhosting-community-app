-- A single named cron job dispatches explicit-recipient in-app campaigns, never external provider drafts.
alter table private.admin_workspace_documents add column scheduled_at timestamptz,add column last_error text;
create function private.deliver_workspace_campaign(p_id uuid,p_version integer,p_reason text,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;recipient integer;total integer:=0;
begin
 if p_actor is null then raise exception 'Campaign actor required';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 select * into campaign from private.admin_workspace_documents where id=p_id and kind='campaign' for update;
 if not found or campaign.archived then raise exception 'Campaign unavailable';end if;
 if campaign.status='sent' then return to_jsonb(campaign);end if;
 if p_version is null or campaign.version<>p_version then raise exception 'Campaign changed. Reload before sending.' using errcode='40001';end if;
 if campaign.payload->>'channel'<>'in_app' then raise exception 'External campaign delivery provider is not configured. The draft is preserved.';end if;
 for recipient in select distinct value::integer from jsonb_array_elements_text(campaign.payload->'recipients') loop
  if not exists(select 1 from public.tbl_users u where u.id=recipient and coalesce(u.is_active,1)=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null and not exists(select 1 from auth.users a where a.id=u.auth_user_id and a.banned_until>now())) then raise exception 'Recipient % is unavailable',recipient;end if;
  perform private.enqueue_notification(recipient,'admin_campaign',campaign.payload->>'title',campaign.payload->>'body',campaign.id::text,null,jsonb_build_object('campaign_id',campaign.id));
  total:=total+1;
 end loop;
 update private.admin_workspace_documents set status='sent',scheduled_at=null,last_error=null,sent_at=now(),updated_at=now(),updated_by=p_actor,version=version+1 where id=p_id returning * into campaign;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(p_actor,'workspace',0,'send_in_app_campaign',btrim(p_reason),'{}',jsonb_build_object('campaign_id',p_id,'recipients',total));
 return to_jsonb(campaign);
end $$;

revoke all on function private.deliver_workspace_campaign(uuid,integer,text,uuid) from public,anon,authenticated;
create or replace function private.admin_send_campaign(p_id uuid,p_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 return private.deliver_workspace_campaign(p_id,p_version,p_reason,auth.uid());
end $$;

create function private.admin_schedule_campaign(p_id uuid,p_version integer,p_when timestamptz,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 select * into campaign from private.admin_workspace_documents where id=p_id and kind='campaign' and not archived for update;
 if not found or campaign.status<>'draft' then raise exception 'Draft campaign unavailable';end if;
 if p_version is null or p_version<>campaign.version then raise exception 'Campaign changed. Reload before scheduling.' using errcode='40001';end if;
 if campaign.payload->>'channel'<>'in_app' then raise exception 'External campaign delivery provider is not configured. The draft is preserved.';end if;
 if p_when is not null and (p_when<=now() or p_when>now()+interval '365 days') then raise exception 'Choose a future time within one year';end if;
 if campaign.scheduled_at is not distinct from p_when then return to_jsonb(campaign);end if;
 update private.admin_workspace_documents set scheduled_at=p_when,last_error=null,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into campaign;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(auth.uid(),'workspace',0,case when p_when is null then 'cancel_campaign_schedule' else 'schedule_in_app_campaign' end,btrim(p_reason),'{}',jsonb_build_object('campaign_id',p_id,'scheduled_at',p_when));
 return to_jsonb(campaign);
end $$;
create function public.admin_schedule_campaign(p_id uuid,p_version integer,p_when timestamptz,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_schedule_campaign(p_id,p_version,p_when,p_reason)$$;
revoke all on function private.admin_schedule_campaign(uuid,integer,timestamptz,text),public.admin_schedule_campaign(uuid,integer,timestamptz,text) from public,anon;
grant execute on function private.admin_schedule_campaign(uuid,integer,timestamptz,text),public.admin_schedule_campaign(uuid,integer,timestamptz,text) to authenticated;

create function private.dispatch_due_admin_campaigns() returns integer language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;sent integer:=0;
begin
 for campaign in select * from private.admin_workspace_documents where kind='campaign' and status='draft' and not archived and scheduled_at<=now() order by scheduled_at limit 50 for update skip locked loop
  begin
   if not exists(select 1 from auth.users a where a.id=campaign.updated_by and a.raw_app_meta_data->>'role' in ('admin','super_admin') and coalesce(a.raw_app_meta_data->>'admin_status','active')='active' and (a.banned_until is null or a.banned_until<=now()) and not exists(select 1 from public.tbl_users u where u.auth_user_id=a.id and (coalesce(u.is_active,1)=0 or coalesce(u.is_delete,0)=1 or u.deactivated_at is not null))) then raise exception 'The approving administrator no longer has active operations access';end if;
   perform private.deliver_workspace_campaign(campaign.id,campaign.version,'Scheduled in-app campaign approved by administrator',campaign.updated_by);
   sent:=sent+1;
  exception when others then
   update private.admin_workspace_documents set scheduled_at=null,last_error=left(sqlerrm,1000),updated_at=now(),version=version+1 where id=campaign.id;
  end;
 end loop;
 return sent;
end $$;
revoke all on function private.dispatch_due_admin_campaigns() from public,anon,authenticated;

-- Editing message content or archiving cancels a previously approved schedule.
create function private.cancel_changed_campaign_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if new.archived or new.payload is distinct from old.payload then new.scheduled_at:=null;new.last_error:=null;end if;
 return new;
end $$;
revoke all on function private.cancel_changed_campaign_schedule() from public,anon,authenticated;
create trigger cancel_changed_campaign_schedule before update on private.admin_workspace_documents for each row execute function private.cancel_changed_campaign_schedule();

-- Cron installation is verified on Supabase after the integrated deployment.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('wenitro-admin-in-app-campaigns','* * * * *','select private.dispatch_due_admin_campaigns()');
