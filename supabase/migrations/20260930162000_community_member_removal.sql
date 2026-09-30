-- Community creators and co-admins need an explicit, audited membership
-- removal path. Direct table deletes remain unavailable to clients.

create or replace function public.community_remove_member(
  p_room_id integer,
  p_user_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me integer := public.get_current_app_user_id();
  room_row public.tbl_chat_rooms;
  removed boolean := false;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into room_row
  from public.tbl_chat_rooms
  where id = p_room_id and room_type = 'community';

  if room_row.id is null then
    raise exception 'Community not found';
  end if;

  if not private.community_manager(p_room_id) then
    raise exception 'Community admin permission required' using errcode = '42501';
  end if;

  if p_user_id is null or p_user_id = room_row.created_by then
    raise exception 'The community creator cannot be removed' using errcode = '22023';
  end if;

  delete from public.tbl_chat_participants
  where room_id = p_room_id and user_id = p_user_id;
  removed := found;

  if not removed then
    raise exception 'Choose a joined member';
  end if;

  delete from public.tbl_community_join_requests
  where room_id = p_room_id and user_id = p_user_id;

  perform private.enqueue_notification(
    p_user_id,
    'community_member_removed',
    'Community membership updated',
    'A community admin removed you from ' || coalesce(room_row.title, 'a community') || '.',
    p_room_id::text,
    me,
    jsonb_build_object('room_id', p_room_id, 'removed_by', me)
  );

  return jsonb_build_object(
    'room_id', p_room_id,
    'user_id', p_user_id,
    'removed', true
  );
end;
$$;

revoke all on function public.community_remove_member(integer, integer)
  from public, anon;
grant execute on function public.community_remove_member(integer, integer)
  to authenticated;
