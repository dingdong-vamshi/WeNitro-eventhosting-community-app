-- Recover the community/chat contracts without rewriting existing production rows.
-- Target project: klyjzbisgycegkkacbjw.

alter table public.tbl_chat_participants
  add column if not exists permissions jsonb;

update public.tbl_chat_participants
set permissions = '{}'::jsonb
where permissions is null or jsonb_typeof(permissions) <> 'object';

alter table public.tbl_chat_participants
  alter column permissions set default '{}'::jsonb,
  alter column permissions set not null;

-- Historical community posts reused message IDs, so explicit inserts may have left
-- the post sequence behind the current maximum. Advance it before using native IDs.
do $$
declare
  sequence_name text := pg_get_serial_sequence('public.tbl_community_posts', 'id');
  maximum_id bigint;
  sequence_value bigint;
  sequence_called boolean;
begin
  if sequence_name is null then
    return;
  end if;

  select max(id) into maximum_id from public.tbl_community_posts;
  execute format('select last_value, is_called from %s', sequence_name::regclass)
    into sequence_value, sequence_called;
  if maximum_id is not null
    and (not sequence_called or maximum_id > sequence_value) then
    perform setval(sequence_name::regclass, maximum_id, true);
  end if;
end
$$;

create or replace function private.community_manager(rid integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.tbl_chat_rooms r
      where r.id = rid
        and r.room_type = 'community'
        and (
          r.created_by = public.current_app_user_id()
          or exists (
            select 1
            from public.tbl_chat_participants p
            where p.room_id = r.id
              and p.user_id = public.current_app_user_id()
              and p.role in ('admin', 'creator')
          )
        )
    );
$$;

create or replace function private.community_permission(rid integer, permission_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select permission_name in ('can_approve', 'can_post', 'can_edit', 'can_manage_roles')
    and auth.uid() is not null
    and exists (
      select 1
      from public.tbl_chat_rooms r
      where r.id = rid
        and r.room_type = 'community'
        and (
          r.created_by = public.current_app_user_id()
          or exists (
            select 1
            from public.tbl_chat_participants p
            where p.room_id = r.id
              and p.user_id = public.current_app_user_id()
              and (
                p.role in ('admin', 'creator')
                or (
                  p.role = 'moderator'
                  and coalesce(p.permissions, '{}'::jsonb)
                    @> jsonb_build_object(permission_name, true)
                )
              )
          )
        )
    );
$$;

create or replace function private.community_can_approve(rid integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_permission(rid, 'can_approve');
$$;

create or replace function private.community_can_edit(rid integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_permission(rid, 'can_edit');
$$;

create or replace function private.community_can_manage_roles(rid integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_permission(rid, 'can_manage_roles');
$$;

create or replace function private.community_can_post(rid integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.is_chat_member(rid)
    and exists (
      select 1
      from public.tbl_chat_rooms r
      where r.id = rid
        and (
          r.room_type <> 'community'
          or coalesce(r.post_permission, 'all') = 'all'
          or private.community_permission(rid, 'can_post')
        )
    );
$$;

create or replace function private.community_create_post(
  p_room_id integer,
  p_title text,
  p_body text,
  p_category text,
  p_media_path text default null,
  p_media_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  post_row public.tbl_community_posts;
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
    or length(coalesce(p_body, '')) > 10000 then
    raise exception 'Post is too long';
  end if;
  if p_media_type is not null and p_media_type not in ('image', 'video') then
    raise exception 'Invalid post media type';
  end if;
  if nullif(trim(coalesce(p_media_path, '')), '') is not null
    and p_media_path not like auth.uid()::text || '/%' then
    raise exception 'Invalid post media path' using errcode = '42501';
  end if;

  insert into public.tbl_community_posts (
    room_id, user_id, title, body, media_url, media_type
  ) values (
    p_room_id,
    me,
    nullif(trim(coalesce(p_title, '')), ''),
    coalesce(p_body, ''),
    nullif(trim(coalesce(p_media_path, '')), ''),
    p_media_type
  )
  returning * into post_row;

  return to_jsonb(post_row) || jsonb_build_object(
    'room_id', p_room_id,
    'community_id', p_room_id,
    'sender_id', me,
    'author_id', me,
    'content', coalesce(p_body, ''),
    'category', coalesce(nullif(trim(coalesce(p_category, '')), ''), 'General'),
    'media_path', post_row.media_url
  );
end;
$$;

create or replace function public.community_create_post(
  p_room_id integer,
  p_title text,
  p_body text,
  p_category text,
  p_media_path text default null,
  p_media_type text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.community_create_post(
    p_room_id, p_title, p_body, p_category, p_media_path, p_media_type
  );
$$;

create or replace function private.community_manage(
  p_room_id integer,
  p_action text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  room_row public.tbl_chat_rooms;
  next_category_id integer;
  target integer;
  target_role text;
  next_role text;
  next_permissions jsonb;
  actor_is_manager boolean;
begin
  select * into room_row
  from public.tbl_chat_rooms
  where id = p_room_id
  for update;

  if not found or room_row.room_type <> 'community' then
    raise exception 'Community not found';
  end if;

  actor_is_manager := private.community_manager(p_room_id);
  if p_action in ('approve', 'reject') then
    if not private.community_can_approve(p_room_id) then
      raise exception 'Community approval permission required' using errcode = '42501';
    end if;
  elsif p_action in ('edit', 'preferences') then
    if not private.community_can_edit(p_room_id) then
      raise exception 'Community edit permission required' using errcode = '42501';
    end if;
  elsif p_action = 'set_role' then
    if not private.community_can_manage_roles(p_room_id) then
      raise exception 'Community role permission required' using errcode = '42501';
    end if;
  elsif p_action = 'delete' then
    if not actor_is_manager then
      raise exception 'Community admin permission required' using errcode = '42501';
    end if;
  else
    raise exception 'Unsupported community action';
  end if;

  if p_action = 'edit' then
    if length(trim(coalesce(p_patch->>'name', ''))) not between 3 and 100
      or length(trim(coalesce(p_patch->>'description', ''))) not between 10 and 500 then
      raise exception 'Check community name and description';
    end if;
    select id into next_category_id
    from public.tbl_categories
    where lower(trim(name)) = lower(trim(p_patch->>'category'))
    order by id
    limit 1;
    if next_category_id is null then
      raise exception 'Select an existing category';
    end if;
    if p_patch ? 'image_path'
      and nullif(p_patch->>'image_path', '') is not null
      and p_patch->>'image_path' not like auth.uid()::text || '/%' then
      raise exception 'Invalid avatar path' using errcode = '42501';
    end if;
    update public.tbl_chat_rooms
    set title = trim(p_patch->>'name'),
        description = trim(p_patch->>'description'),
        category_id = next_category_id,
        image_url = case
          when p_patch ? 'image_path' then nullif(p_patch->>'image_path', '')
          else image_url
        end,
        updated_at = now()
    where id = p_room_id;
  elsif p_action = 'preferences' then
    update public.tbl_chat_rooms
    set verification_level = case
          when p_patch ? 'verified_only' then
            case when (p_patch->>'verified_only')::boolean then 'verified_only' else 'any' end
          else verification_level
        end,
        join_type = case
          when p_patch ? 'requires_approval' then
            case when (p_patch->>'requires_approval')::boolean then 'approval' else 'direct' end
          else join_type
        end,
        post_permission = case
          when p_patch ? 'admins_only' then
            case when (p_patch->>'admins_only')::boolean then 'admins_only' else 'all' end
          else post_permission
        end,
        updated_at = now()
    where id = p_room_id;
  elsif p_action in ('approve', 'reject') then
    target := (p_patch->>'user_id')::integer;
    if not exists (
      select 1 from public.tbl_community_join_requests
      where room_id = p_room_id and user_id = target and status = 'pending'
    ) then
      raise exception 'Pending request not found';
    end if;
    if p_action = 'approve' then
      if room_row.verification_level = 'verified_only'
        and not exists (
          select 1 from public.tbl_users where id = target and isverified = 1
        ) then
        raise exception 'This member is not verified' using errcode = '42501';
      end if;
      insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
      values (p_room_id, target, 'member', '{}'::jsonb)
      on conflict (room_id, user_id) do nothing;
    end if;
    update public.tbl_community_join_requests
    set status = case when p_action = 'approve' then 'approved' else 'rejected' end
    where room_id = p_room_id and user_id = target;
  elsif p_action = 'set_role' then
    target := (p_patch->>'user_id')::integer;
    next_role := lower(trim(coalesce(p_patch->>'role', 'member')));
    if next_role not in ('member', 'moderator', 'admin') then
      raise exception 'Choose Member, Moderator, or Co-Admin.';
    end if;
    if target is null or target = room_row.created_by then
      raise exception 'The community creator role cannot be changed.';
    end if;
    select coalesce(role, 'member') into target_role
    from public.tbl_chat_participants
    where room_id = p_room_id and user_id = target;
    if target_role is null then
      raise exception 'Choose a joined member.';
    end if;

    -- A moderator permission is never sufficient by itself: the actor must still
    -- hold the moderator role, cannot edit higher roles, and cannot mint an admin.
    if not actor_is_manager and (
      me = target
      or target_role in ('admin', 'creator')
      or next_role = 'admin'
    ) then
      raise exception 'Only a community admin can change this role' using errcode = '42501';
    end if;

    if next_role = 'admin' then
      next_permissions := jsonb_build_object(
        'can_approve', true,
        'can_post', true,
        'can_edit', true,
        'can_manage_roles', true
      );
    elsif next_role = 'moderator' then
      next_permissions := jsonb_build_object(
        'can_approve', coalesce(p_patch->'can_approve', 'true'::jsonb) = 'true'::jsonb,
        'can_post', coalesce(p_patch->'can_post', 'true'::jsonb) = 'true'::jsonb,
        'can_edit', coalesce(p_patch->'can_edit', 'false'::jsonb) = 'true'::jsonb,
        'can_manage_roles', coalesce(p_patch->'can_manage_roles', 'false'::jsonb) = 'true'::jsonb
      );
      if not actor_is_manager then
        next_permissions := jsonb_build_object(
          'can_approve', (next_permissions->'can_approve' = 'true'::jsonb)
            and private.community_permission(p_room_id, 'can_approve'),
          'can_post', (next_permissions->'can_post' = 'true'::jsonb)
            and private.community_permission(p_room_id, 'can_post'),
          'can_edit', (next_permissions->'can_edit' = 'true'::jsonb)
            and private.community_permission(p_room_id, 'can_edit'),
          'can_manage_roles', false
        );
      end if;
    else
      next_permissions := '{}'::jsonb;
    end if;

    update public.tbl_chat_participants
    set role = next_role,
        permissions = next_permissions
    where room_id = p_room_id and user_id = target;
  elsif p_action = 'delete' then
    if coalesce((p_patch->>'confirmed')::boolean, false) is not true then
      raise exception 'Deletion must be confirmed';
    end if;
    delete from public.tbl_chat_rooms where id = p_room_id;
  end if;

  return jsonb_build_object('id', p_room_id, 'action', p_action);
end;
$$;

create or replace function public.community_manage(
  p_room_id integer,
  p_action text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.community_manage(p_room_id, p_action, p_patch);
$$;

create or replace function private.community_poll(
  p_action text,
  p_room_id integer,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  v_poll_id integer;
  v_message_id bigint;
  v_option_id integer;
  v_client_id uuid;
  option_value text;
  result jsonb;
begin
  perform public.assert_chat_membership(p_room_id);
  if not exists (
    select 1
    from public.tbl_chat_rooms r
    where r.id = p_room_id and r.room_type in ('community', 'group')
  ) then
    raise exception 'Community or activity group required' using errcode = '42501';
  end if;

  if p_action = 'create' then
    if not private.community_can_post(p_room_id) then
      raise exception 'Poll permission required' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_payload->>'question', ''))) not between 1 and 300
      or jsonb_typeof(p_payload->'options') is distinct from 'array'
      or jsonb_array_length(p_payload->'options') not between 2 and 6
      or exists (
        select 1 from jsonb_array_elements_text(p_payload->'options') value
        where length(trim(value)) not between 1 and 150
      ) then
      raise exception 'Enter a question and 2 to 6 non-empty options';
    end if;
    if (
      select count(distinct lower(trim(value)))
      from jsonb_array_elements_text(p_payload->'options') value
    ) <> jsonb_array_length(p_payload->'options') then
      raise exception 'Options must be different';
    end if;
    v_client_id := (p_payload->>'client_id')::uuid;
    if v_client_id is null then
      raise exception 'Submission identifier required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(me::text || v_client_id::text, 0));
    select existing.id into v_poll_id
    from public.tbl_chat_polls existing
    where existing.created_by = me
      and existing.client_id = v_client_id
      and existing.room_id = p_room_id;
    if v_poll_id is null then
      insert into public.tbl_chat_polls(room_id, question, created_by, client_id)
      values (p_room_id, trim(p_payload->>'question'), me, v_client_id)
      returning id into v_poll_id;
      for option_value in select jsonb_array_elements_text(p_payload->'options')
      loop
        insert into public.tbl_chat_poll_options(poll_id, option_text)
        values (v_poll_id, trim(option_value));
      end loop;
      insert into public.tbl_messages(
        room_id, sender_id, content, message_type, poll_id, client_id, is_delivered
      ) values (
        p_room_id, me, trim(p_payload->>'question'), 'poll', v_poll_id, v_client_id, true
      )
      returning id into v_message_id;
    end if;
  elsif p_action = 'vote' then
    v_poll_id := (p_payload->>'poll_id')::integer;
    v_option_id := (p_payload->>'option_id')::integer;
    if not exists (
      select 1
      from public.tbl_chat_polls p
      join public.tbl_chat_poll_options o on o.poll_id = p.id
      where p.id = v_poll_id and p.room_id = p_room_id and o.id = v_option_id
    ) then
      raise exception 'Invalid poll option' using errcode = '42501';
    end if;
    insert into public.tbl_chat_poll_votes(poll_id, option_id, user_id)
    values (v_poll_id, v_option_id, me)
    on conflict (poll_id, user_id)
    do update set option_id = excluded.option_id, created_at = now();
    update public.tbl_messages m set edited_at = now() where m.poll_id = v_poll_id;
  elsif p_action = 'list' then
    null;
  else
    raise exception 'Unsupported poll action';
  end if;

  select coalesce(jsonb_agg(item order by id), '[]'::jsonb) into result
  from (
    select p.id,
      jsonb_build_object(
        'id', p.id,
        'question', p.question,
        'created_by', p.created_by,
        'created_at', p.created_at,
        'message_id', (select id from public.tbl_messages where poll_id = p.id),
        'my_option_id', (
          select option_id from public.tbl_chat_poll_votes
          where poll_id = p.id and user_id = me
        ),
        'total_votes', (select count(*) from public.tbl_chat_poll_votes where poll_id = p.id),
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'text', o.option_text,
              'votes', (select count(*) from public.tbl_chat_poll_votes v where v.option_id = o.id),
              'percentage', coalesce((
                select round(
                  100.0 * count(*) filter (where v.option_id = o.id)
                    / nullif(count(*), 0),
                  1
                )
                from public.tbl_chat_poll_votes v
                where v.poll_id = p.id
              ), 0)
            ) order by o.id
          )
          from public.tbl_chat_poll_options o
          where o.poll_id = p.id
        ), '[]'::jsonb)
      ) item
    from public.tbl_chat_polls p
    where p.room_id = p_room_id
      and (
        v_poll_id is not null and p.id = v_poll_id
        or v_poll_id is null and p.id in (
          select value::integer
          from jsonb_array_elements_text(coalesce(p_payload->'poll_ids', '[]'::jsonb)) value
        )
      )
    limit 100
  ) polls;
  return result;
end;
$$;

create or replace function public.community_poll(
  p_action text,
  p_room_id integer,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.community_poll(p_action, p_room_id, p_payload);
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

  insert into public.tbl_chat_rooms(room_type, created_by, title, image_url)
  values ('group', me, trim(p_title), image_path)
  returning id into v_room_id;

  insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
  values (v_room_id, me, 'admin', '{}'::jsonb);

  insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
  select v_room_id, u.id, 'member', '{}'::jsonb
  from public.tbl_users u
  where u.id = any(coalesce(p_member_ids, '{}'::integer[])) and u.id <> me
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$$;

create or replace function public.create_group_chat_room(
  p_title text,
  p_member_ids integer[]
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.create_group_chat_room_secure(p_title, p_member_ids, null);
$$;

create or replace function public.create_group_chat_room(
  p_title text,
  p_member_ids integer[],
  p_image_path text
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.create_group_chat_room_secure(p_title, p_member_ids, p_image_path);
$$;

create or replace function public.list_chat_participants(p_room_id integer)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_chat_membership(p_room_id);
  return query
  select jsonb_build_object(
    'room_id', p.room_id,
    'user_id', p.user_id,
    'role', coalesce(p.role, 'member'),
    'permissions', coalesce(p.permissions, '{}'::jsonb),
    'last_read_at', p.last_read_at,
    'muted', p.muted,
    'joined_at', p.joined_at,
    'user', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'profile_image', u.profile_image
    )
  )
  from public.tbl_chat_participants p
  join public.tbl_users u on u.id = p.user_id
  where p.room_id = p_room_id
  order by p.joined_at;
end;
$$;

revoke all on function private.community_manager(integer) from public, anon, authenticated;
revoke all on function private.community_permission(integer, text) from public, anon, authenticated;
revoke all on function private.community_can_approve(integer) from public, anon, authenticated;
revoke all on function private.community_can_edit(integer) from public, anon, authenticated;
revoke all on function private.community_can_manage_roles(integer) from public, anon, authenticated;
revoke all on function private.community_can_post(integer) from public, anon, authenticated;
revoke all on function private.community_create_post(integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.community_manage(integer, text, jsonb) from public, anon, authenticated;
revoke all on function private.community_poll(text, integer, jsonb) from public, anon, authenticated;
revoke all on function private.create_group_chat_room_secure(text, integer[], text) from public, anon, authenticated;

revoke execute on function public.community_create_post(integer, text, text, text, text, text) from public, anon;
revoke execute on function public.community_manage(integer, text, jsonb) from public, anon;
revoke execute on function public.community_poll(text, integer, jsonb) from public, anon;
revoke execute on function public.create_group_chat_room(text, integer[]) from public, anon;
revoke execute on function public.create_group_chat_room(text, integer[], text) from public, anon;
revoke execute on function public.list_chat_participants(integer) from public, anon;

grant execute on function public.community_create_post(integer, text, text, text, text, text) to authenticated;
grant execute on function public.community_manage(integer, text, jsonb) to authenticated;
grant execute on function public.community_poll(text, integer, jsonb) to authenticated;
grant execute on function public.create_group_chat_room(text, integer[]) to authenticated;
grant execute on function public.create_group_chat_room(text, integer[], text) to authenticated;
grant execute on function public.list_chat_participants(integer) to authenticated;
