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
