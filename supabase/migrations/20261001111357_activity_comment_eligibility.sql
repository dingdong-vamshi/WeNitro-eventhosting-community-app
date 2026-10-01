-- Reading a public Activity does not authorize posting a comment.
-- Keep this at the table boundary so RPC and direct-write paths agree.
create function private.guard_activity_comment_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); creator integer;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select created_by into creator from public.tbl_events
    where id=new.event_id and not coalesce(is_deleted,false)
      and not coalesce(is_cancelled,false) and status<>'cancelled'
    for update;
  if creator is null or not public.can_read_event(new.event_id) then
    raise exception 'Activity is unavailable' using errcode='42501';
  end if;
  -- Existing Admin moderation may edit a comment, but cannot create one
  -- while bypassing the participant rule or impersonate another author.
  if tg_op='UPDATE' and public.is_wenitro_admin()
     and new.user_id=old.user_id and new.event_id=old.event_id then return new; end if;
  if new.user_id<>me or not (creator=me or exists (
    select 1 from public.tbl_event_participants
    where event_id=new.event_id and user_id=me and status in ('approved','going','paid')
  )) then
    raise exception 'Only the host and approved participants can comment.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_activity_comment_eligibility() from public,anon,authenticated;
create trigger guard_activity_comment_eligibility
before insert or update of body,event_id,user_id on public.tbl_event_comments
for each row execute function private.guard_activity_comment_eligibility();
