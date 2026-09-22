-- Client PDF security and integrity completion.
-- This migration deliberately contains no seed users, messages, payments, or OTP work.

-- Activity visibility is granted only to the host and active participants.
create or replace function public.is_event_participant(p_event_id integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.tbl_event_participants p
    where p.event_id = p_event_id
      and p.user_id = public.current_app_user_id()
      and p.status in ('pending','approved','waitlist','invited','payment_required','going','paid')
  )
$$;

create or replace function private.can_manage_activity(p_event_id integer, p_user_id integer default public.current_app_user_id())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.tbl_events e
    where e.id = p_event_id
      and not coalesce(e.is_deleted, false)
      and (
        e.created_by = p_user_id
        or exists(
          select 1 from public.tbl_event_participants p
          where p.event_id = e.id and p.user_id = p_user_id
            and p.role = 'cohost'
            and p.status in ('approved','going','paid')
        )
      )
  )
$$;

drop policy if exists app_events_read on public.tbl_events;
create policy app_events_read on public.tbl_events
for select to authenticated
using (
  not coalesce(is_deleted, false)
  and (
    (status = 'published' and visibility_type = 'public')
    or created_by = public.current_app_user_id()
    or public.is_event_participant(id)
  )
);

create or replace function private.validate_host_activity_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  schedule_changed boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    schedule_changed := new.event_start_time is distinct from old.event_start_time
      or new.event_end_time is distinct from old.event_end_time
      or new.registration_close_time is distinct from old.registration_close_time;
  end if;
  if new.max_participants is not null and new.max_participants < 1 then raise exception 'Participant limit must be positive or unlimited' using errcode='22023'; end if;
  if new.age_min is not null and (new.age_min < 0 or new.age_min > 120) then raise exception 'Minimum age must be between 0 and 120' using errcode='22023'; end if;
  if new.age_max is not null and (new.age_max < coalesce(new.age_min,0) or new.age_max > 120) then raise exception 'Invalid maximum age' using errcode='22023'; end if;
  if new.gender_preference is not null and new.gender_preference not in ('male','female','non_binary') then raise exception 'Invalid gender preference' using errcode='22023'; end if;
  if new.event_start_time is null and (new.event_end_time is not null or new.registration_close_time is not null) then raise exception 'Dates must be unset together when deciding later' using errcode='22023'; end if;
  if schedule_changed and new.event_start_time is not null then
    if new.event_start_time <= now() then raise exception 'Start time must be in the future' using errcode='22023'; end if;
    if new.event_end_time is null or new.event_end_time < new.event_start_time + interval '1 hour' then raise exception 'End time must be at least one hour after start time' using errcode='22023'; end if;
    if new.registration_close_time is null or new.registration_close_time < now() or new.registration_close_time > new.event_start_time then raise exception 'Join deadline must be between now and the start time' using errcode='22023'; end if;
  end if;
  if new.latitude is not null and (new.latitude < -90 or new.latitude > 90) then raise exception 'Invalid latitude' using errcode='22023'; end if;
  if new.longitude is not null and (new.longitude < -180 or new.longitude > 180) then raise exception 'Invalid longitude' using errcode='22023'; end if;
  if new.price < 0 or new.is_paid is distinct from (new.price > 0) then raise exception 'Paid activities require a positive price' using errcode='22023'; end if;
  return new;
end
$$;

-- Version the live co-host contract and keep assignment owner-only.
create or replace function public.set_activity_cohost(p_event_id integer, p_user_id integer, p_cohost boolean)
returns public.tbl_event_participants
language plpgsql
security definer
set search_path = 'public'
as $$
declare me integer := public.get_current_app_user_id(); r public.tbl_event_participants;
begin
  if not exists(select 1 from public.tbl_events e where e.id=p_event_id and e.created_by=me and not coalesce(e.is_deleted,false)) then
    raise exception 'Only the host can assign a co-host.' using errcode='42501';
  end if;
  if p_user_id=me then raise exception 'You are already the host.'; end if;
  update public.tbl_event_participants
  set role=case when p_cohost then 'cohost' else 'participant' end
  where event_id=p_event_id and user_id=p_user_id and status in ('approved','going','paid')
  returning * into r;
  if r is null then raise exception 'Choose an approved participant.'; end if;
  return r;
end
$$;

create or replace function public.cancel_activity(p_event_id integer)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare me integer := public.get_current_app_user_id();
begin
  if not private.can_manage_activity(p_event_id, me) then raise exception 'Activity not found or not manageable' using errcode='42501'; end if;
  update public.tbl_events set is_cancelled=true,status='cancelled',updated_by=me,updated_at=now() where id=p_event_id;
end
$$;

create or replace function public.update_activity(p_event_id integer, p_patch jsonb)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Activity patch must be an object' using errcode='22023'; end if;
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Activity not found or not manageable' using errcode='42501'; end if;
  update public.tbl_events set
    title=case when p_patch?'title' then trim(p_patch->>'title') else title end,
    description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,
    event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,
    event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,
    registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,
    max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,
    visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,
    join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,
    location=case when p_patch?'location' then nullif(p_patch->>'location','') else location end,
    display_location=case when p_patch?'display_location' then nullif(p_patch->>'display_location','') else display_location end,
    latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,
    longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,
    is_paid=case when p_patch?'is_paid' then (p_patch->>'is_paid')::boolean else is_paid end,
    price=case when p_patch?'price_inr' then (p_patch->>'price_inr')::numeric else price end,
    intent=case when p_patch?'activity_type' then p_patch->>'activity_type' else intent end,
    status=case when p_patch?'status' then p_patch->>'status' else status end,
    is_cancelled=case when p_patch->>'status'='cancelled' then true else is_cancelled end,
    media=case when p_patch?'cover_url' then case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end else media end,
    verified_only=case when p_patch?'verified_only' then (p_patch->>'verified_only')::boolean else verified_only end,
    age_min=case when p_patch?'age_min' then nullif(p_patch->>'age_min','')::integer else age_min end,
    age_max=case when p_patch?'age_max' then nullif(p_patch->>'age_max','')::integer else age_max end,
    gender_preference=case when p_patch?'gender_preference' then nullif(p_patch->>'gender_preference','') else gender_preference end,
    location_instruction=case when p_patch?'location_instruction' then nullif(trim(p_patch->>'location_instruction'),'') else location_instruction end,
    costs_may_apply=case when p_patch?'costs_may_apply' then (p_patch->>'costs_may_apply')::boolean else costs_may_apply end,
    entry_fee_required=case when p_patch?'entry_fee_required' then (p_patch->>'entry_fee_required')::boolean else entry_fee_required end,
    updated_by=me,updated_at=now()
  where id=p_event_id;
  if cat is not null then
    select id into cid from public.tbl_categories where lower(trim(name))=lower(cat) order by id limit 1;
    if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if;
    delete from public.tbl_event_categories where event_id=p_event_id;
    insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me);
  end if;
  if p_patch?'registration_questions' then perform private.save_activity_registration_questions(p_event_id,p_patch->'registration_questions'); end if;
  return p_event_id;
end
$$;

create or replace function public.respond_activity_join(p_event_id integer, p_user_id integer, p_status text)
returns public.tbl_event_participants
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  me integer := public.get_current_app_user_id();
  event_row public.tbl_events;
  normalized_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null or not private.can_manage_activity(p_event_id, me) then raise exception 'Only a host or co-host can respond' using errcode='42501'; end if;
  if p_status not in ('approved','rejected','waitlist') then raise exception 'Invalid response'; end if;
  normalized_status := case when p_status='waitlist' then 'pending' else p_status end;
  if normalized_status='approved' and event_row.max_participants is not null then
    select count(*) into occupied from public.tbl_event_participants
    where event_id=p_event_id and user_id<>p_user_id and status in ('approved','going','paid');
    if occupied>=event_row.max_participants then raise exception 'Activity is full'; end if;
  end if;
  update public.tbl_event_participants
  set status=normalized_status, responded_at=now(), joined_at=case when normalized_status='approved' then coalesce(joined_at,now()) else null end
  where event_id=p_event_id and user_id=p_user_id returning * into result_row;
  if result_row.id is null then raise exception 'Join request not found'; end if;
  return result_row;
end
$$;

-- Private activity invitation tokens are opaque, hashed, expiring and redeem once per user.
create table if not exists public.tbl_activity_invites (
  id bigint generated by default as identity primary key,
  event_id integer not null references public.tbl_events(id) on delete cascade,
  token_hash text not null unique,
  created_by integer not null references public.tbl_users(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.tbl_activity_invites enable row level security;
revoke all on public.tbl_activity_invites from anon, authenticated;

create or replace function public.create_activity_invite(p_event_id integer, p_expires_at timestamptz default now()+interval '7 days', p_max_uses integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me integer:=public.get_current_app_user_id(); raw_token text:=extensions.gen_random_uuid()::text; invite_id bigint;
begin
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Only a host or co-host can create an invite' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '30 days' then raise exception 'Invite expiry must be within 30 days'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 500 then raise exception 'Invite use limit must be between 1 and 500'; end if;
  insert into public.tbl_activity_invites(event_id,token_hash,created_by,expires_at,max_uses)
  values(p_event_id,encode(extensions.digest(raw_token,'sha256'),'hex'),me,p_expires_at,p_max_uses)
  returning id into invite_id;
  return jsonb_build_object('id',invite_id,'event_id',p_event_id,'token',raw_token,'expires_at',p_expires_at);
end
$$;

create or replace function public.redeem_activity_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me integer:=public.get_current_app_user_id(); invite public.tbl_activity_invites; event_row public.tbl_events; participation public.tbl_event_participants; already_active boolean:=false;
begin
  if p_token !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invite link is invalid'; end if;
  select * into invite from public.tbl_activity_invites
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if invite.id is null or invite.revoked_at is not null or invite.expires_at<=now() or (invite.max_uses is not null and invite.uses_count>=invite.max_uses) then raise exception 'Invite link is invalid or expired' using errcode='42501'; end if;
  select * into event_row from public.tbl_events where id=invite.event_id and status='published' and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false) for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  if event_row.created_by=me then return jsonb_build_object('event_id',event_row.id,'status','host'); end if;
  select exists(select 1 from public.tbl_event_participants p where p.event_id=event_row.id and p.user_id=me and p.status in ('approved','going','paid')) into already_active;
  insert into public.tbl_event_participants(event_id,user_id,status,invited_by,responded_at,joined_at)
  values(event_row.id,me,'approved',invite.created_by,now(),now())
  on conflict(event_id,user_id) do update set status='approved',invited_by=invite.created_by,responded_at=now(),joined_at=coalesce(public.tbl_event_participants.joined_at,now())
  returning * into participation;
  if not already_active then
    update public.tbl_activity_invites set uses_count=uses_count+1 where id=invite.id;
  end if;
  return jsonb_build_object('event_id',event_row.id,'status',participation.status);
end
$$;

-- An activity room is created lazily and kept in sync with active participation.
create or replace function public.ensure_activity_chat(p_event_id integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me integer:=public.get_current_app_user_id(); event_row public.tbl_events; room_row public.tbl_chat_rooms;
begin
  select * into event_row from public.tbl_events where id=p_event_id and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false) for update;
  if event_row.id is null or not (private.can_manage_activity(p_event_id,me) or public.is_event_participant(p_event_id)) then raise exception 'Join this Activity to open its chat' using errcode='42501'; end if;
  select * into room_row from public.tbl_chat_rooms where event_id=p_event_id and room_type='group' order by id limit 1 for update;
  if room_row.id is null then
    insert into public.tbl_chat_rooms(room_type,event_id,created_by,title,visibility,join_type)
    values('group',p_event_id,event_row.created_by,event_row.title,'private','approval') returning * into room_row;
  end if;
  insert into public.tbl_chat_participants(room_id,user_id,role)
  select room_row.id,event_row.created_by,'admin'
  on conflict(room_id,user_id) do update set role='admin';
  insert into public.tbl_chat_participants(room_id,user_id,role)
  select room_row.id,p.user_id,case when p.role='cohost' then 'admin' else 'member' end
  from public.tbl_event_participants p
  where p.event_id=p_event_id and p.status in ('approved','going','paid')
  on conflict(room_id,user_id) do update set role=excluded.role;
  delete from public.tbl_chat_participants cp
  where cp.room_id=room_row.id and cp.user_id<>event_row.created_by
    and not exists(select 1 from public.tbl_event_participants p where p.event_id=p_event_id and p.user_id=cp.user_id and p.status in ('approved','going','paid'));
  if not public.is_chat_member(room_row.id) then raise exception 'Join this Activity to open its chat' using errcode='42501'; end if;
  return jsonb_build_object('id',room_row.id,'event_id',p_event_id,'title',event_row.title,'room_type','group');
end
$$;

create or replace function private.sync_activity_chat_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_key integer; user_key integer; room_key integer; user_role text; user_status text;
begin
  if tg_op='DELETE' then
    event_key:=old.event_id; user_key:=old.user_id; user_role:=coalesce(old.role,'participant'); user_status:='left';
  else
    event_key:=new.event_id; user_key:=new.user_id; user_role:=coalesce(new.role,'participant'); user_status:=coalesce(new.status,'left');
  end if;
  select r.id into room_key from public.tbl_chat_rooms r where r.event_id=event_key and r.room_type='group' order by r.id limit 1;
  if room_key is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  if tg_op<>'DELETE' and user_status in ('approved','going','paid') then
    insert into public.tbl_chat_participants(room_id,user_id,role) values(room_key,user_key,case when user_role='cohost' then 'admin' else 'member' end)
    on conflict(room_id,user_id) do update set role=excluded.role;
  else
    delete from public.tbl_chat_participants cp where cp.room_id=room_key and cp.user_id=user_key;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
drop trigger if exists sync_activity_chat_member on public.tbl_event_participants;
create trigger sync_activity_chat_member after insert or update of status,role or delete on public.tbl_event_participants for each row execute function private.sync_activity_chat_member();

-- Blocking is bidirectional for direct-message delivery and reversible by the blocker.
create or replace function private.users_blocked(p_left integer,p_right integer)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tbl_user_blocks b where (b.blocker_id=p_left and b.blocked_id=p_right) or (b.blocker_id=p_right and b.blocked_id=p_left))
$$;

create or replace function public.assert_chat_membership(p_room_id integer)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); other_user integer;
begin
  if not exists(select 1 from public.tbl_chat_participants p where p.room_id=p_room_id and p.user_id=me) then raise exception 'Not a chat participant' using errcode='42501'; end if;
  if exists(select 1 from public.tbl_chat_rooms r where r.id=p_room_id and r.room_type='personal') then
    select p.user_id into other_user from public.tbl_chat_participants p where p.room_id=p_room_id and p.user_id<>me order by p.id limit 1;
    if other_user is not null and private.users_blocked(me,other_user) then raise exception 'This chat is blocked' using errcode='42501'; end if;
  end if;
  return true;
end
$$;

create or replace function public.create_direct_chat_room(p_other_user_id integer)
returns integer language plpgsql security definer set search_path='public' as $$
declare me integer:=public.get_current_app_user_id(); rid integer;
begin
  if p_other_user_id=me or not exists(select 1 from public.tbl_users where id=p_other_user_id and coalesce(is_delete,0)=0 and coalesce(is_active,0)=1 and auth_user_id is not null) then raise exception 'Invalid participant'; end if;
  if private.users_blocked(me,p_other_user_id) then raise exception 'This chat is blocked' using errcode='42501'; end if;
  if not private.may_message(p_other_user_id) then raise exception 'This member is not accepting messages from you' using errcode='42501'; end if;
  select r.id into rid from public.tbl_chat_rooms r where r.room_type='personal'
    and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=me)
    and exists(select 1 from public.tbl_chat_participants p where p.room_id=r.id and p.user_id=p_other_user_id)
    and (select count(*) from public.tbl_chat_participants p where p.room_id=r.id)=2 order by r.id limit 1;
  if rid is null then
    insert into public.tbl_chat_rooms(room_type,created_by) values('personal',me) returning id into rid;
    insert into public.tbl_chat_participants(room_id,user_id,role) values(rid,me,'admin'),(rid,p_other_user_id,'member') on conflict(room_id,user_id) do nothing;
  end if;
  return rid;
end
$$;

create or replace function public.block_chat_user(p_user_id integer)
returns void language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id();
begin
  if me is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=me then raise exception 'Choose another user to block.' using errcode='22023'; end if;
  if not exists(select 1 from public.tbl_users u where u.id=p_user_id and coalesce(u.is_delete,0)=0) then raise exception 'Member unavailable'; end if;
  insert into public.tbl_user_blocks(blocker_id,blocked_id) values(me,p_user_id) on conflict do nothing;
end
$$;

-- Personal rooms with a block in either direction are absent from the inbox.
create or replace function public.list_chat_inbox(p_message_limit integer default 50)
returns setof jsonb
language plpgsql stable security definer set search_path='public' as $$
declare v_user_id integer:=public.get_current_app_user_id(); v_message_limit integer:=least(greatest(coalesce(p_message_limit,50),1),100);
begin
  return query
  select to_jsonb(r) || jsonb_build_object(
    'viewer_last_read_at',cp.last_read_at,
    'last_message_at',message_stats.last_message_at,
    'unread_count',message_stats.unread_count,
    'last_message',messages.last_message,
    'chat_members',members.items,
    'chat_messages',messages.items
  )
  from public.tbl_chat_participants cp
  join public.tbl_chat_rooms r on r.id=cp.room_id
  left join lateral (
    select max(m.created_at) last_message_at,
      count(*) filter(where m.created_at>coalesce(cp.last_read_at,cp.joined_at,'-infinity'::timestamptz) and m.sender_id is distinct from v_user_id) unread_count
    from public.tbl_messages m where m.room_id=r.id and m.deleted_at is null
  ) message_stats on true
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
      'room_id',member.room_id,'user_id',member.user_id,'role',coalesce(member.role,'member'),
      'last_read_at',member.last_read_at,'muted',member.muted,'joined_at',member.joined_at,
      'user',jsonb_build_object('id',profile.id,'username',profile.username,'fullname',profile.fullname,'profile_image',profile.profile_image)
    ) order by member.joined_at,member.id),'[]'::jsonb) items
    from public.tbl_chat_participants member join public.tbl_users profile on profile.id=member.user_id where member.room_id=r.id
  ) members on true
  left join lateral (
    select coalesce(jsonb_agg(recent.item order by recent.created_at,recent.id),'[]'::jsonb) items,
      (jsonb_agg(recent.item order by recent.created_at desc,recent.id desc)->0) last_message
    from (
      select m.created_at,m.id,to_jsonb(m)||jsonb_build_object('sender',jsonb_build_object(
        'id',sender.id,'username',sender.username,'fullname',sender.fullname,'profile_image',sender.profile_image
      )) item
      from public.tbl_messages m left join public.tbl_users sender on sender.id=m.sender_id
      where m.room_id=r.id and m.deleted_at is null order by m.created_at desc,m.id desc limit v_message_limit
    ) recent
  ) messages on true
  where cp.user_id=v_user_id
    and (r.room_type<>'personal' or not exists(
      select 1 from public.tbl_chat_participants peer
      where peer.room_id=r.id and peer.user_id<>v_user_id and private.users_blocked(v_user_id,peer.user_id)
    ))
  order by message_stats.last_message_at desc nulls last,r.id desc;
end
$$;

create or replace function public.unblock_chat_user(p_user_id integer)
returns void language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id();
begin
  delete from public.tbl_user_blocks where blocker_id=me and blocked_id=p_user_id;
end
$$;

create or replace function public.list_my_blocked_users()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,'blocked_at',b.created_at) order by b.created_at desc),'[]'::jsonb)
  from public.tbl_user_blocks b join public.tbl_users u on u.id=b.blocked_id
  where b.blocker_id=public.get_current_app_user_id()
$$;

-- Referral awards are one-time per referred account and promise exactly 10 Nitro.
alter table public.tbl_referral_history alter column points_awarded set default 10;
create or replace function public.redeem_referral(p_referrer_id integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); created_id integer;
begin
  if p_referrer_id is null or p_referrer_id=me then raise exception 'Referral is invalid'; end if;
  if not exists(select 1 from public.tbl_users u where u.id=p_referrer_id and u.is_active=1 and coalesce(u.is_delete,0)=0) then raise exception 'Inviter is unavailable'; end if;
  perform pg_advisory_xact_lock(me);
  insert into public.tbl_referral_history(referrer_id,referred_user_id,points_awarded)
  values(p_referrer_id,me,10) on conflict(referred_user_id) do nothing returning id into created_id;
  if created_id is not null then update public.tbl_users set points=coalesce(points,0)+10 where id=p_referrer_id; end if;
  return jsonb_build_object('awarded',created_id is not null,'points',case when created_id is null then 0 else 10 end);
end
$$;

-- Return the same privacy-guarded profile structure to owner and visitors.
create or replace function private.profile_contact(p_user_id integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.tbl_users; s public.tbl_user_privacy_settings; own boolean; friend boolean;
begin
  perform public.get_current_app_user_id();
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  select * into u from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
  if not found then raise exception 'Profile unavailable'; end if;
  select * into s from public.tbl_user_privacy_settings where user_id=p_user_id;
  own:=p_user_id=public.current_app_user_id(); friend:=private.in_squad(p_user_id);
  return jsonb_build_object(
    'id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,
    'bio',u.bio,'about',coalesce(u.about,u.bio),'location',u.nationality,'is_verified',u.isverified=1,
    'email',case when own or coalesce(s.email_visibility,'friends')='everyone' or (coalesce(s.email_visibility,'friends')='friends' and friend) then u.email else null end,
    'phone',case when own or coalesce(s.phone_visibility,'friends')='everyone' or (coalesce(s.phone_visibility,'friends')='friends' and friend) then coalesce(u.phone_e164,u.countrycode||u.phonenumber::text) else null end,
    'can_message',private.may_message(p_user_id),
    'social_links',(select jsonb_build_object('instagram',l.instagram,'facebook',l.facebook,'twitter',l.twitter,'linkedin',l.linkedin,'youtube',l.youtube) from public.tbl_user_social_links l where l.user_id=p_user_id order by l.id limit 1),
    'interests',coalesce((select jsonb_agg(c.name order by c.name) from public.tbl_user_interests i join public.tbl_categories c on c.id=i.category_id where i.user_id=p_user_id),'[]'::jsonb),
    'communities',coalesce((select jsonb_agg(r.title order by r.title) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_user_id and r.room_type='community' and (r.visibility='public' or own)),'[]'::jsonb)
  );
end
$$;

-- A privacy-guarded derived Trust Score is the single source of truth.
create or replace function private.trust_score_for(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  target public.tbl_users; auth_row auth.users; email_ok boolean:=false; phone_ok boolean:=false; selfie_ok boolean:=false; aadhaar_ok boolean:=false; social_ok boolean:=false; joined_count integer:=0; rating_value numeric:=0; total_value integer:=0;
begin
  select * into target from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
  if target.id is null then raise exception 'Profile unavailable'; end if;
  select * into auth_row from auth.users where id=target.auth_user_id;
  email_ok:=auth_row.email_confirmed_at is not null;
  phone_ok:=auth_row.phone_confirmed_at is not null or exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.phone_verified);
  selfie_ok:=exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.live_photo_verified);
  aadhaar_ok:=exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.aadhaar_verified and v.status='approved');
  social_ok:=exists(select 1 from public.tbl_user_social_links l where l.user_id=p_user_id and coalesce(nullif(l.instagram,''),nullif(l.facebook,''),nullif(l.twitter,''),nullif(l.linkedin,''),nullif(l.youtube,'')) is not null);
  rating_value:=coalesce(target.rating,0);
  select count(distinct p.event_id) into joined_count from public.tbl_event_participants p join public.tbl_events e on e.id=p.event_id where p.user_id=p_user_id and p.status in ('approved','going','paid') and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false);
  total_value:=(case when email_ok then 10 else 0 end)+(case when phone_ok then 10 else 0 end)+(case when selfie_ok then 10 else 0 end)+(case when aadhaar_ok then 20 else 0 end)+(case when social_ok then 10 else 0 end)+(case when rating_value>=4 then 10 else 0 end)+(case when joined_count>=20 then 30 when joined_count>=10 then 20 else 0 end);
  return jsonb_build_object('total',least(total_value,100),'email_verified',email_ok,'phone_verified',phone_ok,'selfie_verified',selfie_ok,'aadhaar_verified',aadhaar_ok,'social_linked',social_ok,'rating',rating_value,'activities_joined',joined_count);
end
$$;

create or replace function public.my_trust_score()
returns jsonb language sql stable security definer set search_path='' as $$ select private.trust_score_for(public.get_current_app_user_id()) $$;
create or replace function public.profile_trust_score(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare score jsonb;
begin
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  score:=private.trust_score_for(p_user_id);
  return jsonb_build_object('total',score->'total','rating',score->'rating','activities_joined',score->'activities_joined');
end
$$;

create or replace function private.my_profile_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); u public.tbl_users; score jsonb;
begin
  select * into u from public.tbl_users where id=me; score:=private.trust_score_for(me);
  return jsonb_build_object('verified',u.isverified=1,'nitro',coalesce(u.points,0),'karma',coalesce(u.rating,0),'trust_score',score->'total','rating',score->'rating','activities',(select count(*) from public.tbl_events e where not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false) and e.status<>'draft' and (e.created_by=me or exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=me and p.status in ('approved','going','paid')))),'activities_joined',score->'activities_joined','squad',(select count(distinct case when f.user_id=me then f.friend_id else f.user_id end) from public.tbl_friends f where f.user_id=me or f.friend_id=me),'email_verified',score->'email_verified','phone_verified',score->'phone_verified','selfie_verified',score->'selfie_verified','aadhaar_verified',score->'aadhaar_verified','social_linked',score->'social_linked');
end
$$;

-- Other authenticated viewers may read gallery photos only when they may read the profile.
drop policy if exists own_profile_photos_read on public.tbl_user_profile_photos;
drop policy if exists visible_profile_photos_read on public.tbl_user_profile_photos;
create policy visible_profile_photos_read on public.tbl_user_profile_photos for select to authenticated
using (user_id=public.current_app_user_id() or private.can_read_profile(user_id));
alter table public.tbl_user_profile_photos drop constraint if exists tbl_user_profile_photos_position_check;
alter table public.tbl_user_profile_photos add constraint tbl_user_profile_photos_position_check check (position between 2 and 3);

-- Preserve the existing three-slot gallery while moving its secondary photos
-- onto the owner-safe storage contract. Slot 1 already mirrors tbl_users.profile_image.
insert into public.tbl_user_profile_photos(user_id,position,storage_path,public_url,created_at,updated_at)
select i.user_id,i.slot_index,i.image_url,i.image_url,coalesce(i.created_at,now()),coalesce(i.created_at,now())
from public.tbl_user_profile_images i
where i.slot_index between 2 and 3
on conflict do nothing;

create or replace function public.save_my_profile_photo(p_position integer,p_storage_path text,p_public_url text)
returns public.tbl_user_profile_photos language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); owner uuid:=auth.uid(); result public.tbl_user_profile_photos;
begin
  if p_position not between 2 and 3 then raise exception 'Profile photo position must be 2 or 3'; end if;
  if p_storage_path not like owner::text||'/profile-gallery/%' then raise exception 'Invalid profile photo path' using errcode='42501'; end if;
  insert into public.tbl_user_profile_photos(user_id,position,storage_path,public_url,updated_at)
  values(me,p_position,p_storage_path,p_public_url,now()) on conflict(user_id,position) do update set storage_path=excluded.storage_path,public_url=excluded.public_url,updated_at=now()
  returning * into result; return result;
end
$$;

create or replace function public.delete_my_profile_photo(p_photo_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); old_path text;
begin
  delete from public.tbl_user_profile_photos where id=p_photo_id and user_id=me returning storage_path into old_path;
  if old_path is null then raise exception 'Profile photo not found'; end if;
  return jsonb_build_object('removed_path',old_path);
end
$$;

create or replace function public.promote_my_profile_photo(p_position integer,p_previous_path text default null,p_previous_url text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); owner uuid:=auth.uid(); chosen public.tbl_user_profile_photos; previous_url text;
begin
  select * into chosen from public.tbl_user_profile_photos where user_id=me and position=p_position for update;
  if chosen.id is null then raise exception 'Profile photo not found'; end if;
  select profile_image into previous_url from public.tbl_users where id=me for update;
  update public.tbl_users set profile_image=chosen.public_url where id=me;
  delete from public.tbl_user_profile_photos where id=chosen.id;
  if previous_url is not null and coalesce(p_previous_url,previous_url)=previous_url then
    insert into public.tbl_user_profile_photos(user_id,position,storage_path,public_url,updated_at)
    values(me,p_position,coalesce(p_previous_path,previous_url),previous_url,now());
  end if;
  return jsonb_build_object('public_url',chosen.public_url,'position',1);
end
$$;

create or replace function public.delete_my_primary_profile_photo()
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); old_url text; next_photo public.tbl_user_profile_photos;
begin
  select profile_image into old_url from public.tbl_users where id=me for update;
  select * into next_photo from public.tbl_user_profile_photos where user_id=me order by position limit 1 for update;
  if next_photo.id is null then update public.tbl_users set profile_image=null where id=me;
  else update public.tbl_users set profile_image=next_photo.public_url where id=me; delete from public.tbl_user_profile_photos where id=next_photo.id; end if;
  return jsonb_build_object('public_url',case when next_photo.id is null then null else next_photo.public_url end,'removed_url',old_url);
end
$$;

-- Reports are durable, idempotent and unavailable to the Vibe owner.
create table if not exists public.tbl_vibe_reports (
  id bigint generated by default as identity primary key,
  vibe_id bigint not null references public.tbl_activity_vibes(id) on delete cascade,
  reported_by integer not null references public.tbl_users(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vibe_id,reported_by)
);
alter table public.tbl_vibe_reports enable row level security;
revoke all on public.tbl_vibe_reports from anon,authenticated;

create or replace function public.report_vibe(p_vibe_id bigint,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); vibe public.tbl_activity_vibes; report_id bigint;
begin
  select * into vibe from public.tbl_activity_vibes v where v.id=p_vibe_id and (v.visibility='public' or (v.visibility='activity' and public.is_event_participant(v.event_id::integer)));
  if vibe.id is null then raise exception 'Vibe is unavailable'; end if;
  if vibe.user_id=me then raise exception 'You cannot report your own Vibe'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 100 or length(btrim(coalesce(p_details,'')))>1000 then raise exception 'Choose a valid reason and keep details under 1000 characters'; end if;
  insert into public.tbl_vibe_reports(vibe_id,reported_by,reason,details,updated_at)
  values(p_vibe_id,me,btrim(p_reason),btrim(coalesce(p_details,'')),now())
  on conflict(vibe_id,reported_by) do update set reason=excluded.reason,details=excluded.details,status='open',updated_at=now()
  returning id into report_id;
  return jsonb_build_object('id',report_id,'submitted',true);
end
$$;

revoke all on function private.can_manage_activity(integer,integer),private.users_blocked(integer,integer),private.trust_score_for(integer) from public,anon,authenticated;
revoke all on function public.is_event_participant(integer),public.set_activity_cohost(integer,integer,boolean),public.update_activity(integer,jsonb),public.cancel_activity(integer),public.respond_activity_join(integer,integer,text),public.create_activity_invite(integer,timestamptz,integer),public.redeem_activity_invite(text),public.ensure_activity_chat(integer),public.assert_chat_membership(integer),public.create_direct_chat_room(integer),public.block_chat_user(integer),public.unblock_chat_user(integer),public.list_my_blocked_users(),public.list_chat_inbox(integer),public.redeem_referral(integer),public.my_trust_score(),public.profile_trust_score(integer),public.save_my_profile_photo(integer,text,text),public.delete_my_profile_photo(bigint),public.promote_my_profile_photo(integer,text,text),public.delete_my_primary_profile_photo(),public.report_vibe(bigint,text,text) from public,anon,authenticated;
grant execute on function public.is_event_participant(integer),public.set_activity_cohost(integer,integer,boolean),public.update_activity(integer,jsonb),public.cancel_activity(integer),public.respond_activity_join(integer,integer,text),public.create_activity_invite(integer,timestamptz,integer),public.redeem_activity_invite(text),public.ensure_activity_chat(integer),public.assert_chat_membership(integer),public.create_direct_chat_room(integer),public.block_chat_user(integer),public.unblock_chat_user(integer),public.list_my_blocked_users(),public.list_chat_inbox(integer),public.redeem_referral(integer),public.my_trust_score(),public.profile_trust_score(integer),public.save_my_profile_photo(integer,text,text),public.delete_my_profile_photo(bigint),public.promote_my_profile_photo(integer,text,text),public.delete_my_primary_profile_photo(),public.report_vibe(bigint,text,text) to authenticated;
