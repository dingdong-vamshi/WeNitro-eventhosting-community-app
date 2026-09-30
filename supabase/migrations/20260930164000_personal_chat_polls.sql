-- The shared chat composer offers polls in personal, Activity and Community
-- rooms. The poll RPC previously rejected personal rooms despite that contract.

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
    where r.id = p_room_id
      and r.room_type in ('personal', 'community', 'group')
  ) then
    raise exception 'Chat room required' using errcode = '42501';
  end if;

  if p_action = 'create' then
    if not private.community_can_post(p_room_id) then
      raise exception 'Poll permission required' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_payload->>'question', ''))) not between 1 and 300
      or jsonb_typeof(p_payload->'options') is distinct from 'array'
      or jsonb_array_length(p_payload->'options') not between 2 and 6
      or exists (
        select 1
        from jsonb_array_elements_text(p_payload->'options') value
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
        p_room_id, me, trim(p_payload->>'question'), 'poll', v_poll_id,
        v_client_id, true
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
      where p.id = v_poll_id
        and p.room_id = p_room_id
        and o.id = v_option_id
    ) then
      raise exception 'Invalid poll option' using errcode = '42501';
    end if;
    insert into public.tbl_chat_poll_votes(poll_id, option_id, user_id)
    values (v_poll_id, v_option_id, me)
    on conflict(poll_id, user_id)
    do update set option_id = excluded.option_id, created_at = now();
    update public.tbl_messages set edited_at = now() where poll_id = v_poll_id;
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
          select option_id
          from public.tbl_chat_poll_votes
          where poll_id = p.id and user_id = me
        ),
        'total_votes', (
          select count(*) from public.tbl_chat_poll_votes where poll_id = p.id
        ),
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'text', o.option_text,
              'votes', (
                select count(*)
                from public.tbl_chat_poll_votes v
                where v.option_id = o.id
              ),
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
        (v_poll_id is not null and p.id = v_poll_id)
        or (
          v_poll_id is null
          and p.id in (
            select value::integer
            from jsonb_array_elements_text(
              coalesce(p_payload->'poll_ids', '[]'::jsonb)
            ) value
          )
        )
      )
    limit 100
  ) polls;
  return result;
end;
$$;

revoke all on function private.community_poll(text, integer, jsonb)
  from public, anon, authenticated;
