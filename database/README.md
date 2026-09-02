# WeNitro PostgreSQL setup

The SQL files are ordered and idempotent for a fresh Supabase/PostgreSQL database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed.sql
```

`schema.sql` creates the profile, activity, participation, comment, vibe, community, interest, badge, like, save, and follow models used by the UI. Every public table has RLS enabled. Data API grants are explicit so the schema remains compatible with Supabase projects where new public tables are not exposed automatically.

The Expo demo currently persists its interactive state with AsyncStorage. When a Supabase project is provisioned, the frontend should use a publishable key and the Data API; never ship a database password or service-role key in the React Native client.
