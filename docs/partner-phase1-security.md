# Partner Phase 1 security verification

Project: `klyjzbisgycegkkacbjw`. Changes extend the existing integer-ID users, activities, participants, Auth bridge, and Cashfree Sandbox ledger. No separate authentication or payout system was introduced. The applied alignment migration is `20260907064925_partner_optional_business_profile_alignment`. It replaces the initial Phase 1 account classification as authorization authority with an optional normalized Partner profile; earlier QA documents remain historical evidence.

## Authorization and privacy

- Every identity remains a normal WeNitro user. Optional `tbl_partner_profiles` has one row per existing integer user ID and stores business name, description, city and status. RLS allows owner/Admin reads; validated RPCs control writes. `tbl_users.account_type` is a trigger-maintained compatibility flag reflecting active Partner status, not authorization authority; direct client changes remain blocked.
- Eligibility requires an active, nondeleted existing user linked to Supabase Auth with **confirmed email OR confirmed phone**. Saving a valid business profile activates the capability immediately. There is no KYC, Partner verification or approval requirement; suspended/rejected profiles cannot reactivate themselves through onboarding.
- Legacy Partner signup metadata creates only a draft optional profile on initial profile creation. It does not activate Partner privileges, reclassify an existing identity or bypass the existing verification/discoverability bridge.
- Dashboard, registration and transaction RPCs resolve identity on the server and require both current eligibility and an active normalized Partner profile. Activity-specific access also requires ownership. JWT metadata and the compatibility flag do not grant ownership, Partner capability or Admin authority.
- New paid activities and changes to paid pricing/host require active Partner capability. Existing paid activities with unchanged paid flag, price and host are grandfathered: their existing management and payment flows remain available.
- Questions and answers have RLS enabled. Clients can read permitted rows; mutations go through validated RPCs. Answers are visible to their active participant, the owning Partner, and authorized Admin. Registration responses include display name, participation/payment status, amount, timestamps and submitted answers, without automatically adding email or phone.
- Public RPC wrappers delegate to constrained private implementations. Anonymous execution is revoked. Authenticated access to the private schema permits function resolution but does not override function-level checks or table privileges.

## Forms and payment boundaries

Questions validate supported types, required flags, ordering, option uniqueness and bounded lengths/counts. Submission validates question ownership, duplicate answer IDs, text/choice/boolean shapes, and required values. Form definitions lock after the first registration. Approved/payment-required registrations retain their recorded answers on retries.

Payment/form ordering remains pending product clarification. The current form-before-payment sequence is retained safely: both required answers and provider-confirmed payment are required before a paid registration completes. Both the existing join RPC and Cashfree payment preparation enforce required-answer completion. Paid host-approval activities remain pending until host approval, then become `payment_required`; only the existing provider-verification finalization approves payment participation. Phase 1 does not call the payout APIs or change Cashfree credentials/environment.

The central backend fee is 500 basis points. On provider-confirmed payment, the ledger snapshots the fee and net in paisa. Fee rounding occurs per payment to the nearest paisa; summaries sum those snapshots. Confirmed gross and fee fields are immutable. Earnings include only paid rows with provider status `PAID`/`SUCCESS`, verification time and paid time. Gateway charges and taxes are excluded from this Phase 1 calculation.

## Test methodology and evidence

`supabase/tests/partner-phase1.sql` is a rollback-only database suite run through connected Supabase MCP. It selects three established verified QA identities (Suchit, Priya and QA Admin), prioritizing an activity host with existing provider-verified payments, sets up optional Partner profiles only inside its transaction, and creates temporary test content through the production Activity/registration RPCs. JWT claims plus `SET LOCAL ROLE authenticated` exercise actual privileges and RLS rather than owner-only reads. Temporary helpers assert expected denials. The suite ends with a result row and `ROLLBACK`.

After the alignment migration, the lead reran the original Phase 1 suite through MCP: **76 assertions passed**. The additional `supabase/tests/partner-model-alignment.sql` suite passed **40 assertions**. Together these verify optional-profile eligibility/authorization, compatibility-flag protection, paid-hosting rules, capacity/remaining slots, private successful transactions, existing payment reconciliation, registration boundaries and immutable accounting. Both suites roll back their temporary application data; no Auth account or completed payment was created.

Tests cover cross-Partner registrations/answers/earnings isolation, participant answer isolation, Admin/anonymous denial, fee/account/payment write denial, all four join paths, required-answer bypass attempts, answer persistence, host review, payment preparation idempotency, and reconciliation against existing verified payment rows. Payment preparation creates only unconfirmed orders within the rolled-back transaction. The suite never fabricates a successful payment, contacts Cashfree, inserts an Auth account, sends an OTP, or commits test content. PostgreSQL sequences can advance during rollback tests; this does not leave application rows behind.

Historical Phase 1 Auth service tests separately used mocked Supabase calls to verify email and phone account-selection metadata, Individual defaults, verification-required responses, and omission of classification metadata during phone login. These do not prove live OTP/email delivery. New live payment completion was not performed by this suite; existing Sandbox success evidence and the unchanged finalization path support that boundary.

## Limits and baseline findings

The lead's advisor inspection returned **64 existing warnings**: 63 `authenticated_security_definer_function_executable` findings for legacy public RPCs and one `auth_leaked_password_protection` finding. No findings mention new Partner, registration, or fee objects. New exposed Phase 1 RPC wrappers use security invoker; their private implementations enforce ownership/identity before privileged operations. These results do not claim that legacy warnings are resolved. Browser/device QA is separate evidence and is not replaced by static review, this SQL suite, or TypeScript/build success.

No bank details, KYC, partner verification, settlement, withdrawals, refund rules, tax accounting, gateway-fee allocation, Google OAuth or Apple OAuth are implemented here. Net Earnings means calculated earnings after WeNitro's fee, not money paid out.
