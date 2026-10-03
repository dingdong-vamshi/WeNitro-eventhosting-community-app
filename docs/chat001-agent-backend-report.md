# Chat 001 backend, badges, Trust, Partner and payments

Status: local implementation complete for this workstream; integration and fresh deployed acceptance are still required. No production mutations, pushes, deployments, real charges or payouts were performed by this agent. Worktree: `chat001-backend-audit/wenitro-phone-app-`, branch `codex/chat001-backend-audit`, baseline `a47519f`.

## Fixes made in this workstream

| Requested change | Previous defect | Local implementation | Evidence / remaining production check |
|---|---|---|---|
| Ended activities cannot change; secure Cashfree categories | Both preparation overloads omitted the ended-state check; old single-argument RPC bypassed category selection/price/capacity; category edits allowed after ending | Migration `20261003075132_payment_entry_authorization.sql` reuses the locked ended-state guard and routes old checkout calls through the category-aware function | `payment-entry-authorization-test.mjs`: 47 executable PostgreSQL checks; deployed checkout/category acceptance pending |
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

- New executable PostgreSQL suites: payment47 + account54 + referral19 + interests13 + Trust23 = **156 checks**.
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

## Integration follow-up: paid receipt versus confirmed registration

Root review identified that the verification Edge and App still treated any provider `PAID` response as a secured place. The follow-up implementation returns `registrationConfirmed`, `refundRequired` and `financialStatus` from the actual ledger and participant row. The App only shows Joined/secured when registration is confirmed, displays refund/review honestly, blocks another Pay while review is outstanding, and offers an explicit status recheck. Pending return URLs remain available for a reload retry. Failed or stale detail refreshes cannot overwrite the known unconfirmed state. Rechecking an already-paid order reads its current ledger instead of calling the provider again.

Preparation and finalization now both exclude REFUND_REQUIRED/REFUNDED/REVERSED/DISPUTED payments from category capacity. A buyer with an unresolved refund/dispute cannot create another checkout. The finalizer rereads its returned payment after the real fee trigger and refund queue have run: the fee trigger initially sets PAYABLE, while the refund queue then changes the authoritative ledger to REFUND_REQUIRED.

The PostgreSQL suite now executes that real fee trigger and refund queue and passes 47 checks. `payment-registration-confirmation-test.mjs` executes the actual verification Edge handler, client decoder and App handlers across nine receipt/retry states, failed refreshes and a stale approved-details response: 90 assertions pass. The modal suite additionally checks that payment-review state blocks checkout. App TypeScript and Cashfree Edge typechecks pass. Deployment and actual production screenshot/API evidence remain pending.

## Isolated deployed API preparation (production execution pending)

Added `scripts/qa-isolated-backend-production.mjs` and its 12-check execution-gate test. Default invocation only prints the plan and requires no credentials/network. Live writes require `--execute`, an explicit coordinator release manifest, exact target, App/Admin deployment identifiers, Cashfree verification function version, and all five affected migration versions. No production writes were performed during preparation.

The runner creates uniquely named synthetic accounts, private activities and synthetic catalog rows; it never suspends or edits shared QA users 70/71/116. Credentials go only into a unique mode-0600 ignored `tmp` manifest immediately after each identity is created. A `finally` cleanup hides the private activities, holds the synthetic financial/settlement rows, archives fixture categories and bans/deactivates fixture accounts. `--cleanup-manifest FILE` retries interrupted cleanup, first validating manifest ownership against actual Auth and fixture titles. Financial history remains retained and labelled synthetic, and no provider refund, payout, bank or SMS operation is executed.

Coverage planned through deployed REST/RPC/Edge APIs: stale-session account guards, ten-Nitro referral once/replay/cross-inviter/self denial, atomic interest rollback with new archived assignments and retained archived choices, all22 unique achievement catalog/earned timestamp/privacy, owner/public Trust privacy and Nitro independence, private tier access, unverified phone and legacy overload denial, live reservation capacity, completed-activity late finalization, category overbooking/refund-required finalization, same-order Edge receipts and service-only finalizer authorization. These are preparation contracts, **not production PASS claims**. Clock-based expiry is covered in actual local PostgreSQL tests; the deployed synthetic case uses `completed` because the real schedule trigger correctly disallows backdating.

Synthetic service-finalizer fixtures test deployed backend and Edge semantics; they do not prove an actual Cashfree payment. The hosted interactive Sandbox repeat remains required separately. Temporary synthetic catalog rows are visible while enabled for the interest test, then archived; no existing category is changed.

Invocation after coordinator signal:

```sh
node --env-file=/ABSOLUTE/PRIMARY/.env.local scripts/qa-isolated-backend-production.mjs --execute --release /ABSOLUTE/RELEASE.json --secrets-root /ABSOLUTE/PRIMARY
```

Release JSON fields: `projectId: "cxsznhrkzqndhseodcyy"`, `readyForProductionQA: true`, `appDeploymentId`, `adminDeploymentId`, `cashfreeVerifyVersion`, and `appliedMigrations` containing `20261003074100`, `20261003075132`, `20261003075305`, `20261003075444`, `20261003075804`. Populate only with actual deployed evidence. Output proof is `docs/chat001-isolated-backend-production-<run>.json` and includes release IDs, semantic check values, fixture IDs and cleanup results without credentials.

Existing-script hazards identified: `qa-admin-read-models.mjs` restricts shared70 and restores it unconditionally; avoid parallel rerun until isolated. `qa-checkout-setup.mjs` overwrites the shared checkout manifest and creates a public activity under71; do not blindly rerun. `qa-admin-access-acceptance.mjs --setup` has a fixed manifest name and previous revoked fixtures; use isolated new setup rather than overwriting. Anonymous post36 is deleted and must not be reused.

Preparation validation: `node --check scripts/qa-isolated-backend-production.mjs`, credential-free default plan, and `node scripts/qa-isolated-backend-safety-test.mjs` (**12 assertions PASS**, execution gating only). Deployed execution and current-target security advisor rerun remain pending coordinator readiness.

## Integrated production verification and focused invitation regression

Production checks used the coordinator's exact integrated release manifest and target `cxsznhrkzqndhseodcyy`. Shared users70/71/116 and room244 were not edited/restricted. User70/71 were used only to read owner/public Trust and all22 badge states; the stable proof is `docs/chat001-current-profile70-proof.json` (owner70 Trust20, email10 + social10, four joined Activities; public viewer71 gets total/rating/joined count without private verification breakdown).

- Core deployed REST/RPC/Edge: **51 PASS**,13 cleanup checks: `docs/chat001-isolated-backend-production-mus4isau-9ef89f.json`.
- Full isolated social/activity/gallery/media pass: **49 PASS**,17 cleanup checks: `docs/chat001-isolated-backend-production-mus4oh17-f4d98f.json`. Includes actual Realtime INSERT delivery, block/history/unblock, own-message deletion, private Activities/comments/Co-host demotion, ended/deleted guards, gallery3 and primary swap, anonymous media mint/range/tamper/soft-delete/direct-path denial, and Admin-only attribution.
- Extended social run: **31 passing checks before a Realtime timeout**,13 successful cleanup checks: `docs/chat001-isolated-backend-production-musp6fp8-9fe1f2.json`. The added anonymous/named rating privacy, +2 once/duplicate0, self/Host-No-Show denial and report spoof/self/private/unauthorized-review checks passed. The overall run remains labelled FAIL. Fresh isolated Realtime retry then **PASS**, actual INSERT319, identities re-banned/deactivated: `docs/chat001-realtime-current-retry.json`. No silent conversion of a failed run into PASS.
- Invitation regression after migration20261003082845: **18 PASS**,11 cleanup checks: `docs/chat001-isolated-backend-production-musp8cua-ff1af1.json`. A real15-second registration deadline expired naturally; no schedule backdating or disabled trigger was used. Fresh explicit Host-issued private invitation restores approved free participation; public self-rejoin requires Host approval; private self-rejoin without fresh invitation is denied. Cashfree invite remains payment_required until confirmed ledger; reopening a paid invitation preserves approved seat and one-use counter, including an exhausted one-use token; another buyer remains denied.
- Storage ownership/private raw-schema checks: **28 PASS**,12 cleanup checks: `docs/chat001-isolated-backend-production-muspb1ly-43fb61.json`. Actual upload/read/remove and cross-user overwrite/remove denial in avatars, communities, vibes and messages; private observation/workspace schema unavailable via Data API. An initial harness expected immediate public-avatar download failure after deletion and found cached bytes. The corrected test checks actual removed-object response and authoritative listing; it does not claim immediate CDN purge.

The invitation issue was found during production acceptance. Its focused local fix is commits `f1be3fa` + `c63eb4b`: creation/redemption now enforce Activity lifecycle and registration deadline, and verified paid replay preserves the already admitted participant. Actual PostgreSQL invitation suite **42 PASS** and payment/finalizer suite **47 PASS** before coordinator integration/application. The coordinator reported the complete current local suite **78/78 PASS**; this agent did not deploy directly.

`docs/chat001-backend-canonical-coverage.json` maps all **12 F**, **16 E** and **40 relevant C backend** canonical rows to exact evidence and limitations. These are technical contributions, not blanket visual/client acceptance. Hosted Cashfree Sandbox repeat, required-answer UI and visual screenshots remain coordinator/UI-owned. Synthetic service-finalizer fixtures are clearly marked `provider_transaction_exists=false`; no provider payment, refund, payout, real bank transfer, SMS or verification outcome is fabricated.

Fresh post-regression structural SQL: no public table lacks RLS, no public view lacks security_invoker, no public/private SECURITY DEFINER is callable by anon, paid finalizer remains service-only. Public/private schema CREATE is denied to ordinary roles; raw private observation/workspace table grants are denied. Current135 callable authenticated SECURITY DEFINER signatures, definition hashes and call references are in `docs/chat001-postdeploy-rpc-inventory.json`; metadata/call graph helps review but is not a proof of every branch. Fresh advisor retrieval still reports **135 SECURITY DEFINER WARN**, **1 leaked-password-protection WARN**, and **8 private RLS/no-policy INFO** (no ERROR). Private internal tables are accessed through bounded privileged functions/service; no blanket policy added to suppress warnings.

Fresh public Auth settings: email/phone/Google enabled, Apple disabled, email/phone autoconfirm false. These settings do not prove actual delivery/callbacks. See `docs/chat001-postdeploy-auth-provider-state.json`. Root dependency/upstream holds remain unchanged; npm security is not claimed clean.

Final scoped cleanup SQL (`docs/chat001-isolated-fixture-cleanup-audit.json`) shows **0** active synthetic profiles, **0** unbanned synthetic Auth identities, **0** visible synthetic Activities, **0** remaining Storage objects, **0** synthetic paid rows not on hold, and **0** synthetic settlements not on hold. The old anonymous post36 was never reused. Its earlier authentic one-hour expiry proof remains explicitly attributed to the unchanged media capability implementation.

QA entrypoint path handling now uses `fileURLToPath` and canonical paths; **16 local gate assertions PASS**, including spaces and symlink paths. All new social, invitation and Storage modules pass syntax checking. Production tests require explicit release readiness; invitation scope additionally requires migration20261003082845 before any fixtures are created.


## Invited required-answer production regression (fixture297)

Read-only API proof in `docs/chat001-invited-registration-regression.json` confirms buyer116 is `payment_required`, required question134 has no answers, and no payment row exists. The App payment-required shortcut skipped the registration form. The RPC also returned early before saving initial answers for this state. Finally create-order passed a plain PostgREST error to an Error-only formatter, losing the validation message.

The App now checks persisted answers on every checkout entry, opens the existing form when incomplete and never calls Cashfree until valid. Migration `20261003181143_invited_registration_answers.sql` saves initial required answers for authorized invitees without changing their approved/going/paid/payment_required status; complete answers stay immutable on retries. New writes enforce Activity lifecycle and registration deadline. Normal self-join still follows the existing request/approval path. The create-order Edge preserves the actionable RPC message in HTTP400.

Focused local verification: actual App/Edge handlers **32 assertions PASS**, real PostgreSQL answer RPC **39 PASS**, invitation lifecycle **42 PASS**, payment receipt/seat confirmation **90 PASS**, Cashfree modal **6 scenarios PASS**, registration validation **21 PASS**, TypeScript and Deno create-order checks PASS; diff whitespace check PASS. PostgreSQL testing caught and corrected an alias/PLpgSQL variable ambiguity before release. The diagnostic read completed in629ms; the reported approximately30-second UI delay was not independently reproduced.

Fixture297 and shared users remain untouched. This is a local regression fix awaiting coordinator integration, migration then create-order Edge/App deployment, followed by the actual required-answer hosted Sandbox production retest. No deployment, payment, answer submission or finalization was performed by this agent for fixture297.


## Original PDF37 SOS requirement correction and implementation

The original PDF page37 was read as text and visually rendered. Exact clause: “Make SOS button functional by sending a notification just 10 mins before the activity kicks off. Message should be ‘Make sure to share your activity details and live location with someone you trust.’” This requests a reminder; it does not request live-location tracking or native persistent/background behavior. Earlier SOS-WEB/SOS-NATIVE acceptance rows inferred requirements incorrectly. The missing reminder is normal implementation, not an external hold.

Migration `20261003181703_activity_safety_reminders.sql` adds a private delivery ledger keyed by Activity/recipient/start instant, a due-time index and one named minute cron. The dispatcher checks current published/noncancelled/nondeleted/future state, active Auth/profile eligibility, and current Host or approved/going/paid participation. Pending/unpaid/left/rejected attendees are excluded. It locks Activities, bounds each run to1000 deliveries, skips already delivered rows, and atomically persists the exact reminder through existing notification infrastructure. Rescheduling to another start instant permits one new reminder. Dispatch occurs at the first minute tick at/after start-minus-ten, before start; very large backlogs can defer remaining batches. Private table and dispatcher are inaccessible to anon/authenticated clients.

Activity Detail now exposes SOS for Hosts/confirmed attendees, with explicit share/copy Activity details, validated saved-contact dialer, and contact management. Private details sharing does not mint an invitation or grant access. The panel explains that live location must be shared separately using the user's messaging app, no emergency services are contacted, and background push is unavailable. These actions initiate only on explicit user choice.

Local verification: real PostgreSQL **27 PASS** (natural boundary, exact message, recipients/states/bans, idempotency, reschedule, late join, failure rollback, parallel batches, ordinary-role denial); actual SOS handlers **29 PASS** (share/copy/call, invalid/missing contact, failure, busy state); production runner safety **16 PASS**, TypeScript and diff checks PASS. A gated `--safety-reminders` production module waits for real cron delivery using isolated fixtures and checks the next minute retry. It requires migration readiness and has not been executed before deployment. No native call, external message, production mutation or deployment occurred in this local fix.


## Participant management protected targets and paid retries

Read-only deployed function/trigger inspection confirmed `respond_activity_join` lacked protected-target checks: a Co-host could reject another Co-host, and retrying approval for an already verified paid member downgraded them to payment_required. Actual prior function source reproduced both failures locally before applying migration `20261003182405_participant_management_boundaries.sql`.

The replacement protects the original Host, acting user and any current Co-host (the Host must demote that role first). Current manager authority is checked on every call. Confirmed healthy paid approval replay returns the unchanged participant without repeated notifications or capacity recheck; unrefunded paid removal/waitlisting and refund-required/disputed cases require financial review. Repeated ordinary decisions are idempotent. Rejected/waitlisted unpaid attempts are cancelled immediately, and late provider success queues REFUND_REQUIRED instead of re-admitting a declined member. App participant removals all use this RPC; role changes use Host-only set_activity_cohost. Existing ended-state guards remain first.

Local verification: management PostgreSQL **42 PASS**, including both pre-fix reproductions, protected role/self cases, demotion, free/paid replays, reservation release and ended/cancelled/deleted removal; payment PostgreSQL **53 PASS**, including late Host-rejected/waitlisted payment refund behavior; QA safety **16 PASS**. New `--participant-management` production scope is release-gated on migration82405 and prepared but not run. It exercises actual Co-host approve/reject/remove, protected targets, demotion, ended removals and clearly labelled synthetic financial replay/late confirmation. Provider gaps now have precise evidence in `docs/chat001-provider-holds-evidence.json`; Maps is corrected from merely unverified to integration absent in current source.
