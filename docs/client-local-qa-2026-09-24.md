# WeNitro correction pass — executed QA, 24 September 2026

This is an execution log, not release approval. All frontend fixes remain local until the release gate passes. The separate 39-page acceptance ledger records 88 deduplicated requirement groups; source matches are not manual PASS results.

## Preflight and boundaries

- App started clean on `main`, `d579518d4329525d153aef537c2eda0a1e8ae08b`, aligned with its normal GitHub origin.
- Admin started clean on `main`, `a426974225cc0ed2ac0227fdd519d2244f3891e5`, aligned with its normal origin. Its iCloud repository exists; the Desktop alias remains absent. No Admin code changed.
- Supabase `klyjzbisgycegkkacbjw`: ACTIVE_HEALTHY; relevant Auth, tables, RPCs, Storage, functions and QA users accessible. No other project used.
- Existing App/Admin Vercel projects and production configuration inspected; no replacement project created. Safety-net repository untouched.
- Browser-only testing. No Android Studio or emulator.
- Local Metro: port 8082. Production-style web export: port 8083. Tests use the supplied QA member accounts, with existing QA Admin session for approval.

## Proven local / live-backend interactions

| Area | Executed result |
|---|---|
| Anonymous signup UI | Isolated local origin preserved signed-in QA sessions. Welcome→email/phone→Create Account; Individual defaults, Partner/Business selection and phone-entry mode verified. Email used as name produces explicit rejection; invalid email produces error, valid name/email produce check ticks. No signup or OTP was submitted. |
| Partner crash reproduction | Existing production QA2 form submit reproduced `Cannot read properties of undefined (reading 'rest')`. Detached `supabase.rpc` lost the client receiver; corrected to a bound method call. |
| UPI submission | QA2 supplied QA-labelled business details and UPI destination through local UI; submit succeeded to UNDER_REVIEW. Production Admin displayed the application with masked destination. |
| Bank resubmission | QA Admin rejected only that QA application with a QA reason. QA2 saw the rejection, switched to Bank and resubmitted. Admin saw masked bank account/IFSC and no stale UPI. |
| Approval | QA Admin approved the QA application with a no-payout-authorized QA note. App application page showed APPROVED and Partner capability. Both provided QA members are now approved Partners. No real user's approval changed. |
| Dashboard | QA1 opened Overview and My Activities; real hosted count, registrations and zero earnings displayed. Missing dates now display Date to be decided instead of 1 January 1970. Later error-ownership regression covered summary/detail completion order. |
| Normal free | Before QA2 approval, UI published activity 210, `QA Sep24 normal free`; QA1 joined without checkout. Saved, liked and posted a clearly labelled QA comment. |
| Normal on-site paid | Before QA2 approval, UI published activity 209, `QA Sep24 normal onsite`, ₹25. Correct direct/venue-payment explanation; QA1 joined normally. Targeted read confirmed on-site mode, approved participation and no payment attempt. Existing activity retains on-site mode after host becomes Partner. |
| Partner free | QA1 published activity 211, `QA Sep24 partner free`; QA2 joined normally. A later Leave confirmation was not accepted; no leave is claimed. |
| Partner platform paid | Approved QA2 published activity 212, `QA Sep24 partner platform paid`, ₹25, Cashfree mode. QA1 reached Payment required / Pay ₹25 and remained unconfirmed. Checkout correctly required a verified phone. No successful payment, commission, settlement or refund is claimed. |
| Start time | Browser observation: current IST 14:18:16.995; default start 14:28:17; end 15:28:17; deadline 14:28:17. Start difference 600.005 seconds. Date-later option used for persisted QA events so they do not expire during testing. |
| Paid filters / labels | Paid filter returned the paid QA events and existing paid activity; free filter options, date/gender/verified/reset controls inspected. Detail payment classification and JOINED remain separate. Category/type duplicated below title removed; Public/Private remains. |
| Co-host | QA2 granted QA1 co-host on activity 209 through participants UI. QA1 saw co-host status and host-equivalent editing controls. QA2 removed the QA co-host afterward. |
| Activity chat | Activity 209 chat opened with its actual title and two participants; QA1 sent labelled message and QA2 saw it with actual author. Chat information navigated to the correct activity. |
| Poll | QA1 created a real labelled QA poll and QA2 voted Delivered. QA2 saw 100%, one vote. Cross-user update and reopen exposed separate bugs in realtime refresh and poll-ID history mapping; fixed, with final live retest recorded separately by chat auditor. |
| Vibe sharing | QA1 shared existing QA Vibe 99 to Weekend Photography Circle, then to QA2 direct chat and activity 209. Actual delivered thumbnail/caption cards appeared; selecting delivered cards opened Vibe 99. Picker cleared search/selection after successful send. New cards show original creator separately from sharer. |
| Community | Community 187 information, existing posts and separate chat navigation tested. QA2 was temporarily granted only post permission as Moderator; editor/member-management/Admin/delete controls remained absent and post composer available. QA1 restored original Member through UI. No real user's role changed. |
| Own Profile | Light/dark visual comparison against PDF; textured indigo header, actual avatar/verification, trust block/strip, mountain/sun About, interests and locked achievements. Activities history, empty Squad, Karma→Reviews and Nitro ledger clicked; email verification +10 was real ledger data. |
| Public Profile | Shared reference layout, real data, no owner edit/add controls; public photo viewer works. Public community destination opens actual community. Private Squad/points disclosure respected. |
| Social profiles | Empty QA social editor via Add works; public profiles without saved URLs do not fabricate linked icons. No actual linked external URL click was proven: inspected profiles lacked saved URLs. |
| Profile history | Own hosted/joined history, Upcoming/Completed controls and payment-required classification inspected. History now comes from actual paginated membership records, not latest public discovery subset. |
| Profile verification | Actual score 10/100, email verified, phone/selfie not verified; current camera/selfie terminology and points preserved. No live selfie/camera capture was performed. |
| Home | Duplicate top-right avatar removed; logo/search/notifications retained. All four carousel CTA destinations clicked: Activities, Communities, Invite, Store. Store correctly reports current points and unavailable catalogue, not fake rewards. |
| Settings / legal | Dark, Light and System persisted across reloads. Privacy/Terms summaries, Back, and external View More published pages tested. Invite screen displays actual referral and 10-point rules. |

## Backend corrections actually applied

These migrations were required by reproduced feature defects. They are already applied to the correct live project; frontend deployment is a separate pending gate:

1. `20260924083715_activity_dual_payment_modes.sql`: reuse existing paid/mode fields; server derives ordinary on-site vs approved-Partner Cashfree; on-site joins avoid checkout.
2. `20260924085750_profile_community_navigation_links.sql`: return actual community IDs alongside names with existing privacy predicates.
3. `20260924085755_activity_checkout_terms_immutable.sql`: prevent changing charged terms/owner/mode after a Cashfree attempt exists, including late-success risk. No provider transaction was fabricated.
4. `20260924091853_vibe_share_creator_attribution.sql`: server-derived original creator on newly shared Vibes; existing authorization checks retained.

## Performance evidence and limits

- Before: repeated same-account SIGNED_IN notifications reran bootstrap and could return the whole app to a loading screen. After correction, same-session notifications do not restart bootstrap; warm navigation, cross-tab restore and three theme reloads initially passed.
- Request reductions are source/fixture-backed, not claimed production timing benchmarks: inbox preview cap 50→1 per conversation; deduplicated batch media signing; concurrent workspace callers share one load; foreground refreshes request only relevant slices; Dashboard Overview loads summary without unrelated ledgers; community search no longer reloads whole inbox each keystroke.
- Profile/session loading now has bounded error/retry and stale-account guards. Feed can render navigation before unrelated social data, with truthful pending/failed/empty states.
- Later QA nevertheless hit repeated real session/profile deadlines on both local origins. Instrumentation proved an actual `/auth/v1/user` HTTP **504 after 79,440 ms**, not just a loading component problem. Another attempt spent 8.136 seconds in Auth and 21.524 seconds in the profile bootstrap RPC. Public Auth health returned 200 in approximately 1000 ms and project remained ACTIVE_HEALTHY; that does not prove authenticated requests are healthy. A small database wait aggregate showed no lock wait at that snapshot.
- Removed two redundant serial Auth validations and a redundant legacy-ID RPC from startup. A server-validated identity is reused only within its bootstrap; concurrent validations for the exact same token share a pending request, never a settled identity cache. Account-change checks and backend RLS remain intact. Temporary diagnostic code was removed. Offline integration tests pass, but final browser acceptance remains blocked by the authenticated endpoint failure.
- Browser command latency is not an app benchmark. In-app browser also developed an independent CDP focus/confirmation transport failure; Chrome used afterward. No user-owned tab was closed to work around it.

## Validation and remaining gates

- Final **34/34** safe non-live regression scripts passed, including actual auth-service integration, Dashboard error ownership, payment protections, chat poll mapping and Home/search explicit paid/free labels. TypeScript passed.
- Final Expo export passed: `index-189204295b3d97c2908da4e685a58147.js`. This exact final export has not passed authenticated browser acceptance or production QA.
- Diff whitespace checks and targeted source/bundle secret scans passed. No service-role/provider secret included.
- Real phone OTP requires a user-designated test phone and human-entered SMS code; requested, not yet supplied. Provided QA accounts are email-only. Do not use an arbitrary person's number or bypass verification.
- Successful Cashfree payment remains unverified behind verified-phone requirement. No fake success, payment, refund or settlement.
- Full 88-group manual acceptance, new-production functional QA and production performance QA are not complete. No frontend commit/push/deployment has occurred in this pass.
- Pending manual cases are explicitly retained in the acceptance ledger, including final cross-user poll update/reopen, private activity/approval, media upload/three-photo operations, real linked social URL click, complete payment and camera capture. Tests that were interrupted by session failures were not marked PASS.

**READY FOR CLIENT: NO.** Preserve this distinction until evidence actually changes.

## Follow-up: authorized real phone login

The user supplied and authorized a test phone ending 7280. The existing-account Phone Login UI requested one OTP. The first submitted code was rejected by Supabase as expired/invalid. After the user explicitly authorized one resend, the newest code was accepted through the normal Verify & Continue UI.

Observed: Home opened, the existing `@vamshi` profile loaded with its actual metrics, and Verify Your Account displayed **Number Verified**, phone **10/10** and total Trust Score **10/100**. No email is attached to this phone account. No new account was created by the login flow, and no user/verification record was manually inserted or modified to bypass Auth. OTP values are not stored in this log.

**Existing phone OTP login: PASS locally against the correct live Supabase project.** This proves neither new-number signup nor production deployment acceptance. The earlier intermittent Auth 504 remains historical failure evidence, not a claim that this successful attempt failed. Broader stability and remaining release checks still need completion.

## Final stabilization follow-up

- Auth/session stability: five consecutive authenticated phone-session restores reached useful Home in **3298, 1910, 1887, 2072 and 1885 ms**. Three measured production-export QA1 email-session restores completed in **1716, 1774 and 1818 ms**. QA2 email login completed in **2588 ms**. No 504 or Auth error appeared in the browser logs during these repetitions. The earlier 79.44-second `/auth/v1/user` response is retained as historical transient failure evidence; startup now performs one server Auth validation per bootstrap and coalesces only in-flight same-session validation.
- Cross-user Chat: QA1 sent a labelled direct message; QA2 saw it in the inbox and thread. QA2 replied; QA1 received the reply through Realtime in **2264 ms**.
- Routed thread history: browser QA exposed that the rebuilt inbox passed a selected room without loading its full first page, leaving only the one-message preview. The route now hydrates history. Activity room 193 reopened with its earlier sender-labelled text, poll and Vibe share. QA2 changed the poll vote and QA1 updated in **974 ms**; the original vote was restored afterward.
- Comments: Activity 210 now has four harmless QA comments. Collapsed view shows three and `View more comments (1)`; expand shows all four and `Show fewer comments`; collapse hides the fourth again.
- Registration lifecycle: the browser-native confirmation was replaced with an in-app confirmation sheet. QA1 left Activity 210, observed `Join Activity`, rejoined, and returned to `JOINED`.
- Social links/public Profile: QA1 saved the harmless authorized base Instagram URL through the real editor. Own and QA2 public Profile both display only that real saved link; public owner-only controls remain absent. Clicking it opened `https://www.instagram.com/`. Trust Score correctly rose from 10 to 20 through the existing social-link rule.
- NitroBot: the dead `not connected yet` placeholder had no backend, Edge Function or provider. It is now a deterministic privacy-preserving WeNitro help assistant for Activities, Communities, Chat/Vibes, Profile, verification, Nitro Points, Partner/payment and safety topics, with account-specific escalation to the existing `submit_support_query` RPC. Quick Partner help and typed paid-Activity help were browser-tested on the final export.
- Final safe regression gate: **34/34** non-live suites pass (the separate standalone-browser OTP script was intentionally not used; real OTP had already passed through the controlled browser). TypeScript and Expo/Vercel export pass. Final local bundle: `index-6427af6e22f37a31e1988449c6b4f2be.js`.

## Production deployment and browser verification

- Release commit `408b7fe` was pushed to the normal App `main`. Vercel deployment `dpl_FPnaMjafPSyaPZ32vrYvSMuU57tt` reached **READY** and was aliased to `https://wenitro-app.vercel.app`. The safety repository was not used. Admin remained clean at `a426974` and was not redeployed.
- Production QA1 email logout/login completed in **6431 ms** and mapped to Arjun Sharma. Three subsequent authenticated reloads reached useful Home in **2035, 1891 and 1850 ms**. One immediate post-alias cold reload exceeded 20 seconds but resolved within the following 15-second observation; it did not reproduce in the three controlled repeats. No 70–80 second request or stuck app reproduced.
- Home manual carousel navigation selected slide 1 and its Activity CTA opened the production Activities destination. The deployed Home showed the four real payment-labelled QA activities and no duplicate header avatar.
- A fresh production Host form reached Step 3 at **16:52:38 IST** after the transition at **16:52:37 IST**; default start was **17:02:38**, end **18:02:38**, and registration deadline **17:02:38**. Start default is current initialization time plus ten minutes within normal render tolerance.
- Activity 210 showed FREE/JOINED, four comments, a three-comment preview, `View more comments (1)`, all four after expansion, and the in-app Leave Activity confirmation. `Keep my place` preserved the membership. Activity 209 showed PAID ₹25 with direct-at-venue payment and no platform checkout. Activity 212 showed secure Partner checkout and stopped truthfully at `A verified phone number is required for Cashfree checkout`; no charge or payment success was fabricated.
- Own Profile completed to Trust Score **20/100**, one actual Instagram URL, Activities 4, Squad 0, Karma 0.0 and Nitro Points 10. Activities opened Activity History, Squad opened the truthful empty state, Karma selected Reviews, and Nitro Points opened the +10 email ledger. Public QA2 Profile loaded real metrics and omitted owner edit/add controls. Verification showed email +10, social +10 and unverified phone/selfie states.
- Partner Dashboard loaded Overview and My Activities with two hosted activities, two registrations and truthful zero financial totals. Production Admin showed both QA accounts as **Partner active**, both approved Partner applications, and all four QA activities with the correct hosts. The QA Admin finance route correctly enforced its narrower role; no completed payment transaction exists to display.
- Community 187 loaded its real description, rules and six members. Posts and community Chat destinations opened; existing message and shared-Vibe history rendered.
- Activity room 193 hydrated full text, poll and Vibe history after routing. The poll showed Delivered 100%, one vote. A new production Vibe 99 share to this QA room completed in **3834 ms**, dismissed the picker, appeared as a second delivered card with creator attribution, and opened `/#/vibe/99`.
- NitroBot Help returned deterministic Partner-approval and paid-Activity/Cashfree guidance, exposed its privacy boundary, and retained secure escalation to Send Query.
- Existing tested phone OTP login remains PASS without requesting another code. Google remains user-confirmed. The only unexecuted commercial endpoint is a successful Cashfree sandbox payment: the instructed QA email account has no verified phone, and the user explicitly prohibited another OTP. The verified-phone rejection is the intended security gate, not a frontend/backend failure.

**READY FOR CLIENT: YES for the deployed browser release.** No unresolved code, Supabase, GitHub, Vercel, App/Admin integration or browser-flow blocker was found in the final pass. Successful third-party payment completion and native camera/OS behavior remain separately bounded; neither was falsified.
