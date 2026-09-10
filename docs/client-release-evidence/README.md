# Client release evidence — 10 September 2026

## Status and boundaries

Local visual and representative functional checks: PASS. Production checks: pending deployment.

Screenshots are real in-app-browser captures. `local-onboarding-*` and `local-welcome-component.png` use the existing isolated component preview, not an authenticated session. Other `local-*` files show the real app backed by the configured Supabase project. No screenshot proves an untested backend operation.

## Visual coverage

- Home: `local-home.png`, `local-home-extended.png`, `local-home-430.png`, `local-home-desktop.png`.
- Activities: `local-activities.png`, `local-activity-detail.png`, `local-activity-comments-vibes.png`, `local-feedback-mobile.png`, `local-post-vibe.png`.
- Communities: `local-communities.png`, `local-create-community.png`, `local-community-detail.png`, `local-community-chat.png`.
- Social/profile: `local-vibes.png`, `local-personal-chat.png`, `local-activity-chat.png`, `local-profile.png`, `local-public-profile-reviews.png`.
- Appearance/rewards: `local-settings-system.png`, `local-verification-points.png`.
- Intro/Welcome: `local-onboarding-slide-1.png`, `local-onboarding-slide-2.png`, `local-welcome-component.png`.

Home viewport sizes were read from the browser: 390 × 844, 430 × 932, 1440 × 900. Other captures include mobile and centered desktop views; they are not claimed to cover every screen at every width. Light, Dark and System settings were selected and checked. Blank/empty content was not replaced with fabricated reviews or posts.

## Functional evidence

| Check | Result and limitation |
| --- | --- |
| Email/password and restored sessions | Two existing QA members reached their actual feeds; no account created |
| Google | User-assisted local login reached the existing Google account's feed; authenticated login URL normalized to `#/feed`. Chooser cancellation/timeout branches were isolated tests, not repeated real Google attempts |
| Discovery | Server search found `[QA] Final E2E Activity`; Load more increased 30 to 60 visible records; stale-query pagination results are discarded |
| Hosting | Normal form checked without publishing; cost flags tested independently with rollback-only database assertions; numeric paid architecture unchanged |
| Activity comment | One QA comment persisted on existing activity 166 |
| Add Vibes | Single-selection photo/video picker opened; a local logo was selected and the correct activity remained attached. No new public Vibe was published |
| Completed-activity feedback | QA member 34 submitted then updated activity 105 feedback. Database count remained one and latest text persisted. Member 35 could update zero rows belonging to member 34 |
| Verification | Existing QA member 35: confirmed email + private photo = 20 points; replacement/reload stayed 20. Missing and cross-account private paths rejected; private bucket/object access verified |
| Messaging | One personal message and two community-chat messages on existing QA conversations reached the other member and persisted. Activity chat opened existing history. This is delivery/persistence coverage, not a measured latency guarantee |
| Profiles | Own/public profile, Karma-to-Reviews, unavailable social-link notice, actual activity list and existing saved/liked items inspected |
| Community | Existing detail/creator/members, creation form, posts view, photo/video/poll chat content checked; no community created |
| Admin | Local production build opened existing Users, Activities, Communities, Verification and Transactions; no Admin writes |

## Build and backend checks

- `npx tsc --noEmit`; Expo web export; actual `npm run vercel-build` packaging.
- Isolated suites: Google web, Google native-style exchange, onboarding profile, hosting, registration questions, Vibes, privacy, profile. These do not issue real authentication/payment/SMS requests.
- Admin type check and Next production build passed, with no source changes.
- Correct Supabase project: `klyjzbisgycegkkacbjw`; active/healthy. Applied verification rewards, independent activity cost flags and owner-only feedback update changes. Local migration versions match the remote history.
- Non-public local environment values and high-confidence secret patterns were checked against source and generated web JavaScript; no leaks found. Public client configuration is intentionally present.
- Pre-existing Supabase advisor findings were not broadly remediated in this product pass. “Supabase PASS” refers to access, scoped changes and targeted authorization/idempotency checks, not a clean bill of health for the entire legacy database.

No new Cashfree or SMS transaction was initiated. Native SOS, native camera/Google behavior, Partner work and every-platform exhaustive testing are outside this web-release verification.
