-- Add the exact 250-Nitro staging target requested for approved client testers.
-- Existing 200/500 targets and all ledger, audit, idempotency, cleanup, and
-- authorization behavior remain unchanged.

alter table public.tbl_hubble_staging_test_credits
  drop constraint if exists tbl_hubble_staging_test_credits_target_balance_check;

alter table public.tbl_hubble_staging_test_credits
  add constraint tbl_hubble_staging_test_credits_target_balance_check
  check (target_balance in (200, 250, 500));

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


revoke all on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid)
  from public, anon;
grant execute on function public.admin_grant_hubble_staging_credit(integer, integer, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
