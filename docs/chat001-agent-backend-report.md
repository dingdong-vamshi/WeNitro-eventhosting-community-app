# Chat 001 backend, badges, Trust, Partner and payments

Status: local implementation complete for this workstream; integration and fresh deployed acceptance are still required. No production mutations, pushes, deployments, real charges or payouts were performed by this agent. Worktree: `chat001-backend-audit/wenitro-phone-app-`, branch `codex/chat001-backend-audit`, baseline `a47519f`.

## Fixes made in this workstream

| Requested change | Previous defect | Local implementation | Evidence / remaining production check |
|---|---|---|---|
| Ended activities cannot change; secure Cashfree categories | Both preparation overloads omitted the ended-state check; old single-argument RPC bypassed category selection/price/capacity; category edits allowed after ending | Migration `20261003075132_payment_entry_authorization.sql` reuses the locked ended-state guard and routes old checkout calls through the category-aware function | `payment-entry-authorization-test.mjs`: 33 executable PostgreSQL checks; deployed checkout/category acceptance pending |
| Private activity/payment privacy | Category listing returned private activity tier prices to any signed-in user knowing its ID | Listing uses authenticated activity visibility / management permission | Outsider denied, invited member and owner allowed in PostgreSQL tests |
| Paid means verified provider payment and a valid seat | A late successful payment could join an ended activity, a now-unavailable Partner/buyer, or fill a category whose expired reservation had been reused | Finalizer records payment truth, withholds joining and queues `REFUND_REQUIRED`; actual refunds remain provider/operator work | Late-ended, category-full, banned-buyer, ordinary success, replay and service-only execution tests; no provider calls |
| Cashfree requires verified phone | Edge checked only a nonempty phone after creating the reservation | Auth-confirmed phone checked before preparation and at SQL boundary; safe integer minor-unit check rejects overflow | Three Deno tests for phone, amount/PII allowlist and HMAC; Cashfree create/verify/webhook typechecked |
| Suspension/deactivation and stale sessions | Missing Auth record was treated as unbanned; five direct Auth-based privileged entrypoints bypassed live account status; stories used current user only to decorate `viewed`, not constrain access | Migration `20261003075305_account_status_rpc_enforcement.sql` denies removed Auth accounts, inactive/deleted/deactivated profiles and active bans. Guards bootstrap, username check, onboarding completion, live photo, verification sync and story feed | `account-status-rpc-test.mjs`: 54 checks using actual captured RPC definitions, direct table/Storage RLS, expired bans and valid new-user bootstrap |
| Referral abuse prevention and ten Nitro | Badge metrics rejected alias farms but Nitro redemption still rewarded Gmail aliases repeatedly; referral credits missing from Nitro history | Migration `20261003075444_referral_identity_reward_guard.sql` verifies identity, denies self/alias/duplicate-phone awards, serializes claims and includes existing referral ledger in history. Ten Nitro unchanged; no historical balance rewrite | `referral-reward-identity-test.mjs`: 19 checks including repeated/cross-inviter redemption, own history only and negative spend coexistence |
| Profile edits must save atomically | Client deleted removed interests before a stale disabled addition could fail, losing unsaved selections | Existing complete-set RPC hardened with per-profile serialization and catalog icons in migration `20261003075804_atomic_profile_interests.sql`. App agent owns switching client to this RPC | `profile-interest-atomic-test.mjs`: 13 checks proving rollback, archived selection preservation, newly disabled rejection, ownership, dedupe and clear-all |

Four new migrations depend on the existing production schema; `75804` also depends on Admin catalog `74100` adding icon fields. Deploy all integrated migrations in timestamp order. Edge deployment must include `cashfree-create-order`, `cashfree-verify-payment`, and `cashfree-webhook` because all import the changed shared Cashfree module. No media/SMS Edge code changed.

## Badges and Trust coverage

The actual supplied `WeNitro Badges.docx` XML was reread. All 22 definitions match the implemented centralized engine:

- Explorer: joined 1 / 5 / 10 / 25.
- Host: completed hosted activities 1 / 5 / 10 / 25.
- Community: joined 1, qualifying posts 5 / 10, joined 5.
- Connector: valid referrals 1 / 5 / 10.
- Milestones: completed participations 1 / 10 / 25 / 50.
- Partner: approved Partner, 5 completed paid activities, 100 qualifying participants. Popular Partner includes qualifying free activities; Active Partner specifically requires paid activities.

`badge-engine-test.mjs` passed all 22 rules and 82 threshold boundaries, duplicate/cancelled/removed/failed-payment/suspended-user exclusions, deleted/spam posts, self/referral-alias farming, persisted earned-at/snapshot idempotency and private profile protection. `admin-operational-controls-test.mjs` separately proves current Auth suspension exclusion. Existing production 22 detail-sheet screenshots are historical acceptance evidence; they were not recaptured here.

New `trust-score-database-test.mjs` passed 23 actual SQL checks: email 10, phone 10, approved selfie 10, approved Aadhaar 20, social 10, rating >=4 adds 10 and drops when rating falls; 10 activities adds 20, 20 adds 30 without stacking; max100; duplicates/cancelled/removed events excluded. Verification is derived from Auth/approved rows and adds zero Nitro. Public score responses omit private verification details. Actual deployed owner/public score screenshots remain part of root's final acceptance pass.

## Local verification

- New executable PostgreSQL suites: payment33 + account54 + referral19 + interests13 + Trust23 = **142 checks**.
- Existing real PostgreSQL suites passed: badges, Admin operational controls29, backend acceptance, anonymous media, immutable checkout terms (including 24 forbidden term/status combinations).
- 24 of 27 selected existing Node regression scripts passed. Three baseline tests (`phase4-privacy`, `phase5-profile`, `auth-identity-reuse`) failed because mocks rejected the new `category-catalog` import; the App agent owns and is repairing those tests. They must pass in the integrated run before deployment.
- Other passing scripts: payment modes/prices, required registration questions21, Partner auth/eco-system/V1/submission, Cashfree modal/webhook target, community permissions, profile social, Auth bootstrap, readiness, Storage signing, anonymous media service, chat realtime/inbox, client-PDF and Supabase repair regression.
- Deno: media2, SMS8 (using its own `deno.json`), Cashfree3 tests passed. All three Cashfree Edge entrypoints typechecked.
- App TypeScript passed in this isolated baseline plus backend changes. Full integrated App/Admin builds/Expo Doctor remain root integration work.
- SQL fixtures contain schema/function code only. Tests start disposable socket-only PostgreSQL databases and delete only their own temporary directories.

## Security review and production read-only evidence

`docs/chat001-security-rpc-inventory.json` records the exact target and every one of the 137 authenticated public SECURITY DEFINER signatures/call references. This call graph is an inspection aid, not automatic proof of authorization. The review found the concrete gaps repaired above.

Read-only production inspection confirmed **0 public tables without RLS, 0 public views lacking security_invoker, 0 anon-callable SECURITY DEFINER functions**. Current security advisor snapshot remains **137 authenticated-definer WARNs, 1 leaked-password-protection WARN, 3 INFO private RLS tables with no policies**. The three private audit/disqualification tables intentionally deny direct client access. Do not label advisors clean. Rerun after deployment, since counts will change with invoker wrappers/new private tables.

- Definer advice: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Private table advice: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Admin/Finance boundaries use current `auth.users.raw_app_meta_data` through `current_admin_role`, not editable user metadata or stale JWT role claims. Payment provider finalization stays unavailable to anon/authenticated. The obsolete Partner save endpoint always throws instead of mutating payout details. Public badge/category catalogs contain nonsensitive catalog data. Existing anonymous media capability TTL, deletion revocation, member minting and path redaction remain unchanged and passed their local tests; the previous live fixture post36 was deleted, so its old mutation script was deliberately not rerun.

Supabase changelog/docs and Expo57 versioned docs were checked. The September Postgres breaking-change review found no ltree columns/custom non-extension operator estimators on target; no schema change was made for that notice.

## Cross-review / integration notes

Admin catalog migration preserves unchanged archived event categories during edits and makes legacy interest listing active-only. I asked Admin agent to fix two measured-usage issues: valid Squad viewers were omitted by the manual visibility predicate, and recording a share manufactured an `other` platform observation. Admin private document/campaign/gate authorization, reason audit and optimistic version checks looked consistent on review; final integrated tests are still required.

Do not temporarily suspend shared QA70/71/116 while other production QA agents use them. New stale-token tests should create isolated synthetic identities and clean them up. Existing `qa-admin-read-models.mjs` temporarily restricts QA70, so run it serially or refactor its subject first.

Fresh deployed proof still required for these fixes: isolated stale-token RPC/Storage/story denial; private tier/legacy checkout/ended checks; valid Sandbox checkout with confirmed phone and idempotent payment; referral +10 history and alias denial; atomic interest save success and stale-category failure. No new screenshots are claimed by this workstream before the integrated deployment.

## Genuine external limitations

No provider configuration, licensed identity provider, native background service or real-money operation was invented. Existing phone physical-delivery, Aadhaar provider, Google Maps client config, SMTP/domain, Apple/OAuth configuration, persistent native SOS, Hubble redemption, semantic moderation, owner identity for permanent Master and real Cashfree refunds/payout settlement remain subject to the exact root evidence/credentials review. The actual hosted Sandbox success already recorded for payment41/event280 is retained, not called a live payout.

Dependency audits are not clean: root found published-unpatched transitive braces/node-forge advisories in Metro/ESLint/Expo CLI tooling. Do not force framework downgrades or claim those advisories resolved.
