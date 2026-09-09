-- Audited for klyjzbisgycegkkacbjw on September 8. No user-row updates during installation.
-- Reserve usernames case-insensitively, including private/deleted profiles.
-- Unlike a new unique index this does not rewrite/reject preexisting collisions.
-- The bridge already uses this lock, so its generated names stay coordinated.
create or replace function private.guard_profile_username_uniqueness()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.username is not distinct from old.username then return new; end if;
  perform pg_advisory_xact_lock(hashtext('wenitro:auth-bridge:username'));
  if exists(select 1 from public.tbl_users u where lower(u.username)=lower(new.username) and u.id<>new.id) then
    raise exception 'Username is already taken' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function private.guard_profile_username_uniqueness() from public,anon,authenticated;
create trigger guard_profile_username_uniqueness
before insert or update of username on public.tbl_users
for each row execute function private.guard_profile_username_uniqueness();

create function private.check_onboarding_username(p_username text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare me integer; proposed text:=lower(btrim(p_username));
begin
  select id into me from public.tbl_users where auth_user_id=auth.uid() and is_active=1 and coalesce(is_delete,0)=0;
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if proposed is null or proposed !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 letters, numbers, or underscores' using errcode='22023';
  end if;
  return not exists(select 1 from public.tbl_users where lower(username)=proposed and id<>me);
end $$;
create function public.check_onboarding_username(p_username text)
returns boolean language sql stable security invoker set search_path='' as $$
  select private.check_onboarding_username(p_username)
$$;

create function private.complete_my_onboarding(p_expected_auth_user_id uuid,p_full_name text,p_username text,p_dob date default null,p_gender text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare me integer; proposed text:=lower(btrim(p_username));
begin
  if p_expected_auth_user_id is null or p_expected_auth_user_id is distinct from auth.uid() then
    raise exception 'Signed-in account changed' using errcode='42501';
  end if;
  select id into me from public.tbl_users where auth_user_id=auth.uid() and is_active=1 and coalesce(is_delete,0)=0 for update;
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 150 then
    raise exception 'Full name must contain 1-150 characters' using errcode='22023';
  end if;
  if proposed is null or proposed !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 letters, numbers, or underscores' using errcode='22023';
  end if;
  if p_dob is not null and p_dob>current_date then
    raise exception 'Date of birth cannot be in the future' using errcode='22023';
  end if;
  -- Preserve the existing profile service's 18+ validation for supplied DOBs.
  if p_dob is not null and extract(year from age(current_date,p_dob))<18 then
    raise exception 'WeNitro profiles require a minimum age of 18' using errcode='22023';
  end if;
  if p_gender is not null and p_gender not in ('male','female','non_binary','prefer_not_to_say') then
    raise exception 'Choose one of the displayed gender options' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('wenitro:auth-bridge:username'));
  if not private.check_onboarding_username(proposed) then
    raise exception 'Username is already taken' using errcode='23505';
  end if;
  update public.tbl_users set fullname=btrim(p_full_name),username=proposed,dob=p_dob,gender=p_gender,onboarding_completed=true where id=me;
  return me;
end $$;
create function public.complete_my_onboarding(p_expected_auth_user_id uuid,p_full_name text,p_username text,p_dob date default null,p_gender text default null)
returns integer language sql security invoker set search_path='' as $$
  select private.complete_my_onboarding(p_expected_auth_user_id,p_full_name,p_username,p_dob,p_gender)
$$;

revoke all on function private.check_onboarding_username(text),private.complete_my_onboarding(uuid,text,text,date,text),public.check_onboarding_username(text),public.complete_my_onboarding(uuid,text,text,date,text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.check_onboarding_username(text),private.complete_my_onboarding(uuid,text,text,date,text),public.check_onboarding_username(text),public.complete_my_onboarding(uuid,text,text,date,text) to authenticated;
notify pgrst,'reload schema';
