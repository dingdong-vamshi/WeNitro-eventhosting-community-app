create or replace function public.is_event_participant(p_event_id integer) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.tbl_event_participants where event_id=p_event_id and user_id=public.current_app_user_id()) $$;
revoke all on function public.is_event_participant(integer) from public,anon;
grant execute on function public.is_event_participant(integer) to authenticated;
drop policy if exists app_events_read on public.tbl_events;
create policy app_events_read on public.tbl_events for select to authenticated using(not coalesce(is_deleted,false) and (visibility_type='public' or created_by=public.current_app_user_id() or public.is_event_participant(id)));
