create function private.protect_account_type() returns trigger language plpgsql set search_path='' as $$
begin
 if new.account_type is distinct from old.account_type and current_user in ('authenticated','anon') then raise exception 'Account type changes are not permitted' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.protect_account_type() from public,anon,authenticated;
create trigger protect_account_type before update of account_type on public.tbl_users for each row execute function private.protect_account_type();
drop policy registration_answers_private on public.tbl_activity_registration_answers;
create policy registration_answers_private on public.tbl_activity_registration_answers for select to authenticated using(
 (user_id=public.get_current_app_user_id() and exists(select 1 from public.tbl_users u where u.id=user_id and u.is_active=1 and coalesce(u.is_delete,0)=0))
 or private.partner_owns_activity(event_id) or public.is_wenitro_admin()
);
notify pgrst,'reload schema';
