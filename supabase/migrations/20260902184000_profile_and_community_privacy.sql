create or replace function private.can_read_profile(p_target_user_id integer) returns boolean language sql stable security definer set search_path=public,private as $$
 select p_target_user_id=public.current_app_user_id()
   or public.is_wenitro_admin()
   or not exists(select 1 from public.tbl_user_privacy_settings s where s.user_id=p_target_user_id and s.profile_visibility='private')
   or exists(select 1 from public.tbl_chat_participants mine join public.tbl_chat_participants theirs on theirs.room_id=mine.room_id where mine.user_id=public.current_app_user_id() and theirs.user_id=p_target_user_id)
   or exists(select 1 from public.tbl_events e where (e.created_by=public.current_app_user_id() and exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=p_target_user_id and p.status<>'left')) or (e.created_by=p_target_user_id and exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=public.current_app_user_id() and p.status<>'left')));
$$;
revoke all on function private.can_read_profile(integer) from public,anon;
grant execute on function private.can_read_profile(integer) to authenticated;
drop policy if exists app_profiles_read on public.tbl_users;
create policy app_profiles_read on public.tbl_users for select to authenticated using(coalesce(is_delete,0)=0 and private.can_read_profile(id));
drop policy if exists chat_rooms_read on public.tbl_chat_rooms;
create policy chat_rooms_read on public.tbl_chat_rooms for select to authenticated using((room_type='community' and coalesce(visibility,'public')='public' and coalesce(join_type,'direct')<>'approval') or created_by=public.current_app_user_id() or public.is_chat_member(id));
