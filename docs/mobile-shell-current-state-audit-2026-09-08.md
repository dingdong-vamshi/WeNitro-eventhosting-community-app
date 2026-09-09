# WENITRO MOBILE-SHELL + CURRENT STATE AUDIT

September 8, 2026. Consumer app: `/Users/vamshipendyala/Desktop/wenitro-phone-app-`. Supabase project: `klyjzbisgycegkkacbjw`.

## MOBILE-ONLY SHELL

Global shell: **PASS**

Maximum App width: **430 CSS px**

Feed desktop: **PASS**

Host desktop: **PASS**

Community Chat desktop: **PASS**

Profile desktop: **PASS**

Settings desktop: **PASS**

Vibes desktop: **PASS**

Bottom navigation constrained: **PASS**

Sheets/modals constrained: **PASS**

Horizontal overflow: **NONE**

1440px still looks like phone app: **YES**

1920px still looks like phone app: **YES**

Android Studio used: **NO**

The consumer app now enters through one `MobileAppShell`. It uses 100% width through 430px, remains 430px above that, fills the viewport height, and centers against the existing navy background. Portal-based sheets, dialogs, location search, video, crop/editor, onboarding pickers, Community Create, and Share to Chat use the same overlay frame.

Measured browser results:

| Viewport | App shell | Bottom navigation | Horizontal overflow |
| --- | --- | --- | --- |
| 390×844 | 390px at x=0 | 390px at x=0 | none |
| 430×932 | 430px at x=0 | 430px at x=0 | none |
| 768×1024 | 430px at x=169 | 430px at x=169 | none |
| 1024×768 | 430px at x=297 | 430px at x=297 | none |
| 1440×900 | 430px at x=505 | 430px at x=505 | none |
| 1920×1080 | 430px at x=745 | 430px at x=745 | none |

At 1440×900 the Community Create portal and sheet both measured 430px from x=505 to x=935. Browser screenshots were inspected at 390×844 and 1440×900 for Feed, Host, Community Chat, Profile, Settings, Vibes, Host Activity, and Community Create.

## WHAT WE HAVE BUILT

- Global mobile-only shell — every consumer route, loading state, navigation bar, modal, sheet, cropper, and chat composer should stay within the centered phone-width app.
- Onboarding — splash, intro artwork, swipe/Skip/Next, Google Welcome, profile completion, and first-time Feed were rebuilt from the supplied references.
- Google Welcome — the real Google Identity Services button is the primary action; Google ID-token exchange routes through Supabase without exposing a client secret.
- Email/Phone fallback — existing email and phone login/signup routes remain available from Welcome and continue to use the existing identities.
- Profile Completion — avatar, name, username availability, optional DOB/gender, validation, and completion persistence are wired to the authenticated profile.
- Feed — real account points, filters, nearby/today/tomorrow discovery, Activity cards, likes, host details, and Search should display within the phone shell.
- Search — Activities, People, and Communities use scoped real-data search with debounce, loading, empty, and pagination behavior.
- Host landing — Host Activity, Post a Vibe, and Create a Community remain the same three compact mobile cards at every browser width.
- Host Activity — the three-step Individual flow includes draft restore, title/description, cover crop, access/privacy, participant rules, categories, real location search, scheduling, and safe publish recovery.
- Activity safeguards — visibility, approval, verification, age, gender, capacity, scheduling, and Individual free-only rules are enforced by the existing data model and September 8 migrations.
- Community creation — the mobile sheet has name/description validation, avatar crop/remove, searchable shared categories, duplicate-submit protection, and direct success routing into its chat.
- Community chat — real text messages, realtime subscription, history pagination, read state, media attachment paths, chat options, and reopen/persistence are wired to the existing room.
- Community polls — 2–6 options, idempotent creation, one vote per member, vote changes, percentages, totals, and permission checks use the existing Community room.
- Community Info and Settings — details, members/search, profile navigation, sharing, edit, approval requests, verified-only, admins-only, and guarded delete are wired to real membership and permissions.
- Messages — Chats, Groups, and Communities tabs plus All/Joined/Created Community filters use real inbox relationships.
- Profile — identity, real Activities/Squad/Nitro metrics, locked achievements, truthful trust signals, and My Vibes/Upcoming/Completed/Drafts tabs are present.
- Edit Profile — name, username, read-only auth email, bio, occupation, About, DOB, gender, nationality, interests, avatar, validation, and persistence are implemented.
- Settings — persisted System/Light/Dark appearance, Privacy, storage explanation, Invite Squad, Saved, Liked, support, legal placeholders, deactivation confirmation, logout, and current app version are present.
- Privacy — profile/email/phone visibility, messaging permission, and online-status preferences are stored and enforced server-side.
- Saved and Liked — real account-scoped collections, empty/loading states, navigation, save/unlike behavior, and supported Vibe entries are retained.
- Invite Squad — stable profile referral link, clipboard copy, native/web share path, and incoming first-touch referral capture are implemented; rewards are clearly marked as coming soon.
- Nitro Store gate — actual points determine the 500-point gate; unavailable values show an error and no fake catalog or balance.
- Vibe entry — eligible hosted/joined Activities are loaded, a real no-events state is shown, and the existing successful editor/upload/publish path is preserved.
- Notifications and existing personal/group chat — current production flows remain connected and now inherit the global phone shell.

## GOOGLE

Client ID: **CONFIGURED**

Client Secret: **CONFIGURED SERVER-SIDE** — Supabase does not expose the value through its public status endpoint, and the final frontend/export scan found no client-secret pattern.

Supabase provider: **ENABLED** — current `/auth/v1/settings` returned HTTP 200 with Google enabled.

Supabase project access: **WORKING** — project status is `ACTIVE_HEALTHY`; scoped SQL and migration-ledger reads succeeded.

Real Google login: **NOT TESTED END TO END**

Current exact blocker: **OTHER** — the current Codex in-app browser loaded Google Identity Services and rendered the real account button, but its single click opened no account chooser and returned no credential callback or console/network error. The Google Cloud project that owns the client is still unavailable to the connected account, so origins, consent/test users, and native client registrations cannot be independently inspected. This is not a Supabase blocker.

Google ready for my manual test: **YES — use a regular supported Chrome session at `http://localhost:8081`; if it fails, the owning Google Cloud account must inspect that existing OAuth client.**

## PREVIOUSLY PENDING BROWSER QA

Community avatar/create/success: **PASS** — current sheet visual checked; the existing upload/create/success route was previously exercised with one cleaned-up QA Community.

Community photo/video: **MANUAL NATIVE QA REQUIRED** — source and database permission paths exist, but the Codex browser cannot complete the operating-system media chooser without creating new media records.

Community reopen/persistence: **PASS** — an existing Community was reopened from the Communities inbox and its persisted message reloaded.

Community member profile navigation: **PASS** — the real member row opened its profile route.

Community poll sheet: **PASS** — Chat Options and the 2–6 option poll composer opened in the live browser without a write; server create/vote assertions remain covered by the prior rollback test.

System share: **MANUAL NATIVE QA REQUIRED** — the browser invoked the share path but the in-app browser exposed no observable system share sheet.

Profile visual comparison: **PASS** — inspected at 390×844 and 1440×900.

Appearance persistence: **PASS** — Light persisted across a route remount; System was restored afterward.

Invite Squad copy: **PASS** — live browser returned “Invitation link copied.”

Invite Squad share: **MANUAL NATIVE QA REQUIRED** — same system-share limitation as above.

Profile/Edit Profile visual comparison: **PASS** — both loaded in the live 390px viewport; a no-change save completed successfully without altering profile values.

## STILL NOT IMPLEMENTED / INTENTIONALLY PENDING

- Partner V1 — paused as requested.
- Google login proof — a real account chooser, Google credential, Supabase Google session, new/existing-user routing, logout/login, and session restoration still need one regular-browser/native manual test.
- NitroBot — no configured AI endpoint exists; the app labels it coming soon.
- Achievements engine — achievements remain locked and are not invented.
- Final legal content — Privacy Policy and Terms remain explicit placeholders pending approved copy.
- Referral reward backend — automatic association and 20-point crediting are not implemented; the UI does not promise an immediate reward.
- Nitro Store catalog/redemption — only the real 500-point eligibility gate exists.
- Android-native media pickers, crop feel, Google chooser, keyboard behavior, and system share sheets — require manual native QA.

## BUILDS

TypeScript: **PASS** — `npx tsc --noEmit`, zero errors.

Web export: **PASS** — fresh Expo SDK 57 export at `/tmp/wenitro-mobile-shell-export-final`.

Regression checks: **PASS** — Google isolation, onboarding profile, Host Activity, Vibe recovery/eligibility, privacy mapping, and Phase 5 profile/referral tests all passed without remote writes.

## SOURCE CONTROL

Commit: **NO**

Push: **NO**

Deploy: **NO**

Partner: **PAUSED**

The current reconstruction remains a large local uncommitted worktree. This shell pass added one root shell component and updated only consumer overlay/layout integration. No Admin or Partner source was edited, and no Supabase write was made in this pass.

## FINAL MANUAL REVIEW CHECKLIST

### AUTH

- Check splash, intro swipe/Skip/Next, Google Welcome, email/phone fallback, profile completion, and first-time Feed.
- Try one real Google account in regular Chrome; confirm existing/new-user routing and session restoration.

### FEED

- Check filters, Activity cards, real points, likes, Search, Activity Detail, and Notifications.
- Confirm the same 430px phone layout on tablet and desktop.

### HOST

- Check compact Host cards and all three Host Activity steps, dialogs, crop, categories, location, scheduling, draft restore, and guarded publish.

### COMMUNITY

- Check create/avatar/success, chat text/media, reopen persistence, polls, Info, members, settings, pending approvals, permissions, and delete confirmation.

### PROFILE

- Check real stats, trust signals, content tabs, Store gate, Edit Profile fields/avatar, and save/reopen behavior.

### SETTINGS

- Check appearance persistence, Privacy, Saved/Liked, Invite copy/share, support status, legal placeholders, deactivation confirmation, and logout.

### VIBES

- Check eligibility loading/no-events, existing editor publish path, viewer gestures/video, actions, and phone-width action rail.

### CHAT

- Check Chats/Groups/Communities tabs, personal/group threads, Community composer, keyboard clearance, sheets, and phone-width bottom navigation.

MOBILE-ONLY UI FIXED — READY FOR FULL MANUAL REVIEW
