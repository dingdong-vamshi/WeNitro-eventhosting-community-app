alter table public.tbl_user_interests enable row level security;
grant select,insert,delete on public.tbl_user_interests to authenticated;
drop policy if exists own_user_interests on public.tbl_user_interests;
create policy own_user_interests on public.tbl_user_interests for all to authenticated using(user_id=public.current_app_user_id() or public.is_wenitro_admin()) with check(user_id=public.current_app_user_id() or public.is_wenitro_admin());
