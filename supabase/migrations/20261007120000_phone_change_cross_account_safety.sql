-- Keep phone-change ownership checks provider-independent and project a
-- confirmed Auth phone into the legacy profile without trusting client state.

create or replace function public.prepare_my_phone_change(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  normalized text := private.normalize_phone_e164(p_phone);
begin
  if me is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if normalized is null or normalized !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tbl_users u
    where u.auth_user_id = me and coalesce(u.is_delete, 0) = 0
      and u.deactivated_at is null
  ) then
    raise exception 'Account unavailable.' using errcode = '42501';
  end if;

  if exists (
    select 1 from auth.users u
    where u.id <> me and private.normalize_phone_e164(u.phone) = normalized
  ) or exists (
    select 1 from public.tbl_users u
    where u.auth_user_id is distinct from me and u.phone_e164 = normalized
  ) then
    raise exception 'phone_exists' using errcode = 'P0001';
  end if;

  -- GoTrue resolves a phone-change OTP by the pending phone value. Do not let
  -- two accounts hold the same pending value, which could make the result
  -- ambiguous even though the final auth.users.phone column is unique.
  if exists (
    select 1 from auth.users u
    where u.id <> me and private.normalize_phone_e164(u.phone_change) = normalized
  ) then
    raise exception 'phone_change_in_progress' using errcode = 'P0001';
  end if;

  return jsonb_build_object('available', true);
end;
$$;

revoke all on function public.prepare_my_phone_change(text) from public, anon;
grant execute on function public.prepare_my_phone_change(text) to authenticated;

create or replace function private.project_confirmed_auth_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := private.normalize_phone_e164(new.phone);
begin
  if new.phone_confirmed_at is null or normalized is null
     or normalized !~ '^\+91[6-9][0-9]{9}$' then
    return new;
  end if;

  update public.tbl_users target
  set phone_e164 = normalized,
      countrycode = '+91',
      phonenumber = substring(normalized from 4)::bigint
  where target.auth_user_id = new.id
    and coalesce(target.is_delete, 0) = 0
    and not exists (
      select 1 from public.tbl_users other
      where other.id <> target.id and other.phone_e164 = normalized
    );
  return new;
end;
$$;

drop trigger if exists zzz_auth_confirmed_phone_projection on auth.users;
create trigger zzz_auth_confirmed_phone_projection
after insert or update of phone, phone_confirmed_at on auth.users
for each row execute function private.project_confirmed_auth_phone();

with confirmed as (
  select a.id, private.normalize_phone_e164(a.phone) as normalized
  from auth.users a
  where a.phone_confirmed_at is not null and nullif(btrim(a.phone), '') is not null
)
update public.tbl_users target
set phone_e164 = confirmed.normalized,
    countrycode = '+91',
    phonenumber = substring(confirmed.normalized from 4)::bigint
from confirmed
where target.auth_user_id = confirmed.id
  and confirmed.normalized ~ '^\+91[6-9][0-9]{9}$'
  and coalesce(target.is_delete, 0) = 0
  and not exists (
    select 1 from public.tbl_users other
    where other.id <> target.id and other.phone_e164 = confirmed.normalized
  );
