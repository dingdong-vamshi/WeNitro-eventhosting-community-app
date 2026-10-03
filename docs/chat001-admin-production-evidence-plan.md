# Admin integrated production acceptance preparation

Prepared only. No production checks are claimed by this plan. Wait for the coordinator's deployment IDs and readiness signal.

## Guarded API execution

`qa-admin-integrated-production.mjs` requires `CHAT001_PRODUCTION_READY=yes`, `QA_APP_DEPLOYMENT_ID`, and `QA_ADMIN_DEPLOYMENT_ID`. Load only the existing target's public environment. `QA_SOURCE_ROOT` locates the ignored `tmp/chat001-qa.json` and `tmp/chat001-server-key`; default is the current checkout. Never print those files.

- `--execute` creates dedicated synthetic host, recipient and Finance identities. It never restricts shared QA members 70, 71 or 116 and never addresses real members. It checks catalog mutation boundaries, historical category preservation, private usage access, observed views/shares, template/reward/coupon persistence, optimistic conflicts, provider draft preservation, immediate one-shot in-app delivery/read receipts, cancellation and a future actual cron delivery. It retains fixtures for UI proof.
- `--observe-scheduled`, after the saved due time, verifies actual persisted `sent_at`, one dedicated member notification and no duplicate on retry. A saved schedule is never marked delivery PASS without this second phase.
- `--cleanup`, after screenshots, archives all documents (cancelling any schedule), archives the category, removes the private unpaid Activity, and deactivates the dedicated identities including Finance-role revocation.

Fixture passwords stay only in ignored `tmp/chat001-admin-integrated-fixtures.json`, mode0600. The committed proof JSON contains fixture IDs and sanitized outcomes, no passwords/tokens. A failure writes FAIL with the completed checks; partial checks never become a blanket PASS.

## Cron technical inspection

Use a read-only Supabase SQL call after deployment:

```sql
select jobid,jobname,schedule,active,command
from cron.job where jobname='wenitro-admin-in-app-campaigns';
```

Require exactly one active job with the intended minute schedule and private dispatcher. After the due time, inspect its actual run outcome and the fixture's stored recipient notification. Do not invoke the dispatcher manually and call that proof of scheduling. Record the job ID, status and timestamps; do not export unrelated jobs or payloads.

Global creation gate mutations are permitted only in one rolled-back database transaction using `chat001-admin-production-rollback-checks.sql`. This uses the dedicated fixture's actual host and ordinary Admin auth IDs. No committed pause can disrupt other tests/users. Local tests already exercise all four gate row types. Check all installed triggers and all four restored enabled values as production technical evidence.

## Deployed UI proof list

Use a dedicated Chrome tab at `https://wenitro-admin-roan.vercel.app`, authenticated as the existing ordinary QA Admin. Do not reuse or modify the root agent's current App tab. Record deployment IDs, URL, account role, viewport, fixture IDs, interaction and screenshot filename in the combined screenshot index.

Suggested unique filenames under `qa-evidence/chat001`:

| Evidence | Interaction and result |
|---|---|
| `production-admin-integrated-dashboard.png` | Actual target dashboard/login, aggregate data and working navigation. |
| `production-admin-integrated-category-dialog.png` | Search only the dedicated category; edit a description/order with reason, save. |
| `production-admin-integrated-category-reloaded.png` | Reload shows persisted category change; archive/restore state and historical Activity reference remain. |
| `production-admin-integrated-search-first.png` / `...search-second.png` | Header search two successive terms while staying on the search route; results follow the changed URL. |
| `production-admin-integrated-header-help.png` / `...header-profile.png` | Actual help and account menu; notification count links to review queue. |
| `production-admin-integrated-analytics.png` | Measured UTC DAU/MAU, observation start and unavailable empty prior cohorts. |
| `production-admin-integrated-event-analytics.png` | Distinct QA Activity views/shares; no host rating substituted as Activity rating. |
| `production-admin-integrated-template-edit.png` / `...template-reloaded.png` | Edit the dedicated template, save and reload; visible error if invalid/stale. |
| `production-admin-integrated-campaign-delivered.png` | Dedicated sent campaign shows actual one delivered/one read; immutable content. |
| `production-admin-integrated-scheduled-delivery.png` | Actual cron campaign becomes sent with its recipient receipt. Cancellation can be checked using the other dedicated campaign. |
| `production-admin-integrated-provider-drafts.png` | Email/push draft persists; no fake delivery action or success. |
| `production-admin-integrated-feature-controls.png` | Four real creation gates and required audit reason; no UI global pause. |
| `production-admin-integrated-reward-drafts.png` / `...nitro-rules.png` / `...leaderboard.png` | Persistent proposals, approved Nitro economics and actual period ledger ranks. |
| `production-admin-integrated-investigation.png` / `...partner-activities.png` | Second-wave real report investigation and Partner-hosted activities, with actual links. |
| `production-admin-integrated-settings.png` | Accurate release-owned settings/language/provider limits, no fake saves. |

Category names beginning `[QA]` intentionally do not appear in App selectors. Use the ordinary existing catalog entries for App selector propagation, and pair that with the category API and shared catalog contract proof; do not claim a filtered QA category was visibly offered to members.

Capture screenshot pairs for changes that a single static image cannot prove. Anonymous attribution, Master grants/revocation and prior moderation/reports proof remain separate existing source requirements; reuse only where current implementation is unchanged and the coordinator accepts the evidence scope. Do not run the old shared-user restriction read-model script while other UI QA is active.
