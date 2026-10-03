# Chat 001 Admin local completion handoff

This slice covers the source PDF requirement that existing Admin dashboard functionality works, shared category controls, and observed analytics. All changes are local. No migration, live data mutation, deployment, external campaign, or notification was sent during this slice.

## Implemented

- Shared category CRUD, order, disable/archive/restore and audited reasons remain server enforced. Existing disabled or archived categories survive ordinary Activity edits. Legacy interest-catalog RPC now returns available categories and saved icons only.
- Header search responds to successive URL queries. Core member, Activity, participant, report, category and workspace document readers paginate beyond PostgREST's default 1,000-row limit. Dashboard uncapped Activities no longer display a zero-person limit.
- Analytics use actual UTC signed-in observations for DAU/MAU, returning cohorts, daily member/platform observations, Activity views and Activity shares. Empty prior cohorts remain unavailable. Squad visibility works. A share does not manufacture a view or an `other` platform observation. Activity shares do not reuse Vibe share counts. Only approved/confirmed/going/paid participants count. Activity numerical ratings and conversion attribution are accurately unavailable; host ratings are not substituted. Registration and Activity creation buckets are interval counts.
- Profile verification selects the latest record rather than failing on multiple verification methods. Followers and last-active timestamps are not fabricated. Geography distinguishes declared nationality from saved Activity display locations.
- Private persisted notification/email templates, push/email campaign drafts, reward/coupon proposals: create, search, edit, archive, restore and conflict checks. Sent campaign content is immutable. Drafts survive validation/provider errors. Every mutation records a reason in the existing audit.
- Actual in-app notification campaigns use explicit member IDs (1–500), all-or-nothing delivery, current recipient eligibility, stored delivery/read counts and idempotent replay. Scheduled delivery, cancellation and visible failures use a bounded dispatcher with row locks and SKIP LOCKED. Editing content or archiving cancels a prior schedule. A revoked/deactivated/banned approving Admin cannot deliver a queued campaign.
- Four database-enforced creation gates pause/resume Activities, Communities, Vibes and Stories. Direct API inserts honor them; direct chat creation is unaffected by the Community gate.
- Nitro rules remain the approved contract; no invented earning economics. Leaderboard periods derive from actual positive award and referral ledgers, not balances; restricted accounts are excluded. Fake leaderboard reset removed. Reward and coupon proposals cannot activate monetary redemptions.
- Release-owned brand/currency/current English language are accurately displayed, without fake saves that never affect the client. README describes actual access, delivery, analytics and provider boundaries.

## Focused verification

- `scripts/admin-category-catalog-test.mjs`: 24 real disposable PostgreSQL checks, including unchanged historical category edits.
- `scripts/admin-observed-usage-test.mjs`: 21 real disposable PostgreSQL checks, including UTC distinct counts, inaccessible/deleted/Squad visibility, share idempotence and no manufactured platform, null cohorts and exact 50% returning cohort.
- `scripts/admin-workspace-operations-test.mjs`: 44 real disposable PostgreSQL checks, including roles, optimistic versions including null rejection, atomic/replayed delivery, provider draft preservation, all four creation gates, schedule/cancel/due dispatch and revoked approver. The portable local test excludes only pg_cron extension installation and the cron.schedule registration statement; it exercises the actual dispatcher.
- `scripts/admin-read-models-test.mjs`: 25 checks against transpiled actual Admin adapters, including 1,002-member pagination, real usage values, no invented ratings/timestamps/followers, approved-only counts, Activity/Vibe share separation, UTC daily chart bucketing and period leaderboard ledgers.
- Admin TypeScript and ESLint clean. Next production webpack build passed. Default Turbopack build in this isolated worktree rejects the shared node_modules symlink outside its root; the integrated primary checkout must run its normal production build.
- Root runner should set `QA_ADMIN_ROOT` to the integrated Admin checkout. Otherwise the adapter test defaults to the sibling `../wenitro-admin-` checkout. No worktree path is embedded in the tests.

## Integration/deployment dependencies

Apply local migrations in filename order: `20261003074100_admin_category_catalog.sql`, `20261003074522_observed_usage_analytics.sql`, `20261003075439_admin_workspace_operations.sql`, `20261003080410_scheduled_admin_campaigns.sql`, interleaved with the other agent migrations by timestamp. The final one enables available Supabase pg_cron 1.6.4 and registers one named job `wenitro-admin-in-app-campaigns` every minute. No extension was enabled live in this slice. Backend precedes App and Admin deployment. The App agent already implemented `record_activity_share` calls after successful shares.

## Production acceptance still required

The root must run the integrated full suite and production pass. Capture category persistence/reopen and historical edit; new search URL; analytics definitions; workspace draft save/reload/archive; explicit QA-only in-app send and replay; QA-only scheduled send/cancel/failure; feature states; Nitro leaderboard periods; and provider-disabled draft state. Do not broadcast to real users. Test global feature disable/restore only inside a rolled-back database transaction. Verify exactly one named cron job, its active status and successful actual scheduled QA delivery. Verify role-denied RPCs with member/Finance sessions.

## Exact boundaries

- Email campaign delivery lacks the configured external sender/provider, and device push delivery lacks a configured delivery provider; drafts persist but cannot claim send success. The Supabase custom SMTP and provider setup is not changed here.
- Hubble redemption provider and approved reward/coupon economic contract are required before activation. No balances, coupons or monetary liabilities are invented.
- Additional UI languages need approved translation bundles and a client release. Adding a language row alone would not translate the app.
- Numeric Activity ratings and conversion attribution are not collected in the current product; UI reports this, instead of substituting host ratings or zero.
- IP monitoring was checked directly: auth.audit_log_entries has the ip_address column but **0 audit rows, 0 nonempty IPs, and 0 login-action rows**. Timestamp and exact target are in `docs/chat001-admin-auth-audit-availability.json`; no raw IP or PII was read. No enforceable IP blocking is configured.
- Moderation investigation/manual media review and Partner-hosted Activity pages are the separate second-wave Admin slice owned by app_pdf_regression (commit 29068b2); merge it as well.
