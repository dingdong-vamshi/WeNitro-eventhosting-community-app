# WeNitro Partner Model Alignment — QA

## Delivered deltas

Inspected the existing Phase 1 implementation and extended it in place. Correct App/Admin paths and runtime project references verified; connected Supabase MCP independently returned ACTIVE_HEALTHY and read-only SQL success on `klyjzbisgycegkkacbjw`. Existing three Partner migrations, public RLS, Auth profile bridge, payment rows and Cashfree edge functions were present. No CLI, source-control write or frontend deployment used.

Applied `20260907064925_partner_optional_business_profile_alignment.sql` through MCP and regenerated database types. Added only one normalized extension: `tbl_partner_profiles`, uniquely linked to the existing integer user ID. All users retain their normal identity and interface. The old account_type is a compatibility projection; active optional Partner profiles authorize Partner operations.

Existing verified email OR phone users can complete basic business-name onboarding without another Auth identity, KYC or Admin approval. Description and city are optional. Business details can be edited from Profile. New Partner signup initializes a draft business profile only on first user creation; later metadata changes do not grant capabilities. Draft/pending/active/suspended/rejected states are supported, and suspended/rejected users cannot self-reactivate.

New paid hosting and paid-price/owner changes require an active Partner profile at the database trigger boundary, including direct table writes. Existing unchanged paid listings are grandfathered so their management and participant payments remain working. Normal free hosting remains available. A paid-contribution CTA preserves unsaved activity fields through onboarding and returns to the form.

Added Partner borders to existing shared activity cards/Home tiles/detail images, plus a compact badge where appropriate. Dashboard adds capacity, remaining slots and successful transaction details derived from real payment rows. Occupancy follows existing approved/going/payment_required seat rules. Admin wording describes Partner capability; no approval workflow was added.

## Verified results

- App TypeScript: zero errors. Expo production web export: PASS (`dist-partner-alignment`).
- Admin TypeScript and production build: PASS, 68 static pages. ESLint: zero errors, 15 unchanged warnings.
- Existing Phase 1 regression SQL: 76/76 passed after updating setup for normalized profiles.
- New alignment SQL: 40/40 passed (onboarding, no duplicate identity, idempotency, status restrictions, direct/RPC paid-hosting guards, free hosting, real transactions, capacity and cross-Partner isolation).
- Registration validation: 21 assertions passed. Auth service metadata: 12 mocked checks passed.
- Security advisors: 64 baseline warnings, no new Partner/registration/fee findings. RLS remains enabled on every public table. The leaked-password-protection finding remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Browser QA used the existing Vamshi phone session. Individual Profile displayed Become a Partner; positive contribution showed its CTA. Empty business name was rejected. Real onboarding created one optional profile for the same user, immediately opened Dashboard and preserved Home/Vibes/Host/Chat/Profile. Edit Business Details reloaded and saved. Existing padel activity showed capacity 3 and remaining slots 1, and exactly that Partner card had the 2px purple border. Normal cards did not receive it. Cancelling and completing onboarding preserved the unsaved activity title, price and other fields; completion returned to the form with registration-question controls available.

No new social content or completed payments were persisted. All automated database mutations rolled back. Temporary browser-created business profiles were removed using exact user/name/creation-time guards. Final baseline: 38 tbl_users, 8 Auth users, 122 events, 133 participants, 2 payment rows, zero Partner profiles/flags/questions/answers. Vamshi remains Individual and signed in. Existing users were not automatically converted.

## Payment order and accounting

The current direct-paid path persists form answers before checkout. Confirmation requires both validated answers and provider-verified payment, and existing payment preparation remains idempotent. Payment-first presentation is a pending client clarification; this alignment does not move collection ahead of required questions. Paid host approval remains Request → host approval → payment_required → Cashfree → provider-confirmed approval.

Successful existing rows reconcile to INR20 gross, INR1 (5%) fee, INR19 net. Per-payment paisa rounding and immutable snapshots remain unchanged. No settlement, bank input, KYC, payout, gateway fee, tax or refund accounting exists. Bank / Settlement Details is only a future location in Profile.

## Limits

No fresh email/phone signup delivery, OTP, email confirmation, new Cashfree charge or provider callback was performed. Signup metadata tests are mocked and the Auth bridge was inspected. All four join paths/answer persistence and financial isolation were exercised using authenticated SQL roles, not a new two-user browser checkout. Native devices were not tested. Optional Partner RPC failure now fails closed independently so ordinary workspace loading can proceed; its recovery path is the Partner Account screen.

## Manual QA

1. Sign in with an existing Individual account and choose Profile → Become a Partner.
2. Enter the business name and complete onboarding; confirm normal navigation and Partner Dashboard remain available.
3. Open Partner Account → Edit Business Details, save, and reopen it.
4. Create a paid Activity with optional questions. Check its Partner border, capacity and remaining slots.
5. As another user submit answers. For approval activities, have the Partner review and approve before payment.
6. Complete Cashfree Sandbox checkout if needed, then verify registration, saved answers and real transaction.
7. Check Gross → 5% → Net and confirm another Partner cannot access the private records.
