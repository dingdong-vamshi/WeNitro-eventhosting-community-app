-- The generic account-status policy is intentionally broad and is suitable
-- only as an additional guard on tables that already have narrow row
-- predicates.  On these privacy-sensitive tables it could otherwise become
-- an authorization policy by itself because PostgreSQL ORs permissive RLS
-- policies.  Keep only the target-specific policies and SECURITY DEFINER RPCs.
drop policy if exists admin_suspension_guard on public.tbl_user_reports;
drop policy if exists admin_suspension_guard on public.tbl_user_verification;

-- Reports are created and reviewed only through the validated RPCs.  Members
-- may read their own submitted reports; Admin reads are covered by the
-- existing wenitro_admin_all policy.
revoke insert, update, delete on table public.tbl_user_reports from authenticated;

-- Verification projection is server-authoritative.  Authenticated clients
-- can read their own state, while verified mutations are performed by the
-- verification RPCs and Admin review RPC.
revoke insert, update, delete on table public.tbl_user_verification from authenticated;
