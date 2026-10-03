-- Administrator-owned drafts and campaigns. JSON documents are private and have bounded schemas.
create table private.admin_workspace_documents(
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('notification_template','email_template','reward','coupon','campaign')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=30000),
 version integer not null default 1,status text not null default 'draft' check(status in ('draft','sent')),
 archived boolean not null default false,created_by uuid not null,updated_by uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),sent_at timestamptz
);
alter table private.admin_workspace_documents enable row level security;
revoke all on private.admin_workspace_documents from public,anon,authenticated;
create index if not exists tbl_notifications_campaign_id_idx on public.tbl_notifications ((data->>'campaign_id'));

create function private.admin_workspace_list(p_kind text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 return query select to_jsonb(d)||jsonb_build_object('delivered',(select count(*) from public.tbl_notifications n where n.data->>'campaign_id'=d.id::text),'opened',(select count(*) from public.tbl_notifications n where n.data->>'campaign_id'=d.id::text and n.is_read)) from private.admin_workspace_documents d where d.kind=p_kind order by d.updated_at desc,d.id;
end $$;
create function public.admin_workspace_list(p_kind text) returns setof jsonb language sql security invoker set search_path='' as $$select private.admin_workspace_list(p_kind)$$;

create function private.admin_workspace_save(p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_archived boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if old_row.kind<>p_kind or old_row.version<>p_version then raise exception 'This document changed. Reload before saving.' using errcode='40001';end if;
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
create function public.admin_workspace_save(p_id uuid,p_kind text,p_payload jsonb,p_version integer,p_archived boolean,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_workspace_save(p_id,p_kind,p_payload,p_version,p_archived,p_reason)$$;

create function private.admin_send_campaign(p_id uuid,p_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign private.admin_workspace_documents;recipient integer;total integer:=0;
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'A reason of 5–1000 characters is required';end if;
 select * into campaign from private.admin_workspace_documents where id=p_id and kind='campaign' for update;
 if not found or campaign.archived then raise exception 'Campaign unavailable';end if;
 if campaign.status='sent' then return to_jsonb(campaign);end if;
 if p_version is null or campaign.version<>p_version then raise exception 'Campaign changed. Reload before sending.' using errcode='40001';end if;
 if campaign.payload->>'channel'<>'in_app' then raise exception 'External campaign delivery provider is not configured. The draft is preserved.';end if;
 for recipient in select distinct value::integer from jsonb_array_elements_text(campaign.payload->'recipients') loop
  if not exists(select 1 from public.tbl_users u where u.id=recipient and coalesce(u.is_active,1)=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null and exists(select 1 from auth.users a where a.id=u.auth_user_id and (a.banned_until is null or a.banned_until<=now()))) then raise exception 'Recipient % is unavailable',recipient;end if;
  perform private.enqueue_notification(recipient,'admin_campaign',campaign.payload->>'title',campaign.payload->>'body',campaign.id::text,null,jsonb_build_object('campaign_id',campaign.id));
  total:=total+1;
 end loop;
 update private.admin_workspace_documents set status='sent',sent_at=now(),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into campaign;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(auth.uid(),'workspace',0,'send_in_app_campaign',btrim(p_reason),'{}',jsonb_build_object('campaign_id',p_id,'recipients',total));
 return to_jsonb(campaign);
end $$;
create function public.admin_send_campaign(p_id uuid,p_version integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_send_campaign(p_id,p_version,p_reason)$$;
revoke all on function private.admin_workspace_list(text),public.admin_workspace_list(text),private.admin_workspace_save(uuid,text,jsonb,integer,boolean,text),public.admin_workspace_save(uuid,text,jsonb,integer,boolean,text),private.admin_send_campaign(uuid,integer,text),public.admin_send_campaign(uuid,integer,text) from public,anon;
grant execute on function private.admin_workspace_list(text),public.admin_workspace_list(text),private.admin_workspace_save(uuid,text,jsonb,integer,boolean,text),public.admin_workspace_save(uuid,text,jsonb,integer,boolean,text),private.admin_send_campaign(uuid,integer,text),public.admin_send_campaign(uuid,integer,text) to authenticated;

-- Feature gates are enforced on creation in the database, including legacy direct table writes.
create table private.platform_feature_gates(key text primary key check(key in ('activities','communities','vibes','stories')),enabled boolean not null default true,updated_at timestamptz not null default now());
alter table private.platform_feature_gates enable row level security;
revoke all on private.platform_feature_gates from public,anon,authenticated;
insert into private.platform_feature_gates(key) values('activities'),('communities'),('vibes'),('stories');
create function private.feature_gate_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='tbl_chat_rooms' then
  if new.room_type is distinct from 'community' then return new;end if;
 end if;
 if exists(select 1 from private.platform_feature_gates where key=tg_argv[0] and not enabled) then raise exception '% creation is temporarily paused by WeNitro.',initcap(tg_argv[0]) using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.feature_gate_guard() from public,anon,authenticated;
create trigger platform_activity_gate before insert on public.tbl_events for each row execute function private.feature_gate_guard('activities');
create trigger platform_community_gate before insert on public.tbl_chat_rooms for each row execute function private.feature_gate_guard('communities');
create trigger platform_vibe_gate before insert on public.tbl_activity_vibes for each row execute function private.feature_gate_guard('vibes');
create trigger platform_story_gate before insert on public.tbl_stories for each row execute function private.feature_gate_guard('stories');
create function private.admin_feature_gates(p_key text,p_enabled boolean,p_reason text) returns setof private.platform_feature_gates language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_key is not null then
  if p_enabled is null or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'An enabled state and reason of 5–1000 characters are required';end if;
  if not exists(select 1 from private.platform_feature_gates where key=p_key) then raise exception 'Feature unavailable';end if;
  update private.platform_feature_gates set enabled=p_enabled,updated_at=now() where key=p_key and enabled is distinct from p_enabled;
  if found then insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state) values(auth.uid(),'feature',0,'set_feature_gate',btrim(p_reason),jsonb_build_object('key',p_key,'enabled',not p_enabled),jsonb_build_object('key',p_key,'enabled',p_enabled));end if;
 end if;
 return query select * from private.platform_feature_gates order by key;
end $$;
create function public.admin_feature_gates(p_key text default null,p_enabled boolean default null,p_reason text default null) returns setof private.platform_feature_gates language sql security invoker set search_path='' as $$select * from private.admin_feature_gates(p_key,p_enabled,p_reason)$$;
revoke all on function private.admin_feature_gates(text,boolean,text),public.admin_feature_gates(text,boolean,text) from public,anon;
grant execute on function private.admin_feature_gates(text,boolean,text),public.admin_feature_gates(text,boolean,text) to authenticated;
