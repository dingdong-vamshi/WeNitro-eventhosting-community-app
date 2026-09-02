-- WeNitro completion bridge. Target schema: legacy public.tbl_* tables with integer IDs.
-- This migration is intentionally additive and replay-safe. New client writes go through
-- authenticated RPCs; helper and trigger functions are not client executable.

create table if not exists public.tbl_event_comments (
  id bigserial primary key,
  event_id integer not null references public.tbl_events(id) on delete cascade,
  user_id integer not null references public.tbl_users(id) on delete cascade,
  parent_id bigint references public.tbl_event_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tbl_event_comments_event_created_idx
  on public.tbl_event_comments(event_id, created_at, id)
  where deleted_at is null;
create index if not exists tbl_event_comments_user_idx
  on public.tbl_event_comments(user_id, created_at desc);
create index if not exists tbl_event_comments_parent_idx
  on public.tbl_event_comments(parent_id)
  where parent_id is not null;
create index if not exists tbl_user_interests_user_category_idx
  on public.tbl_user_interests(user_id, category_id);
create index if not exists tbl_story_views_viewer_idx
  on public.tbl_story_views(viewer_id, viewed_at desc);
create index if not exists tbl_notifications_user_unread_idx
  on public.tbl_notifications(user_id, id desc)
  where coalesce(is_read, false) = false;
create index if not exists tbl_user_verification_status_idx
  on public.tbl_user_verification(status, id desc);

create or replace function public.can_read_event(p_event_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tbl_events e
    where e.id = p_event_id
      and not coalesce(e.is_deleted, false)
      and (
        e.visibility_type = 'public'
        or e.created_by = public.current_app_user_id()
        or exists (
          select 1
          from public.tbl_event_participants ep
          where ep.event_id = e.id
            and ep.user_id = public.current_app_user_id()
        )
      )
  )
$$;

alter table public.tbl_event_comments enable row level security;
revoke all on table public.tbl_event_comments from anon, authenticated;
grant select on table public.tbl_event_comments to authenticated;
revoke all on sequence public.tbl_event_comments_id_seq from anon;

drop policy if exists wenitro_admin_all on public.tbl_event_comments;
create policy wenitro_admin_all
on public.tbl_event_comments
for select
to authenticated
using (public.is_wenitro_admin());

drop policy if exists activity_comments_read on public.tbl_event_comments;
create policy activity_comments_read
on public.tbl_event_comments
for select
to authenticated
using (deleted_at is null and public.can_read_event(event_id));

-- Direct writes to legacy interests remain closed. Users mutate their own set atomically.
alter table public.tbl_user_interests enable row level security;
revoke all on table public.tbl_user_interests from anon, authenticated;
grant select on table public.tbl_user_interests to authenticated;
drop policy if exists own_interests_read on public.tbl_user_interests;
create policy own_interests_read
on public.tbl_user_interests
for select
to authenticated
using (user_id = public.current_app_user_id() or public.is_wenitro_admin());

create or replace function public.list_activity_comments(
  p_event_id integer,
  p_page integer default 1,
  p_page_size integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 30), 1), 100);
  v_total integer;
  v_items jsonb;
begin
  perform public.get_current_app_user_id();
  if not public.can_read_event(p_event_id) then
    raise exception 'Activity is unavailable' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.tbl_event_comments c
  where c.event_id = p_event_id and c.deleted_at is null;

  select coalesce(jsonb_agg(q.item order by q.created_at, q.id), '[]'::jsonb)
  into v_items
  from (
    select
      c.id,
      c.created_at,
      to_jsonb(c) || jsonb_build_object(
        'author', jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'fullname', u.fullname,
          'profile_image', u.profile_image
        )
      ) as item
    from public.tbl_event_comments c
    join public.tbl_users u on u.id = c.user_id
    where c.event_id = p_event_id and c.deleted_at is null
    order by c.created_at, c.id
    offset (v_page - 1) * v_size
    limit v_size
  ) q;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'has_more', v_page * v_size < v_total
  );
end
$$;

create or replace function public.create_activity_comment(
  p_event_id integer,
  p_body text,
  p_parent_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_comment public.tbl_event_comments;
  v_author public.tbl_users;
begin
  if not public.can_read_event(p_event_id) then
    raise exception 'Activity is unavailable' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Comment must contain 1 to 2000 characters';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.tbl_event_comments
    where id = p_parent_id and event_id = p_event_id and deleted_at is null
  ) then
    raise exception 'Parent comment is unavailable';
  end if;

  insert into public.tbl_event_comments(event_id, user_id, parent_id, body)
  values (p_event_id, v_user_id, p_parent_id, trim(p_body))
  returning * into v_comment;

  select * into v_author from public.tbl_users where id = v_user_id;
  return to_jsonb(v_comment) || jsonb_build_object(
    'author', jsonb_build_object(
      'id', v_author.id,
      'username', v_author.username,
      'fullname', v_author.fullname,
      'profile_image', v_author.profile_image
    )
  );
end
$$;

create or replace function public.delete_activity_comment(p_comment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_comment public.tbl_event_comments;
begin
  update public.tbl_event_comments
  set deleted_at = now(), updated_at = now()
  where id = p_comment_id
    and deleted_at is null
    and (user_id = v_user_id or public.is_wenitro_admin())
  returning * into v_comment;
  if v_comment.id is null then
    raise exception 'Comment is unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object('id', v_comment.id, 'event_id', v_comment.event_id);
end
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'fullname', u.fullname,
    'email', u.email,
    'bio', u.bio,
    'about', u.about,
    'dob', u.dob,
    'gender', u.gender,
    'nationality', u.nationality,
    'occupation', u.occupation,
    'profile_image', u.profile_image,
    'rating', u.rating,
    'points', u.points,
    'isverified', u.isverified,
    'create_at', u.create_at
  )
  from public.tbl_users u
  where u.id = public.get_current_app_user_id()
$$;

create or replace function public.update_my_profile(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_username text;
  v_fullname text;
  v_dob date;
begin
  if exists (
    select 1 from jsonb_object_keys(v_patch) k
    where k not in (
      'username', 'fullname', 'bio', 'about', 'dob', 'gender',
      'nationality', 'occupation', 'profile_image'
    )
  ) then
    raise exception 'Profile patch contains unsupported fields';
  end if;

  if v_patch ? 'username' then
    v_username := trim(v_patch->>'username');
    if v_username !~ '^[A-Za-z0-9_]{3,40}$' then
      raise exception 'Username must be 3 to 40 letters, numbers, or underscores';
    end if;
    if exists (
      select 1 from public.tbl_users
      where lower(username) = lower(v_username) and id <> v_user_id
    ) then
      raise exception 'Username is already in use' using errcode = '23505';
    end if;
  end if;

  if v_patch ? 'fullname' then
    v_fullname := trim(v_patch->>'fullname');
    if char_length(v_fullname) not between 1 and 150 then
      raise exception 'Full name must contain 1 to 150 characters';
    end if;
  end if;

  if v_patch ? 'dob' and v_patch->>'dob' is not null then
    v_dob := (v_patch->>'dob')::date;
    if v_dob > (current_date - interval '18 years')::date then
      raise exception 'WeNitro members must be at least 18 years old';
    end if;
  end if;

  update public.tbl_users
  set
    username = case when v_patch ? 'username' then v_username else username end,
    fullname = case when v_patch ? 'fullname' then v_fullname else fullname end,
    bio = case when v_patch ? 'bio' then nullif(left(trim(v_patch->>'bio'), 500), '') else bio end,
    about = case when v_patch ? 'about' then nullif(left(trim(v_patch->>'about'), 2000), '') else about end,
    dob = case when v_patch ? 'dob' then v_dob else dob end,
    gender = case when v_patch ? 'gender' then nullif(left(trim(v_patch->>'gender'), 40), '') else gender end,
    nationality = case when v_patch ? 'nationality' then nullif(left(trim(v_patch->>'nationality'), 80), '') else nationality end,
    occupation = case when v_patch ? 'occupation' then nullif(left(trim(v_patch->>'occupation'), 120), '') else occupation end,
    profile_image = case when v_patch ? 'profile_image' then nullif(left(trim(v_patch->>'profile_image'), 2048), '') else profile_image end
  where id = v_user_id;

  return public.get_my_profile();
end
$$;

create or replace function public.list_interest_catalog()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', lower(regexp_replace(trim(c.name), '[^A-Za-z0-9]+', '-', 'g')),
    'name', c.name,
    'icon', null
  )
  from public.tbl_categories c
  order by c.name, c.id
$$;

create or replace function public.list_my_interests()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', lower(regexp_replace(trim(c.name), '[^A-Za-z0-9]+', '-', 'g')),
    'name', c.name,
    'icon', null,
    'selected_at', ui.created_at
  )
  from public.tbl_user_interests ui
  join public.tbl_categories c on c.id = ui.category_id
  where ui.user_id = public.get_current_app_user_id()
  order by c.name, c.id
$$;

create or replace function public.set_my_interests(p_category_ids integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_ids integer[];
  v_valid integer;
  v_items jsonb;
begin
  select coalesce(array_agg(distinct x), '{}'::integer[])
  into v_ids
  from unnest(coalesce(p_category_ids, '{}'::integer[])) x;

  if cardinality(v_ids) > 50 or exists (select 1 from unnest(v_ids) x where x <= 0) then
    raise exception 'Select between 0 and 50 valid interests';
  end if;

  select count(*) into v_valid
  from public.tbl_categories c
  where c.id = any(v_ids);
  if v_valid <> cardinality(v_ids) then
    raise exception 'One or more interests are unavailable';
  end if;

  delete from public.tbl_user_interests
  where user_id = v_user_id and not (category_id = any(v_ids));

  insert into public.tbl_user_interests(user_id, category_id)
  select v_user_id, x
  from unnest(v_ids) x
  where not exists (
    select 1 from public.tbl_user_interests ui
    where ui.user_id = v_user_id and ui.category_id = x
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', lower(regexp_replace(trim(c.name), '[^A-Za-z0-9]+', '-', 'g')),
    'name', c.name,
    'icon', null,
    'selected_at', ui.created_at
  ) order by c.name, c.id), '[]'::jsonb)
  into v_items
  from public.tbl_user_interests ui
  join public.tbl_categories c on c.id = ui.category_id
  where ui.user_id = v_user_id;

  return v_items;
end
$$;

create or replace function public.list_badge_catalog()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(b) from public.tbl_badges b order by b.name, b.id
$$;

create or replace function public.list_my_badges()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(b) || jsonb_build_object(
    'awarded_at', ub.awarded_at,
    'awarded_by', ub.awarded_by
  )
  from public.tbl_user_badges ub
  join public.tbl_badges b on b.id = ub.badge_id
  where ub.user_id = public.get_current_app_user_id()
  order by ub.awarded_at desc, b.id
$$;

create or replace function public.create_story(
  p_media_url text,
  p_media_type text,
  p_caption text default '',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_auth_id uuid := auth.uid();
  v_story public.tbl_stories;
  v_type text := case when p_media_type = 'image' then 'photo' else p_media_type end;
  v_expiry timestamptz := least(coalesce(p_expires_at, now() + interval '24 hours'), now() + interval '24 hours');
begin
  if v_type not in ('photo', 'video') then
    raise exception 'Story media type must be photo or video';
  end if;
  if nullif(trim(p_media_url), '') is null or p_media_url not like v_auth_id::text || '/%' then
    raise exception 'Story media must be an owned storage object path';
  end if;
  if v_expiry <= now() then
    raise exception 'Story expiry must be in the future';
  end if;

  insert into public.tbl_stories(user_id, media_url, media_type, caption, expires_at)
  values (v_user_id, p_media_url, v_type, left(coalesce(p_caption, ''), 2200), v_expiry)
  returning * into v_story;
  return to_jsonb(v_story);
end
$$;

create or replace function public.list_active_stories(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id bigint default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s) || jsonb_build_object(
    'owner', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'profile_image', u.profile_image
    ),
    'viewed', exists (
      select 1 from public.tbl_story_views sv
      where sv.story_id = s.id and sv.viewer_id = public.current_app_user_id()
    )
  )
  from public.tbl_stories s
  join public.tbl_users u on u.id = s.user_id
  where s.deleted_at is null
    and s.expires_at > now()
    and (
      p_before_created_at is null
      or (s.created_at, s.id) < (p_before_created_at, coalesce(p_before_id, 9223372036854775807::bigint))
    )
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create or replace function public.list_my_stories(p_include_expired boolean default false)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s) || jsonb_build_object(
    'view_count', (select count(*) from public.tbl_story_views sv where sv.story_id = s.id)
  )
  from public.tbl_stories s
  where s.user_id = public.get_current_app_user_id()
    and s.deleted_at is null
    and (p_include_expired or s.expires_at > now())
  order by s.created_at desc, s.id desc
$$;

create or replace function public.mark_story_viewed(p_story_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_viewed_at timestamptz;
begin
  if not exists (
    select 1 from public.tbl_stories
    where id = p_story_id and deleted_at is null and expires_at > now()
  ) then
    raise exception 'Story is unavailable';
  end if;

  insert into public.tbl_story_views(story_id, viewer_id)
  values (p_story_id, v_user_id)
  on conflict(story_id, viewer_id)
  do update set viewed_at = excluded.viewed_at
  returning viewed_at into v_viewed_at;

  return jsonb_build_object(
    'story_id', p_story_id,
    'viewer_id', v_user_id,
    'viewed_at', v_viewed_at
  );
end
$$;

create or replace function public.delete_story(p_story_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_story public.tbl_stories;
begin
  update public.tbl_stories
  set deleted_at = now()
  where id = p_story_id and user_id = v_user_id and deleted_at is null
  returning * into v_story;
  if v_story.id is null then
    raise exception 'Story is unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object('id', v_story.id, 'media_path', v_story.media_url);
end
$$;

create or replace function private.enqueue_notification(
  p_user_id integer,
  p_type text,
  p_title text,
  p_body text,
  p_reference_id text,
  p_sender_id integer default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_user_id is null or p_user_id = p_sender_id then
    return;
  end if;
  insert into public.tbl_notifications(
    user_id, sender_id, type, title, body, reference_id, data, is_read
  ) values (
    p_user_id,
    p_sender_id,
    left(coalesce(p_type, 'system'), 80),
    left(coalesce(p_title, ''), 180),
    left(coalesce(p_body, ''), 1000),
    left(coalesce(p_reference_id, ''), 255),
    coalesce(p_data, '{}'::jsonb),
    false
  );
end
$$;

create or replace function private.notify_activity_comment()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_host_id integer;
  v_title text;
  v_parent_user_id integer;
begin
  select e.created_by, e.title into v_host_id, v_title
  from public.tbl_events e where e.id = new.event_id;

  perform private.enqueue_notification(
    v_host_id,
    'activity_comment',
    'New activity comment',
    left(new.body, 240),
    new.event_id::text,
    new.user_id,
    jsonb_build_object('event_id', new.event_id, 'comment_id', new.id)
  );

  if new.parent_id is not null then
    select c.user_id into v_parent_user_id
    from public.tbl_event_comments c where c.id = new.parent_id;
    if v_parent_user_id is distinct from v_host_id then
      perform private.enqueue_notification(
        v_parent_user_id,
        'activity_comment_reply',
        'New reply on ' || coalesce(v_title, 'an activity'),
        left(new.body, 240),
        new.event_id::text,
        new.user_id,
        jsonb_build_object('event_id', new.event_id, 'comment_id', new.id, 'parent_id', new.parent_id)
      );
    end if;
  end if;
  return new;
end
$$;

create or replace function private.notify_activity_participation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_host_id integer;
  v_title text;
begin
  select e.created_by, e.title into v_host_id, v_title
  from public.tbl_events e where e.id = new.event_id;

  if tg_op = 'INSERT' then
    perform private.enqueue_notification(
      v_host_id,
      case when new.status = 'pending' then 'activity_join_request' else 'activity_join' end,
      case when new.status = 'pending' then 'New activity join request' else 'New activity participant' end,
      'A member joined ' || coalesce(v_title, 'your activity'),
      new.event_id::text,
      new.user_id,
      jsonb_build_object('event_id', new.event_id, 'participant_id', new.id, 'status', new.status)
    );
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected', 'waitlist') then
    perform private.enqueue_notification(
      new.user_id,
      'activity_join_status',
      'Activity request ' || new.status,
      'Your request for ' || coalesce(v_title, 'an activity') || ' is ' || new.status,
      new.event_id::text,
      v_host_id,
      jsonb_build_object('event_id', new.event_id, 'participant_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end
$$;

create or replace function private.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_recipient record;
  v_sender_name text;
begin
  if new.room_id is null or new.sender_id is null then
    return new;
  end if;
  select coalesce(nullif(fullname, ''), username, 'A member') into v_sender_name
  from public.tbl_users where id = new.sender_id;

  for v_recipient in
    select p.user_id
    from public.tbl_chat_participants p
    where p.room_id = new.room_id and p.user_id <> new.sender_id
  loop
    perform private.enqueue_notification(
      v_recipient.user_id,
      'message',
      coalesce(v_sender_name, 'New message'),
      case when new.message_type = 'text' then left(new.content, 240) else 'Sent ' || coalesce(new.message_type, 'media') end,
      new.id::text,
      new.sender_id,
      jsonb_build_object('room_id', new.room_id, 'message_id', new.id)
    );
  end loop;
  return new;
end
$$;

create or replace function private.notify_community_member()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner_id integer;
  v_title text;
begin
  select r.created_by, r.title into v_owner_id, v_title
  from public.tbl_chat_rooms r
  where r.id = new.room_id and r.room_type = 'community';
  if found then
    perform private.enqueue_notification(
      v_owner_id,
      'community_join',
      'New community member',
      'A member joined ' || coalesce(v_title, 'your community'),
      new.room_id::text,
      new.user_id,
      jsonb_build_object('room_id', new.room_id, 'member_id', new.user_id)
    );
  end if;
  return new;
end
$$;

create or replace function private.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner_id integer;
  v_room_id integer;
begin
  select p.user_id, p.room_id into v_owner_id, v_room_id
  from public.tbl_community_posts p where p.id = new.post_id;
  perform private.enqueue_notification(
    v_owner_id,
    'community_comment',
    'New community post comment',
    left(new.body, 240),
    new.post_id::text,
    new.user_id,
    jsonb_build_object('room_id', v_room_id, 'post_id', new.post_id, 'comment_id', new.id)
  );
  return new;
end
$$;

create or replace function private.notify_community_reaction()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner_id integer;
  v_room_id integer;
begin
  select p.user_id, p.room_id into v_owner_id, v_room_id
  from public.tbl_community_posts p where p.id = new.post_id;
  perform private.enqueue_notification(
    v_owner_id,
    'community_reaction',
    'New community post reaction',
    'Someone reacted to your community post',
    new.post_id::text,
    new.user_id,
    jsonb_build_object('room_id', v_room_id, 'post_id', new.post_id, 'reaction', new.reaction)
  );
  return new;
end
$$;

create or replace function private.notify_verification_status()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin record;
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    for v_admin in
      select u.id
      from public.tbl_users u
      join auth.users au on au.id = u.auth_user_id
      where coalesce(au.raw_app_meta_data->>'role', '') in ('admin', 'super_admin')
    loop
      perform private.enqueue_notification(
        v_admin.id,
        'verification_submitted',
        'Verification submitted',
        'A member submitted an identity verification request',
        new.id::text,
        new.user_id,
        jsonb_build_object('verification_id', new.id, 'user_id', new.user_id)
      );
    end loop;
  end if;

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    perform private.enqueue_notification(
      new.user_id,
      'verification_reviewed',
      'Verification ' || new.status,
      case when new.status = 'approved'
        then 'Your identity verification was approved'
        else 'Your identity verification needs attention'
      end,
      new.id::text,
      null,
      jsonb_build_object('verification_id', new.id, 'status', new.status)
    );
  end if;
  return new;
end
$$;

create or replace function public.admin_list_verifications(
  p_status text default null,
  p_limit integer default 50,
  p_before_id integer default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_wenitro_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  select jsonb_build_object(
    'id', v.id,
    'user_id', v.user_id,
    'verification_type', v.verification_type,
    'status', v.status,
    'document_path', v.document_path,
    'document_mime', v.document_mime,
    'document_size', v.document_size,
    'review_notes', v.review_notes,
    'submitted_at', v.submitted_at,
    'reviewed_at', v.reviewed_at,
    'created_at', v.created_at,
    'updated_at', v.updated_at,
    'user', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'profile_image', u.profile_image
    )
  )
  from public.tbl_user_verification v
  join public.tbl_users u on u.id = v.user_id
  where (p_status is null or v.status = p_status)
    and (p_before_id is null or v.id < p_before_id)
  order by v.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end
$$;

create or replace function public.admin_review_verification(
  p_verification_id integer,
  p_status text,
  p_review_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id integer;
  v_verification public.tbl_user_verification;
  v_badge_id integer;
begin
  if not public.is_wenitro_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Review status must be approved or rejected';
  end if;
  v_admin_id := public.get_current_app_user_id();

  update public.tbl_user_verification
  set
    status = p_status,
    review_notes = left(coalesce(p_review_notes, ''), 2000),
    reviewed_at = now(),
    updated_at = now()
  where id = p_verification_id and status in ('submitted', 'under_review')
  returning * into v_verification;

  if v_verification.id is null then
    raise exception 'Verification is unavailable or already reviewed';
  end if;

  update public.tbl_users
  set isverified = case when p_status = 'approved' then 1 else 0 end
  where id = v_verification.user_id;

  if p_status = 'approved' then
    select id into v_badge_id from public.tbl_badges where slug = 'verified';
    if v_badge_id is not null then
      insert into public.tbl_user_badges(user_id, badge_id, awarded_by)
      values (v_verification.user_id, v_badge_id, v_admin_id)
      on conflict(user_id, badge_id) do update
      set awarded_at = now(), awarded_by = excluded.awarded_by;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_verification.id,
    'user_id', v_verification.user_id,
    'status', v_verification.status,
    'review_notes', v_verification.review_notes,
    'reviewed_at', v_verification.reviewed_at
  );
end
$$;

drop trigger if exists notify_activity_comment on public.tbl_event_comments;
create trigger notify_activity_comment
after insert on public.tbl_event_comments
for each row execute function private.notify_activity_comment();

drop trigger if exists notify_activity_participation on public.tbl_event_participants;
create trigger notify_activity_participation
after insert or update of status on public.tbl_event_participants
for each row execute function private.notify_activity_participation();

drop trigger if exists notify_chat_message on public.tbl_messages;
create trigger notify_chat_message
after insert on public.tbl_messages
for each row execute function private.notify_chat_message();

drop trigger if exists notify_community_member on public.tbl_chat_participants;
create trigger notify_community_member
after insert on public.tbl_chat_participants
for each row execute function private.notify_community_member();

drop trigger if exists notify_community_comment on public.tbl_community_post_comments;
create trigger notify_community_comment
after insert on public.tbl_community_post_comments
for each row execute function private.notify_community_comment();

drop trigger if exists notify_community_reaction on public.tbl_community_post_reactions;
create trigger notify_community_reaction
after insert on public.tbl_community_post_reactions
for each row execute function private.notify_community_reaction();

drop trigger if exists notify_verification_status on public.tbl_user_verification;
create trigger notify_verification_status
after insert or update of status on public.tbl_user_verification
for each row execute function private.notify_verification_status();

revoke all on function private.enqueue_notification(integer, text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function private.notify_activity_comment() from public, anon, authenticated;
revoke all on function private.notify_activity_participation() from public, anon, authenticated;
revoke all on function private.notify_chat_message() from public, anon, authenticated;
revoke all on function private.notify_community_member() from public, anon, authenticated;
revoke all on function private.notify_community_comment() from public, anon, authenticated;
revoke all on function private.notify_community_reaction() from public, anon, authenticated;
revoke all on function private.notify_verification_status() from public, anon, authenticated;

revoke execute on function public.can_read_event(integer) from public, anon;
revoke execute on function public.list_activity_comments(integer, integer, integer) from public, anon;
revoke execute on function public.create_activity_comment(integer, text, bigint) from public, anon;
revoke execute on function public.delete_activity_comment(bigint) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.update_my_profile(jsonb) from public, anon;
revoke execute on function public.list_interest_catalog() from public, anon;
revoke execute on function public.list_my_interests() from public, anon;
revoke execute on function public.set_my_interests(integer[]) from public, anon;
revoke execute on function public.list_badge_catalog() from public, anon;
revoke execute on function public.list_my_badges() from public, anon;
revoke execute on function public.create_story(text, text, text, timestamptz) from public, anon;
revoke execute on function public.list_active_stories(integer, timestamptz, bigint) from public, anon;
revoke execute on function public.list_my_stories(boolean) from public, anon;
revoke execute on function public.mark_story_viewed(bigint) from public, anon;
revoke execute on function public.delete_story(bigint) from public, anon;
revoke execute on function public.admin_list_verifications(text, integer, integer) from public, anon;
revoke execute on function public.admin_review_verification(integer, text, text) from public, anon;

grant execute on function public.can_read_event(integer) to authenticated;
grant execute on function public.list_activity_comments(integer, integer, integer) to authenticated;
grant execute on function public.create_activity_comment(integer, text, bigint) to authenticated;
grant execute on function public.delete_activity_comment(bigint) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;
grant execute on function public.list_interest_catalog() to authenticated;
grant execute on function public.list_my_interests() to authenticated;
grant execute on function public.set_my_interests(integer[]) to authenticated;
grant execute on function public.list_badge_catalog() to authenticated;
grant execute on function public.list_my_badges() to authenticated;
grant execute on function public.create_story(text, text, text, timestamptz) to authenticated;
grant execute on function public.list_active_stories(integer, timestamptz, bigint) to authenticated;
grant execute on function public.list_my_stories(boolean) to authenticated;
grant execute on function public.mark_story_viewed(bigint) to authenticated;
grant execute on function public.delete_story(bigint) to authenticated;
grant execute on function public.admin_list_verifications(text, integer, integer) to authenticated;
grant execute on function public.admin_review_verification(integer, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tbl_event_comments'
  ) then
    alter publication supabase_realtime add table public.tbl_event_comments;
  end if;
end
$$;
