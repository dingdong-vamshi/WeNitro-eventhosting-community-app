# WENITRO PROFILE / SETTINGS REBUILD

September 8, 2026. Continued from the current local Phase 4 worktree.

**NOT READY for visual acceptance.** The supplied request was read completely. macOS returned `Operation not permitted` when reading the attached video, including with the bundled Python runtime. The browser tool twice reported that the Mac was locked and automatic unlock failed. No video frames, mobile screenshots, or browser interaction results are claimed for this phase. The user was asked to unlock the Mac while independent implementation continued.

PASS in this report means source/service checks or the explicitly described automated/database checks passed. It does not mean the corresponding screen passed mobile visual QA. FAIL (unverified) marks a required acceptance check that could not be performed.

## REFERENCE

- New video reviewed completely: **NO** — file access blocked.
- All screens/interactions inventoried: **NO** — the written scope is inventoried below; the recording cannot yet be inspected.
- Reference: `/Users/vamshipendyala/Downloads/WhatsApp Video 2026-09-08 at 15.49.59.mp4`.
- Written request: `/Users/vamshipendyala/.codex/attachments/42614b3f-1919-407e-95c0-e8dfb8b778c0/pasted-text.txt`.

## PROFILE

| Item | Implementation/service result |
|---|---|
| Header | PASS — current username, Store and Settings actions |
| Avatar/name | PASS — actual identity and gender when present; no invented avatar |
| Connect Social | PASS — existing own-account social links RPC retained |
| Badge of Trust | PASS — existing verification route; genuine verification signal |
| Activities | PASS — existing own metrics count |
| Squad | PASS — existing relationships count |
| Nitro | PASS — existing actual points balance |
| Karma | PASS — truthful zero; no separate Karma model configured |
| Achievements Coming Soon | PASS — always locked; no achievement engine or invented awards |
| Trust Score | PASS — read-only derived score from genuine phone (+20), Aadhaar (+20), social link (+10), rating >=4 (+10); unknown activity weighting not invented |
| My Vibes | PASS — real own paginated Vibes; centered “No vibes posted yet” empty state |
| Upcoming | PASS — existing user activity eligibility and date/status logic |
| Completed | PASS — existing user activity eligibility and date/status logic |
| Drafts | PASS — existing server-filtered own drafts |

Profile tab requests now discard stale responses after switching tabs or unmounting. The score remains /100 as requested, but only documented weights contribute; activity weighting is explicitly unavailable. The existing server metrics RPC still returns null for an official trust score.

All Profile visual comparisons: **FAIL (unverified)**.

## NITRO STORE

| Item | Result |
|---|---|
| 500-point gate | PASS — boundary tests at 499, 500 and 501 |
| Actual balance used | PASS — own metrics RPC on entry and Retry |
| Error toast | PASS implementation; browser display unverified |
| Unable-to-load state | PASS implementation; browser display unverified |
| Retry | PASS source — fresh balance read without full app reload |
| Fake store/catalog created | NO |

Below 500, shows the specified eligibility message and “Unable to Load Store”. At or above 500, shows FEATURE UNLOCKS SOON because no real current catalog/redemption integration exists. Invalid/unavailable balances show an error instead of inventing zero.

## SETTINGS

| Item | Result |
|---|---|
| Appearance | PASS — existing persisted System/Light/Dark behavior retained |
| Privacy | PASS — existing privacy service retained; enum regression tests pass |
| Cookie/Storage | PASS — existing essential-storage explanation retained |
| Invite Squad | PASS — dedicated route added |
| Saved Items | PASS — existing real account collection |
| Liked Items | PASS — existing real account collection; title “Liked Activities” |
| NitroBot | COMING SOON — no provider added |
| Send Query | PASS — existing feedback RPC retained; no real query submitted for QA |
| Privacy Policy placeholder | PASS — “Privacy Policy content will be displayed here soon.” |
| Terms placeholder | PASS — “Terms & Conditions content will be displayed here soon.” |
| Deactivate | PASS — existing confirmation + deactivation RPC retained; NOT executed |
| Logout | PASS — existing real session logout retained; label “Log Out” |
| Version | PASS — current Expo metadata |

All Settings browser interaction/visual acceptance checks: **FAIL (unverified)**.

## SAVED / LIKED

| Item | Result |
|---|---|
| Liked Activity empty state | PASS implementation — heart, “No liked items yet”, supporting sentence |
| Actual likes populate | PASS — existing account-scoped relation and activity join verified in rollback transaction |
| Actual unlike removes | PASS — rollback transaction |
| Saved Items | PASS — existing account-scoped relation |
| Actual save/unsave | PASS — rollback transaction |

No second likes/saves tables. Loading skeletons retained. Existing supported Vibe collection entries retained. Browser entry/reopen sequence still unverified.

## INVITE SQUAD

| Item | Result |
|---|---|
| Design | FAIL (unverified) — written layout implemented; video comparison blocked |
| 20-point presentation | PASS — clearly marked rewards coming soon, no false immediate credit claim |
| Referral link | PASS — stable existing profile ID; web current-origin `#/invite/<id>`, native `wenitro://invite/<id>` |
| Copy | FAIL (unverified) — Expo Clipboard implemented; selectable fallback present; real clipboard interaction blocked |
| Share | FAIL (unverified) — Web Share API/native Share and fallback dialog implemented; system interaction blocked |
| Automatic reward backend | MISSING — existing `tbl_referral_history` is admin-only; no reward RPC or client integration found |

Incoming invitations are parsed and retained in local storage for up to 30 days across onboarding. This prepares association data; it does NOT write a completed referral association or points. No fake user/referral/reward was created. Actual server association/reward processing remains future work permitted by this request. Web links in this local preview point to localhost; they are not a deployed public invitation landing page.

## EDIT PROFILE

| Item | Result |
|---|---|
| Full Name | PASS — canonical fullname; existing validation |
| Username | PASS — normalized onboarding format, blur/save availability, existing database uniqueness; duplicate rejected in rollback test |
| Email | READ ONLY — current authenticated email; no tbl_users/auth.users mismatch introduced |
| Bio 40 | PASS — UI and service limits; 40 accepted/41 rejected |
| Occupation 100 | PASS — UI and service limits; 100 accepted/101 rejected |
| About You 500 | PASS — maps existing `about`; 500 accepted/501 rejected; separated from Bio |
| DOB | PASS — real date picker/field, YYYY-MM-DD, existing age/date validation; untouched null preserved |
| Gender | PASS — existing normalized onboarding values |
| Nationality | PASS — centralized 249 ISO alpha-2 countries and flags; existing field; null clearing tested |
| Interests | PASS — existing IDs and shared category taxonomy; QA Automation excluded; existing hidden selections preserved |
| Save | PASS implementation — duplicate-submit guard, only changed fields, own-identity checks, success state |
| Persistence | PASS database readback/rollback; browser save-and-reopen remains unverified |

Existing avatar selection/upload remains available, with upload at Save and existing identity/media validation. A successful save updates local profile, own Activity host, own Vibe author, and own Story avatar without a full reload. Different profile/interest/avatar operations use existing services, not a new transaction RPC. A later-operation failure can leave earlier legitimate saves persisted; errors remain visible and retry is supported.

All Edit Profile visual comparisons: **FAIL (unverified)**.

## BACKEND / REAL DATA

- Correct MCP identity verified: WeNitro, `klyjzbisgycegkkacbjw`, ACTIVE_HEALTHY.
- Existing bio, about, occupation, nationality, DOB, gender, interests, saves and likes reused.
- Schema migrations this phase: **0**.
- Database types regenerated from the correct project.
- Fake metrics: **0**.
- Fake achievements: **0**.
- Fake verification: **0**.
- Fake liked/saved runtime data: **0**.
- Persistent QA writes: **0**. The entire profile/collection SQL test rolled back.
- No deactivation, new referred account, support submission, or payment executed.
- Security advisor baseline unchanged: 63 authenticated-definer findings and one leaked-password-protection finding. No additional findings introduced. Existing remediation guidance: [function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## BUILDS / REGRESSION

- TypeScript: **PASS**, zero errors.
- Web production export: **PASS**, `/tmp/wenitro-phase5-export`.
- Local preview health: **PASS**, HTTP 200 at `http://localhost:8081`.
- Mobile browser at 390×844, 360×800, 412×915: **FAIL (unverified)** — Mac locked.
- Android Studio used: **NO**; no qemu process found.
- New profile unit/service tests: PASS.
- Existing privacy, onboarding profile/avatar, Google auth isolation, Host, Vibes, Partner auth, registration tests: PASS. Two test harnesses were updated to load the newly shared interest taxonomy dependency.
- Existing database profile/interest/like/save readback, ownership and duplicate-name checks: PASS; all changes rolled back.
- Nine protected App screen function bodies unchanged from the Phase 4 snapshot.
- All 12 protected Partner file hashes unchanged.
- Web bundle scan: 0 Google client-secret patterns, 0 service-role JWTs.
- Native builds, real Google-login retest, real payment: not run.

## SOURCE CONTROL

Commit: **NO**. Push: **NO**. Deploy: **NO**. Partner: **PAUSED**.

Local before snapshot: `/tmp/wenitro-phase5-before`.

## WRITTEN SCOPE INVENTORY / PENDING VIDEO REVIEW

Profile header/identity → Store gate/toast/Retry → Settings appearance/privacy/storage → Saved/Liked loading and empty/populated states → Invite Squad/copy/system share → legal placeholders → Profile content tabs → locked Achievements → Trust Score → Edit Profile fields/photo/date/gender/country/interests/Save. These come from the written request, not a claimed review of the recording.

Once access is restored, review the entire 75-second recording, record actual timestamps, run the three viewport sizes, capture screenshots, compare each evidenced screen, and correct differences. Complete real UI copy/share and profile save/reopen checks with minimal reversible writes. Do not sign off visual acceptance before this work.

## MANUAL QA

Use [local Profile](http://localhost:8081/#/profile).

1. Open Profile.
2. Test Nitro Store gate and Retry.
3. Open Settings.
4. Toggle System/Light/Dark and reopen to verify persistence.
5. Open Liked Activities.
6. Like an Activity, confirm it appears, then undo.
7. Save an Activity, confirm Saved Items, then undo.
8. Open Invite Squad and test copy/share; do not create a referred account.
9. Open Edit Profile.
10. Change one harmless profile field/interest.
11. Save, reopen, confirm persistence, and restore the original values.

NOT READY — ONLY THIS GENUINELY EXTERNAL BLOCKER REMAINS: the Mac is locked and macOS denies access to the reference video, preventing full recording review and required mobile-browser visual/interaction QA.
