-- Repair only the currently authenticated identity. This covers Auth users that
-- were created before the WeNitro profile trigger existed without bulk-creating
-- or guessing links for other accounts.
create or replace function public.bootstrap_my_profile()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_row auth.users%rowtype;
  profile_id integer;
  email_profile_id integer;
  phone_profile_id integer;
  email_matches bigint := 0;
  phone_matches bigint := 0;
  existing_auth_user_id uuid;
  normalized_email text;
  normalized_phone text;
  storage_email text;
  metadata_full_name text;
  full_name text;
  username_seed text;
  username_base text;
  generated_username text;
  uuid_suffix text;
  username_attempt integer := 0;
  country_code text;
  national_phone bigint;
  active_value integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into auth_row from auth.users where id = auth.uid();
  if not found then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select u.id into profile_id
  from public.tbl_users u
  where u.auth_user_id = auth_row.id
  limit 1;

  if profile_id is not null then
    insert into public.tbl_user_privacy_settings(user_id)
    values (profile_id)
    on conflict(user_id) do nothing;
    return profile_id;
  end if;

  normalized_email := nullif(lower(btrim(auth_row.email)), '');
  normalized_phone := private.normalize_phone_e164(auth_row.phone);
  metadata_full_name := nullif(btrim(coalesce(
    auth_row.raw_user_meta_data ->> 'full_name',
    auth_row.raw_user_meta_data ->> 'fullname',
    auth_row.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if normalized_email is not null then
    select min(u.id), count(*) into email_profile_id, email_matches
    from public.tbl_users u
    where lower(btrim(u.email)) = normalized_email;
    if email_matches > 1 then
      raise exception 'Email matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if normalized_phone is not null then
    select min(u.id), count(*) into phone_profile_id, phone_matches
    from public.tbl_users u
    where u.phone_e164 = normalized_phone
       or (u.phone_e164 is null and private.normalize_phone_e164(
         coalesce(u.countrycode, '') || coalesce(u.phonenumber::text, '')
       ) = normalized_phone);
    if phone_matches > 1 then
      raise exception 'Phone matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if email_profile_id is not null and phone_profile_id is not null
     and email_profile_id <> phone_profile_id then
    raise exception 'Email and phone belong to different legacy accounts' using errcode = '23505';
  end if;

  profile_id := coalesce(email_profile_id, phone_profile_id);
  active_value := case when auth_row.email_confirmed_at is not null
    or auth_row.phone_confirmed_at is not null then 1 else 0 end;

  if normalized_phone ~ '^\+91[6-9][0-9]{9}$' then
    country_code := '+91';
    national_phone := substring(normalized_phone from 4)::bigint;
  end if;

  if profile_id is not null then
    perform 1 from public.tbl_users u where u.id = profile_id for update;
    select u.auth_user_id into existing_auth_user_id
    from public.tbl_users u where u.id = profile_id;
    if existing_auth_user_id is not null and existing_auth_user_id <> auth_row.id then
      raise exception 'Legacy account is already linked to another auth user' using errcode = '23505';
    end if;

    update public.tbl_users
    set auth_user_id = auth_row.id,
        is_active = active_value,
        is_delete = 0,
        fullname = coalesce(left(metadata_full_name, 150), fullname),
        phone_e164 = coalesce(normalized_phone, phone_e164),
        countrycode = coalesce(country_code, countrycode),
        phonenumber = coalesce(national_phone, phonenumber)
    where id = profile_id;
  else
    uuid_suffix := left(replace(auth_row.id::text, '-', ''), 12);
    username_seed := coalesce(
      nullif(auth_row.raw_user_meta_data ->> 'username', ''),
      case when normalized_email is not null then split_part(normalized_email, '@', 1) end,
      'member'
    );
    username_base := lower(regexp_replace(btrim(username_seed), '[^a-zA-Z0-9_]+', '_', 'g'));
    username_base := btrim(username_base, '_');
    if username_base = '' then username_base := 'member'; end if;

    perform pg_advisory_xact_lock(hashtext('wenitro:auth-bridge:username'));
    loop
      generated_username := left(username_base, 80) || '_' || uuid_suffix;
      if username_attempt > 0 then
        generated_username := left(username_base, 74) || '_' || uuid_suffix || '_' || username_attempt::text;
      end if;
      generated_username := left(generated_username, 100);
      exit when not exists (
        select 1 from public.tbl_users u
        where lower(u.username) = lower(generated_username)
      );
      username_attempt := username_attempt + 1;
      if username_attempt > 100 then
        raise exception 'Unable to allocate a unique username' using errcode = '23505';
      end if;
    end loop;

    full_name := left(coalesce(
      metadata_full_name,
      case when normalized_email is not null then split_part(normalized_email, '@', 1) end,
      'WeNitro member'
    ), 150);
    storage_email := coalesce(
      normalized_email,
      'auth-phone-' || replace(auth_row.id::text, '-', '') || '@invalid.wenitro.local'
    );

    insert into public.tbl_users(
      username, fullname, email, password, is_active, is_delete,
      auth_user_id, phone_e164, countrycode, phonenumber, account_type
    ) values (
      generated_username, full_name, storage_email, 'supabase-auth-managed',
      active_value, 0, auth_row.id, normalized_phone, country_code,
      national_phone, 'individual'
    ) returning id into profile_id;

    if auth_row.raw_user_meta_data ->> 'account_type' = 'partner' then
      insert into public.tbl_partner_profiles(user_id, status)
      values(profile_id, 'draft')
      on conflict(user_id) do nothing;
    end if;
  end if;

  insert into public.tbl_user_privacy_settings(user_id)
  values (profile_id)
  on conflict(user_id) do nothing;
  return profile_id;
end
$$;

revoke all on function public.bootstrap_my_profile() from public, anon, authenticated;
grant execute on function public.bootstrap_my_profile() to authenticated;
notify pgrst, 'reload schema';
