-- Provider enablement remains off in Edge configuration until authorized Sandbox
-- onboarding and credentials are available. No Aadhaar number, OTP, image,
-- document URL, document content or demographic data is persisted here.
create table private.aadhaar_verification_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id integer not null references public.tbl_users(id) on delete cascade,
 auth_id uuid not null references auth.users(id) on delete cascade,
 environment text not null check(environment in ('test','production')),
 consent_version text not null default 'wenitro-aadhaar-digilocker-v1',
 consented_at timestamptz not null default now(),
 provider_session_id uuid unique,
 provider_transaction_id uuid,
 status text not null default 'initializing' check(status in ('initializing','created','succeeded','failed','expired')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 hour',
 last_checked_at timestamptz,
 verified_at timestamptz,
 check(verified_at is null or (environment='production' and status='succeeded'))
);
create index aadhaar_verification_sessions_actor on private.aadhaar_verification_sessions(auth_id,created_at desc);
alter table private.aadhaar_verification_sessions enable row level security;
revoke all on private.aadhaar_verification_sessions from public,anon,authenticated;

-- Only the authenticated Edge handler's service client can access the ledger.
-- Every operation revalidates the actor against current Auth/account state.
create function public.aadhaar_session_service(
 p_auth_id uuid,p_action text,p_environment text default null,p_session_id uuid default null,
 p_provider_session_id uuid default null,p_status text default null,p_verified boolean default false,
 p_transaction_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer; s private.aadhaar_verification_sessions;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 select u.id into me from public.tbl_users u join auth.users a on a.id=u.auth_user_id
 where a.id=p_auth_id and u.is_active=1 and coalesce(u.is_delete,0)=0 and u.deactivated_at is null
 and (a.banned_until is null or a.banned_until<=now()) for update of u;
 if me is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 if p_action='begin' then
  if p_environment not in ('test','production') or p_environment is null then raise exception 'Invalid verification environment' using errcode='22023'; end if;
  if exists(select 1 from private.aadhaar_verification_sessions where auth_id=p_auth_id and created_at>now()-interval '60 seconds')
   or (select count(*) from private.aadhaar_verification_sessions where auth_id=p_auth_id and created_at>now()-interval '1 hour')>=5
  then raise exception 'Please wait before starting another verification' using errcode='P0001'; end if;
  update private.aadhaar_verification_sessions set status='expired',updated_at=now()
   where auth_id=p_auth_id and verified_at is null and status in ('initializing','created');
  insert into private.aadhaar_verification_sessions(user_id,auth_id,environment) values(me,p_auth_id,p_environment) returning * into s;
 elsif p_action in ('read','update','claim_refresh') then
  select * into s from private.aadhaar_verification_sessions where auth_id=p_auth_id
   and (p_session_id is null or id=p_session_id) order by created_at desc limit 1 for update;
  if s.id is null then
   if p_action='read' and p_session_id is null then return null; end if;
   raise exception 'Verification session unavailable' using errcode='42501';
  end if;
  if p_action='claim_refresh' then
   if s.last_checked_at>now()-interval '10 seconds' then raise exception 'Please wait before checking verification again' using errcode='P0001'; end if;
   update private.aadhaar_verification_sessions set last_checked_at=now() where id=s.id returning * into s;
  end if;
  if p_action='update' then
   if p_session_id is null or p_environment is distinct from s.environment then raise exception 'Verification session mismatch' using errcode='42501'; end if;
   if s.verified_at is not null then return to_jsonb(s); end if;
   if s.expires_at<=now() or s.status in ('failed','expired') then raise exception 'Verification session expired' using errcode='22023'; end if;
   if p_status not in ('created','succeeded','failed','expired') or p_status is null then raise exception 'Invalid verification status' using errcode='22023'; end if;
   if s.provider_session_id is not null and p_provider_session_id is distinct from s.provider_session_id then raise exception 'Provider session mismatch' using errcode='42501'; end if;
   if p_status in ('created','succeeded') and p_provider_session_id is null then raise exception 'Provider reference required' using errcode='22023'; end if;
   if p_verified and (p_status<>'succeeded' or p_environment<>'production' or s.provider_session_id is null) then raise exception 'Live provider proof required' using errcode='22023'; end if;
   update private.aadhaar_verification_sessions set provider_session_id=coalesce(s.provider_session_id,p_provider_session_id),
    provider_transaction_id=p_transaction_id,status=p_status,updated_at=now(),
    verified_at=case when p_verified then now() else null end where id=s.id returning * into s;
  end if;
 else raise exception 'Unsupported verification action' using errcode='22023';
 end if;
 return to_jsonb(s);
end $$;
revoke all on function public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid) to service_role;

create function private.has_verified_aadhaar(p_user_id integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.aadhaar_verification_sessions s where s.user_id=p_user_id and s.environment='production' and s.verified_at is not null)
 or exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.aadhaar_verified and v.status='approved')
$$;
revoke all on function private.has_verified_aadhaar(integer) from public,anon,authenticated;
-- Integrate only the Aadhaar signal; never change selfie review or Nitro ledgers.
do $$
declare original text; revised text;
begin
 select pg_get_functiondef('private.trust_score_for(integer)'::regprocedure) into original;
 revised:=replace(original,'aadhaar_ok:=exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.aadhaar_verified and v.status=''approved'');','aadhaar_ok:=private.has_verified_aadhaar(p_user_id);');
 if revised=original then raise exception 'Unexpected Trust Aadhaar contract'; end if;
 execute revised;
 select pg_get_functiondef('private.sync_verification_rewards(uuid)'::regprocedure) into original;
 revised:=replace(original,'fully_verified := coalesce(email_ok and phone_ok and photo_ok and aadhaar_ok,false);','aadhaar_ok := private.has_verified_aadhaar(me);'||chr(10)||'  fully_verified := coalesce(email_ok and phone_ok and photo_ok and aadhaar_ok,false);');
 if revised=original then raise exception 'Unexpected verification signal contract'; end if;
 execute revised;
end $$;
