-- Auditable, reversible Nitro credits used only for Hubble staging acceptance.
-- The grant RPC adds only the amount needed to reach the requested target.
-- Hubble debits consume tagged staging credit first so an administrator can
-- later reverse the unused portion without touching legitimately earned Nitro.

create table public.tbl_hubble_staging_test_credits (
  id bigint generated always as identity primary key,
  user_id integer not null references public.tbl_users(id) on delete cascade,
  category text not null default 'HUBBLE_STAGING_TEST_CREDIT'
    check (category = 'HUBBLE_STAGING_TEST_CREDIT'),
  idempotency_key uuid not null unique,
  original_balance integer not null check (original_balance >= 0),
  target_balance integer not null check (target_balance in (200, 500)),
  granted_amount integer not null check (granted_amount > 0),
  remaining_amount integer not null check (remaining_amount between 0 and granted_amount),
  reason text not null check (length(trim(reason)) between 5 and 240),
  status text not null default 'active'
    check (status in ('active', 'partially_used', 'consumed', 'reversed')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or length(trim(reversal_reason)) between 5 and 240)
);

create index tbl_hubble_staging_credits_user_status_idx
  on public.tbl_hubble_staging_test_credits(user_id, status, granted_at, id);

create table public.tbl_hubble_staging_credit_usage (
  id bigint generated always as identity primary key,
  credit_id bigint not null references public.tbl_hubble_staging_test_credits(id) on delete restrict,
  debit_transaction_id integer not null references public.tbl_hubble_transactions(id) on delete restrict,
  amount integer not null check (amount > 0),
  reversed_amount integer not null default 0 check (reversed_amount between 0 and amount),
  created_at timestamptz not null default now(),
  unique (credit_id, debit_transaction_id)
);

create index tbl_hubble_staging_credit_usage_debit_idx
  on public.tbl_hubble_staging_credit_usage(debit_transaction_id);

alter table public.tbl_hubble_staging_test_credits enable row level security;
alter table public.tbl_hubble_staging_credit_usage enable row level security;

create policy hubble_staging_credit_admin_read
  on public.tbl_hubble_staging_test_credits for select to authenticated
  using ((select public.is_wenitro_admin()));
create policy hubble_staging_credit_usage_admin_read
  on public.tbl_hubble_staging_credit_usage for select to authenticated
  using ((select public.is_wenitro_admin()));

revoke all on public.tbl_hubble_staging_test_credits from public, anon, authenticated;
revoke all on public.tbl_hubble_staging_credit_usage from public, anon, authenticated;
grant select on public.tbl_hubble_staging_test_credits to authenticated;
grant select on public.tbl_hubble_staging_credit_usage to authenticated;
grant all on public.tbl_hubble_staging_test_credits to service_role;
grant all on public.tbl_hubble_staging_credit_usage to service_role;

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
    or (
      verification_method like 'qa_credit:hubble_staging:%'
      and rating_id is null and points_earned > 0
    )
    or (
      verification_method like 'qa_credit_reversal:hubble_staging:%'
      and rating_id is null and points_earned < 0
    )
  );

create or replace function private.track_hubble_staging_credit_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  allocation record;
  amount_left integer;
  amount_to_use integer;
begin
  if new.status <> 'SUCCESS' then return new; end if;

  if new.transaction_type = 'debit' then
    amount_left := new.coins::integer;
    for allocation in
      select id, remaining_amount
      from public.tbl_hubble_staging_test_credits
      where user_id = new.user_id
        and remaining_amount > 0
        and status in ('active', 'partially_used')
      order by granted_at, id
      for update
    loop
      exit when amount_left = 0;
      amount_to_use := least(amount_left, allocation.remaining_amount);
      insert into public.tbl_hubble_staging_credit_usage(
        credit_id, debit_transaction_id, amount
      ) values (allocation.id, new.id, amount_to_use);
      update public.tbl_hubble_staging_test_credits
      set remaining_amount = remaining_amount - amount_to_use,
          status = case
            when remaining_amount - amount_to_use = 0 then 'consumed'
            else 'partially_used'
          end
      where id = allocation.id;
      amount_left := amount_left - amount_to_use;
    end loop;
  elsif new.transaction_type = 'reverse' and new.original_transaction_id is not null then
    for allocation in
      select u.id usage_id, u.credit_id, u.amount, u.reversed_amount
      from public.tbl_hubble_staging_credit_usage u
      where u.debit_transaction_id = new.original_transaction_id
        and u.reversed_amount < u.amount
      order by u.id
      for update
    loop
      amount_to_use := allocation.amount - allocation.reversed_amount;
      update public.tbl_hubble_staging_test_credits
      set remaining_amount = least(granted_amount, remaining_amount + amount_to_use),
          status = case
            when least(granted_amount, remaining_amount + amount_to_use) = granted_amount then 'active'
            else 'partially_used'
          end
      where id = allocation.credit_id;
      update public.tbl_hubble_staging_credit_usage
      set reversed_amount = amount
      where id = allocation.usage_id;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists track_hubble_staging_credit_usage on public.tbl_hubble_transactions;
create trigger track_hubble_staging_credit_usage
after insert on public.tbl_hubble_transactions
for each row execute function private.track_hubble_staging_credit_usage();

create or replace function public.admin_grant_hubble_staging_credit(
  p_user_id integer,
  p_target_balance integer,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  config private.hubble_redemption_config;
  account public.tbl_users;
  existing public.tbl_hubble_staging_test_credits;
  created public.tbl_hubble_staging_test_credits;
  credit_amount integer;
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 240), '');
begin
  if actor is null or not public.is_wenitro_admin() then
    raise exception 'WeNitro Admin access required' using errcode = '42501';
  end if;
  if p_target_balance not in (200, 500) then
    raise exception 'Target balance must be 200 or 500 Nitro' using errcode = '22023';
  end if;
  if clean_reason is null or length(clean_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  select * into config from private.hubble_redemption_config where singleton;
  if config.environment <> 'staging' then
    raise exception 'Hubble test credits are disabled outside staging' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wenitro:hubble-credit:' || p_idempotency_key::text, 0));
  select * into existing
  from public.tbl_hubble_staging_test_credits
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'creditId', existing.id,
      'userId', existing.user_id,
      'originalBalance', existing.original_balance,
      'targetBalance', existing.target_balance,
      'granted', existing.granted_amount,
      'currentBalance', (select coalesce(points, 0) from public.tbl_users where id = existing.user_id),
      'idempotent', true
    );
  end if;

  select * into account
  from public.tbl_users
  where id = p_user_id
    and coalesce(is_active, 1) = 1
    and coalesce(is_delete, 0) = 0
    and deactivated_at is null
  for update;
  if not found then raise exception 'Active WeNitro user not found' using errcode = 'P0002'; end if;

  credit_amount := greatest(p_target_balance - coalesce(account.points, 0), 0);
  if credit_amount = 0 then
    return jsonb_build_object(
      'creditId', null,
      'userId', account.id,
      'originalBalance', coalesce(account.points, 0),
      'targetBalance', p_target_balance,
      'granted', 0,
      'currentBalance', coalesce(account.points, 0),
      'idempotent', false
    );
  end if;

  insert into public.tbl_hubble_staging_test_credits(
    user_id, idempotency_key, original_balance, target_balance,
    granted_amount, remaining_amount, reason, granted_by
  ) values (
    account.id, p_idempotency_key, coalesce(account.points, 0), p_target_balance,
    credit_amount, credit_amount, clean_reason, actor
  ) returning * into created;

  update public.tbl_users
  set points = coalesce(points, 0) + credit_amount
  where id = account.id
  returning * into account;

  insert into public.tbl_user_points_history(
    user_id, rating_id, points_earned, verification_method
  ) values (
    account.id, null, credit_amount, 'qa_credit:hubble_staging:' || created.id
  );

  return jsonb_build_object(
    'creditId', created.id,
    'userId', account.id,
    'originalBalance', created.original_balance,
    'targetBalance', created.target_balance,
    'granted', created.granted_amount,
    'currentBalance', account.points,
    'idempotent', false
  );
end $$;

create or replace function public.admin_reverse_hubble_staging_credit(
  p_credit_id bigint,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  config private.hubble_redemption_config;
  credit public.tbl_hubble_staging_test_credits;
  account public.tbl_users;
  reverse_amount integer;
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 240), '');
begin
  if actor is null or not public.is_wenitro_admin() then
    raise exception 'WeNitro Admin access required' using errcode = '42501';
  end if;
  if clean_reason is null or length(clean_reason) < 5 then
    raise exception 'A reversal reason of at least 5 characters is required' using errcode = '22023';
  end if;
  select * into config from private.hubble_redemption_config where singleton;
  if config.environment <> 'staging' then
    raise exception 'Hubble test credits are disabled outside staging' using errcode = '42501';
  end if;

  select * into credit
  from public.tbl_hubble_staging_test_credits
  where id = p_credit_id
  for update;
  if not found then raise exception 'Staging credit not found' using errcode = 'P0002'; end if;

  reverse_amount := credit.remaining_amount;
  if reverse_amount = 0 then
    return jsonb_build_object(
      'creditId', credit.id, 'userId', credit.user_id, 'reversed', 0,
      'currentBalance', (select coalesce(points, 0) from public.tbl_users where id = credit.user_id),
      'idempotent', true
    );
  end if;

  select * into account from public.tbl_users where id = credit.user_id for update;
  if coalesce(account.points, 0) < reverse_amount then
    raise exception 'Current balance is lower than the unused test credit; review the ledger before cleanup';
  end if;

  update public.tbl_users
  set points = coalesce(points, 0) - reverse_amount
  where id = credit.user_id
  returning * into account;

  update public.tbl_hubble_staging_test_credits
  set remaining_amount = 0,
      status = 'reversed',
      reversed_by = actor,
      reversed_at = now(),
      reversal_reason = clean_reason
  where id = credit.id;

  insert into public.tbl_user_points_history(
    user_id, rating_id, points_earned, verification_method
  ) values (
    credit.user_id, null, -reverse_amount,
    'qa_credit_reversal:hubble_staging:' || credit.id
  );

  return jsonb_build_object(
    'creditId', credit.id,
    'userId', credit.user_id,
    'reversed', reverse_amount,
    'currentBalance', account.points,
    'idempotent', false
  );
end $$;

create or replace function public.admin_list_hubble_staging_credits(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_wenitro_admin() then
    raise exception 'WeNitro Admin access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'userId', p_user_id,
    'currentBalance', (select coalesce(points, 0) from public.tbl_users where id = p_user_id),
    'credits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'category', c.category,
        'originalBalance', c.original_balance,
        'targetBalance', c.target_balance,
        'grantedAmount', c.granted_amount,
        'remainingAmount', c.remaining_amount,
        'reason', c.reason,
        'status', c.status,
        'grantedBy', c.granted_by,
        'grantedAt', c.granted_at,
        'reversedBy', c.reversed_by,
        'reversedAt', c.reversed_at,
        'reversalReason', c.reversal_reason
      ) order by c.granted_at desc, c.id desc)
      from public.tbl_hubble_staging_test_credits c
      where c.user_id = p_user_id
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid)
  from public, anon;
revoke all on function public.admin_reverse_hubble_staging_credit(bigint, text)
  from public, anon;
revoke all on function public.admin_list_hubble_staging_credits(integer)
  from public, anon;
grant execute on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid)
  to authenticated;
grant execute on function public.admin_reverse_hubble_staging_credit(bigint, text)
  to authenticated;
grant execute on function public.admin_list_hubble_staging_credits(integer)
  to authenticated;

create or replace function public.list_my_nitro_history()
returns jsonb language sql stable security definer set search_path = '' as $$
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
    when verification_method like 'qa_credit:hubble_staging:%' then 'Hubble staging test credit'
    when verification_method like 'qa_credit_reversal:hubble_staging:%' then 'Unused Hubble staging test credit reversed'
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
  ) order by created_at desc,id desc) from entries),'[]'::jsonb)
 )
$$;

notify pgrst, 'reload schema';
