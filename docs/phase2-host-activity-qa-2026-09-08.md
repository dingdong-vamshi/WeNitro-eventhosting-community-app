# WENITRO ACTIVITY UI REBUILD + AUTH FALLBACK

September 8, 2026. App: `/Users/vamshipendyala/Desktop/wenitro-phone-app-`. Supabase: `klyjzbisgycegkkacbjw`.

The frontend is local and ready for visual/manual QA. No commit, push, App/Admin deployment, emulator, new Auth identity, OTP send, or persistent social test record was made. Two explicitly scoped database migrations were applied to the specified Supabase project; this is the only remote implementation change.

## Baseline and scope

- September 8 splash, intro artwork, Google Welcome, loading, profile completion, and first Feed designs preserved. Welcome gained one secondary fallback action.
- Existing Email/Phone screens and auth services reconnected through `authFallback` and `authSignup` routes. Established completed users go to Feed, including legacy accounts without DOB.
- Protected users 34 (Priya), 35 (Suchit), 44 (Vamshi phone), 47 (Vamshi email) still have `onboarding_completed=true`; verification flags remain 1, 1, 0, 0 respectively. No passwords, identities, classifications or provider links changed.
- Partner V1 remains paused. Hash comparison: all 12 Partner/registration source and migration files unchanged. The original `CreateActivityScreen` function is byte-for-byte unchanged against the start-of-run App backup. Partner accounts retain that screen and their existing paid-hosting gate. The reconstructed three-step form is used for Individual hosting.
- Post Vibe and Create Community cards route to their existing flows. Admin was not edited.

## Reference review and fidelity

Source: `/Users/vamshipendyala/Downloads/WhatsApp Video 2026-09-08 at 14.07.39.mp4`, 101.25 seconds, 576×1296, approximately 59.94 fps, no audio stream.

**Continuous full-video watch: NO.** Available inspection exposed decoded frames. The complete timeline was reviewed using 202 frames at 2 fps, nine contact sheets, and enlarged interaction frames. This is not a normal continuous playback watch and cannot certify exact animation timing or native keyboard behavior.

Observed sequence: Feed → Create & Share → Find a Partner → system image picker → Edit Photo/crop → Access & Privacy → visibility/age/gender dialogs → Categories & Venue → location search/select → scheduled or date-later mode → Host Now. The reference's failed final HTTP request was not reproduced as product behavior.

Centralized evidenced categories (11): `[QA] Automation`, Business, Career, Creative, Education, Entertainment, Fitness, Food, Jobs, Music, Networking. This is the visibly exposed list, not a claim to the complete production taxonomy. Source: `src/domain/host-activity.ts`.

Visual comparison: all three steps match the observed hierarchy, navy surfaces, purple CTA/focus, three progress positions, compact footer navigation, and dialogs. Web uses functional browser datetime controls and a real canvas cropper; native uses Expo's picker/editor and native date/time picker. Pixel-perfect animation/native keyboard equivalence remains manual QA.

## Backend mapping audited before migration

| Reference control | Existing representation | Implementation |
| --- | --- | --- |
| Title, description | `tbl_events.title`, `description` | Existing create/update RPCs |
| Cover photo | `activity-media`, event `media` metadata | Local preview/crop first; existing upload service at publish |
| Visibility | `visibility_type` | Public, Private and Squad; Squad means existing `tbl_friends` connections with host, either direction |
| Approval Requirement | `join_type` | Existing `direct` / `approval` join and host approval services |
| Verified Membership | `verified_only`, users `isverified` | RPC writes existing field; participant trigger enforces verification |
| Participant Limit | `max_participants` | Explicit null = unlimited; positive integer = capacity |
| Age Restriction | `age_min`, `age_max`, users `dob` | Inclusive bounds; missing DOB cannot join an age-restricted activity |
| Gender Preference | `gender_preference`, users `gender` | Null, male, female, non_binary; enforced on participant entry |
| Paid Activity | `is_paid`, `price`, `currency` | Existing Partner gate and Cashfree flow preserved; Individual can publish free only |
| Category | `tbl_categories`, `tbl_event_categories` | Existing create/update category bridge |
| Venue | `location`, `display_location`, `latitude`, `longitude` | Actual selected Photon/OSM result |
| Instructions | `location_instruction` | Separate text field |
| Schedule | `event_start_time`, `event_end_time`, `registration_close_time` | Date-later writes null; browser/native date controls otherwise |
| Draft | Device AsyncStorage, keyed by user id | Autosave, explicit Draft, Save & Exit, back/forward restore; not a remotely published draft |

No replacement Activity table and no new Activity columns were needed. Existing columns were omitted by the previous write RPCs; the migration extends those RPCs and adds targeted validation/enforcement.

Applied migrations (local filenames match the remote ledger):

- `supabase/migrations/20260908090835_profile_onboarding_completion.sql`: missing username-check and profile-completion RPCs, authenticated identity checks, case-insensitive username collision guard. Does not update established users during migration.
- `supabase/migrations/20260908090857_phase2_host_activity_fields.sql`: existing RPC field mapping, null capacity, participant restriction trigger, Squad visibility helper/read policy, existing activity read helpers extended consistently.

Generated `src/types/database.generated.ts` from the actual project after application.

## Functional results

| Area | Result | Evidence / scope |
| --- | --- | --- |
| Google primary and secondary fallback | PASS | Browser Welcome retains Google and exposes the secondary action |
| Email Login, Phone Login, Email Signup, Phone Signup | PASS for rendering and service wiring | Browser inspected all four; existing auth suite passes. Fresh password login and real OTP delivery were not performed in this run |
| Existing session and legacy routing | PASS | Existing Vamshi session restored to real app; protected DB rows unchanged |
| Google provider | DISABLED | Public Auth settings: google=false, email=true, phone=true, disable_signup=false, email/phone autoconfirm=false |
| Host landing | PASS | Three cards and compact hosting navigation visible |
| Title / description | PASS | Controlled inputs, 50-character title counter/limit and required validation |
| Cover / Crop/Edit | PASS on web | Local file picker, cancel, zoom, rotate, confirm, preview, remove; no remote upload from editing |
| Visibility / approval / verified toggle | PASS | All visibility choices and toggle state observed; DB enforcement assertions pass |
| Capacity / age / custom age / gender | PASS | Unlimited and numeric model; custom 20–45; reversed range blocks Save; all four gender choices shown |
| Paid Activity | PASS for preserved gate | Price appears; Individual cannot continue paid. No payment transaction or new Partner development |
| Category search | PASS | 11 visible reference categories; filtering and no-results state checked |
| Location search | PASS live | Actual Pune results and coordinates from Photon; selection persists |
| Current Location | PASS recovery, live fix UNVERIFIED | Browser permission wait times out after 15 seconds and permits retry/search. Controlled service tests cover granted/denied GPS and reverse lookup; physical GPS was not obtained |
| Location instructions | PASS | Separate editable field survives steps/reload |
| Decide Date Later | PASS | Schedule hidden, deadline Not set, null database fields |
| Start / End / Join Deadline | PASS | Browser input events persist; earlier end and deadline after start disable Host Now |
| Host Now | PASS at service/database level | Real create RPC and persisted fields verified inside a rolled-back transaction; no permanent browser submission |
| Duplicate taps / known committed save | PASS | Immediate submission lock; committed event receipt saved locally before detail read; reload failure offers Open Activity and retains its cover |
| Draft/back navigation | PASS | Fields restored across steps, hot reload, and Save & Exit |

A network interruption before the server returns an activity ID remains an ambiguous save outcome; the underlying create RPC does not have a server idempotency key. Check hosted activities before manually resubmitting after such an interruption. The new recovery specifically prevents resubmission after a known successful commit.

Location provider: lightweight public Photon endpoint with debounce, cancellation, cache, bounded waits and attribution. An owned endpoint can be configured with `EXPO_PUBLIC_PHOTON_URL` for a public release; no private provider credential is exposed. Public-demo availability is outside app control. Reference: https://github.com/komoot/photon.

## Tests, builds and data footprint

- `npx tsc --noEmit`: PASS, zero errors.
- `CI=1 npx expo export --platform web --output-dir /tmp/wenitro-phase2-export --max-workers 2`: PASS.
- `node scripts/host-activity-test.mjs`: PASS. Real domain/service functions under mocked transport; field mapping, validation, committed-cover retention, precommit cleanup, GPS permission/provider branches. No network/data writes.
- `node scripts/onboarding-profile-test.mjs`: PASS.
- `node scripts/onboarding-google-auth-test.mjs`: PASS.
- `node scripts/partner-auth-test.mjs`: PASS, 12 mocked auth checks.
- `node scripts/registration-questions-test.mjs`: PASS, 21 assertions.
- `supabase/tests/phase2-host-activity.sql`: PASS, 20 assertions under authenticated roles; one transaction and ROLLBACK. Tests include real creation/mapping, invalid writes, nonowner rejection, unverified/missing-DOB rejection, approval pending/leave, Individual paid gate, Squad audience consistency, username collision and identity substitution.
- Final database count: 123 events; zero retained `[QA] Phase 2 transactional check` rows. No persistent participant/user/test events retained. Transactional inserts may advance sequences despite rollback.
- Browser: functional walkthrough and screenshots at 390×844, 360×800, 412×915; no horizontal overflow observed. Host form console error/warning check empty at final check.
- Native Android build/emulator: not required and not launched. Native soft-keyboard and system-picker behavior remain device/manual checks.

## Security checks

RLS remains enabled on users, events and participants. Existing policies preserved; one authenticated Squad read policy added with friendship checks. Existing age/gender/verified fields now have participant-entry enforcement; host editing still checks ownership. Supabase advisors remain at the previous baseline (63 public security-definer function warnings and the existing leaked-password-protection warning); this task did not expand into a general security cleanup.

No Google Client Secret, Fast2SMS secret, Cashfree secret or Supabase service-role credential introduced into frontend source or export. Existing non-public Vercel environment token was specifically checked and absent from the web bundle. Cashfree functions and Sandbox/server-derived amount architecture unchanged; no payment/Edge Function deployment.

## Manual QA guide

1. Open the local app at `http://localhost:8081`. In a separate browser without a session, use Welcome → **Use email or phone instead** → Email, then your existing email/password.
2. For phone login choose Phone, enter the existing phone identity, Send OTP once, then verify the received code. Do not create a replacement identity for an established user.
3. Open Host → Host an Activity using an Individual account. Partner accounts intentionally retain the paused existing hosting UI.
4. Compare Step 1 heading, spacing, counter, focused input border, cover tile/crop and description to the video.
5. Compare Access & Privacy dialogs, switches, dividers, capacity and custom age controls. Return Paid Activity to OFF for an Individual account.
6. Compare category search, real location search/change, instructions, date-later mode and all three schedule fields.
7. Move back/forward, use Draft, then Back → Save & Exit and reopen. Your form values should remain. A local QA draft may already exist in the current signed-in browser.
8. If you choose to save one final activity: use a clear `[QA]` title, Free, Private, Open to All, a suitable age range and future schedule (or Decide Date Later). Tap Host Now once. Verify the resulting activity details and hosted listing. Do not publish multiple test activities or initiate a payment just to inspect the UI.

## Files from this run

Modified: `App.tsx`, `src/components/onboarding/reference-screens.tsx`, `src/services/wenitro.ts`, `src/services/activities-production.ts`, `package.json`, `package-lock.json`, regenerated database types.

Added: `src/components/hosting/host-activity-screen.tsx`, `cover-editor.web.tsx`, `cover-editor.tsx`, `src/domain/host-activity.ts`, `src/services/activity-location.ts`, `scripts/host-activity-test.mjs`, the two migrations, rollback SQL test and this report. The repository already had extensive local changes before this task; none were committed or discarded.

Implementation documentation consulted before coding: Expo SDK 57 versioned docs (https://docs.expo.dev/versions/v57.0.0/), ImagePicker (https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), Location (https://docs.expo.dev/versions/v57.0.0/sdk/location/).

REAL HOST ACTIVITY FLOW REBUILT — READY FOR MY VISUAL QA
