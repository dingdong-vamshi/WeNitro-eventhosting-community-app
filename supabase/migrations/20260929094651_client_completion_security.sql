-- Client acceptance completion: anonymous community posts, poll voter identity,
-- owner-controlled chat deletion, and an idempotent Play Store reward.

alter table public.tbl_community_posts
  add column if not exists category text not null default 'General',
  add column if not exists is_anonymous boolean not null default false;

alter table public.tbl_community_posts
  drop constraint if exists tbl_community_posts_category_length;
alter table public.tbl_community_posts
  add constraint tbl_community_posts_category_length
  check (length(category) between 1 and 60);

create index if not exists tbl_community_posts_room_created_idx
  on public.tbl_community_posts(room_id, created_at desc, id desc)
  where deleted_at is null;

create or replace function private.community_create_post_v2(
  p_room_id integer,
  p_title text,
  p_body text,
  p_category text,
  p_media_path text,
  p_media_type text,
  p_anonymous boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  post_row public.tbl_community_posts;
  anonymous_post boolean := coalesce(p_anonymous, false);
begin
  perform public.assert_chat_membership(p_room_id);
  if not exists (
    select 1 from public.tbl_chat_rooms r
    where r.id = p_room_id and r.room_type = 'community'
  ) then
    raise exception 'Community not found' using errcode = '42501';
  end if;
  if not private.community_can_post(p_room_id) then
    raise exception 'Only permitted community members can post' using errcode = '42501';
  end if;
  if trim(coalesce(p_title, '')) = ''
    and trim(coalesce(p_body, '')) = ''
    and nullif(trim(coalesce(p_media_path, '')), '') is null then
    raise exception 'Post is empty';
  end if;
  if length(trim(coalesce(p_title, ''))) > 180
    or length(coalesce(p_body, '')) > 10000
    or length(coalesce(nullif(trim(p_category), ''), 'General')) > 60 then
    raise exception 'Post is too long';
  end if;
  if p_media_type is not null and p_media_type not in ('image', 'video') then
    raise exception 'Invalid post media type';
  end if;
  if nullif(trim(coalesce(p_media_path, '')), '') is not null
    and p_media_path not like auth.uid()::text || '/%' then
    raise exception 'Invalid post media path' using errcode = '42501';
  end if;

  insert into public.tbl_community_posts(
    room_id, user_id, title, body, media_url, media_type, category, is_anonymous
  ) values (
    p_room_id, me, nullif(trim(coalesce(p_title, '')), ''), coalesce(p_body, ''),
    nullif(trim(coalesce(p_media_path, '')), ''), p_media_type,
    coalesce(nullif(trim(p_category), ''), 'General'), anonymous_post
  ) returning * into post_row;

  return to_jsonb(post_row) - 'user_id' || jsonb_build_object(
    'community_id', p_room_id,
    'author_id', case when anonymous_post then null else me end,
    'author', case when anonymous_post then jsonb_build_object(
      'id', null, 'username', 'anonymous', 'fullname', 'Anonymous', 'profile_image', null
    ) else null end
  );
end;
$$;

create or replace function public.community_create_post_v2(
  p_room_id integer,
  p_title text,
  p_body text,
  p_category text,
  p_media_path text,
  p_media_type text,
  p_anonymous boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.community_create_post_v2(
    p_room_id, p_title, p_body, p_category, p_media_path, p_media_type, p_anonymous
  );
$$;

create or replace function public.community_list_posts(
  p_room_id integer,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  can_identify boolean := public.is_wenitro_admin();
  total_count bigint;
  result_items jsonb;
begin
  perform public.assert_chat_membership(p_room_id);
  if not exists (
    select 1 from public.tbl_chat_rooms r
    where r.id = p_room_id and r.room_type = 'community'
  ) then
    raise exception 'Community not found' using errcode = '42501';
  end if;

  select count(*) into total_count
  from public.tbl_community_posts p
  where p.room_id = p_room_id and p.deleted_at is null;

  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into result_items
  from (
    select p.id, p.created_at,
      to_jsonb(p) - 'user_id' || jsonb_build_object(
        'author_id', case when p.is_anonymous and not can_identify then null else p.user_id end,
        'author', case
          when p.is_anonymous and not can_identify then jsonb_build_object(
            'id', null, 'username', 'anonymous', 'fullname', 'Anonymous', 'profile_image', null
          )
          else jsonb_build_object(
            'id', u.id, 'username', u.username, 'fullname', u.fullname,
            'profile_image', u.profile_image
          )
        end,
        'can_identify_anonymous', can_identify
      ) item
    from public.tbl_community_posts p
    join public.tbl_users u on u.id = p.user_id
    where p.room_id = p_room_id and p.deleted_at is null
    order by p.created_at desc, p.id desc
    offset (page_number - 1) * page_size
    limit page_size
  ) rows;

  return jsonb_build_object(
    'items', result_items,
    'total', total_count,
    'has_more', page_number * page_size < total_count
  );
end;
$$;

create or replace function public.admin_list_anonymous_community_posts(
  p_limit integer default 50,
  p_before_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_wenitro_admin() then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.id desc), '[]'::jsonb)
  into result
  from (
    select p.id, p.room_id, r.title community_name, p.user_id, u.username,
      u.fullname, p.title, p.body, p.media_type, p.created_at
    from public.tbl_community_posts p
    join public.tbl_chat_rooms r on r.id = p.room_id
    join public.tbl_users u on u.id = p.user_id
    where p.is_anonymous and p.deleted_at is null
      and (p_before_id is null or p.id < p_before_id)
    order by p.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) rows;
  return result;
end;
$$;

create or replace function public.community_poll_voters(
  p_room_id integer,
  p_poll_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.assert_chat_membership(p_room_id);
  if not exists (
    select 1 from public.tbl_chat_polls p
    where p.id = p_poll_id and p.room_id = p_room_id
  ) then
    raise exception 'Poll not found' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', v.user_id,
    'option_id', v.option_id,
    'option_text', o.option_text,
    'username', u.username,
    'full_name', u.fullname,
    'avatar_url', u.profile_image,
    'voted_at', v.created_at
  ) order by v.created_at, v.user_id), '[]'::jsonb)
  into result
  from public.tbl_chat_poll_votes v
  join public.tbl_chat_poll_options o on o.id = v.option_id and o.poll_id = v.poll_id
  join public.tbl_users u on u.id = v.user_id
  where v.poll_id = p_poll_id;
  return result;
end;
$$;

create or replace function public.delete_own_chat_message(p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  message_row public.tbl_messages;
  media_path text;
begin
  select * into message_row
  from public.tbl_messages m
  where m.id = p_message_id
  for update;
  if not found or message_row.deleted_at is not null then
    raise exception 'Message not found';
  end if;
  if message_row.sender_id is distinct from me then
    raise exception 'You can only delete your own messages' using errcode = '42501';
  end if;
  perform public.assert_chat_membership(message_row.room_id);
  media_path := message_row.media_url;
  update public.tbl_messages
  set content = '', media_url = null, thumbnail_url = null, share_payload = null,
      edited_at = now(), deleted_at = now()
  where id = p_message_id;
  return jsonb_build_object(
    'id', p_message_id,
    'room_id', message_row.room_id,
    'deleted_at', now(),
    'media_path', media_path
  );
end;
$$;

create or replace function public.claim_play_store_rating_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  inserted boolean := false;
  next_balance integer;
begin
  insert into public.tbl_user_points_history(
    user_id, rating_id, points_earned, verification_method
  ) values (me, null, 10, 'play_store_rating')
  on conflict (user_id, verification_method) where verification_method is not null
  do nothing;
  inserted := found;
  if inserted then
    update public.tbl_users set points = coalesce(points, 0) + 10 where id = me;
  end if;
  select coalesce(points, 0) into next_balance from public.tbl_users where id = me;
  return jsonb_build_object('awarded', inserted, 'points', case when inserted then 10 else 0 end, 'balance', next_balance);
end;
$$;

create or replace function public.list_my_nitro_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.get_current_app_user_id() id), entries as (
    select h.id,h.points_earned,h.created_at,h.verification_method,r.event_id,e.title
    from public.tbl_user_points_history h join me on me.id=h.user_id
    left join public.tbl_participant_ratings r on r.id=h.rating_id
    left join public.tbl_events e on e.id=r.event_id
    order by h.created_at desc,h.id desc limit 100
  ) select jsonb_build_object(
    'balance',(select coalesce(u.points,0) from public.tbl_users u join me on me.id=u.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'points',points_earned,'created_at',created_at,'event_id',event_id,
      'description',case verification_method
        when 'email' then 'Email verification'
        when 'phone' then 'Phone verification'
        when 'live_photo' then 'Live Photo verification'
        when 'play_store_rating' then 'Play Store rating reward'
        else case
          when verification_method like 'spend:%' then 'Nitro Points spent · ' || substring(verification_method from 7)
          when title is null then 'Activity participation rating'
          else 'Rating for '||title
        end
      end
    ) order by created_at desc,id desc) from entries),'[]'::jsonb)
  );
$$;

revoke all on function private.community_create_post_v2(integer,text,text,text,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.community_create_post_v2(integer,text,text,text,text,text,boolean)
  from public, anon;
revoke all on function public.community_list_posts(integer,integer,integer)
  from public, anon;
revoke all on function public.admin_list_anonymous_community_posts(integer,bigint)
  from public, anon;
revoke all on function public.community_poll_voters(integer,integer)
  from public, anon;
revoke all on function public.delete_own_chat_message(bigint)
  from public, anon;
revoke all on function public.claim_play_store_rating_reward()
  from public, anon;

grant execute on function public.community_create_post_v2(integer,text,text,text,text,text,boolean)
  to authenticated;
grant execute on function public.community_list_posts(integer,integer,integer)
  to authenticated;
grant execute on function public.admin_list_anonymous_community_posts(integer,bigint)
  to authenticated;
grant execute on function public.community_poll_voters(integer,integer)
  to authenticated;
grant execute on function public.delete_own_chat_message(bigint)
  to authenticated;
grant execute on function public.claim_play_store_rating_reward()
  to authenticated;

-- Anonymous authors must not be discoverable through the REST table endpoint.
-- Reads go through community_list_posts, which masks identity unless the caller
-- has a WeNitro Admin role.
revoke select on public.tbl_community_posts from authenticated;
grant select (
  id, room_id, title, body, media_url, media_type, category, is_anonymous,
  created_at, updated_at, deleted_at
) on public.tbl_community_posts to authenticated;
