# CHAT001 App / PDF regression agent — local implementation handoff

Branch: `codex/chat001-app-audit`, baseline `a47519f`. No push, deployment, production browser action, or live mutation performed by this agent. This is a local implementation report, not final acceptance.

## Changes

- Shared live category selectors now distinguish loading, failure, zero active categories and search misses, with retry on Home/Tribes, Home filters, Activities filters, Search, Host and Community forms. Successful catalog data survives a failed refresh; superseded responses and unmounted hooks cannot overwrite it.
- Existing Activity/Community category remains selected when later disabled/archived, with an explanatory label. Only active categories are offered for new choices. Admin agent owns the SQL fix preserving unchanged event-category associations.
- Edit Profile no longer becomes entirely unusable when its optional category lookup fails. The profile loads, existing interest IDs remain intact, and a category retry is available. Historical selected interests remain visible and can be explicitly removed; the service already updates interests by additions/removals rather than reinserting preserved IDs.
- Profile's main avatar now uses the common deterministic, Unicode-aware fallback, including failure to load an existing image URL.
- Corrected the unused shared Store eligibility helper from 500 to the newer PDF's 200 Nitro minimum, matching the already-rendered Store screen. No Hubble redemption is claimed.
- Added daily successful Activity-share observation calls for successful direct sends, completed external shares and completed private-invite shares. No call on cancel/failure. Admin agent owns the authenticated `record_activity_share` RPC and aggregation. External-share cancellation now returns `false`; the existing Vibe observation also honors that result.
- Updated existing isolated profile test dependency doubles for the new category service; did not remove their identity, validation or persistence checks.

## Local verification and limitations

`npm run typecheck` passed after implementation. `git diff --check` passed.

Two new **executable behavioral** tests passed:

- `scripts/category-catalog-client-test.mjs`: actual transpiled service query filters/order, precise QA-prefix exclusion, network failure propagation; controlled-promise hook loading/retry/cache/stale-response/unmount transitions.
- `scripts/activity-share-observation-test.mjs`: actual transpiled external share success/dismissal/Web AbortError/error, payload branding/URL; invalid observation IDs and offline failure. Three additional source checks identify post-success call sites; these checks do not simulate native OS share UIs.

Existing tests run successfully (some are mixed behavioral and source checks):

- Behavioral or mixed: activities-filter, activity-history, avatar-fallback, chat-inbox-merge, chat-ui-regression, feed-loading-state, host-activity, messages-search-performance, onboarding-google-auth, onboarding-profile, phase3-vibe, phase5-profile, phone-otp-ui, profile-community-avatars, profile-social, registration-questions, validation, workspace-loading-regression, workspace-refresh.
- Primarily source-contract checks, **not visual or production interaction proof**: acceptance-ui-contract, activity-deep-link-regression, client-home-profile, client-pdf-regression, client-readiness-contract, hero-brand-visual, onboarding-completion.

Expo's web export compiled successfully. The subsequent `vercel-build` font-copy packaging step failed because this isolated worktree uses a read-only symlink to primary `node_modules`, causing Metro to export dependency assets under a different path from `assets/node_modules`. No deployment packaging was changed to accommodate the temporary worktree. Integration must run the complete build in the primary checkout with its real dependencies. Latest share-observation edits were typechecked and behavior-tested; root will run the final integrated export/build.

No new production screenshots are claimed. All new behavior needs the integrated deployed acceptance pass. Existing evidence in the master ledger remains historical evidence and must be matched to the final build's unchanged paths or refreshed.

## Page reconciliation

All 79 source-page entries in the master ledger were read, including every semicolon clause. This is code/test reconciliation against the prior full PDF visual review recorded by root; it is not a claim that this agent independently re-rendered all PDF pages or newly exercised every production interaction. Newer PDF requirements remain authoritative. Backend, provider and Admin subrequirements are delegated as shown, not counted as frontend passes.

Legend: `UI` = existing implementation inspected through relevant components/contracts; final deployed interaction/screenshot remains with QA. `UI+fix` = touched by this local commit. `Backend` = backend agent also required. `Admin` = Admin agent. `External` = genuine provider/configuration/physical-device dependency requiring final root verification. `Coordinator` = final reconciliation/acceptance, not an implementable screen.

| Source page | Requested clauses | Scope and current verification |
| --- | --- | --- |
| A01 | Restore functional Next (the source describes its absence as a bug); appropriate spacing; three old-app onboarding screens; Skip/swipe/dots/finish/replay | UI |
| A02 | Different rotating taglines on screen load | UI |
| A03 | WeNitro email branding; Confirm your Email Address wording; confirmation links and sender configuration | UI; Backend; External subrequirement; see master provider evidence |
| A04 | Google new/existing user login; target session/profile; provider configuration and separate external callback dependency | UI; Backend; External subrequirement; see master provider evidence |
| A05 | Forgot Password email; recovery redirect; reset; subsequent login | UI; Backend |
| A06 | Phone new/existing signup; OTP send/verify; user mapping; verified state | UI; Backend; External subrequirement; see master provider evidence |
| A07 | Reduced hero height; remove outer blue surround; responsive visual proof | UI |
| A08 | Lighter hero treatment without extra blue patch; uploaded user photos; varied deterministic avatar fallback | UI+fix |
| A09 | All Activities redesigned layout; search/notification icons; search only on tap; Filter beside Activities for You; no redundant description; image fallback and full coverage; Host name/photo opens profile | UI+fix |
| A10 | Non-overlapping timeline; sensible fonts; long-press Like reveals liker identities and profile navigation | UI |
| A11 | Host/participant photos and initials; Message action; ended activity no edit/remove participant/leave with backend enforcement | UI; Backend |
| A12 | Only eligible participants comment; backend restriction; commenter identity | UI; Backend |
| A13 | Ended participant Rate Participants; nonparticipant Activity Ended; no leave | UI; Backend |
| A14 | Cancel/delete hides activity chat; stale chat writes blocked; retained history policy | UI; Backend |
| A15 | Cannot rate self; Host identified; correct No Show eligibility; Host excluded | UI; Backend |
| A16 | Two Nitro per legitimate rating; multiple rewards; dark gold congratulations popup; Nitro history; duplicate prevention | UI; Backend |
| A17 | Tribe/category pictures; no Find wording; tribe opens filtered Activities | UI+fix |
| A18 | Host Responsibly warning; explicit/misleading/hateful/discriminatory warning; prominent permanent account suspension consequence; Cancel/Continue; applicable backend content checks | UI |
| A19 | Upload Responsibly before Activity/Vibe/Community and applicable media pickers; Cancel; Continue opens picker | UI; Backend |
| A20 | Community logo and placement; Search beside Notification; consistent notification size; no permanent search; tap search/filter/back | UI+fix |
| A21 | Smaller Community cover; color fallback; community letter/avatar; member icon/count; Admin remove member | UI+fix |
| A22 | Members list visible icons/photos; fallback; profile navigation | UI; Backend |
| A23 | Edit Community cover; upload persistence and storage authorization | UI; Backend |
| A24 | Poll voter identities; Community Chat Back returns to originating Community | UI; Backend |
| A25 | Verification adds Trust not Nitro; selfie camera evidence/review; phone architecture; badge only after intended stages | UI; Backend |
| A26 | Inspect Aadhaar integration; approved licensed provider only; explicit hold if unavailable | UI; External subrequirement; see master provider evidence |
| A27 | No recurring Notifications error; repeated/reload/empty/multiple notification cases | UI |
| A28 | Profile gallery up to three photos; view/add/change/delete/set primary; public gallery; backend maximum | UI+fix; Backend |
| A29 | Profile Community picture/icon; actual badge logic from newly supplied 22-badge document | UI; Backend |
| A30 | No duplicate/self Squad members; backend/query deduplication | UI; Backend |
| A31 | Save Edit Profile returns to Profile; failed save remains editable | UI+fix |
| A32 | Partner instructions; terms agreement before application; persisted agreement | UI; Backend |
| A33 | Partner dashboard; participants; amount/details; multiple category prices; category selection; successful payment and required details before joined | UI; Backend |
| A34 | Partner activity visual differentiation and badge across lists | UI; Backend |
| A35 | Admin authenticated DB-backed data; Master/Admin controls; role enforcement | Admin |
| A36 | Pin upcoming activity; category correction; existing Admin controls operational; login announcement creation/audience/display/read receipt | Admin; category selector local fix shared with App |
| A37 | Post-create activity detail; ended non-editable; Activity/Community/Vibe sharing; Community Created state; delete chat messages/media; default start now+10min/end start+1h/registration=start; SOS web/native distinction; NitroBot FAQ; support query; Play Store reward once without falsely proving review; Hubble threshold/hold | UI+fix; Backend; External subrequirement; see master provider evidence |
| A38 | Co-host approve/reject/remove/edit; preserve original Host; demote Co-host and persist permission removal; unblock; readable blocked old history; first-signup policies; public Profile Vibes first; negative Nitro spend history; Partner external URL; optional activity media to Vibes; anonymous Community posts recipient privacy and Admin attribution; security/privacy; developer documentation | UI+fix; Backend |
| A39 | Record genuine ambiguities after code/source investigation | Coordinator |
| A40 | No known fixable regression in tested scope; evidence-backed quality acceptance | Coordinator |
| B01 | Functional external legal links | UI |
| B02 | Email verification tick; name validation including Unicode/profanity; backend validation | UI; Backend |
| B03 | Social login artwork not dating-themed; appropriate contrast | UI |
| B04 | Nitro Store naming; latest Home header without avatar or empty section | UI |
| B05 | Exact four approved hero assets; correct CTA destinations; no duplicate overlays | UI |
| B06 | Invite ten Nitro; How it works; readable terms; referral abuse/duplicate controls | UI; Backend |
| B07 | Contact Support replaced with View More linking policy site | UI |
| B08 | Nitro Points card matches Invite visual styling; blue/purple only | UI |
| B09 | Readable smaller-screen fonts | UI |
| B10 | Readable Activities layout; filters; Back returns Home | UI+fix |
| B11 | Activity date range/All/Free/Paid/gender filters; reset/apply actual results | UI+fix; Backend |
| B12 | Host edit/delete eligibility; Activity chat; compact FREE/JOINED status | UI; Backend |
| B13 | Start now+10min; end at least one hour later; registration no later than start/no earlier than now; visible validation; time zones | UI; Backend |
| B14 | Public/private by title; tags under About; round DPs; private activity RLS | UI+fix; Backend |
| B15 | Bold Host identity/photo; chat; Co-host | UI |
| B16 | Consistent direct/activity Vibe composer | UI |
| B17 | See All opens Activities | UI |
| B18 | Activity Chat Back; block/unblock; old history remains; no Chat Video | UI; Backend |
| B19 | Vibes reels layout; no redundant header/arrows; creator photo; linked Activity | UI |
| B20 | Normal Paid ON/OFF only; no price/no Cashfree/no platform collection | UI; Backend |
| B21 | Actual Google Maps integration using client account; accurately separate absent Maps API configuration from Photon fallback | UI; External subrequirement; see master provider evidence |
| B22 | Host does not report own Activity; edit/delete controls; contextual Back to Activities | UI |
| B23 | Community design; Back All Communities; moderator selection and controls; backend permissions | UI+fix; Backend |
| B24 | Community Posts separate from Chat; no post Poll; post Video yes; compact Chat button; no redundant description | UI; Backend |
| B25 | Chat/activity names; unread counts/filter; timestamps; DPs | UI; Backend |
| B26 | Chat info/activity navigation; Poll creation/voting | UI; Backend |
| B27 | Chat plus opens direct/create-group flow; user DPs | UI; Backend |
| B28 | Profile design; Store/social plus; Trust/reviews/Karma; upcoming/completed Activities; three photos | UI+fix |
| B29 | Camera-only selfie; preview; verification Trust points | UI; Backend |
| B30 | Trust max100; email/Google10 phone10 selfie10 Aadhaar20 social10 rating4+10; rating fall removes boost; ten Activities20/twenty Activities30 nonstacking; Nitro independent | UI; Backend |
| B31 | Separator page; no standalone implementation requirement | Coordinator; separator/end page has no standalone change |
| B32 | Vibes vertical/newest/all menu; direct create; no arrows | UI |
| B33 | Meaningful sharing metadata/thumbnail/WeNitro branding; external preview limitations explicit | UI+fix; Backend |
| B34 | Hide quiet-mode indicator when inactive | UI |
| B35 | Community chats date/time/DP | UI; Backend |
| B36 | Live case-insensitive chat search | UI; Backend |
| B37 | All includes People and Groups; accurate unread; stories mark seen | UI; Backend |
| B38 | Group avatar upload/preview/persistence/fallback | UI; Backend |
| B39 | End page; no standalone implementation requirement | Coordinator; separator/end page has no standalone change |

## Required deployed QA for this commit

1. Load active Admin categories in all six consumer surfaces; verify a real category change reaches fresh selectors. Capture Home Tribe/filter, Activities filter, Search, Host, Community and Profile interest screens. Trigger a browser network failure in a scoped test session, verify retry feedback, recover and confirm no draft loss.
2. Disable one explicitly marked QA category with Admin, edit an existing QA Activity/Community without changing category, preserve its old category, and confirm the category cannot be assigned to a new entity. Restore the fixture and capture both UI and DB proof.
3. Edit Profile with a historical interest and optional catalog failure; unrelated save must return to Profile. Explicit removal persists. Never clear unrelated user interests for evidence.
4. Capture missing/broken avatar and uploaded-avatar Profile states, including a Unicode name fixture.
5. Successful Activity direct/external share yields the intended daily observed share; cancellation does not. Compare an isolated QA event's analytics before/after with backend evidence. A shared action reports OS completion, not proof that a recipient opened the link.
6. Refresh full PDF visual acceptance including already-implemented onboarding, exact hero art, filters, Host/participant controls, rating gold popup, upload warnings, Community covers/member avatars, polls, Profile gallery/Trust, and private/public profile differences. Use root's production QA plan to avoid missing per-state screenshots.

## Remaining concerns

- Full integration and production acceptance have not run yet; no zero-failure final verdict is made here.
- Final deployment depends on Admin's category-preservation and observed-analytics RPC migrations; do not deploy this App branch alone.
- Scope includes no new provider setup: SMTP sender, alternate Google redirect configuration, physical SMS receipt, licensed Aadhaar, client Google Maps keys, native background SOS and Hubble remain to be assessed using exact current evidence by root.
- Native share-sheet dismissal and native date-picker/camera interactions require the supported native environment; web source/behavior tests cannot substitute for actual native screenshots.

## Follow-up focused review

Executable component testing reproduced stale profile/catalog responses reaching a different signed-in account. The follow-up uses a per-effect active guard and category request generations, clears old fields on account change, and loads optional categories independently so they cannot hang the whole form. Each save freezes its initiating auth subject rather than consulting a mutable expected-subject ref after asynchronous steps.

The category guard also exposed non-atomic interest updates: a disabled new choice could fail after prior interests were already deleted. The client now uses the existing transactional `set_my_interests` RPC; the backend agent owns serialization and PostgreSQL rollback/preservation proof. `profile-catalog-recovery-test.mjs` executes the actual component with controlled async responses and the actual service with an offline RPC double. It verifies independent form loading, account-switch cleanup, stale profile/catalog/error rejection, one transactional write, deduplication, validation and error propagation.

Two further existing profile-service test doubles (`phase4-privacy-test`, `auth-identity-reuse-test`) were updated for the category import and passed without weakening identity/privacy assertions.
