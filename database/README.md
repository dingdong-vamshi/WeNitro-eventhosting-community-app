# Historical schema reference

`schema.sql` and `seed.sql` preserve an earlier schema design. They are not the deployment source for the current WeNitro production project and must not be replayed over it.

The active integer-keyed schema, policies, RPCs and changes are in `supabase/migrations/`; history and baseline constraints are documented in `supabase/MIGRATION_BASELINE.md`. Current production uses Supabase Auth, Data API/RPCs, Storage and Realtime via `src/services/`. AsyncStorage is client persistence/demo state, not the production database.

Use the root README for local development, batch deployment order and acceptance verification. Production clients use only the publishable key; server secrets never belong in the browser or native bundle.
