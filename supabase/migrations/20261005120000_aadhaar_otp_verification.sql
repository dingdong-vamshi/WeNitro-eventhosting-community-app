-- Sandbox Aadhaar Offline e-KYC OTP ledger. Full Aadhaar numbers, OTPs,
-- demographics, provider photos and documents are never persisted.
alter table private.aadhaar_verification_sessions
  add column if not exists provider_reference_id text,
  add column if not exists aadhaar_last4 text,
  add column if not exists otp_attempt_count integer not null default 0,
  add column if not exists last_otp_requested_at timestamptz,
  add column if not exists last_error_code text;

alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_status_check;
alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_status_check
  check(status in ('initializing','otp_sent','verifying','succeeded','failed','expired'));
alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_aadhaar_last4_check;
alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_aadhaar_last4_check
  check(aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');
alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_check;
alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_check
  check(verified_at is null or (environment='production' and status='succeeded' and provider_reference_id is not null));

create index if not exists aadhaar_verification_provider_reference
  on private.aadhaar_verification_sessions(provider_reference_id)
  where provider_reference_id is not null;

create or replace function public.aadhaar_otp_session_service(
  p_auth_id uuid,
  p_action text,
  p_environment text default null,
  p_session_id uuid default null,
  p_provider_reference_id text default null,
  p_status text default null,
  p_verified boolean default false,
  p_transaction_id uuid default null,
  p_aadhaar_last4 text default null,
  p_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  me integer;
  s private.aadhaar_verification_sessions;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Service access required' using errcode='42501';
  end if;
  select u.id into me
  from public.tbl_users u join auth.users a on a.id=u.auth_user_id
  where a.id=p_auth_id and u.is_active=1 and coalesce(u.is_delete,0)=0
    and u.deactivated_at is null and (a.banned_until is null or a.banned_until<=now())
  for update of u;
  if me is null then raise exception 'Account unavailable' using errcode='42501'; end if;

  if p_action='read' then
    select * into s from private.aadhaar_verification_sessions
    where auth_id=p_auth_id
    order by (verified_at is not null) desc, created_at desc limit 1;
    if s.id is null then return null; end if;

  elsif p_action='begin' then
    if p_environment not in ('test','production') or p_environment is null then
      raise exception 'Invalid verification environment' using errcode='22023';
    end if;
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Invalid masked Aadhaar' using errcode='22023';
    end if;
    select * into s from private.aadhaar_verification_sessions
    where auth_id=p_auth_id and environment='production' and verified_at is not null
    order by verified_at desc limit 1;
    if s.id is not null then return to_jsonb(s); end if;
    if exists(
      select 1 from private.aadhaar_verification_sessions
      where auth_id=p_auth_id and created_at>now()-interval '30 seconds'
    ) or (
      select count(*) from private.aadhaar_verification_sessions
      where auth_id=p_auth_id and created_at>now()-interval '1 hour'
    ) >= 10 then
      raise exception 'Please wait before starting another verification' using errcode='P0001';
    end if;
    update private.aadhaar_verification_sessions set status='expired',updated_at=now()
    where auth_id=p_auth_id and verified_at is null and status in ('initializing','otp_sent','verifying');
    insert into private.aadhaar_verification_sessions(
      user_id,auth_id,environment,consent_version,aadhaar_last4,last_otp_requested_at,expires_at
    ) values(
      me,p_auth_id,p_environment,'wenitro-aadhaar-okyc-v1',p_aadhaar_last4,now(),now()+interval '10 minutes'
    ) returning * into s;

  elsif p_action in ('update','claim_verify','error') then
    select * into s from private.aadhaar_verification_sessions
    where auth_id=p_auth_id and id=p_session_id for update;
    if s.id is null then raise exception 'Verification session unavailable' using errcode='42501'; end if;
    if p_action='claim_verify' then
      if s.verified_at is not null then return to_jsonb(s); end if;
      if s.expires_at<=now() or s.status not in ('otp_sent','verifying') or s.provider_reference_id is null then
        raise exception 'Verification session expired' using errcode='22023';
      end if;
      if s.otp_attempt_count>=5 then raise exception 'Too many OTP attempts' using errcode='22023'; end if;
      if s.last_checked_at is not null and s.last_checked_at>now()-interval '3 seconds' then
        raise exception 'Please wait before checking verification again' using errcode='P0001';
      end if;
      update private.aadhaar_verification_sessions
        set status='verifying',otp_attempt_count=otp_attempt_count+1,last_checked_at=now(),updated_at=now()
      where id=s.id returning * into s;
    elsif p_action='error' then
      if p_error_code is null or p_error_code !~ '^[a-z0-9_]{3,60}$' then
        raise exception 'Invalid provider error code' using errcode='22023';
      end if;
      update private.aadhaar_verification_sessions
        set status=case when status='verifying' then 'otp_sent' else status end,
            last_error_code=p_error_code,updated_at=now()
      where id=s.id returning * into s;
    else
      if p_environment is distinct from s.environment then raise exception 'Verification session mismatch' using errcode='42501'; end if;
      if s.verified_at is not null then return to_jsonb(s); end if;
      if s.expires_at<=now() or s.status in ('failed','expired') then raise exception 'Verification session expired' using errcode='22023'; end if;
      if p_status not in ('otp_sent','succeeded','failed','expired') or p_status is null then raise exception 'Invalid verification status' using errcode='22023'; end if;
      if s.provider_reference_id is not null and p_provider_reference_id is distinct from s.provider_reference_id then raise exception 'Provider reference mismatch' using errcode='42501'; end if;
      if p_status in ('otp_sent','succeeded') and p_provider_reference_id is null then raise exception 'Provider reference required' using errcode='22023'; end if;
      if p_verified and (p_status<>'succeeded' or p_environment<>'production' or p_provider_reference_id is null) then raise exception 'Live provider proof required' using errcode='22023'; end if;
      update private.aadhaar_verification_sessions
        set provider_reference_id=coalesce(s.provider_reference_id,p_provider_reference_id),
            provider_transaction_id=p_transaction_id,status=p_status,last_error_code=null,updated_at=now(),
            verified_at=case when p_verified then now() else verified_at end
      where id=s.id returning * into s;
      if p_verified then
        insert into public.tbl_user_verification(
          user_id,phone_verified,aadhaar_verified,verification_type,status,submitted_at,reviewed_at,updated_at,
          aadhaar_number,aadhaar_otp_code,aadhaar_client_id,aadhaar_otp_created_at
        ) values(me,false,true,'identity','approved',now(),now(),now(),null,null,null,null)
        on conflict(user_id) do update set aadhaar_verified=true,status='approved',
          reviewed_at=coalesce(public.tbl_user_verification.reviewed_at,now()),updated_at=now(),
          aadhaar_number=null,aadhaar_otp_code=null,aadhaar_client_id=null,aadhaar_otp_created_at=null;
      end if;
    end if;
  else
    raise exception 'Unsupported verification action' using errcode='22023';
  end if;
  return to_jsonb(s);
end $$;

revoke all on function public.aadhaar_otp_session_service(uuid,text,text,uuid,text,text,boolean,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.aadhaar_otp_session_service(uuid,text,text,uuid,text,text,boolean,uuid,text,text)
  to service_role;

create or replace function private.prevent_legacy_aadhaar_storage()
returns trigger language plpgsql set search_path='' as $$
begin
  new.aadhaar_number:=null;
  new.aadhaar_otp_code:=null;
  new.aadhaar_client_id:=null;
  new.aadhaar_otp_created_at:=null;
  return new;
end $$;
revoke all on function private.prevent_legacy_aadhaar_storage() from public,anon,authenticated;
drop trigger if exists prevent_legacy_aadhaar_storage on public.tbl_user_verification;
create trigger prevent_legacy_aadhaar_storage
before insert or update on public.tbl_user_verification
for each row execute function private.prevent_legacy_aadhaar_storage();

notify pgrst,'reload schema';
