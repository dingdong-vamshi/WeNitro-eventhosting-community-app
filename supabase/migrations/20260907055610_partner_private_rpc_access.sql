grant usage on schema private to authenticated;
create or replace function private.registration_event_visible(p_event_id integer) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.tbl_users u where u.id=public.get_current_app_user_id() and u.is_active=1 and coalesce(u.is_delete,0)=0)
 and exists(select 1 from public.tbl_events e where e.id=p_event_id and not coalesce(e.is_deleted,false) and (e.created_by=public.get_current_app_user_id() or (e.status='published' and (e.visibility_type='public' or exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=public.get_current_app_user_id() and p.status not in ('left','rejected'))))))
$$;
notify pgrst,'reload schema';
