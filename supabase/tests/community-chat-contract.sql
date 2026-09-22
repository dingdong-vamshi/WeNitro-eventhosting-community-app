-- Requires the designated Phase 4 QA community. Every mutation rolls back.
begin;

do $$
declare
  community_id integer := 132;
  creator_id integer := 35;
  member_id integer := 47;
  second_member_id integer := 44;
  creator_uid uuid := '3eaa15aa-2a8e-49b3-ae37-aef126239680';
  member_uid uuid := '1f7afcc7-b00a-48f1-9945-f8cb8c215d08';
  outsider_uid uuid := 'f034763a-7b42-4e58-8fee-8ba4f3bdd59b';
  message_count integer;
  message_notification_count integer;
  post_result jsonb;
  group_id integer;
  poll_result jsonb;
  poll_id integer;
  option_id integer;
  denied boolean;
  category_name text;
  checks integer := 0;
begin
  if not exists (
    select 1 from public.tbl_chat_rooms
    where id = community_id and room_type = 'community' and created_by = creator_id
  ) then
    raise exception 'QA community guard failed';
  end if;

  insert into public.tbl_chat_participants(room_id, user_id, role, permissions)
  values
    (community_id, member_id, 'member', '{}'::jsonb),
    (community_id, second_member_id, 'member', '{}'::jsonb)
  on conflict (room_id, user_id)
  do update set role = excluded.role, permissions = excluded.permissions;

  select count(*) into message_count
  from public.tbl_messages where room_id = community_id;
  select count(*) into message_notification_count
  from public.tbl_notifications
  where type = 'message' and data->>'room_id' = community_id::text;

  execute 'set local role authenticated';
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', creator_uid, 'role', 'authenticated')::text,
    true
  );

  post_result := public.community_create_post(
    community_id,
    '[QA] Separate post',
    'A community post must not become a chat message.',
    'General',
    null,
    null
  );
  assert (post_result->>'id')::bigint is not null;
  assert (select count(*) from public.tbl_messages where room_id = community_id) = message_count;
  assert (
    select count(*) from public.tbl_notifications
    where type = 'message' and data->>'room_id' = community_id::text
  ) = message_notification_count;
  checks := checks + 3;

  denied := false;
  begin
    perform public.create_group_chat_room(
      '[QA] Invalid image group', array[member_id], outsider_uid::text || '/group/no.jpg'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied;
  checks := checks + 1;

  group_id := public.create_group_chat_room(
    '[QA] Image and poll group',
    array[member_id],
    creator_uid::text || '/group/contract-test.jpg'
  );
  assert (
    select image_url = creator_uid::text || '/group/contract-test.jpg'
    from public.tbl_chat_rooms where id = group_id
  );
  assert public.is_chat_member(group_id);
  checks := checks + 2;

  poll_result := public.community_poll(
    'create',
    group_id,
    jsonb_build_object(
      'question', '[QA] Group poll',
      'options', jsonb_build_array('Morning', 'Evening'),
      'client_id', gen_random_uuid()
    )
  );
  poll_id := (poll_result->0->>'id')::integer;
  option_id := (poll_result->0->'options'->0->>'id')::integer;
  assert poll_id is not null and (poll_result->0->>'message_id')::bigint is not null;
  poll_result := public.community_poll(
    'vote', group_id, jsonb_build_object('poll_id', poll_id, 'option_id', option_id)
  );
  assert (poll_result->0->>'total_votes')::integer = 1;
  checks := checks + 2;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', outsider_uid, 'role', 'authenticated')::text,
    true
  );
  denied := false;
  begin
    perform public.community_poll(
      'list', group_id, jsonb_build_object('poll_ids', jsonb_build_array(poll_id))
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied;
  checks := checks + 1;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', creator_uid, 'role', 'authenticated')::text,
    true
  );
  perform public.community_manage(
    community_id,
    'set_role',
    jsonb_build_object(
      'user_id', member_id,
      'role', 'moderator',
      'can_approve', false,
      'can_post', true,
      'can_edit', true,
      'can_manage_roles', false
    )
  );
  assert (
    select role = 'moderator'
      and permissions @> '{"can_post":true,"can_edit":true,"can_approve":false}'::jsonb
    from public.tbl_chat_participants
    where room_id = community_id and user_id = member_id
  );
  checks := checks + 1;

  select c.name into category_name
  from public.tbl_chat_rooms r
  join public.tbl_categories c on c.id = r.category_id
  where r.id = community_id;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', member_uid, 'role', 'authenticated')::text,
    true
  );
  perform public.community_manage(
    community_id,
    'edit',
    jsonb_build_object(
      'name', '[QA] Moderator edit permission',
      'description', 'This change verifies the explicit moderator edit permission.',
      'category', category_name
    )
  );
  denied := false;
  begin
    perform public.community_manage(
      community_id,
      'set_role',
      jsonb_build_object('user_id', second_member_id, 'role', 'moderator')
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied;
  checks := checks + 2;

  execute 'reset role';
  update public.tbl_chat_participants
  set role = 'member', permissions = '{"can_edit":true,"can_manage_roles":true}'::jsonb
  where room_id = community_id and user_id = member_id;
  assert not private.community_can_edit(community_id);
  assert not private.community_can_manage_roles(community_id);
  checks := checks + 2;

  raise notice 'PASS: % community/chat recovery assertions', checks;
end
$$;

select 'PASS: community posts, group images, member-scoped polls and role permissions; rolled back' result;
rollback;
