# WeNitro migration baseline

Canonical production project: `klyjzbisgycegkkacbjw`.

The live legacy integer-keyed schema was verified before reconciliation. The five bridge stages had originally been executed transactionally outside the migration ledger. Supported Supabase migration API calls then recorded five no-op baseline entries, and the local SQL files were renamed to the exact returned remote versions:

- `20260902140608_wenitro_legacy_supabase_bridge_baseline.sql`
- `20260902140610_activity_rpc_bridge_baseline.sql`
- `20260902140612_social_rpc_bridge_baseline.sql`
- `20260902140614_fix_event_rls_recursion_baseline.sql`
- `20260902140616_completion_bridge_baseline.sql`

The local files retain the complete schema SQL for fresh environments. Production will not replay them because their versions are now present in `supabase_migrations.schema_migrations`.

Eleven incompatible UUID-era migrations are preserved under `supabase/migrations_archive/incompatible_uuid/` and are no longer in the active chain.

Never move those archived migrations back into the active directory or run a linked reset against production. Before a future push, confirm the project ref and inspect `supabase migration list`. The local CLI account used during this reconciliation lacked project-management privileges, so the remote ledger was verified through the Supabase migration API instead.

## Reconciled follow-up migrations

The production migration ledger assigned the following canonical versions to four follow-up changes that were originally authored with later planned timestamps:

- `20260902172441_activity_contract_and_media_authorization.sql`
- `20260902172729_explicit_onboarding_state.sql`
- `20260902172918_onboarding_column_read_grant.sql`
- `20260902173417_profile_and_community_privacy.sql`

The local filenames now match those existing production ledger entries exactly. This reconciliation does not replay SQL or alter production schema objects.

## Remote activation ledger

The phone-auth, Cashfree sandbox, verified-user, internal-share, and participant-status changes below were applied to canonical project `klyjzbisgycegkkacbjw` through the connected Supabase plugin. Local migration versions use the versions assigned by the production ledger:

- `20260903171713_phone_auth_server_slice.sql`
- `20260903171725_cashfree_activity_payments.sql`
- `20260904062444_real_user_flow_activation.sql`
- `20260904063640_restrict_internal_share_rpc.sql`
- `20260904063834_fix_internal_share_client_id_variable.sql`
- `20260904064217_secure_discoverable_people_directory.sql`
- `20260904064255_reload_real_user_flow_schema_cache.sql`
- `20260904085443_allow_cashfree_payment_required_participant_status.sql`

The three focused internal-share hardening entries and schema-cache reload are represented as ledger markers because their final definitions are consolidated in `20260904062444_real_user_flow_activation.sql` for fresh environments.
