-- Client follow-up: Squad-only groups, 24-hour Stories, no personal-chat
-- polls, and attributable user/community safety reports.

create or replace function public.list_eligible_group_members()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.get_current_app_user_id() id), related as (
    select case when f.user_id = me.id then f.friend_id else f.user_id end member_id,
      min(f.created_at) connected_at
    from public.tbl_friends f cross join me
    where (f.user_id = me.id or f.friend_id = me.id)
      and f.user_id <> f.friend_id
    group by case when f.user_id = me.id then f.friend_id else f.user_id end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'fullname', u.fullname,
    'profile_image', u.profile_image,
    'isverified', u.isverified,
    'connected_at', r.connected_at
  ) order by coalesce(u.fullname, u.username), u.id), '[]'::jsonb)
  from related r
  join public.tbl_users u on u.id = r.member_id
  cross join me
  where coalesce(u.is_delete, 0) = 0
    and coalesce(u.is_active, 1) = 1
    and not private.users_blocked(me.id, u.id)
$$;

create or replace function private.create_group_chat_room_secure(
  p_title text,
  p_member_ids integer[],
  p_image_path text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  v_room_id integer;
  requested_count integer;
  image_path text := nullif(trim(coalesce(p_image_path, '')), '');
begin
  if length(trim(coalesce(p_title, ''))) not between 3 and 80 then
    raise exception 'Invalid group title';
  end if;
  if image_path is not null and (
    length(image_path) > 512
    or image_path not like auth.uid()::text || '/group/%'
  ) then
    raise exception 'Invalid group image path' using errcode = '42501';
  end if;

  select count(distinct member_id) into requested_count
  from unnest(coalesce(p_member_ids, '{}'::integer[])) member_id
  where member_id is not null and member_id <> me;
  if requested_count < 2 then
    raise exception 'Select at least two Squad members.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from (
      select distinct member_id
      from unnest(coalesce(p_member_ids, '{}'::integer[])) member_id
      where member_id is not null and member_id <> me
    ) requested
    where not exists (
      select 1
      from public.tbl_friends f
      join public.tbl_users u on u.id = requested.member_id
      where ((f.user_id = me and f.friend_id = requested.member_id)
          or (f.friend_id = me and f.user_id = requested.member_id))
        and coalesce(u.is_delete, 0) = 0
        and coalesce(u.is_active, 1) = 1
        and not private.users_blocked(me, requested.member_id)
    )
  ) then
    raise exception 'Groups can only include eligible Squad members.' using errcode = '42501';
  end if;

  insert into public.tbl_chat_rooms(room_type, created_by, title, image_url)
  values ('group', me, trim(p_title), image_path)
  returning id into v_room_id;
  insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
  values (v_room_id, me, 'admin', '{}'::jsonb);
  insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
  select v_room_id, requested.member_id, 'member', '{}'::jsonb
  from (
    select distinct member_id
    from unnest(p_member_ids) member_id
    where member_id is not null and member_id <> me
  ) requested
  on conflict (room_id, user_id) do nothing;
  return v_room_id;
end;
$$;

revoke all on function public.list_eligible_group_members() from public, anon;
grant execute on function public.list_eligible_group_members() to authenticated;
revoke all on function private.create_group_chat_room_secure(text, integer[], text)
  from public, anon, authenticated;

-- Historical personal-chat polls remain readable, but every new poll must be
-- attached to an eligible group or Community room even if a client bypasses UI.
create or replace function private.reject_personal_chat_poll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.tbl_chat_rooms r
    where r.id = new.room_id and r.room_type = 'personal'
  ) then
    raise exception 'Polls are not available in personal chats.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_personal_chat_poll() from public, anon, authenticated;
drop trigger if exists reject_personal_chat_poll on public.tbl_chat_polls;
create trigger reject_personal_chat_poll
before insert on public.tbl_chat_polls
for each row execute function private.reject_personal_chat_poll();

-- The product's existing approved Story duration is exactly 24 hours. Enforce
-- it at persistence so custom clients cannot create a longer-lived Story.
alter table public.tbl_stories
  alter column expires_at set default (now() + interval '24 hours');
create or replace function private.set_story_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end;
$$;
revoke all on function private.set_story_expiry() from public, anon, authenticated;
drop trigger if exists set_story_expiry on public.tbl_stories;
create trigger set_story_expiry
before insert on public.tbl_stories
for each row execute function private.set_story_expiry();

create table if not exists public.tbl_community_reports (
  id serial primary key,
  community_id integer not null references public.tbl_chat_rooms(id) on delete cascade,
  reporter_id integer not null references public.tbl_users(id) on delete cascade,
  reason varchar(100) not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tbl_community_reports_queue_idx
  on public.tbl_community_reports(status, created_at desc);
create index if not exists tbl_community_reports_target_idx
  on public.tbl_community_reports(community_id, created_at desc);
alter table public.tbl_community_reports enable row level security;
drop policy if exists community_report_own_read on public.tbl_community_reports;
create policy community_report_own_read on public.tbl_community_reports
for select to authenticated
using (reporter_id = (select public.current_app_user_id()) or public.is_wenitro_admin());
grant select on public.tbl_community_reports to authenticated;
revoke insert, update, delete on public.tbl_community_reports from authenticated;

create or replace function public.submit_safety_report(
  p_target_type text,
  p_target_id integer,
  p_reason text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  clean_type text := lower(trim(coalesce(p_target_type, '')));
  clean_reason text := lower(trim(coalesce(p_reason, '')));
  clean_description text := nullif(trim(coalesce(p_description, '')), '');
  report_id bigint;
  recent_count integer;
begin
  if clean_type not in ('user', 'community') or p_target_id is null then
    raise exception 'Invalid report target.' using errcode = '22023';
  end if;
  if clean_description is not null and length(clean_description) > 1000 then
    raise exception 'Report details must be 1000 characters or fewer.' using errcode = '22023';
  end if;
  if clean_type = 'user' and clean_reason not in (
    'harassment_or_bullying', 'spam', 'fake_account_or_impersonation',
    'inappropriate_content', 'suspicious_behaviour', 'other'
  ) then
    raise exception 'Choose a valid user report reason.' using errcode = '22023';
  end if;
  if clean_type = 'community' and clean_reason not in (
    'inappropriate_content', 'harassment', 'spam',
    'fake_or_misleading_community', 'hate_or_abusive_content', 'other'
  ) then
    raise exception 'Choose a valid Community report reason.' using errcode = '22023';
  end if;

  select
    (select count(*) from public.tbl_user_reports r
      where r.reporter_id = me and r.created_at > now() - interval '1 hour')
    + (select count(*) from public.tbl_community_reports r
      where r.reporter_id = me and r.created_at > now() - interval '1 hour')
  into recent_count;
  if recent_count >= 5 then
    raise exception 'Too many reports submitted. Please try again later.' using errcode = '42900';
  end if;

  if clean_type = 'user' then
    if p_target_id = me then
      raise exception 'You cannot report your own profile.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.tbl_users u
      where u.id = p_target_id and coalesce(u.is_delete, 0) = 0
    ) then
      raise exception 'Reported profile is unavailable.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.tbl_user_reports r
      where r.reporter_id = me and r.target_user_id = p_target_id
        and r.reason = clean_reason and r.status in ('open', 'reviewing')
        and r.created_at > now() - interval '24 hours'
    ) then
      raise exception 'You already submitted this report recently.' using errcode = '23505';
    end if;
    insert into public.tbl_user_reports(target_user_id, reporter_id, reason, description, status)
    values (p_target_id, me, clean_reason, clean_description, 'open')
    returning id into report_id;
  else
    if not exists (
      select 1 from public.tbl_chat_rooms r
      where r.id = p_target_id and r.room_type = 'community'
    ) then
      raise exception 'Reported Community is unavailable.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.tbl_community_reports r
      where r.reporter_id = me and r.community_id = p_target_id
        and r.reason = clean_reason and r.status in ('open', 'reviewing')
        and r.created_at > now() - interval '24 hours'
    ) then
      raise exception 'You already submitted this report recently.' using errcode = '23505';
    end if;
    insert into public.tbl_community_reports(community_id, reporter_id, reason, description, status)
    values (p_target_id, me, clean_reason, clean_description, 'open')
    returning id into report_id;
  end if;
  return jsonb_build_object('id', report_id, 'type', clean_type, 'status', 'open');
end;
$$;
revoke all on function public.submit_safety_report(text, integer, text, text)
  from public, anon;
grant execute on function public.submit_safety_report(text, integer, text, text)
  to authenticated;
revoke insert on table public.tbl_user_reports from authenticated;

drop trigger if exists protect_report_review on public.tbl_community_reports;
create trigger protect_report_review
before insert or update on public.tbl_community_reports
for each row execute function private.protect_report_review_status();

create or replace function public.admin_review_report(
  p_type text,
  p_id integer,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  table_name text;
begin
  if not public.is_wenitro_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_type not in ('user', 'event', 'community')
    or p_status not in ('reviewing', 'resolved', 'dismissed', 'open')
    or p_type is null or p_status is null then
    raise exception 'Invalid report state';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 1000 then
    raise exception 'Review reason required (5–1000 characters)';
  end if;
  table_name := case p_type
    when 'user' then 'tbl_user_reports'
    when 'event' then 'tbl_event_reports'
    else 'tbl_community_reports'
  end;
  execute format('select status from public.%I where id=$1 for update', table_name)
    into previous_status using p_id;
  if previous_status is null then raise exception 'Report unavailable'; end if;
  execute format('update public.%I set status=$1 where id=$2', table_name)
    using p_status, p_id;
  if previous_status <> p_status then
    insert into private.admin_operation_audit(
      actor_id, target_type, target_id, action, reason, previous_state, next_state
    ) values (
      auth.uid(), p_type || '_report', p_id, 'review_report', btrim(p_reason),
      jsonb_build_object('status', previous_status), jsonb_build_object('status', p_status)
    );
  end if;
  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;
revoke all on function public.admin_review_report(text, integer, text, text)
  from public, anon;
grant execute on function public.admin_review_report(text, integer, text, text)
  to authenticated;
