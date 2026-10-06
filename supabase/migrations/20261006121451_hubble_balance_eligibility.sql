-- Return the server-authoritative 200-Nitro eligibility decision to Hubble
-- together with the current ledger balance. Hubble documents this optional
-- field on the balance callback, so the provider and WeNitro enforce the same
-- boundary without relying on a frontend-only check.
create or replace function public.hubble_get_balance(p_user_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  account record;
  config private.hubble_redemption_config;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select id, coalesce(points, 0) points
    into account
  from public.tbl_users
  where id=p_user_id
    and coalesce(is_active,1)=1
    and coalesce(is_delete,0)=0
    and deactivated_at is null;
  if not found then raise exception 'No user with this ID'; end if;

  select * into config
  from private.hubble_redemption_config
  where singleton;

  return jsonb_build_object(
    'userId', account.id,
    'totalCoins', account.points,
    'consumptionEligibility', jsonb_strip_nulls(jsonb_build_object(
      'allowed', account.points >= config.eligibility_points,
      'message', case
        when account.points < config.eligibility_points then
          'At least ' || config.eligibility_points || ' Nitro Points are required to redeem'
        else null
      end
    ))
  );
end $$;

revoke all on function public.hubble_get_balance(integer) from public, anon, authenticated;
grant execute on function public.hubble_get_balance(integer) to service_role;
notify pgrst, 'reload schema';
