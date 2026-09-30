-- A block stops new direct-message delivery, but it must not erase or make the
-- existing conversation history unreadable. Keep the membership assertion
-- about membership only, and enforce the block at direct-room creation/send.

create or replace function public.assert_chat_membership(p_room_id integer)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
begin
  if not exists (
    select 1
    from public.tbl_chat_participants p
    where p.room_id = p_room_id and p.user_id = me
  ) then
    raise exception 'Not a chat participant' using errcode = '42501';
  end if;
  return true;
end;
$$;

create or replace function public.send_chat_message(
  p_room_id integer,
  p_client_id uuid,
  p_content text,
  p_message_type text default 'text',
  p_media_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  me integer := public.get_current_app_user_id();
  other_user integer;
  m public.tbl_messages;
  u public.tbl_users;
begin
  perform public.assert_chat_membership(p_room_id);

  if exists (
    select 1 from public.tbl_chat_rooms r
    where r.id = p_room_id and r.room_type = 'personal'
  ) then
    select p.user_id into other_user
    from public.tbl_chat_participants p
    where p.room_id = p_room_id and p.user_id <> me
    order by p.id
    limit 1;
    if other_user is not null and private.users_blocked(me, other_user) then
      raise exception 'This chat is blocked' using errcode = '42501';
    end if;
  end if;

  if length(coalesce(p_content, '')) > 10000
    or (trim(coalesce(p_content, '')) = '' and p_media_url is null) then
    raise exception 'Invalid message';
  end if;
  if p_message_type not in ('text', 'image', 'video', 'audio', 'document') then
    raise exception 'Invalid message type';
  end if;

  insert into public.tbl_messages(
    room_id, sender_id, content, message_type, media_url, client_id, is_delivered
  ) values (
    p_room_id, me, coalesce(p_content, ''), p_message_type, p_media_url,
    p_client_id, true
  )
  on conflict(sender_id, client_id) where client_id is not null
  do update set client_id = excluded.client_id
  returning * into m;

  select * into u from public.tbl_users where id = me;
  return to_jsonb(m) || jsonb_build_object(
    'sender', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'profile_image', u.profile_image
    )
  );
end;
$$;

revoke all on function public.assert_chat_membership(integer)
  from public, anon;
revoke all on function public.send_chat_message(integer, uuid, text, text, text)
  from public, anon;
grant execute on function public.assert_chat_membership(integer)
  to authenticated;
grant execute on function public.send_chat_message(integer, uuid, text, text, text)
  to authenticated;
