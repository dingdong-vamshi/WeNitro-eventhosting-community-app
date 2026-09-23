-- Partner profile reads must go through explicit SECURITY DEFINER RPC projections.
-- Direct table reads would expose internal reviewer identifiers added later.
revoke select on table public.tbl_partner_profiles from authenticated;

drop policy if exists partner_profile_owner_read on public.tbl_partner_profiles;
