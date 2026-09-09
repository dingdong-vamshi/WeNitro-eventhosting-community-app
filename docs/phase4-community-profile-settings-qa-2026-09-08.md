# WENITRO REAL COMMUNITY + PROFILE/SETTINGS REBUILD

Implementation and server checks are complete. Final mobile-browser acceptance is **not complete**: computer use reported that the Mac was locked on three attempts. No Phase 4 implementation screenshots were captured, and no visual MATCH claim is made.

Below, PASS identifies implemented code and completed source/server checks. It does not imply the outstanding browser interactions or visual comparison passed. Browser-only acceptance checks are marked FAIL (unverified).

## REFERENCES

- Short video reviewed fully: YES — complete 50.10-second timeline, sequential 4-fps inspection.
- Long Community video reviewed fully: YES — complete 126.19-second timeline, sequential 4-fps inspection.
- All evidenced screens inventoried: YES — `docs/phase4-reference-inventory.md` was created before implementation.
- This was frame-by-frame timeline inspection, not continuous playback. All 705 frames across 23 contact sheets were reviewed; full-size details informed implementation.

## FEED

- Header: PASS (implemented); visual comparison pending.
- Nitro card: PASS — actual account points; no rewards transactions or fake Shop balance.
- Filter chips: PASS — All, Trending (participation), Nearby (device location, 25 km), Today, Tomorrow.
- Activity cards: PASS — real activities, Storage cover URLs, dates, location, host and participant counts, persisted likes, existing detail navigation.

## SEARCH

- Activities: PASS — existing activity discovery service, targeted query, pagination.
- People: PASS — scoped search through profile RLS, minimal projected fields.
- Communities: PASS — existing Community discovery service.
- Search: PASS — 350 ms debounce, two-character minimum, 20-result pages, no invented initial suggestions.
- Browser acceptance: FAIL (unverified).

## MESSAGES

- Chats: PASS — existing personal conversations; debounced people search; existing detail screen preserved.
- Groups: PASS — existing group/event conversations; existing group/stories tools remain accessible.
- Communities: PASS — real avatar/name/category, latest message preview and time; floating create action.
- Community filters: PASS — All/Joined/Created use account relationships; tab/filter selection retained when returning.
- Browser acceptance: FAIL (unverified).

## CATEGORY TAXONOMY

- Reference categories captured: 22.
- Current production list (21): Business, Career, Creative, Education, Entertainment, Fitness, Food, Jobs, Music, Networking, Outdoors, Party, Politics, Professional, Social, Social Work, Socialize, Sports, Study, Technology, Travel.
- [QA] Automation classification: QA-ONLY — current database entry is used by `scripts/qa-cross-app.mjs`.
- Centralized category source: PASS — `src/domain/interest-categories.ts`, re-exported for Host Activity and reused by Community.
- Existing `Career ` database name is matched after trimming, avoiding a duplicate category during creation/editing.

## COMMUNITY CREATE

- Modal/sheet: PASS (implementation; visual verification pending).
- Name: PASS — shared create/edit control, required 3–100 characters.
- Description: PASS — required 10–500 characters in the shared form.
- Avatar: PASS (implementation) — existing picker, square crop, circular preview, remove, save-time upload.
- Category: PASS — centralized 21-item searchable picker with selected state.
- Create: PASS (existing persistent creation path preserved).
- Success: PASS (direct conversation navigation and dismissible success banner preserved).
- Browser creation and upload acceptance: FAIL (unverified).

## COMMUNITY CHAT

- Text: PASS — authenticated database send tested in a rollback transaction.
- Photo: FAIL (browser upload/send unverified); implementation reuses the messages bucket and chat engine.
- Video: FAIL (browser upload/playback unverified); MP4 picker/send, Play Video card, player mounted only after tapping.
- Chat Options: PASS (implemented) — Share Photo, Share Video, Create Poll, Cancel.
- Persistence: PASS (database storage); FAIL for the requested browser reopen check.
- Date grouping: PASS (timestamp-based implementation); visual comparison pending.
- Realtime: existing message subscription plus Community metadata refresh; no constant polling.

## POLLS

- Create: PASS — existing poll tables reused and linked to messages.
- 2–6 options: PASS — database validation; blank/duplicate/too-many options rejected.
- Post: PASS — submission UUID and server idempotency prevent duplicate polls/messages.
- Vote: PASS — one active vote per member; deliberate option changes replace that vote.
- Percentages: PASS — computed from database votes.
- Total votes: PASS — database-derived; vote change retained total one in the test.
- Security: PASS — outsiders blocked; ordinary members cannot create announcements; vote identity spoof rejected; invalid options rejected.
- Browser poll sheet/voting/reopen acceptance: FAIL (unverified).

## COMMUNITY INFO

- Details: PASS (implementation and real Community metadata).
- Members: PASS — scoped existing membership service and server member counts.
- Search members: PASS (scoped local filter).
- Profile navigation: FAIL (browser unverified); privacy-checked member profile, contact and existing hosted activity functionality are wired.
- Share: FAIL (system share interaction unverified); real name and ID are wired.
- Deep link: PASS (implemented) — `wenitro://community/join/<id>` and existing Community link shape; browser hash join shape supported. Device/browser navigation remains unverified.

## COMMUNITY SETTINGS

- Edit Profile: PASS — authorized server edit tested; shared form implemented.
- Verified Only: PASS — actual `isverified` checked at join and approval.
- Admin Approval: PASS — pending request is not membership; approval grants membership.
- Pending Requests: PASS — existing request table reused; scoped list, approve/reject wired.
- Admins Only: PASS — database guards text/media/polls and Community posts.
- Delete: PASS — manager check and explicit confirmation; cascade delete tested only on the existing designated QA community inside a rolled-back subtransaction.
- Browser settings/dialog acceptance: FAIL (unverified).

## PROFILE

- Layout: FAIL (visual comparison blocked); reference hierarchy implemented.
- Stats: PASS — own account metrics RPC tested; Activities/Squad/Nitro are real counts/points. No Karma model exists, so it remains zero.
- Edit: PASS — existing EditProfile implementation preserved exactly.
- Achievements: PASS — actual awarded badges or locked future state; none invented.
- Trust Score: PASS for truthful fallback — no configured /100 scoring model exists, so 0 is shown with an explicit explanation. Phone/Aadhaar/social/activity/rating checks use actual data. The existing rating is not relabeled as a /100 score.
- Content Tabs: PASS (implemented) — own Vibes and eligible/hosted activity sources, real Drafts, pagination and loading states; browser acceptance unverified.

## SETTINGS

- Appearance: FAIL (browser persistence/OS-change verification pending); System/Light/Dark and persisted preference are implemented.
- Privacy: PASS (server path); selection-sheet visual acceptance pending.
- Cookie/Storage: PASS — truthful essential-storage explanation; optional tracking is not claimed to be enabled.
- Invite Squad: FAIL (system sharing unverified); real profile deep link wired.
- Saved: PASS (existing account source and item navigation wired); browser unverified.
- Liked: PASS (existing account source and item navigation wired); browser unverified.
- NitroBot: FAIL — no existing configured AI endpoint was found. The screen says so and offers Send Query. No provider was invented.
- Send Query: PASS (implementation) — existing `tbl_user_feedbacks` via authenticated RPC. No real support message was submitted for QA.
- Legal: FAIL — approved final documents were not provided. The existing `public/privacy/index.html` is an unfinished technical notice. The app does not claim that placeholder copy is legally final.
- Deactivate: PASS (implementation only) — explicit confirmation, persistent deactivation flag, hidden profile and identity access guard; future sign-in cannot silently reactivate it. **No real QA account was deactivated or tested for deactivation.**
- Logout: PASS — existing sign-out/session flow preserved; browser interaction unverified.
- Version: current Expo app metadata (1.0.0), not the recorded app version.

## PRIVACY

- Profile Visibility: PASS — Public/Squad Only; Squad access uses existing friendships.
- Email Visibility: PASS — Everyone/Squad Only/Private (None), server masking.
- Phone Visibility: PASS — Everyone/Squad Only/Private (None), server masking.
- Messaging Permissions: PASS — enforced on direct conversation creation and sending, including existing rooms.
- Online Status: PASS — server presence publication gate, filtered visible peers, client tracking preference.
- Server enforcement: PASS — rollback assertions passed. Corrected legacy contact enum mismatch (`everyone/none` storage versus `public/private` client aliases).
- Browser reload/cross-device verification: FAIL (unverified).

## VIBE ENTRY

- Loading active events: PASS — existing implementation preserved exactly.
- No-events state: PASS — existing implementation preserved exactly.
- Current working successful Vibe editor: PRESERVED — AST comparison confirms no changes to PostVibeScreen or PostVibeEntry.

## BUILDS

- TypeScript: PASS — `npx tsc --noEmit`, zero errors.
- Web: PASS — production export at `/tmp/wenitro-phase4-export-final`, newer than all current source files.
- Mobile Browser: FAIL — Mac locked; required 390×844, 360×800, 412×915 checks and all 13 implementation screenshots remain pending.
- Android Studio used: NO. No emulator or native build session was started.
- Local preview: HTTP 200 at `http://localhost:8081/`.
- Google client secret/service-role JWT scan: PASS — zero findings in the two exported JavaScript bundles.

## SOURCE CONTROL

- Commit: NO.
- Push: NO.
- Deployment: NO App/Admin/frontend deployment.
- Supabase: seven authorized migrations applied only to `klyjzbisgycegkkacbjw`; matching migration files saved locally.
- Partner: PAUSED / UNCHANGED — all 12 protected file hashes match. Existing create/update Activity SQL differs only in category-name normalization; payment and Partner authorization statements are unchanged.

## Verification evidence

- `scripts/phase4-privacy-test.mjs`: PASS, actual mapper exercised against legacy database enum values; no network.
- `supabase/tests/phase4-community-privacy.sql`: PASS, real authenticated-role RPC/RLS tests in a rollback transaction using existing designated QA Community 132.
- Existing onboarding Google/auth, onboarding/profile, Host Activity, Vibe, Partner (12), registration-question (21) checks passed.
- Exact Phase 3 source preservation verified for Activity Detail, personal/group ChatScreen, Notifications, login/signup, EditProfile, Verification, PostVibeScreen, PostVibeEntry and VibeEntryState.
- No new QA Community or media upload was persisted. Each test transaction used one temporary poll and one text in the existing QA community, then rolled back.
- Final counts: 16 Communities, 116 messages, 4 polls, 6 votes — unchanged from this phase's audit. QA Community 132 still has its original three members. Protected accounts 34/35/44/47 remain active, onboarded and retain their verified states.
- Existing advisor baseline unchanged: [63 authenticated SECURITY DEFINER findings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [one leaked-password-protection finding](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). New exposed RPCs use invoker wrappers and private authorized implementations; new RPC execution is denied to anon.
- Runtime references consulted: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Supabase database functions](https://supabase.com/docs/guides/database/functions).

## Manual QA guide

Use **http://localhost:8081/#/feed**. Refresh the tab after unlocking the Mac. No Android Studio is required.

1. Feed: check the header, real points card, filters, likes and activity navigation. Nearby requests location and filters within 25 km.
2. Search: type at least two characters; check Activities, People and Communities; clear the field.
3. Messages: check Chats/Groups/Communities and All/Joined/Created filters.
4. Create one Community: name, description, avatar crop/remove, searchable category; verify the success banner and direct conversation.
5. Send one text message; leave and reopen the conversation.
6. Create one poll with 2–6 options; vote, change the choice, and reopen. Total votes must not increase when changing a vote.
7. Share one photo and one small MP4; verify the video loads only when Play Video is tapped.
8. Community Info: check details, member count/search, member profile and system share link.
9. Community Settings: edit the Community; inspect toggles and pending requests. Open Delete Community confirmation and cancel.
10. Privacy Settings: change each audience and Online Status, leave/reopen, then reload. Use an existing second account for audience checks if desired.
11. Profile: verify account values, Edit profile, badges/locked achievements, truthful trust checks and all four content tabs.
12. Settings: test System/Light/Dark and persistence, saved/liked navigation, support and legal status. Open Deactivate confirmation and cancel; do not deactivate a real QA account. Logout only when ready to end the session.

Required final visual comparison remains: Feed, Search, Messages Chats, Messages Groups, Messages Communities, Create Community, Community Conversation, Poll, Community Info, Community Settings, Profile, Settings, Privacy, at all three requested sizes where appropriate.

NOT READY — ONLY THIS GENUINELY EXTERNAL BLOCKER REMAINS: the Mac is locked, preventing required browser interaction, screenshots and visual comparison.
