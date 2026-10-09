-- Permit the existing audited, reversible Hubble QA credit workflow in the
-- production Hubble environment for the single approved 250-Nitro target.
-- Production grants require the explicit production QA audit reason.

alter table public.tbl_hubble_staging_test_credits
  drop constraint if exists tbl_hubble_staging_test_credits_category_check;

alter table public.tbl_hubble_staging_test_credits
  add constraint tbl_hubble_staging_test_credits_category_check
  check (category in ('HUBBLE_STAGING_TEST_CREDIT', 'HUBBLE_PRODUCTION_QA_TEST_CREDIT'));

alter table public.tbl_user_points_history
  drop constraint if exists verification_reward_valid;

alter table public.tbl_user_points_history
  add constraint verification_reward_valid check (
    (verification_method is null and rating_id is not null)
    or (
      verification_method in ('email', 'phone', 'live_photo', 'play_store_rating')
      and rating_id is null and points_earned = 10
    )
    or (verification_method like 'spend:%' and rating_id is null and points_earned < 0)
    or (verification_method like 'refund:%' and rating_id is null and points_earned > 0)
    or (verification_method like 'qa_credit:hubble_staging:%' and rating_id is null and points_earned > 0)
    or (verification_method like 'qa_credit_reversal:hubble_staging:%' and rating_id is null and points_earned < 0)
    or (verification_method like 'qa_credit:hubble_production_qa:%' and rating_id is null and points_earned > 0)
    or (verification_method like 'qa_credit_reversal:hubble_production_qa:%' and rating_id is null and points_earned < 0)
  );

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
  credit_category text;
  history_prefix text;
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 240), '');
begin
  if actor is null or not public.is_wenitro_admin() then
    raise exception 'WeNitro Admin access required' using errcode = '42501';
  end if;
  if p_target_balance not in (200, 250, 500) then
    raise exception 'Target balance must be 200, 250, or 500 Nitro' using errcode = '22023';
  end if;
  if clean_reason is null or length(clean_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  select * into config from private.hubble_redemption_config where singleton;
  if config.environment = 'production' then
    if p_target_balance <> 250 then
      raise exception 'Production Hubble QA credit target must be exactly 250 Nitro' using errcode = '22023';
    end if;
    if clean_reason <> 'HUBBLE_PRODUCTION_QA_TEST_CREDIT' then
      raise exception 'Production Hubble QA credit requires the approved audit reason' using errcode = '22023';
    end if;
    credit_category := 'HUBBLE_PRODUCTION_QA_TEST_CREDIT';
    history_prefix := 'qa_credit:hubble_production_qa:';
  elsif config.environment = 'staging' then
    credit_category := 'HUBBLE_STAGING_TEST_CREDIT';
    history_prefix := 'qa_credit:hubble_staging:';
  else
    raise exception 'Hubble QA credits are unavailable in this environment' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wenitro:hubble-credit:' || p_idempotency_key::text, 0));
  select * into existing
  from public.tbl_hubble_staging_test_credits
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'creditId', existing.id,
      'userId', existing.user_id,
      'category', existing.category,
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
      'category', credit_category,
      'originalBalance', coalesce(account.points, 0),
      'targetBalance', p_target_balance,
      'granted', 0,
      'currentBalance', coalesce(account.points, 0),
      'idempotent', false
    );
  end if;

  insert into public.tbl_hubble_staging_test_credits(
    user_id, category, idempotency_key, original_balance, target_balance,
    granted_amount, remaining_amount, reason, granted_by
  ) values (
    account.id, credit_category, p_idempotency_key, coalesce(account.points, 0), p_target_balance,
    credit_amount, credit_amount, clean_reason, actor
  ) returning * into created;

  update public.tbl_users
  set points = coalesce(points, 0) + credit_amount
  where id = account.id
  returning * into account;

  insert into public.tbl_user_points_history(user_id, rating_id, points_earned, verification_method)
  values (account.id, null, credit_amount, history_prefix || created.id);

  return jsonb_build_object(
    'creditId', created.id,
    'userId', account.id,
    'category', created.category,
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
  history_prefix text;
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 240), '');
begin
  if actor is null or not public.is_wenitro_admin() then
    raise exception 'WeNitro Admin access required' using errcode = '42501';
  end if;
  if clean_reason is null or length(clean_reason) < 5 then
    raise exception 'A reversal reason of at least 5 characters is required' using errcode = '22023';
  end if;
  select * into config from private.hubble_redemption_config where singleton;

  select * into credit
  from public.tbl_hubble_staging_test_credits
  where id = p_credit_id
  for update;
  if not found then raise exception 'Hubble QA credit not found' using errcode = 'P0002'; end if;

  if credit.category = 'HUBBLE_PRODUCTION_QA_TEST_CREDIT' then
    if config.environment <> 'production' then
      raise exception 'Production QA credit cleanup requires the production Hubble environment' using errcode = '42501';
    end if;
    history_prefix := 'qa_credit_reversal:hubble_production_qa:';
  else
    if config.environment <> 'staging' then
      raise exception 'Staging QA credit cleanup requires the staging Hubble environment' using errcode = '42501';
    end if;
    history_prefix := 'qa_credit_reversal:hubble_staging:';
  end if;

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

  insert into public.tbl_user_points_history(user_id, rating_id, points_earned, verification_method)
  values (credit.user_id, null, -reverse_amount, history_prefix || credit.id);

  return jsonb_build_object(
    'creditId', credit.id,
    'userId', credit.user_id,
    'reversed', reverse_amount,
    'currentBalance', account.points,
    'idempotent', false
  );
end $$;

revoke all on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid) from public, anon;
revoke all on function public.admin_reverse_hubble_staging_credit(bigint, text) from public, anon;
grant execute on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid) to authenticated;
grant execute on function public.admin_reverse_hubble_staging_credit(bigint, text) to authenticated;

notify pgrst, 'reload schema';
