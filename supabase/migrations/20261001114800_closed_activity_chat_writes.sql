-- Keep historical messages intact, but do not accept new messages/polls/shares
-- in an Activity chat whose Activity was cancelled or deleted.
create function private.guard_activity_chat_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare activity_id integer; available boolean;
begin
  select event_id into activity_id from public.tbl_chat_rooms where id=new.room_id;
  if activity_id is null then return new; end if;
  select not coalesce(is_deleted,false) and not coalesce(is_cancelled,false)
    and coalesce(status,'')<>'cancelled' into available
    from public.tbl_events where id=activity_id for share;
  if not coalesce(available,false) then
    raise exception 'This Activity chat is no longer available.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_activity_chat_write() from public,anon,authenticated;
create trigger guard_activity_chat_write before insert on public.tbl_messages
for each row execute function private.guard_activity_chat_write();
