# Partner Phase 1 QA — 7 September 2026

## Scope and preflight

Implemented in the original App and Admin folders. Supabase MCP independently verified project `klyjzbisgycegkkacbjw`, read-only SQL, schema, RLS, Auth, Storage, migration history and Cashfree Sandbox functions before modifications. Both client configurations and public keys were verified against that project. No Supabase CLI was used.

Existing dirty files and divergent histories were preserved: App remains ahead 2 / behind 32; Admin ahead 1 / behind 17. No commits, pushes, GitHub changes, frontend deployments or release audit occurred.

## Backend delivered

Remote migrations and matching local files:

- `20260907055314_partner_registration_phase1.sql`
- `20260907055610_partner_private_rpc_access.sql`
- `20260907055640_partner_account_type_guard.sql`

Existing users, events, participants and payments remain authoritative. Added initial-signup account classification, normalized questions/answers, ownership-constrained RPCs, RLS, atomic question/join integration and immutable verified-payment accounting snapshots. Generated database types refreshed through MCP.

The central fee is 500 basis points. Rounding is per payment to the nearest paisa before aggregation. The two existing verified INR 10 payments reconcile to INR 20 gross, INR 1 platform fee and INR 19 net. No new provider charge was made. Net is accounting only, not payout.

## Actual verification

- App TypeScript: 0 errors.
- App Expo production web export: PASS, `dist-partner-phase1`.
- Admin TypeScript and production build: PASS, 68 static pages.
- Admin ESLint: 0 errors, 15 existing warnings.
- Registration domain tests: 21 assertions passed.
- Auth service tests: 12 checks passed using mocked requests.
- Connected database tests: all 76 assertions passed; transaction rolled back.
- New-source secret-pattern scan: no matches for secret-key/private-key patterns checked.
- Supabase advisors: 64 baseline warnings (63 legacy authenticated security-definer RPC findings, one leaked-password-protection setting). No new Partner/registration/fee findings; public RLS remains enabled.

Database tests cover all four free/paid direct/approval paths, required-answer enforcement through existing join/payment RPCs, answer persistence and host review, ownership/privacy denials, malformed forms, locked definitions, payment preparation idempotency, client payment/fee fabrication denial and reconciliation against existing verified payments.

Browser QA used the existing signed-in Vamshi QA identity, temporarily classified Partner, then restored Individual. Verified dashboard real data, registrations without contacts, earnings empty state, 390x844 layout without horizontal overflow, signup selection across Email/Phone, and actual paid-draft creation with required short text, required dropdown and optional checkbox. Reopened, reordered and saved the questions. Verified Admin Partner filtering and existing completed payment records. Existing Home/activity/community lists, Vibes, Chat/story list and Profile rendered. Session restored after reload; Partner entry disappeared after account restoration.

The temporary draft (event 141) was removed with title/owner/status and no-participation/payment guards. Final counts returned to baseline: 38 users, 122 events, 133 participants, 2 payments, 0 questions, 0 answers, 0 Partners. No existing user remains reclassified. No persistent test payments or registrations remain.

## Limits

Fresh email confirmation delivery, a new phone OTP, a fresh email login and a new Cashfree checkout/provider callback were not executed. Auth configuration, verified existing identities, mocked service requests and existing provider-verified payment evidence were checked. Participant submission/approval was exercised through authenticated SQL roles, not a second-user browser end-to-end session. Native iOS/Android devices were not tested. Social regression was read-only rendering/data inspection, not new posts/messages/reactions. Notifications were inspected in the database. These limits remain for manual QA; build success does not replace them.

Private registration details and answers are restricted; existing public attendee displays were preserved. Legacy security-advisor findings were not claimed resolved.

## Manual QA (eight tests)

1. Create a Partner using Email or Phone; complete the existing verification. Use an Individual as the participant.
2. In the Partner Profile open Partner Dashboard and review the real empty/summary states.
3. Create a paid approval-required Activity with required short text, required dropdown and optional checkbox; publish it.
4. As the participant open it, check required validation, answer and request to join.
5. As Partner open Registrations, review answers and approve; participant must become payment_required.
6. As participant complete Cashfree Sandbox checkout once if needed; wait for provider verification.
7. Check successful amount, 5% fee and net in Partner Earnings, including the Activity breakdown.
8. Reopen Registrations and verify persisted answers/status; an unrelated user must not access the private view. Form edits should lock after registration.

## Deferred

No bank details, KYC, partner verification, payout schedule, settlement, withdrawal, split settlement, gateway-fee responsibility, taxes, refunds, cancellation policy or payout eligibility timing. Google OAuth remains paused pending client secret; Apple OAuth is not implemented.
