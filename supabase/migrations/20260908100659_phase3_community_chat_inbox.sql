-- Include communities in the same membership-scoped inbox; personal/group rules are unchanged.
create or replace function public.list_chat_inbox(
  p_message_limit integer default 50
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_message_limit integer := least(greatest(coalesce(p_message_limit, 50), 1), 100);
begin
  return query
  select to_jsonb(r) || jsonb_build_object(
    'viewer_last_read_at', cp.last_read_at,
    'last_message_at', message_stats.last_message_at,
    'unread_count', message_stats.unread_count,
    'last_message', messages.last_message,
    'chat_members', members.items,
    'chat_messages', messages.items
  )
  from public.tbl_chat_participants cp
  join public.tbl_chat_rooms r on r.id = cp.room_id
  left join lateral (
    select
      max(m.created_at) as last_message_at,
      count(*) filter (
        where m.created_at > coalesce(cp.last_read_at, cp.joined_at, '-infinity'::timestamptz)
          and m.sender_id is distinct from v_user_id
      ) as unread_count
    from public.tbl_messages m
    where m.room_id = r.id
      and m.deleted_at is null
  ) message_stats on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'room_id', member.room_id,
          'user_id', member.user_id,
          'role', coalesce(member.role, 'member'),
          'last_read_at', member.last_read_at,
          'muted', member.muted,
          'joined_at', member.joined_at,
          'user', jsonb_build_object(
            'id', profile.id,
            'username', profile.username,
            'fullname', profile.fullname,
            'profile_image', profile.profile_image
          )
        )
        order by member.joined_at, member.id
      ),
      '[]'::jsonb
    ) as items
    from public.tbl_chat_participants member
    join public.tbl_users profile on profile.id = member.user_id
    where member.room_id = r.id
  ) members on true
  left join lateral (
    select
      coalesce(jsonb_agg(recent.item order by recent.created_at, recent.id), '[]'::jsonb) as items,
      (jsonb_agg(recent.item order by recent.created_at desc, recent.id desc)->0) as last_message
    from (
      select
        m.created_at,
        m.id,
        to_jsonb(m) || jsonb_build_object(
          'sender', jsonb_build_object(
            'id', sender.id,
            'username', sender.username,
            'fullname', sender.fullname,
            'profile_image', sender.profile_image
          )
        ) as item
      from public.tbl_messages m
      left join public.tbl_users sender on sender.id = m.sender_id
      where m.room_id = r.id
        and m.deleted_at is null
      order by m.created_at desc, m.id desc
      limit v_message_limit
    ) recent
  ) messages on true
  where cp.user_id = v_user_id
  order by message_stats.last_message_at desc nulls last, r.id desc;
end
$$;

revoke all on function public.list_chat_inbox(integer) from public, anon;
grant execute on function public.list_chat_inbox(integer) to authenticated;

