-- Hubble staging redemption backed by WeNitro's authoritative Nitro ledger.
-- Provider callbacks can only reach the service-role RPCs below; app users
-- continue to see their own balance/history through the existing read models.

create table if not exists private.hubble_redemption_config (
  singleton boolean primary key default true check (singleton),
  environment text not null check (environment in ('staging', 'production')),
  nitro_to_inr numeric(12, 2) not null check (nitro_to_inr > 0),
  eligibility_points integer not null check (eligibility_points > 0),
  minimum_debit_points integer not null check (minimum_debit_points > 0),
  payment_model text not null check (payment_model in ('coins_only', 'mixed')),
  updated_at timestamptz not null default now()
);

insert into private.hubble_redemption_config(
  singleton, environment, nitro_to_inr, eligibility_points,
  minimum_debit_points, payment_model
) values (true, 'staging', 1, 200, 1, 'coins_only')
on conflict (singleton) do update set
  environment = excluded.environment,
  nitro_to_inr = excluded.nitro_to_inr,
  eligibility_points = excluded.eligibility_points,
  minimum_debit_points = excluded.minimum_debit_points,
  payment_model = excluded.payment_model,
  updated_at = now();

revoke all on private.hubble_redemption_config from public, anon, authenticated;
grant select on private.hubble_redemption_config to service_role;

create table if not exists public.tbl_hubble_transactions (
  id serial primary key,
  user_id integer not null references public.tbl_users(id) on delete cascade,
  reference_id varchar(180) not null,
  coins numeric(12, 2) not null,
  transaction_type varchar(20) not null,
  status varchar(20) not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.tbl_hubble_transactions
  add column if not exists balance_after integer,
  add column if not exists original_transaction_id integer
    references public.tbl_hubble_transactions(id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.tbl_hubble_transactions
  drop constraint if exists tbl_hubble_transactions_reference_id_key,
  drop constraint if exists tbl_hubble_transactions_reference_length,
  drop constraint if exists tbl_hubble_transactions_coins_valid,
  drop constraint if exists tbl_hubble_transactions_type_valid,
  drop constraint if exists tbl_hubble_transactions_status_valid,
  drop constraint if exists tbl_hubble_transactions_note_length;

alter table public.tbl_hubble_transactions
  add constraint tbl_hubble_transactions_reference_length
    check (length(reference_id) between 1 and 180),
  add constraint tbl_hubble_transactions_coins_valid
    check (coins > 0 and coins = trunc(coins)),
  add constraint tbl_hubble_transactions_type_valid
    check (transaction_type in ('debit', 'reverse')),
  add constraint tbl_hubble_transactions_status_valid
    check (status = 'SUCCESS'),
  add constraint tbl_hubble_transactions_note_length
    check (note is null or length(note) <= 240);

create unique index if not exists tbl_hubble_transactions_type_reference_uidx
  on public.tbl_hubble_transactions(transaction_type, reference_id);
create index if not exists tbl_hubble_transactions_user_created_idx
  on public.tbl_hubble_transactions(user_id, created_at desc, id desc);

alter table public.tbl_hubble_transactions enable row level security;
drop policy if exists wenitro_admin_all on public.tbl_hubble_transactions;
drop policy if exists hubble_admin_read on public.tbl_hubble_transactions;
create policy hubble_admin_read on public.tbl_hubble_transactions
  for select to authenticated using (public.is_wenitro_admin());
revoke insert, update, delete, truncate on public.tbl_hubble_transactions
  from anon, authenticated;
grant select on public.tbl_hubble_transactions to authenticated;
grant all on public.tbl_hubble_transactions to service_role;
grant usage, select on sequence public.tbl_hubble_transactions_id_seq to service_role;

alter table public.tbl_user_points_history
  drop constraint if exists verification_reward_valid;
alter table public.tbl_user_points_history
  add constraint verification_reward_valid check (
    (verification_method is null and rating_id is not null)
    or (
      verification_method in ('email', 'phone', 'live_photo', 'play_store_rating')
      and rating_id is null and points_earned = 10
    )
    or (
      verification_method like 'spend:%'
      and rating_id is null and points_earned < 0
    )
    or (
      verification_method like 'refund:%'
      and rating_id is null and points_earned > 0
    )
  );

create or replace function public.hubble_token_context(p_auth_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  account record;
  config private.hubble_redemption_config;
  normalized_phone text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select u.id, coalesce(u.points, 0) points, u.fullname,
         a.email, a.email_confirmed_at, a.phone, a.phone_confirmed_at
    into account
  from public.tbl_users u
  join auth.users a on a.id=u.auth_user_id
  where u.auth_user_id=p_auth_user_id
    and coalesce(u.is_active,1)=1
    and coalesce(u.is_delete,0)=0
    and u.deactivated_at is null;
  if not found then raise exception 'Active WeNitro user not found'; end if;
  normalized_phone := regexp_replace(coalesce(account.phone,''),'[^0-9]','','g');
  if account.phone_confirmed_at is null or length(normalized_phone) < 10 then
    raise exception 'A verified phone number is required for Hubble rewards';
  end if;
  normalized_phone := right(normalized_phone,10);
  select * into config from private.hubble_redemption_config where singleton;
  return jsonb_build_object(
    'userId',account.id,
    'balance',account.points,
    'phoneNumber',normalized_phone,
    'name',nullif(trim(coalesce(account.fullname,'')),''),
    'email',case when account.email_confirmed_at is not null then account.email else null end,
    'environment',config.environment,
    'nitroToInr',config.nitro_to_inr,
    'eligibilityPoints',config.eligibility_points,
    'minimumDebitPoints',config.minimum_debit_points,
    'paymentModel',config.payment_model,
    'eligible',account.points >= config.eligibility_points
  );
end $$;

create or replace function public.hubble_get_balance(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare account record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select id,coalesce(points,0) points into account from public.tbl_users
   where id=p_user_id and coalesce(is_active,1)=1 and coalesce(is_delete,0)=0
     and deactivated_at is null;
  if not found then raise exception 'No user with this ID'; end if;
  return jsonb_build_object('userId',account.id,'totalCoins',account.points);
end $$;

create or replace function public.hubble_debit(
  p_user_id integer, p_coins numeric, p_reference_id text, p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  account public.tbl_users;
  config private.hubble_redemption_config;
  existing public.tbl_hubble_transactions;
  created public.tbl_hubble_transactions;
  points_to_debit integer;
  clean_reference text := trim(coalesce(p_reference_id,''));
  clean_note text := nullif(left(trim(coalesce(p_note,'')),240),'');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id <= 0 then raise exception 'No user with this ID'; end if;
  if p_coins is null or p_coins <= 0 or p_coins <> trunc(p_coins) or p_coins > 2147483647 then
    raise exception 'Coins must be a positive whole number';
  end if;
  if length(clean_reference) not between 1 and 180 then raise exception 'Invalid referenceId'; end if;
  points_to_debit := p_coins::integer;
  perform pg_advisory_xact_lock(hashtextextended('wenitro:hubble:'||clean_reference,0));
  select * into existing from public.tbl_hubble_transactions
   where transaction_type='debit' and reference_id=clean_reference;
  if found then
    if existing.user_id<>p_user_id or existing.coins<>p_coins then
      raise exception 'referenceId conflicts with an existing debit';
    end if;
    return jsonb_build_object(
      'transactionId','nitro_txn_'||existing.id,
      'balance',existing.balance_after,
      'referenceId',existing.reference_id,
      'idempotent',true
    );
  end if;
  select * into account from public.tbl_users where id=p_user_id for update;
  if not found or coalesce(account.is_active,1)<>1 or coalesce(account.is_delete,0)<>0
     or account.deactivated_at is not null then raise exception 'No user with this ID'; end if;
  select * into config from private.hubble_redemption_config where singleton;
  if coalesce(account.points,0) < config.eligibility_points then
    raise exception 'At least % Nitro Points are required to redeem',config.eligibility_points;
  end if;
  if points_to_debit < config.minimum_debit_points then
    raise exception 'Redemption amount is below the configured minimum';
  end if;
  if points_to_debit > coalesce(account.points,0) then raise exception 'Insufficient balance'; end if;
  update public.tbl_users set points=coalesce(points,0)-points_to_debit where id=p_user_id
    returning * into account;
  insert into public.tbl_hubble_transactions(
    user_id,reference_id,coins,transaction_type,status,note,balance_after
  ) values (p_user_id,clean_reference,points_to_debit,'debit','SUCCESS',clean_note,account.points)
  returning * into created;
  insert into public.tbl_user_points_history(
    user_id,rating_id,points_earned,verification_method
  ) values (p_user_id,null,-points_to_debit,'spend:hubble:'||clean_reference);
  return jsonb_build_object(
    'transactionId','nitro_txn_'||created.id,
    'balance',account.points,
    'referenceId',created.reference_id,
    'idempotent',false
  );
end $$;

create or replace function public.hubble_reverse(
  p_user_id integer, p_reference_id text, p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  account public.tbl_users;
  debit public.tbl_hubble_transactions;
  existing public.tbl_hubble_transactions;
  created public.tbl_hubble_transactions;
  points_to_refund integer;
  clean_reference text := trim(coalesce(p_reference_id,''));
  clean_note text := nullif(left(trim(coalesce(p_note,'')),240),'');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id <= 0 then raise exception 'No user with this ID'; end if;
  if length(clean_reference) not between 1 and 180 then raise exception 'Invalid referenceId'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wenitro:hubble:'||clean_reference,0));
  select * into debit from public.tbl_hubble_transactions
   where transaction_type='debit' and reference_id=clean_reference;
  if not found then raise exception 'Original debit not found'; end if;
  if debit.user_id<>p_user_id then raise exception 'referenceId belongs to another user'; end if;
  select * into existing from public.tbl_hubble_transactions
   where transaction_type='reverse' and reference_id=clean_reference;
  if found then
    return jsonb_build_object(
      'transactionId','nitro_txn_'||existing.id,
      'balance',existing.balance_after,
      'referenceId',existing.reference_id,
      'idempotent',true
    );
  end if;
  select * into account from public.tbl_users where id=p_user_id for update;
  if not found or coalesce(account.is_active,1)<>1 or coalesce(account.is_delete,0)<>0
     or account.deactivated_at is not null then raise exception 'No user with this ID'; end if;
  points_to_refund := debit.coins::integer;
  if coalesce(account.points,0) > 2147483647-points_to_refund then
    raise exception 'Balance overflow';
  end if;
  update public.tbl_users set points=coalesce(points,0)+points_to_refund where id=p_user_id
    returning * into account;
  insert into public.tbl_hubble_transactions(
    user_id,reference_id,coins,transaction_type,status,note,balance_after,
    original_transaction_id
  ) values (
    p_user_id,clean_reference,points_to_refund,'reverse','SUCCESS',clean_note,
    account.points,debit.id
  ) returning * into created;
  insert into public.tbl_user_points_history(
    user_id,rating_id,points_earned,verification_method
  ) values (p_user_id,null,points_to_refund,'refund:hubble:'||clean_reference);
  return jsonb_build_object(
    'transactionId','nitro_txn_'||created.id,
    'balance',account.points,
    'referenceId',created.reference_id,
    'idempotent',false
  );
end $$;

revoke all on function public.hubble_token_context(uuid) from public,anon,authenticated;
revoke all on function public.hubble_get_balance(integer) from public,anon,authenticated;
revoke all on function public.hubble_debit(integer,numeric,text,text) from public,anon,authenticated;
revoke all on function public.hubble_reverse(integer,text,text) from public,anon,authenticated;
grant execute on function public.hubble_token_context(uuid) to service_role;
grant execute on function public.hubble_get_balance(integer) to service_role;
grant execute on function public.hubble_debit(integer,numeric,text,text) to service_role;
grant execute on function public.hubble_reverse(integer,text,text) to service_role;

create or replace function public.list_my_nitro_history()
returns jsonb language sql stable security definer set search_path='' as $$
 with me as (select public.get_current_app_user_id() id), all_entries as (
  select h.id::bigint,h.points_earned,h.created_at,h.verification_method,
         r.event_id,e.title,t.note hubble_note
  from public.tbl_user_points_history h join me on me.id=h.user_id
  left join public.tbl_participant_ratings r on r.id=h.rating_id
  left join public.tbl_events e on e.id=r.event_id
  left join public.tbl_hubble_transactions t
    on t.reference_id=case
      when h.verification_method like 'spend:hubble:%' then substring(h.verification_method from 14)
      when h.verification_method like 'refund:hubble:%' then substring(h.verification_method from 15)
      else null end
   and t.transaction_type=case when h.points_earned<0 then 'debit' else 'reverse' end
  union all
  select -r.id::bigint,r.points_awarded,r.created_at,'referral',null::integer,null::text,null::text
  from public.tbl_referral_history r join me on me.id=r.referrer_id where r.points_awarded<>0
 ), entries as (select * from all_entries order by created_at desc,id desc limit 100)
 select jsonb_build_object(
  'balance',(select coalesce(u.points,0) from public.tbl_users u join me on me.id=u.id),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'points',points_earned,'created_at',created_at,'event_id',event_id,
   'description',case
    when verification_method like 'spend:hubble:%' then
      'Hubble redemption'||case when hubble_note is null then '' else ' · '||hubble_note end
    when verification_method like 'refund:hubble:%' then
      'Hubble redemption reversed'||case when hubble_note is null then '' else ' · '||hubble_note end
    when verification_method='referral' then 'Successful referral'
    when verification_method='email' then 'Email verification'
    when verification_method='phone' then 'Phone verification'
    when verification_method='live_photo' then 'Live Photo verification'
    when verification_method='play_store_rating' then 'Play Store rating reward'
    when verification_method like 'spend:%' then 'Nitro Points spent · '||substring(verification_method from 7)
    when title is null then 'Activity participation rating' else 'Rating for '||title end
  ) order by created_at desc,id desc) from entries),'[]'::jsonb))
$$;

-- Extend the existing service-role-only Vault projection. Credentials are
-- inserted into Vault separately and never appear in source control.
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
  ('wenitro_google_places_api_key','GOOGLE_PLACES_API_KEY'),
  ('wenitro_hubble_environment','HUBBLE_ENVIRONMENT'),
  ('wenitro_hubble_client_id','HUBBLE_CLIENT_ID'),
  ('wenitro_hubble_app_secret','HUBBLE_APP_SECRET'),
  ('wenitro_hubble_secret','HUBBLE_SECRET'),
  ('wenitro_hubble_private_key','HUBBLE_PRIVATE_KEY'),
  ('wenitro_hubble_sdk_url','HUBBLE_SDK_URL')
 ) mapped(secret_name,environment_name) on mapped.secret_name=s.name
$$;
revoke all on function public.provider_runtime_secrets() from public,anon,authenticated;
grant execute on function public.provider_runtime_secrets() to service_role;

notify pgrst,'reload schema';
