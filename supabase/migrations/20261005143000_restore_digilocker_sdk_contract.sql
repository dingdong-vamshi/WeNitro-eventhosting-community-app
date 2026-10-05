-- Restore one server-owned DigiLocker SDK session contract after the retired
-- Aadhaar OKYC flow changed the shared session table and Edge RPC.
alter table private.aadhaar_verification_sessions
  alter column consent_version set default 'wenitro-aadhaar-digilocker-sdk-v1';

alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_status_check;
alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_status_check
  check(status in (
    'initializing','created','initialized','authorized','succeeded','failed','expired',
    'otp_sent','verifying'
  ));

alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_check;
alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_check
  check(verified_at is null or (
    environment='production' and status='succeeded' and provider_session_id is not null
  ));

create or replace function public.aadhaar_session_service(
 p_auth_id uuid,p_action text,p_environment text default null,p_session_id uuid default null,
 p_provider_session_id uuid default null,p_status text default null,p_verified boolean default false,
 p_transaction_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer; s private.aadhaar_verification_sessions;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then
  raise exception 'Service access required' using errcode='42501';
 end if;
 select u.id into me from public.tbl_users u join auth.users a on a.id=u.auth_user_id
 where a.id=p_auth_id and u.is_active=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
 and (a.banned_until is null or a.banned_until<=now()) for update of u;
 if me is null then raise exception 'Account unavailable' using errcode='42501'; end if;

 if p_action='read' then
  select * into s from private.aadhaar_verification_sessions where auth_id=p_auth_id
    and (p_session_id is null or id=p_session_id)
  order by (verified_at is not null) desc,created_at desc limit 1 for update;
  if s.id is null then
   if p_session_id is null then return null; end if;
   raise exception 'Verification session unavailable' using errcode='42501';
  end if;

 elsif p_action='begin' then
  if p_environment not in ('test','production') or p_environment is null then
   raise exception 'Invalid verification environment' using errcode='22023';
  end if;
  select * into s from private.aadhaar_verification_sessions
  where auth_id=p_auth_id and environment='production' and verified_at is not null
  order by verified_at desc limit 1;
  if s.id is not null then return to_jsonb(s); end if;
  if exists(select 1 from private.aadhaar_verification_sessions
    where auth_id=p_auth_id and verified_at is null and created_at>now()-interval '30 seconds')
   or (select count(*) from private.aadhaar_verification_sessions
    where auth_id=p_auth_id and verified_at is null and created_at>now()-interval '1 hour')>=10
  then raise exception 'Please wait before starting another verification' using errcode='P0001'; end if;
  update private.aadhaar_verification_sessions set status='expired',updated_at=now()
  where auth_id=p_auth_id and verified_at is null
    and status in ('initializing','created','initialized','authorized','otp_sent','verifying');
  insert into private.aadhaar_verification_sessions(
    user_id,auth_id,environment,consent_version,expires_at
  ) values(
    me,p_auth_id,p_environment,'wenitro-aadhaar-digilocker-sdk-v1',now()+interval '1 hour'
  ) returning * into s;

 elsif p_action in ('update','claim_refresh') then
  select * into s from private.aadhaar_verification_sessions
  where auth_id=p_auth_id and id=p_session_id for update;
  if s.id is null then raise exception 'Verification session unavailable' using errcode='42501'; end if;
  if p_action='claim_refresh' then
   if s.verified_at is not null then return to_jsonb(s); end if;
   if s.expires_at<=now() or s.status in ('failed','expired') or s.provider_session_id is null then
    raise exception 'Verification session expired' using errcode='22023';
   end if;
   if s.last_checked_at is not null and s.last_checked_at>now()-interval '3 seconds' then
    raise exception 'Please wait before checking verification again' using errcode='P0001';
   end if;
   update private.aadhaar_verification_sessions set last_checked_at=now(),updated_at=now()
    where id=s.id returning * into s;
  else
   if p_environment is distinct from s.environment then
    raise exception 'Verification session mismatch' using errcode='42501';
   end if;
   if s.verified_at is not null then return to_jsonb(s); end if;
   if s.expires_at<=now() or s.status='expired' then
    raise exception 'Verification session expired' using errcode='22023';
   end if;
   if p_status not in ('created','initialized','authorized','succeeded','failed','expired') or p_status is null then
    raise exception 'Invalid verification status' using errcode='22023';
   end if;
   if s.provider_session_id is not null and p_provider_session_id is distinct from s.provider_session_id then
    raise exception 'Provider session mismatch' using errcode='42501';
   end if;
   if p_status in ('created','initialized','authorized','succeeded') and p_provider_session_id is null then
    raise exception 'Provider reference required' using errcode='22023';
   end if;
   if p_verified and (
    p_status<>'succeeded' or p_environment<>'production' or s.provider_session_id is null
   ) then raise exception 'Live provider proof required' using errcode='22023'; end if;
   update private.aadhaar_verification_sessions set
    provider_session_id=coalesce(s.provider_session_id,p_provider_session_id),
    provider_transaction_id=coalesce(p_transaction_id,provider_transaction_id),
    status=p_status,updated_at=now(),
    verified_at=case when p_verified then coalesce(verified_at,now()) else verified_at end
   where id=s.id returning * into s;
   if p_verified then
    insert into public.tbl_user_verification(
      user_id,phone_verified,aadhaar_verified,verification_type,status,
      submitted_at,reviewed_at,updated_at,
      aadhaar_number,aadhaar_otp_code,aadhaar_client_id,aadhaar_otp_created_at
    ) values(
      me,false,true,'identity','approved',now(),now(),now(),null,null,null,null
    ) on conflict(user_id) do update set
      aadhaar_verified=true,status='approved',
      reviewed_at=coalesce(public.tbl_user_verification.reviewed_at,now()),updated_at=now(),
      aadhaar_number=null,aadhaar_otp_code=null,aadhaar_client_id=null,aadhaar_otp_created_at=null;
   end if;
  end if;
 else
  raise exception 'Unsupported verification action' using errcode='22023';
 end if;
 return to_jsonb(s);
end $$;

revoke all on function public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)
  from public,anon,authenticated;
grant execute on function public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)
  to service_role;

-- The SDK must receive the public API key, while the secret remains available
-- only to service_role through the Edge Function.
create or replace function public.provider_runtime_secrets()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(mapped.environment_name,s.decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets s
 join (values
  ('wenitro_aadhaar_enabled','AADHAAR_OKYC_ENABLED'),
  ('wenitro_aadhaar_enabled','AADHAAR_DIGILOCKER_ENABLED'),
  ('wenitro_sandbox_environment','SANDBOX_ENVIRONMENT'),
  ('wenitro_sandbox_base_url','SANDBOX_BASE_URL'),
  ('wenitro_sandbox_api_key','SANDBOX_API_KEY'),
  ('wenitro_sandbox_api_secret','SANDBOX_API_SECRET'),
  ('wenitro_openai_api_key','OPENAI_API_KEY'),
  ('wenitro_moderation_qa_fixtures','MODERATION_QA_FIXTURES_ENABLED'),
  ('wenitro_google_places_enabled','GOOGLE_PLACES_ENABLED'),
  ('wenitro_google_places_api_key','GOOGLE_PLACES_API_KEY')
 ) mapped(secret_name,environment_name) on mapped.secret_name=s.name
$$;
revoke all on function public.provider_runtime_secrets() from public,anon,authenticated;
grant execute on function public.provider_runtime_secrets() to service_role;

notify pgrst,'reload schema';
