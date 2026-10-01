alter table public.tbl_events add column is_admin_pinned boolean not null default false;
grant select(is_admin_pinned) on public.tbl_events to authenticated;

create function private.guard_admin_activity_pin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' and new.is_admin_pinned) or
     (tg_op='UPDATE' and new.is_admin_pinned is distinct from old.is_admin_pinned) then
    if auth.uid() is null or not public.is_wenitro_admin() then
      raise exception 'Only Admin can pin Activities' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_admin_activity_pin() from public,anon,authenticated;
create trigger guard_admin_activity_pin before insert or update on public.tbl_events
for each row execute function private.guard_admin_activity_pin();

create function public.admin_set_activity_pinned(p_event_id integer,p_pinned boolean)
returns void language plpgsql security definer set search_path='' as $$
declare e public.tbl_events;
begin
  if auth.uid() is null or not public.is_wenitro_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_pinned is null then raise exception 'Choose pin or unpin'; end if;
  select * into e from public.tbl_events where id=p_event_id for update;
  if e.id is null then raise exception 'Activity not found'; end if;
  if p_pinned and (e.status<>'published' or e.is_deleted or e.is_cancelled
    or e.event_start_time is null or e.event_start_time<=now()) then
    raise exception 'Only upcoming published Activities can be pinned';
  end if;
  update public.tbl_events set is_admin_pinned=p_pinned,updated_at=now(),
    updated_by=public.get_current_app_user_id() where id=p_event_id;
end $$;
revoke all on function public.admin_set_activity_pinned(integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_activity_pinned(integer,boolean) to authenticated;
