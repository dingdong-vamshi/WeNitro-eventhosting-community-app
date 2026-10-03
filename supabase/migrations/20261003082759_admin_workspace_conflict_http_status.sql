-- Business version conflicts must return HTTP 409, not retryable serialization failures.
-- PostgREST 14 retries SQLSTATE40001 indefinitely; preserve every existing authorization and payload guard.
create or replace function private.admin_workspace_save(p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_archived boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row private.admin_workspace_documents;result_row private.admin_workspace_documents;recipient jsonb;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_id is null or p_version is null or p_archived is null or p_kind not in ('notification_template','email_template','reward','coupon','campaign') then raise exception 'Invalid document';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>30000 or length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 160 then raise exception 'A name of 2–160 characters is required';end if;
 if p_kind in ('campaign','notification_template','email_template') then
  if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 180 or length(btrim(coalesce(p_payload->>'body',''))) not between 1 and 1000 then raise exception 'Title (1–180) and message (1–1000) are required';end if;
  if p_payload->>'channel' is null or p_payload->>'channel' not in ('in_app','push','email') then raise exception 'Invalid delivery channel';end if;
 end if;
 if p_kind='campaign' then
  if jsonb_typeof(p_payload->'recipients') is distinct from 'array' or jsonb_array_length(p_payload->'recipients') not between 1 and 500 then raise exception 'Choose 1–500 explicit recipient IDs';end if;
  for recipient in select value from jsonb_array_elements(p_payload->'recipients') loop
   if jsonb_typeof(recipient)<>'number' or recipient::text !~ '^[1-9][0-9]{0,8}$' then raise exception 'Invalid recipient ID';end if;
  end loop;
 end if;
 if p_kind in ('reward','coupon') and coalesce(p_payload->>'status','draft')<>'draft' then raise exception 'Redemption provider and approved reward economics are required before activation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,13));
 select * into old_row from private.admin_workspace_documents where id=p_id for update;
 if found then
  if old_row.kind<>p_kind or old_row.version<>p_version then raise exception 'This document changed. Reload before saving.' using errcode='PT409';end if;
  if old_row.status='sent' and old_row.payload is distinct from p_payload then raise exception 'Sent campaigns cannot be edited';end if;
  if old_row.payload=p_payload and old_row.archived=p_archived then return to_jsonb(old_row);end if;
  update private.admin_workspace_documents set payload=p_payload,archived=p_archived,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into result_row;
 else
  if p_version<>0 or p_archived then raise exception 'Document unavailable';end if;
  insert into private.admin_workspace_documents(id,kind,payload,created_by,updated_by) values(p_id,p_kind,p_payload,auth.uid(),auth.uid()) returning * into result_row;
 end if;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(auth.uid(),'workspace',0,case when p_archived then 'archive_'||p_kind else 'save_'||p_kind end,btrim(p_reason),coalesce(to_jsonb(old_row),'{}'),to_jsonb(result_row));
 return to_jsonb(result_row);
end $$;

create or replace function private.deliver_workspace_campaign(p_id uuid,p_version integer,p_reason text,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;recipient integer;total integer:=0;
begin
 if p_actor is null then raise exception 'Campaign actor required';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 select * into campaign from private.admin_workspace_documents where id=p_id and kind='campaign' for update;
 if not found or campaign.archived then raise exception 'Campaign unavailable';end if;
 if campaign.status='sent' then return to_jsonb(campaign);end if;
 if p_version is null or campaign.version<>p_version then raise exception 'Campaign changed. Reload before sending.' using errcode='PT409';end if;
 if campaign.payload->>'channel'<>'in_app' then raise exception 'External campaign delivery provider is not configured. The draft is preserved.';end if;
 for recipient in select distinct value::integer from jsonb_array_elements_text(campaign.payload->'recipients') loop
  if not exists(select 1 from public.tbl_users u where u.id=recipient and coalesce(u.is_active,1)=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null and exists(select 1 from auth.users a where a.id=u.auth_user_id and (a.banned_until is null or a.banned_until<=now()))) then raise exception 'Recipient % is unavailable',recipient;end if;
  perform private.enqueue_notification(recipient,'admin_campaign',campaign.payload->>'title',campaign.payload->>'body',campaign.id::text,null,jsonb_build_object('campaign_id',campaign.id));
  total:=total+1;
 end loop;
 update private.admin_workspace_documents set status='sent',scheduled_at=null,last_error=null,sent_at=now(),updated_at=now(),updated_by=p_actor,version=version+1 where id=p_id returning * into campaign;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(p_actor,'workspace',0,'send_in_app_campaign',btrim(p_reason),'{}',jsonb_build_object('campaign_id',p_id,'recipients',total));
 return to_jsonb(campaign);
end $$;

create or replace function private.admin_schedule_campaign(p_id uuid,p_version integer,p_when timestamptz,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 select * into campaign from private.admin_workspace_documents where id=p_id and kind='campaign' and not archived for update;
 if not found or campaign.status<>'draft' then raise exception 'Draft campaign unavailable';end if;
 if p_version is null or p_version<>campaign.version then raise exception 'Campaign changed. Reload before scheduling.' using errcode='PT409';end if;
 if campaign.payload->>'channel'<>'in_app' then raise exception 'External campaign delivery provider is not configured. The draft is preserved.';end if;
 if p_when is not null and (p_when<=now() or p_when>now()+interval '365 days') then raise exception 'Choose a future time within one year';end if;
 if campaign.scheduled_at is not distinct from p_when then return to_jsonb(campaign);end if;
 update private.admin_workspace_documents set scheduled_at=p_when,last_error=null,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into campaign;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(auth.uid(),'workspace',0,case when p_when is null then 'cancel_campaign_schedule' else 'schedule_in_app_campaign' end,btrim(p_reason),'{}',jsonb_build_object('campaign_id',p_id,'scheduled_at',p_when));
 return to_jsonb(campaign);
end $$;

