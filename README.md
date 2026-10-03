# WeNitro

Expo SDK 57 / React Native 0.86 / React 19.2 app for Activities, Communities, Vibes, Chat and profiles. The production application uses Supabase Auth, PostgreSQL RPCs/RLS, Storage and Realtime. AsyncStorage supports client persistence and the explicit demo; it is not the production database.

## Existing production projects

- App: https://wenitro-app.vercel.app
- Admin: https://wenitro-admin-roan.vercel.app (separate `wenitro-admin-` repository)
- Supabase: `cxsznhrkzqndhseodcyy`

Use these existing projects. The old source project is archival; do not point current deployments or QA at it. See [migration history](supabase/MIGRATION_BASELINE.md).

## Local development

Use Node 22.13 or later supported by SDK57, install from the lockfile with `npm ci`, and copy `.env.example` to ignored `.env.local`. Populate the target URL and publishable key from approved project configuration. Never put a service key, database password, Google client secret or Cashfree secret in any `EXPO_PUBLIC_` variable.

```bash
npm run web
npm run ios
npm run android
npm run typecheck
npm run vercel-build
```

Read the exact [Expo57 documentation](https://docs.expo.dev/versions/v57.0.0/) before changing Expo APIs. Native Google sign-in requires a configured development/release build; a web export does not prove native camera, date-picker, background SOS or share-sheet behavior.

## Implementation map

- `App.tsx`: application navigation/state and remaining shared screens; extracted UI is in `src/components/`.
- `src/services/*-production.ts`: authenticated service adapters. Related services handle payments, referrals, invites, signed URLs and Realtime.
- `src/lib/supabase.ts`: publishable client configuration. Production authorization belongs in database/Edge code, not conditional rendering.
- `supabase/migrations/`: current integer-keyed production schema and versioned RPC/RLS changes. `database/schema.sql` and `api/openapi.yaml` are historical designs, not deployment instructions for the current backend.
- `supabase/functions/`: SMS hook, Cashfree order/verification/webhook, Vibe sharing and anonymous Community media proxy.
- `scripts/*-test.mjs`: local behavioral and source-contract regression tests. PostgreSQL behavior tests create and remove disposable local clusters; install PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) on PATH.
- `scripts/qa-*.mjs`: authenticated current-target integration QA. Read each fixture/cleanup contract first; some mutate isolated test records. Do not execute them as an indiscriminate batch against production.

## Important domain boundaries

Ordinary non-Partner Paid Activities record off-platform costs and never collect a platform price. Approved Partner Activities use server-authoritative categories, prices and registration details; only verified Cashfree payment admits paid participants. Sandbox payment evidence must never be treated as real-money settlement or payout proof.

Original Hosts retain creator identity after Co-host promotion. Co-host removal must remove backend permissions. Ended Activities reject prohibited edits, leaving and participant removal. Community Posts and Chat have different media rules: new Chat video is prohibited, while Vibes and Community Posts support video.

Anonymous Community posts/ratings hide member-visible author identity while preserving authorized Admin audit. Anonymous media uses opaque expiring capabilities; do not expose uploader-identifying Storage paths to recipients. Role authority comes from server-controlled current Auth data. Client metadata and cached JWT role claims cannot be the sole authority for sensitive operations.

The supplied 22-badge document is authoritative. Qualifying-action exclusions and idempotency must be tested independently of the UI. Verification changes Trust, not Nitro; two Nitro per legitimate participant rating and ten per valid referral remain separate ledger rules. Do not fabricate historical rewards or analytics to fill empty states.

## Batch release and acceptance

Finish all local changes across both repositories before release. Integrate isolated agent commits, resolve overlapping contracts and run:

```bash
node scripts/run-local-acceptance-suite.mjs /absolute/path/to/wenitro-admin-
```

The runner records each local test, typecheck, Expo Doctor result, App export, Admin lint and Admin build in `docs/chat001-integrated-local-verification.json`, with logs under ignored `tmp/chat001-integrated-local/`. It does not deploy or run live QA. Source-contract tests are not substitutes for real behavior or screenshots.

After the complete integrated local gate passes: commit/push the reviewed state, apply required migrations/RPCs/RLS, deploy dependent Edge Functions, then deploy the existing App and Admin projects. Never deploy an individual audit branch ahead of its backend. Compare the remote migration ledger before applying changes; some historical remote version/name pairs differ from local filenames.

Then follow [production QA](docs/chat001-production-qa-plan.md) against the exact deployed versions. Regressions require local fix/test, integration, redeployment and production retest. Use scoped synthetic QA records; restore temporary roles, restrictions, pins, categories and photos. Never run a production reset, real-money payout/refund or unrestricted QA broadcast.

## Evidence and current status

The current working ledger is [acceptance reconciliation](docs/acceptance-reconciliation-2026-10-02.json). [Requirement evidence index](docs/chat001-requirement-evidence-index.json) tracks source clauses and all 22 badges. Older reports may contain superseded interpretations (notably “No Next Button” means restore the missing Next button), expired fixture references or pre-repair failures; they are historical evidence, not the final verdict.

A successful build/deployment is not final acceptance. Each visual requirement needs actual deployed screenshot proof; security, permissions, payment and idempotency need authenticated API/SQL evidence. Record genuine provider/native/client-identity dependencies separately from fixable bugs. The dependency review also records upstream toolchain advisories without claiming a zero-vulnerability audit.
