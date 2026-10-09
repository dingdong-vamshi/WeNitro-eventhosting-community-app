-- One auditable, reversible moderation state shared by Admin and the user app.
alter table public.tbl_events
  add column if not exists admin_moderation_status text not null default 'active'
    check (admin_moderation_status in ('active','hidden','removed')),
  add column if not exists admin_moderation_reason text,
  add column if not exists admin_moderated_at timestamptz,
  add column if not exists admin_moderated_by uuid;

alter table public.tbl_chat_rooms
  add column if not exists admin_moderation_status text not null default 'active'
    check (admin_moderation_status in ('active','hidden','suspended','removed')),
  add column if not exists admin_moderation_reason text,
  add column if not exists admin_moderated_at timestamptz,
  add column if not exists admin_moderated_by uuid;

alter table public.tbl_activity_vibes
  add column if not exists admin_moderation_status text not null default 'active'
    check (admin_moderation_status in ('active','hidden','removed')),
  add column if not exists admin_moderation_reason text,
  add column if not exists admin_moderated_at timestamptz,
  add column if not exists admin_moderated_by uuid;

alter table public.tbl_stories
  add column if not exists admin_moderation_status text not null default 'active'
    check (admin_moderation_status in ('active','hidden','removed')),
  add column if not exists admin_moderation_reason text,
  add column if not exists admin_moderated_at timestamptz,
  add column if not exists admin_moderated_by uuid;

comment on column public.tbl_chat_rooms.admin_moderation_status is
  'active is normal; hidden is unavailable in the app; suspended is unavailable and blocks writes/joins; removed is unavailable but retained for audit.';

create index if not exists tbl_events_admin_moderation_status_idx on public.tbl_events(admin_moderation_status);
create index if not exists tbl_chat_rooms_admin_moderation_status_idx on public.tbl_chat_rooms(admin_moderation_status) where room_type='community';
create index if not exists tbl_activity_vibes_admin_moderation_status_idx on public.tbl_activity_vibes(admin_moderation_status);
create index if not exists tbl_stories_admin_moderation_status_idx on public.tbl_stories(admin_moderation_status);

create or replace function private.protect_admin_moderation_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.role()='service_role' or coalesce(public.is_wenitro_admin(),false) then return new;end if;
 if tg_op='INSERT' then
  new.admin_moderation_status:='active';
  new.admin_moderation_reason:=null;
  new.admin_moderated_at:=null;
  new.admin_moderated_by:=null;
 elsif new.admin_moderation_status is distinct from old.admin_moderation_status
    or new.admin_moderation_reason is distinct from old.admin_moderation_reason
    or new.admin_moderated_at is distinct from old.admin_moderated_at
    or new.admin_moderated_by is distinct from old.admin_moderated_by then
  raise exception 'Only an administrator can change moderation state' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.protect_admin_moderation_fields() from public,anon,authenticated;

drop trigger if exists protect_admin_moderation_events on public.tbl_events;
create trigger protect_admin_moderation_events before insert or update on public.tbl_events for each row execute function private.protect_admin_moderation_fields();
drop trigger if exists protect_admin_moderation_communities on public.tbl_chat_rooms;
create trigger protect_admin_moderation_communities before insert or update on public.tbl_chat_rooms for each row execute function private.protect_admin_moderation_fields();
drop trigger if exists protect_admin_moderation_vibes on public.tbl_activity_vibes;
create trigger protect_admin_moderation_vibes before insert or update on public.tbl_activity_vibes for each row execute function private.protect_admin_moderation_fields();
drop trigger if exists protect_admin_moderation_stories on public.tbl_stories;
create trigger protect_admin_moderation_stories before insert or update on public.tbl_stories for each row execute function private.protect_admin_moderation_fields();

create or replace function public.admin_moderate_activity(p_event_id integer,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.tbl_events%rowtype; old_state jsonb; new_state jsonb; count_sent integer:=0;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_action is null or p_action not in ('warn_host','hide_event','unhide_event','cancel_event','suspend_host','delete_event','restore_event','notify_participants') then raise exception 'Invalid moderation action';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A reason or message of 5–1000 characters is required';end if;
 select * into e from public.tbl_events where id=p_event_id for update;
 if not found then raise exception 'Activity unavailable';end if;
 if (p_action='cancel_event' and coalesce(e.is_cancelled,false))
    or (p_action='delete_event' and coalesce(e.is_deleted,false))
    or (p_action='hide_event' and e.admin_moderation_status='hidden')
    or (p_action='unhide_event' and e.admin_moderation_status='active')
    or (p_action='restore_event' and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false) and e.admin_moderation_status='active')
 then return jsonb_build_object('id',e.id,'changed',false,'notifications',0);end if;
 old_state:=jsonb_build_object('is_deleted',e.is_deleted,'is_cancelled',e.is_cancelled,'status',e.status,'admin_moderation_status',e.admin_moderation_status);
 if p_action='suspend_host' then perform public.admin_moderate_user(e.created_by,'30d',p_reason);
 elsif p_action='hide_event' then update public.tbl_events set admin_moderation_status='hidden',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),is_admin_pinned=false,updated_at=now() where id=e.id;
 elsif p_action='unhide_event' then update public.tbl_events set admin_moderation_status='active',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='cancel_event' then update public.tbl_events set is_cancelled=true,is_admin_pinned=false,admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='delete_event' then update public.tbl_events set is_deleted=true,is_admin_pinned=false,admin_moderation_status='removed',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='restore_event' then
  if exists(select 1 from public.tbl_activity_payments where event_id=e.id and status in ('paid','success')) then raise exception 'Paid activity restoration requires financial reconciliation';end if;
  update public.tbl_events set is_deleted=false,is_cancelled=false,admin_moderation_status='active',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 end if;
 if p_action in ('warn_host','suspend_host','hide_event') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  values(e.created_by,public.current_app_user_id(),'system',e.id::text,'WeNitro activity moderation',p_reason,jsonb_build_object('eventId',e.id));count_sent:=1;
 elsif p_action in ('cancel_event','delete_event','notify_participants') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  select u,public.current_app_user_id(),'system',e.id::text,
   case p_action when 'cancel_event' then 'Activity cancelled' when 'delete_event' then 'Activity removed' else 'Activity update' end,
   e.title||': '||p_reason,jsonb_build_object('eventId',e.id)
  from(select e.created_by u union select user_id from public.tbl_event_participants where event_id=e.id and lower(status) in ('approved','joined','confirmed','registered')) recipients;
  get diagnostics count_sent=row_count;
 end if;
 select jsonb_build_object('is_deleted',is_deleted,'is_cancelled',is_cancelled,'status',status,'admin_moderation_status',admin_moderation_status) into new_state from public.tbl_events where id=e.id;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
 values(auth.uid(),'activity',e.id,p_action,btrim(p_reason),old_state,new_state||jsonb_build_object('notifications',count_sent));
 return jsonb_build_object('id',e.id,'action',p_action,'notifications',count_sent,'moderation_status',new_state->>'admin_moderation_status');
end $$;

create or replace function public.admin_moderate_content(p_type text,p_id bigint,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_state jsonb; new_state jsonb; next_status text;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_type not in ('community','vibe','story') or p_id is null or p_id<=0 then raise exception 'Invalid moderation target';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A moderation reason of 5–1000 characters is required';end if;
 if p_action not in ('hide','suspend','remove','restore') then raise exception 'Invalid moderation action';end if;
 if p_type<>'community' and p_action='suspend' then raise exception 'Suspend applies only to Communities';end if;
 next_status:=case p_action when 'hide' then 'hidden' when 'suspend' then 'suspended' when 'remove' then 'removed' else 'active' end;

 if p_type='community' then
  select to_jsonb(r) into old_state from public.tbl_chat_rooms r where r.id=p_id and r.room_type='community' for update;
  if old_state is null then raise exception 'Community unavailable';end if;
  update public.tbl_chat_rooms set admin_moderation_status=next_status,admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=p_id;
  select to_jsonb(r) into new_state from public.tbl_chat_rooms r where r.id=p_id;
 elsif p_type='vibe' then
  select to_jsonb(v) into old_state from public.tbl_activity_vibes v where v.id=p_id for update;
  if old_state is null then raise exception 'Vibe unavailable';end if;
  update public.tbl_activity_vibes set admin_moderation_status=next_status,admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=p_id;
  select to_jsonb(v) into new_state from public.tbl_activity_vibes v where v.id=p_id;
 else
  select to_jsonb(s) into old_state from public.tbl_stories s where s.id=p_id for update;
  if old_state is null then raise exception 'Story unavailable';end if;
  if p_action='restore' and old_state->>'deleted_at' is not null then raise exception 'A Story deleted by its owner cannot be restored';end if;
  update public.tbl_stories set admin_moderation_status=next_status,admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid() where id=p_id;
  select to_jsonb(s) into new_state from public.tbl_stories s where s.id=p_id;
 end if;

 if old_state->>'admin_moderation_status' is distinct from next_status then
  insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
  values(auth.uid(),p_type,p_id,p_action,btrim(p_reason),old_state,new_state);
 end if;
 return jsonb_build_object('type',p_type,'id',p_id,'action',p_action,'moderation_status',next_status,'changed',old_state->>'admin_moderation_status' is distinct from next_status);
end $$;

revoke all on function public.admin_moderate_content(text,bigint,text,text) from public,anon;
grant execute on function public.admin_moderate_content(text,bigint,text,text) to authenticated;

create or replace function private.enforce_community_moderation() returns trigger
language plpgsql security definer set search_path='' as $$
declare state text;
begin
 select admin_moderation_status into state from public.tbl_chat_rooms where id=new.room_id and room_type='community';
 if state in ('suspended','removed') then raise exception 'This Community is currently restricted' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.enforce_community_moderation() from public,anon,authenticated;

drop trigger if exists enforce_community_moderation_messages on public.tbl_messages;
create trigger enforce_community_moderation_messages before insert or update on public.tbl_messages for each row execute function private.enforce_community_moderation();
drop trigger if exists enforce_community_moderation_posts on public.tbl_community_posts;
create trigger enforce_community_moderation_posts before insert or update on public.tbl_community_posts for each row execute function private.enforce_community_moderation();
drop trigger if exists enforce_community_moderation_participants on public.tbl_chat_participants;
create trigger enforce_community_moderation_participants before insert or update on public.tbl_chat_participants for each row execute function private.enforce_community_moderation();
drop trigger if exists enforce_community_moderation_requests on public.tbl_community_join_requests;
create trigger enforce_community_moderation_requests before insert or update on public.tbl_community_join_requests for each row execute function private.enforce_community_moderation();

notify pgrst,'reload schema';
