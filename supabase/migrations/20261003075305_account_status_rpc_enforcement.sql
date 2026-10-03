-- JWTs issued before suspension, deactivation or Auth deletion must not retain
-- access. A missing Auth row is a denial, not proof that an account is unbanned.
create or replace function private.account_is_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users a where a.id=auth.uid()
  and (a.banned_until is null or a.banned_until<=now()))
 and not exists(select 1 from public.tbl_users u where u.auth_user_id=auth.uid()
  and (coalesce(u.is_active,0)<>1 or coalesce(u.is_delete,0)<>0 or u.deactivated_at is not null))
$$;
revoke all on function private.account_is_allowed() from public,anon;
grant execute on function private.account_is_allowed() to authenticated;

-- These SECURITY DEFINER entry points use Auth directly instead of the normal
-- current_app_user_id boundary. RLS alone cannot constrain their owner access.
do $$ declare definition text; signature text; begin
 foreach signature in array array[
  'private.bootstrap_my_profile()',
  'private.check_onboarding_username(text)',
  'private.complete_my_onboarding(uuid,text,text,date,text)',
  'public.submit_my_live_photo(text)',
  'public.sync_my_verification()'
 ] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  if position(E'begin\n' in definition)=0 then raise exception 'Unexpected function contract: %',signature;end if;
  definition:=replace(definition,E'begin\n',E'begin\n  if not private.account_is_allowed() then raise exception ''Account unavailable or deactivated'' using errcode=''42501'';end if;\n');
  execute definition;
 end loop;
end $$;

-- A current-user expression used only to decorate a row (for example viewed)
-- is not an authorization predicate. Constrain the story feed itself.
do $$ declare definition text; begin
 select pg_get_functiondef('public.list_active_stories(integer,timestamptz,bigint)'::regprocedure) into definition;
 if position('where s.deleted_at is null' in definition)=0 then raise exception 'Unexpected story feed contract';end if;
 execute replace(definition,'where s.deleted_at is null','where private.account_is_allowed() and s.deleted_at is null');
end $$;
