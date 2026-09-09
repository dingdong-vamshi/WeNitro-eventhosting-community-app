-- Phone-auth bridge for the canonical legacy integer-ID user table.
-- The Supabase Auth user remains the identity source; the compatibility email
-- below exists only because the legacy tbl_users.email column is required.

alter table public.tbl_users
  add column if not exists phone_e164 text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'tbl_users_phone_e164_e164_check'
      and conrelid = 'public.tbl_users'::regclass
  ) then
    alter table public.tbl_users
      add constraint tbl_users_phone_e164_e164_check
      check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end
$$;

create or replace function private.normalize_phone_e164(p_phone text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := regexp_replace(btrim(p_phone), '[^0-9+]', '', 'g');

  if left(v_phone, 2) = '00' then
    v_phone := '+' || substring(v_phone from 3);
  elsif v_phone ~ '^91[6-9][0-9]{9}$' then
    v_phone := '+' || v_phone;
  elsif v_phone ~ '^[6-9][0-9]{9}$' then
    v_phone := '+91' || v_phone;
  end if;

  if v_phone ~ '^\+[1-9][0-9]{7,14}$' then
    return v_phone;
  end if;

  return null;
end
$$;

revoke all on function private.normalize_phone_e164(text) from public;

-- Backfill only unambiguous, valid legacy phone values. Duplicate legacy
-- values remain NULL so the migration cannot attach an identity arbitrarily.
with phone_candidates as (
  select
    u.id,
    private.normalize_phone_e164(
      coalesce(u.countrycode, '') ||
      coalesce(u.phonenumber::text, '')
    ) as phone_e164
  from public.tbl_users u
  where u.phone_e164 is null
    and u.phonenumber is not null
),
unique_candidates as (
  select min(id) as id, phone_e164
  from phone_candidates
  where phone_e164 is not null
  group by phone_e164
  having count(*) = 1
)
update public.tbl_users u
set phone_e164 = c.phone_e164
from unique_candidates c
where u.id = c.id
  and not exists (
    select 1
    from public.tbl_users existing
    where existing.id <> u.id
      and existing.phone_e164 = c.phone_e164
  );

create unique index if not exists tbl_users_phone_e164_uidx
  on public.tbl_users(phone_e164)
  where phone_e164 is not null;

comment on column public.tbl_users.phone_e164 is
  'Canonical E.164 phone identity linked to auth.users; never stores an OTP.';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id integer;
  v_email_user_id integer;
  v_phone_user_id integer;
  v_user_id integer;
  v_email_matches bigint := 0;
  v_phone_matches bigint := 0;
  v_existing_auth_user_id uuid;
  v_email text;
  v_phone text;
  v_storage_email text;
  v_metadata_full_name text;
  v_full_name text;
  v_username_seed text;
  v_username_base text;
  v_username text;
  v_uuid_suffix text;
  v_username_attempt integer := 0;
  v_countrycode text;
  v_national_phone bigint;
begin
  v_email := nullif(lower(btrim(new.email)), '');
  v_phone := private.normalize_phone_e164(new.phone);
  v_metadata_full_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'fullname',
        new.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  select u.id
  into v_auth_user_id
  from public.tbl_users u
  where u.auth_user_id = new.id
  limit 1;

  if v_email is not null then
    select min(u.id), count(*)
    into v_email_user_id, v_email_matches
    from public.tbl_users u
    where lower(btrim(u.email)) = v_email;

    if v_email_matches > 1 then
      raise exception 'Email matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if v_phone is not null then
    select min(u.id), count(*)
    into v_phone_user_id, v_phone_matches
    from public.tbl_users u
    where u.phone_e164 = v_phone
       or (
         u.phone_e164 is null
         and private.normalize_phone_e164(
           coalesce(u.countrycode, '') ||
           coalesce(u.phonenumber::text, '')
         ) = v_phone
       );

    if v_phone_matches > 1 then
      raise exception 'Phone matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if v_email_user_id is not null
     and v_phone_user_id is not null
     and v_email_user_id <> v_phone_user_id then
    raise exception 'Email and phone belong to different legacy accounts' using errcode = '23505';
  end if;

  if v_auth_user_id is not null
     and v_email_user_id is not null
     and v_auth_user_id <> v_email_user_id then
    raise exception 'Auth user and email map to different legacy accounts' using errcode = '23505';
  end if;

  if v_auth_user_id is not null
     and v_phone_user_id is not null
     and v_auth_user_id <> v_phone_user_id then
    raise exception 'Auth user and phone map to different legacy accounts' using errcode = '23505';
  end if;

  v_user_id := coalesce(v_auth_user_id, v_email_user_id, v_phone_user_id);

  if v_phone ~ '^\+91[6-9][0-9]{9}$' then
    v_countrycode := '+91';
    v_national_phone := substring(v_phone from 4)::bigint;
  end if;

  if v_user_id is not null then
    perform 1
    from public.tbl_users u
    where u.id = v_user_id
    for update;

    select u.auth_user_id
    into v_existing_auth_user_id
    from public.tbl_users u
    where u.id = v_user_id;

    if v_existing_auth_user_id is not null
       and v_existing_auth_user_id <> new.id then
      raise exception 'Legacy account is already linked to another auth user' using errcode = '23505';
    end if;

    update public.tbl_users
    set
      auth_user_id = new.id,
      is_active = 1,
      is_delete = 0,
      fullname = case
        when v_metadata_full_name is not null then left(v_metadata_full_name, 150)
        else fullname
      end,
      phone_e164 = case
        when v_phone is not null then v_phone
        else phone_e164
      end,
      countrycode = case
        when v_countrycode is not null then v_countrycode
        else countrycode
      end,
      phonenumber = case
        when v_national_phone is not null then v_national_phone
        else phonenumber
      end
    where id = v_user_id;
  else
    v_uuid_suffix := left(replace(new.id::text, '-', ''), 12);
    v_username_seed := coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      case when v_email is not null then split_part(v_email, '@', 1) end,
      'member'
    );
    v_username_base := lower(
      regexp_replace(btrim(v_username_seed), '[^a-zA-Z0-9_]+', '_', 'g')
    );
    v_username_base := btrim(v_username_base, '_');

    if v_username_base = '' then
      v_username_base := 'member';
    end if;

    -- Serialize bridge-generated username selection so concurrent signups cannot
    -- choose the same case-insensitive username.
    perform pg_advisory_xact_lock(
      hashtext('wenitro:auth-bridge:username')
    );

    loop
      v_username := left(v_username_base, 80) || '_' || v_uuid_suffix;
      if v_username_attempt > 0 then
        v_username := left(v_username_base, 74) || '_' ||
          v_uuid_suffix || '_' || v_username_attempt::text;
      end if;
      v_username := left(v_username, 100);

      exit when not exists (
        select 1
        from public.tbl_users u
        where lower(u.username) = lower(v_username)
      );

      v_username_attempt := v_username_attempt + 1;
      if v_username_attempt > 100 then
        raise exception 'Unable to allocate a unique username' using errcode = '23505';
      end if;
    end loop;

    v_full_name := left(
      coalesce(
        v_metadata_full_name,
        case when v_email is not null then split_part(v_email, '@', 1) end,
        'WeNitro member'
      ),
      150
    );

    v_storage_email := coalesce(
      v_email,
      'auth-phone-' || replace(new.id::text, '-', '') || '@invalid.wenitro.local'
    );

    insert into public.tbl_users (
      username,
      fullname,
      email,
      password,
      is_active,
      is_delete,
      auth_user_id,
      phone_e164,
      countrycode,
      phonenumber
    )
    values (
      v_username,
      v_full_name,
      v_storage_email,
      'supabase-auth-managed',
      1,
      0,
      new.id,
      v_phone,
      v_countrycode,
      v_national_phone
    )
    returning id into v_user_id;
  end if;

  insert into public.tbl_user_privacy_settings(user_id)
  values (v_user_id)
  on conflict(user_id) do nothing;

  return new;
end
$$;

revoke all on function private.handle_new_auth_user() from public;
