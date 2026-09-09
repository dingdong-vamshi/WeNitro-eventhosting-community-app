-- Signing in again must not undo an explicitly confirmed deactivation.
create or replace function private.sync_auth_profile_activation() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.tbl_users set is_active=case when new.email_confirmed_at is not null or new.phone_confirmed_at is not null then 1 else 0 end where auth_user_id=new.id and coalesce(is_delete,0)=0 and deactivated_at is null; return new; end;
$$;
create or replace function private.can_read_profile(p_target_user_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_app_user_id() is not null and exists(select 1 from public.tbl_users where id=p_target_user_id and deactivated_at is null) and (p_target_user_id=public.current_app_user_id() or public.is_wenitro_admin() or coalesce((select profile_visibility from public.tbl_user_privacy_settings where user_id=p_target_user_id),'public')='public' or ((select profile_visibility from public.tbl_user_privacy_settings where user_id=p_target_user_id)='friends' and private.in_squad(p_target_user_id)));
$$;
