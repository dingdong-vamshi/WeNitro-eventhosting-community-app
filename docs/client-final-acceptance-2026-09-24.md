# Client acceptance audit - 24 September 2026

## Evidence and status rules

Source: `/Users/vamshipendyala/Downloads/Issues with App.pdf`, 39 pages. Every page was rendered at 1440 px and inspected visually; all page text was extracted with pypdf. Pages 31 and 39 are separators, not requirements. Reference images, arrows, and callouts were considered, not just extracted text.

This is the **source-audit ledger**, initially against `d579518` plus concurrently changing working-tree files. It is not a production acceptance certificate. Line locations below refer to the inspected snapshot and can move during this pass.

- `SOURCE MATCH`: a concrete corresponding implementation was located; manual local and deployed behavior remain unverified by this auditor.
- `FIX`: source proves a mismatch, or latest client evidence proves the current release needs correction.
- `VISUAL QA`: source has a corresponding UI, but visual fidelity needs side-by-side browser comparison.
- `EXTERNAL`: the latest request explicitly permits the dependency exception.
- Every production result starts `NOT VERIFIED`. Only the release owner may replace that status with PASS after actual deployed interaction. A source match must never be counted as an already-correct production requirement.
- Local QA column combines this auditor's browser observations below with the release owner's executed log `docs/client-local-qa-2026-09-24.md`. A partial result lists its missing action; successful earlier sessions do not erase the subsequent session/workspace timeout failure. Source assessment remains the explicitly labelled initial snapshot, not a claim that every originally reported gap is still unfixed.

Count convention: **88 PDF requirement groups**, including one explicit external Aadhaar integration group. Closely repeated complaints are deduplicated, while distinct interactions remain separate. The seven trust weights are retained together as a single formula with individual acceptance values. The latest prompt adds a supplemental release matrix below.

## Complete PDF checklist

| ID | PDF pages | Requirement / acceptance | Source assessment and evidence | Local QA | Production |
|---|---|---|---|---|---|
| 01 | 1 | Welcome Terms link opens actual website Terms | SOURCE MATCH: `src/components/onboarding/reference-screens.tsx:13,140,156`, `https://wenitro.com/terms-and-conditions.html` | NOT TESTED — source evidence only | NOT VERIFIED |
| 02 | 1 | Welcome Privacy link opens actual website Privacy | SOURCE MATCH: same component:14,140,156, `https://wenitro.com/privacy-policy.html` | NOT TESTED — source evidence only | NOT VERIFIED |
| 03 | 2 | Email validation tick only for a valid address | SOURCE MATCH: `App.tsx` AuthField validation; `src/utils/validation.ts`; `src/services/auth-production.ts:95` | PASS: invalid email error; valid QA2 email tick shown in actual anonymous signup UI (root latest QA) | NOT VERIFIED |
| 04 | 2 | Proper full name, reject email/profanity/example handles | SOURCE MATCH for signup: `App.tsx:1384,1487,1640`; `src/utils/validation.ts` includes client examples. Recheck profile completion separately, whose service currently only checks nonempty/length. | PARTIAL: email-as-name rejected; valid Priya Nair tick shown; profanity/all client handle examples not manually tested | NOT VERIFIED |
| 05 | 3 | Replace irrelevant login button thumbnail with suitable icon | VISUAL QA: login controls in `App.tsx:1350-1720` | NOT TESTED — source evidence only | NOT VERIFIED |
| 06 | 3 | Relevant login hero without heart/dating art | SOURCE MATCH: supplied WeNitro brand hero assets used by auth. VISUAL QA required. | NOT TESTED — source evidence only | NOT VERIFIED |
| 07 | 3 | Google continuation styled like the reference | VISUAL QA: live Google button must be rendered and compared. The callout "Change this to Like this" points to the Google reference image; it does not request a new Like label. | NOT TESTED — source evidence only | NOT VERIFIED |
| 08 | 3 | Blue/purple action text readable in both themes | SOURCE MATCH for Welcome: `reference-screens.tsx:154,156` uses theme-aware accent. VISUAL QA for all dark links remains. | NOT TESTED — source evidence only | NOT VERIFIED |
| 09 | 4 | Header arrangement close to reference | VISUAL QA: `feed-search.tsx:183`, `BrandBar`. Latest prompt overrides duplicate avatar: remove it. | PASS visual: duplicate avatar removed; logo/search/notifications retained (root QA) | NOT VERIFIED |
| 10 | 4,5 | Use Nitro Store naming, no V-Nitro Store UI label | SOURCE MATCH: `feed-search.tsx:51-53`. Supplied artwork itself contains legacy words; current code uses revised live title. | PASS naming: Home CTA and destination say Nitro Store | NOT VERIFIED |
| 11 | 4 | Reduce empty hero/card space | VISUAL QA: `feed-search.tsx:183-234` image-backed carousel | NOT TESTED — source evidence only | NOT VERIFIED |
| 12 | 5 | Activities hero supplied asset | SOURCE MATCH: `feed-search.tsx` hero manifest; compare final crop | NOT TESTED — source evidence only | NOT VERIFIED |
| 13 | 5 | Community hero supplied asset | SOURCE MATCH: same hero manifest; compare final crop | NOT TESTED — source evidence only | NOT VERIFIED |
| 14 | 5 | Invite hero supplied asset | SOURCE MATCH: same hero manifest; compare final crop | NOT TESTED — source evidence only | NOT VERIFIED |
| 15 | 5 | Store hero supplied asset | SOURCE MATCH: same hero manifest; compare final crop | NOT TESTED — source evidence only | NOT VERIFIED |
| 16 | 5 | All four hero CTA destinations work | SOURCE MATCH: carousel CTA routing; click every slide locally and deployed | PASS routes: all4 carousel CTAs opened Activities, Communities, Invite Squad, Nitro Store; Store data fetch pending | NOT VERIFIED |
| 17 | 6 | Invite card explicitly Earn 10 Nitro Points | SOURCE MATCH: `feed-search.tsx:298`, `invite-squad.tsx:24,27` | PASS: Home and Invite screen say Earn 10 Nitro Points | NOT VERIFIED |
| 18 | 6 | Invite How it works opens the explanatory page | SOURCE MATCH: invitation screen and Home link. Test back behavior. | PASS: Home How it works opens Invite Squad explanatory steps and actual account referral link | NOT VERIFIED |
| 19 | 6 | Home legal section titled Terms and Policies | SOURCE MATCH: `feed-search.tsx:308` | PASS: Home section visibly titled Terms and Policies | NOT VERIFIED |
| 20 | 7 | Both legal pages use View More to website | SOURCE MATCH: `reconstruction/settings.tsx:53` | PASS: both legal summaries/Back and external View More pages tested (root QA) | NOT VERIFIED |
| 21 | 8 | Nitro Points naming and invite-style section | SOURCE MATCH naming; VISUAL QA styling: `feed-search.tsx` points section | NOT TESTED — source evidence only | NOT VERIFIED |
| 22 | 6,8-10,13 | Larger, heavier, readable supporting typography throughout | VISUAL QA: feed card secondary text remains 12 px, Chat date 9 px, activity group info date 9 px. This broad requirement cannot be marked PASS from source alone. | NOT TESTED — source evidence only | NOT VERIFIED |
| 23 | 10 | Activity list back returns Home | SOURCE MATCH: `discovery/activities-screen.tsx` Header back `go('feed')` | PASS: Activity list Back returns Home | NOT VERIFIED |
| 24 | 10,11 | Visible Filter button opens sheet | SOURCE MATCH: activities screen `Open activity filters` button | PASS: visible Filter button opens Filters sheet | NOT VERIFIED |
| 25 | 11 | Date range filter | SOURCE MATCH: activities screen dateFrom/dateTo draft with validation | PARTIAL: date From/To controls visible; range selection/filter data pending | NOT VERIFIED |
| 26 | 11 | Price All/Free/Paid filter | SOURCE MATCH: activities screen price draft and server/client filters; recheck after new dual payment mode | PASS Paid results: paid QA events returned; Free result filtering pending (root QA) | NOT VERIFIED |
| 27 | 11 | Gender All/Male/Female/Non-binary filter | SOURCE MATCH: activities screen gender options and filtering | PARTIAL: all requested gender controls present; Non-binary clicked, then reset; data pending | NOT VERIFIED |
| 28 | 11 | Verified-only option, Reset All, Apply Filters | SOURCE MATCH: activities screen verifiedOnly switch and sheet footer | PARTIAL: verified switch, Reset All, Apply exercised; sheet dismisses; fetched-result correctness pending | NOT VERIFIED |
| 29 | 12,22 | Host Edit and Delete; hidden from ordinary viewers | SOURCE MATCH: `App.tsx` ActivityDetails options use canHost. Recheck co-host capabilities and server enforcement. | PARTIAL: owner/co-host editing controls shown; outsider/delete checks pending (root QA) | NOT VERIFIED |
| 30 | 12,22 | Report only non-host | SOURCE MATCH: ActivityDetails owner option branching | NOT TESTED — source evidence only | NOT VERIFIED |
| 31 | 12,15 | Activity chat only host/co-host/approved or joined participant | SOURCE MATCH: `App.tsx:4705` and group option guards; test outsider plus pending participant | PARTIAL: joined participants chat works; outsider/pending restrictions UI pending (root QA) | NOT VERIFIED |
| 32 | 12 | FREE/PAID and JOINED thumbnail state | SOURCE MATCH: `App.tsx:4602-4609`; current joined badge replaces payment badge. Latest dual-mode change must preserve visible payment classification. | PASS detail: FREE/PAID classification and JOINED separate; four modes inspected (root QA) | NOT VERIFIED |
| 33 | 12 | Remove verbose free-activity card | SOURCE MATCH: `App.tsx:4618` price card renders paid only | NOT TESTED — source evidence only | NOT VERIFIED |
| 34 | 13 | Fresh Start exactly now + 10 min | FIX / precision decision: `domain/host-activity.ts:22-23` adds 10 min then ceilings to minute: actual delta 10:00 to 10:59. `host-activity-screen.tsx:157` refreshes untouched schedule on opening timeline. Record seconds and UI precision. | PASS: 14:18:16.995 ->14:28:17, delta600.005s (root QA) | NOT VERIFIED |
| 35 | 13 | End defaults Start + 1h; cannot be shorter | SOURCE MATCH: `host-activity.ts:27,88`; `host-activity-screen.tsx:242` | PARTIAL: default end15:28:17 = start+1h; invalid shorter-end interaction pending | NOT VERIFIED |
| 36 | 13 | Registration defaults Start; current <= registration <= Start | SOURCE MATCH: `host-activity.ts:27,89` | PARTIAL: deadline defaults14:28:17=start; invalid deadline interaction pending | NOT VERIFIED |
| 37 | 13 | Invalid schedule shows red field outline + message | SOURCE MATCH: ScheduleField error inputs in `host-activity-screen.tsx:273`; VISUAL QA invalid start/end/deadline | NOT TESTED — source evidence only | NOT VERIFIED |
| 38 | 14 | Public/Private under title, category/type only in About | FIX: `App.tsx:4630` title-side detailTags duplicate About category/type at ~4667; Public/Private is already under title | PASS: Public/Private retained; duplicate title category/type removed (root QA) | NOT VERIFIED |
| 39 | 14 | Private activity only host/invited participants; absent public discovery | SOURCE MATCH: `domain/activity-visibility.ts`, `services/activity-invites.ts`, discovery uses viewer visibility; requires two-account backend/UI check | NOT TESTED — source evidence only | NOT VERIFIED |
| 40 | 14,15 | Round participant avatars; tapping opens real profile | SOURCE MATCH: `App.tsx:4725` joinedParticipants map and openProfile | NOT TESTED — source evidence only | NOT VERIFIED |
| 41 | 15 | Bold visible Activity Host label | SOURCE MATCH: `App.tsx:4685` detailHostLabel; VISUAL QA | NOT TESTED — source evidence only | NOT VERIFIED |
| 42 | 15 | Add/remove co-host and host-equivalent appropriate controls | SOURCE MATCH: `App.tsx:4538` participant role button; verify editing/approval with second account | PASS: QA co-host granted, editing controls shown, then removed (root QA) | NOT VERIFIED |
| 43 | 17 | Recommended See All opens Activities | SOURCE MATCH: `App.tsx:4860` `go('activities')` | NOT TESTED — source evidence only | NOT VERIFIED |
| 44 | 20 | Single Paid Activity toggle replacing free/free-to-join toggles | FIX baseline: `host-activity-screen.tsx:260` was Partner-only; latest request permits ordinary on-site paid mode | PASS: one Paid control supports normal onsite and approved Partner platform, four UI modes (root QA) | NOT VERIFIED |
| 45 | 21 | Detailed venue/location search | SOURCE MATCH: `services/activity-location.ts:210` combines Photon + Nominatim, deduplicates, caches and supports bias; real venue search required | NOT TESTED — source evidence only | NOT VERIFIED |
| 46 | 16 | Consistent Post Vibe UI/font/layout | VISUAL QA: PostVibe components; PDF only shows rejected version, no complete old-form reference | NOT TESTED — source evidence only | NOT VERIFIED |
| 47 | 16 | Same upload flow from Vibes + and Activity Add Vibes | SOURCE MATCH: shared postVibe route with selected activity state; perform both paths | NOT TESTED — source evidence only | NOT VERIFIED |
| 48 | 19 | Remove blue Vibes header and up/down arrows | SOURCE MATCH: `App.tsx:3140-3218` full-screen reel, no old blue header/arrows | PASS: full-screen Vibe99, no obsolete header/arrows (14:59) | NOT VERIFIED |
| 49 | 19 | Vibe author avatar and profile navigation | SOURCE MATCH: `App.tsx:3177` pressable author image and name | PARTIAL: author rendered; profile click pending | NOT VERIFIED |
| 50 | 19 | Vibe Activity association and navigation | SOURCE MATCH: `App.tsx:3187` activity link; data without title falls back View activity | PARTIAL: actual activity title shown; title click pending | NOT VERIFIED |
| 51 | 32 | Vertical reel swipe, latest to oldest | SOURCE MATCH: `App.tsx:2885` sort and `3144` FlatList paging/snap. Real touch/trackpad test required. | NOT TESTED — source evidence only | NOT VERIFIED |
| 52 | 32 | Vibe 3-dot menu actions work | SOURCE MATCH: delete own/report other/copy link in `App.tsx:3080-3235` | NOT TESTED — source evidence only | NOT VERIFIED |
| 53 | 32 | Direct + upload on Vibes | SOURCE MATCH: reel overlay add button routes postVibe | NOT TESTED — source evidence only | NOT VERIFIED |
| 54 | 33 | Share to chat delivers thumbnail/card + correct content opening + small logo | SOURCE MATCH: `ShareToChatModal.tsx:129-146,170-177`; `realtime-chat.ts` share payload; actual two-user delivery still required | PASS: single and dual recipients; cards/thumbnail/open confirmed 14:58–15:00; failure retry pending | NOT VERIFIED |
| 55 | 33 | External WhatsApp share thumbnail | SOURCE MATCH infrastructure: `internal-share.ts:36`, `/share/vibe/:id`; `vercel.json:6-7` rewrites to share-vibe Edge Function. Need fetch metadata from deployed URL; WhatsApp cache rendering cannot be guaranteed from source alone. | PARTIAL HTTP: correct metadata first read; subsequent 502; image/cache unverified | NOT VERIFIED |
| 56 | 23 | Community back opens all communities | SOURCE MATCH: `community/community-info.tsx:71` back label/callback; verify route owner | PASS: Community detail Back reached /#/communities and All cards | NOT VERIFIED |
| 57 | 23 | Community detail visual treatment close to reference | VISUAL QA: `community-info.tsx` cover gradient, overlap avatar, member stack, About/Rules, two CTAs; compare light/dark | PARTIAL: dark detail inspected; full reference/light comparison pending | NOT VERIFIED |
| 58 | 23 | Co-Admin/Moderator roles and configurable controls | FIX IMPLEMENTED, manual QA pending: community permissions now hydrated; settings/edit/approval/role management and admins-only chat use granular permissions matching live SQL. Ordinary members cannot acquire capabilities from stray flags. Co-Admin grants remain full permissions as server requires. | PARTIAL: post-only QA Moderator and ordinary Member management gates verified; admin-only post test pending | NOT VERIFIED |
| 59 | 24 | Posts and chat remain separate destinations and writes | SOURCE MATCH: `App.tsx:7245+` community posts vs `reference-community.tsx` realtime messages; send one of each | PARTIAL: separate posts/chat navigation and chat share write PASS; post write pending | NOT VERIFIED |
| 60 | 24 | Small chat icon beside Created/Joined, no large Open conversation banner | SOURCE MATCH: CommunityDetail header controls; VISUAL QA | PASS: small chat icon beside Created, no legacy banner | NOT VERIFIED |
| 61 | 24 | Remove duplicated description from Posts header | SOURCE MATCH: CommunityDetail posts shell; VISUAL QA | PASS: Posts header title/member count without repeated description | NOT VERIFIED |
| 62 | 24 | No poll in Post composer; polls retained in chat | SOURCE MATCH: `App.tsx:7560` composer photo/video/send only; `reference-community.tsx:179` chat PollComposer | PARTIAL: Posts composer has photo/video, no Poll; existing chat Poll visible | NOT VERIFIED |
| 63 | 24 | Attractive post cards with actual author photo/date | FIX: `App.tsx:7284-7300,7323` feed mappers drop author.avatarUrl and createdAt, while renderer ~7608 reads them; composer ~7560 hardcodes neutralAvatar | PARTIAL: actual author/date and initial fallback shown; photographic author fixture pending | NOT VERIFIED |
| 64 | 25 | Activity chat names use actual Activity title | SOURCE MATCH: `services/wenitro.ts:304-315,386` title batch and generic-name replacement | PASS: Activity209 inbox/chat uses actual QA Activity title | NOT VERIFIED |
| 65 | 25 | New-message notification and unread Activity chat filter | SOURCE MATCH: `App.tsx:9070-9087` inbox update + Alert; `messages.tsx` All/Unread filter. Foreground notification does not prove background delivery. | NOT TESTED — source evidence only | NOT VERIFIED |
| 66 | 26 | Activity Chat info leads to correct Activity | SOURCE MATCH: `App.tsx:5549-5567` event lookup and View Activity Page action | PASS: Activity209 chat info opened correct Activity (root QA) | NOT VERIFIED |
| 67 | 26 | Activity Chat poll creation and vote | SOURCE MATCH: group chat uses PollComposer/PollCard; test author and voter | PARTIAL: real poll created and QA2 vote100%/onevote; history/live refresh fixes await final retest | NOT VERIFIED |
| 68 | 27 | + opens inline Create Group modal immediately; member pictures shown | SOURCE MATCH: `reconstruction/messages.tsx:214` setCreatingGroup; group people avatar map | PASS: inline modal opens immediately; real member photos/initials rendered; no group submitted | NOT VERIFIED |
| 69 | 18 | Host personal chat Back returns originating Activity | SOURCE MATCH: App route/history handling; must manually execute activity->host chat->Back | NOT TESTED — source evidence only | NOT VERIFIED |
| 70 | 18 | Block Chat action and enforcement | SOURCE MATCH: personal chat Block/Unblock action; test blocked send with second account | NOT TESTED — source evidence only | NOT VERIFIED |
| 71 | 22 | Activity detail Back returns All Activities | SOURCE MATCH: `App.tsx:4557` `go('activities')` | NOT TESTED — source evidence only | NOT VERIFIED |
| 72 | 28 | Purple textured/gradient Profile header close to right-side reference; Shop | FIX / VISUAL QA: assigned Profile reconstruction; baseline plain appearance rejected by client; source `reconstruction/profile.tsx` shared ProfileLayout | PASS visual: own/public Light/Dark compared with PDF; textured indigo/About mountain/interests (profile/root QA) | NOT VERIFIED |
| 73 | 28 | Saved social icons + owner Add Social, real URL targets | SOURCE MATCH: `domain/social-profiles.ts`, shared ProfileLayout and social editor; compare active/inactive own/public | PARTIAL: empty editor/Add and truthful absent links verified; linked URL click untested | NOT VERIFIED |
| 74 | 28 | Badge of Trust presentation matches reference | VISUAL QA: shared ProfileLayout trust strip | PASS visual: trust block/strip compared with reference (profile/root QA) | NOT VERIFIED |
| 75 | 28 | Activities summary opens real history | SOURCE MATCH: `profile.tsx:244` activityHistory; `profile-utilities.tsx:121` currently capped hosted100 + discover100 can omit older joined history | PASS: own real hosted/joined history navigation inspected; paginated source used (profile/root QA) | NOT VERIFIED |
| 76 | 28 | Squad summary opens real relationships | SOURCE MATCH: own/public openSquad callbacks in `profile.tsx:244,284` | PARTIAL: empty own Squad and public privacy verified; nonzero relationship navigation pending | NOT VERIFIED |
| 77 | 28 | Karma summary explicitly opens Reviews | SOURCE MATCH: shared ProfileLayout tab switching; execute scroll/result behavior | PASS own: Karma opens Reviews; public behavior still not separately proven | NOT VERIFIED |
| 78 | 28 | Nitro Points summary opens ledger/store destination | SOURCE MATCH own: `profile.tsx:244` nitroHistory; public disclosure/action must respect privacy | PASS own: real Nitro ledger email+10; public private disclosure respected (profile/root QA) | NOT VERIFIED |
| 79 | 28 | Activities separated Upcoming / Completed | SOURCE MATCH: `profile.tsx:185-187`; clock/status boundary QA needed | PARTIAL: Upcoming/Completed controls inspected; populated Completed/boundary behavior pending | NOT VERIFIED |
| 80 | 28 | Up to 3 profile photos, primary/change/delete, public viewing | SOURCE MATCH: profile gallery handlers + `referenceDeltaService`; public visibility QA needed | PARTIAL: public photo viewer works; add/change/delete three-photo lifecycle not executed | NOT VERIFIED |
| 81 | 28 | Trust Score real stages + rating + joined count | SOURCE MATCH: profile refresh reads metrics/trust; formula specified p30 overrides older "check with me" text | PARTIAL: actual QA score10/100 agrees email state; other stage/rating/join cases offline only | NOT VERIFIED |
| 82 | 29 | Upload Selfie wording | SOURCE MATCH: `profile-utilities.tsx:90` Upload Selfie / Selfie Uploaded. Latest prompt supersedes older no-rename instruction. | PASS displayed: current selfie naming preserved (profile/root QA) | NOT VERIFIED |
| 83 | 29 | Camera-only input, no gallery action | SOURCE MATCH: `profile-utilities.tsx:66-70,93` launchCameraAsync. Browser camera capture behavior must be exercised; HTML capture hint alone is not universal enforcement. | NOT EXECUTED: camera-only source inspected; live browser capture pending | NOT VERIFIED |
| 84 | 29 | Captured/private selfie preview visible | SOURCE MATCH: `profile-utilities.tsx:60,72,92` previewLivePhoto + local capture preview | NOT EXECUTED: no real camera capture/private preview test | NOT VERIFIED |
| 85 | 29,30 | Display verification points; exact 100-point Trust formula | SOURCE MATCH: `domain/profile-signals.ts:15-30`: email10, phone10, selfie10, Aadhaar20, social10, rating>=4 gives10 else0, joined>=10 gives20 / >=20 gives30; UI breakdown `profile-utilities.tsx:98` | PARTIAL: actual email+10 and verification breakdown shown; complete100point formula offline only | NOT VERIFIED |
| 86 | 30 | Real Aadhaar verification contributes 20 only when verified | EXTERNAL: Aadhaar provider explicitly excluded by latest prompt; no fabricated verification | EXTERNAL: Aadhaar provider excluded | NOT VERIFIED |
| 87 | 34-36 | No Quiet label; Community dates/photos; live prefix chat search and avatars | SOURCE MATCH: `messages.tsx:35` startsWithQuery, `:268` sender fallback/date render. No user-facing Quiet match found. Test all three inbox tabs. | PARTIAL: Priya prefix query eventually returns only Priya; stale intermediate rows now fixed/tested; remaining tabs pending | NOT VERIFIED |
| 88 | 37,38 | Mark All Seen persists; real consistent counts; Create Group asks/saves photo | SOURCE MATCH: `messages.tsx:134` tabCounts, `:151` required groupPhoto, `:194` Promise.allSettled persistence. Counts now Chats/Activities/Communities rather than old All/People/Groups, so validate distinct membership scopes. | NOT TESTED — source evidence only | NOT VERIFIED |

## Source-confirmed gaps reported to release owner

1. **P1** Partner application `this.rest` failure shown by latest production evidence; root/Partner agent owns reproduction, fix and two settlement-method lifecycle test.
2. **P1** Normal-host paid mode was hidden and payload forced Free; new on-site/platform distinction needs authoritative server rules, four UI cases and payment checks. Payment agent owns.
3. **P1** `App.tsx:7284-7300,7323` community post mapping loses author avatar/date. Renderer cannot show data it never receives; fix both first load and realtime refresh mappings and current-user composer image.
4. **P2** `App.tsx:4630` duplicate category/type under title still violates p14; retain Public/Private there and tags in About only.
5. **P2** `host-activity.ts:22-23` minute ceiling produces up to 59 additional seconds. Capture exact expected precision and measured result rather than claiming an exact timestamp from a minute-only display.
6. **P1 visual** Profile reference needs premium visual treatment, illustration, compact metrics and coherent own/public layout; independently compare both themes after Profile agent changes.
7. **P2 data completeness** `profile-utilities.tsx:121` derives joined history from only the newest 100 discoverable Activities, so long-lived users can have joined activities missing from their history. Use the actual joined-history source/pagination rather than discovery subset.
8. **P1** Community moderator permissions are persisted by role editor but unavailable to UI: CommunitySummary lacks permission fields, settings/requests are admin-role-only, and admins-only chat ignores can_post. Hydrate actual permissions, gate each action separately, and verify moderator plus constrained co-admin with a second account. Do not broaden all moderators to full admin privileges.

### Implemented community follow-up

At the release owner's direction, this auditor changed only `communities-production.ts`, `community-info.tsx`, and `reference-community.tsx` beyond this ledger. A tiny live read confirmed `tbl_chat_participants.permissions`; read-only inspection confirmed current `private.community_permission`/`community_can_post` definitions. Eight executable resolver tests passed, covering ordinary/anonymous roles with malicious-looking flags, granular moderators, string-versus-boolean flags, admin, creator, and owner. The existing client PDF regression script passed. Full TypeScript initially encountered only two concurrently edited root boot integration errors (`App.tsx:9179`); release owner is reconciling those. No live roles, records, or schema were changed by this auditor. Manual role assignment / second-account UI and production checks remain with release QA.

## Performance findings: source evidence, not measured timings

| Priority | Evidence | Mechanism | Required measurement / next correction |
|---|---|---|---|
| P1 | `App.tsx:9160-9176`; `services/wenitro.ts:210-250` | Auth refresh awaits onboarding resolution, then whole workspace hydration. Whole workspace eagerly waits Activity50, Community30, Profile, Partner, People50, friend count, Vibe50, Story50 before Home data is available. | Record session restore->useful Home baseline. Resolve minimal identity first and allow screen data to arrive progressively without breaking onboarding/privacy gates. |
| P1 | `wenitro.ts:264-345,435-457` | Inbox begins after first feature batch. Event titles, event covers, message media, group covers and Activity covers follow in later stages. Event/group covers are signed individually, often repeatedly. | Waterfall request count and critical path. Batch/cached signing by bucket; fetch independent inbox earlier; defer messages/media unrelated to Home. |
| P1 | `App.tsx:9125` | Every foreground refresh executes whole loadRemoteWorkspace, then discards most slices depending current screen. | Leave to a social URL then return and measure. Refresh current feature slice, preserve recent state. |
| P2 | `activities-screen.tsx:69+` | Every mount/filter effect sets loading true and replaces previously usable rows with spinner until complete refetch. | Back-navigation visible-content latency. Preserve rows during background refresh, separate initial and refresh loading. |
| P2 | `profile-production.ts:534+`; Profile refresh metrics; edit-profile loader | Repeated current-user, profile, auth, interests, verification/metrics resolution across bootstrap and screen entry. | Count identical GET/RPCs per navigation; share short-lived identity/stable data only with correct auth invalidation. |
| P2 | `services/vibes-production.ts:404` | Every reel resolves signed media independently, boot requests 50 reels before Vibes is opened. | Compare boot requests and Vibes start. Batch where storage contract allows; retain paginated FlatList behavior. |
| P2 | `reconstruction/messages.tsx:101` | Community tab search/page changes refetch entire chat inbox alongside community results; query typing triggers unrelated inbox calls. | Search watermark request count; separate stable inbox from community search dependencies. |
| P2 | `App.tsx:9115` | Inbox subscription depends on selectedConversationId, recreating channel on every selected-chat transition. | Count channel setup/teardown; stable subscription with current-room ref if behavior permits. Existing cleanup is present. |
| P2 | Activities/messages lists | Main Activity list and Chat list use ScrollView plus map; pagination limits initial Activities30 but subsequent pages accumulate all cards. | Long-list scroll CPU/memory. Virtualize only if baseline demonstrates material cost. |
| P2 | `profile-utilities.tsx:121` | History eagerly loads 200 possible Activities, prepares hosted then joined sequentially, still omits older joined rows. | Measure history open and use actual paginated hosted/joined data. |

Positive constraints to retain: Vibes already uses paged FlatList; verified badges already batch mounted IDs and cache 60 seconds (`services/verified-users.ts`); location searches already use cache and concurrent providers; inbox event updates update only relevant conversation state rather than refetching everything; subscriptions have cleanup. Do not replace these with more expensive generic refreshes.

## Supplemental latest-request release matrix

These checks supplement rather than inflate the 88 PDF group count:

| Check | Required final evidence | Executed local status / remaining gate |
|---|---|---|
| Supabase preflight | Correct project healthy; relevant Auth/table/RPC/Storage/functions readable, no whole-DB crawl | Initial access PASS; latest authenticated readiness BLOCKED by observed Auth user504 after79440ms, despite healthy project status |
| Partner UPI | QA UI submit -> UNDER_REVIEW -> Admin inspect -> approve -> App APPROVED/Dashboard | Local UI/live Admin inspection PASS; UPI masked; later Bank resubmission approved; no payout |
| Partner Bank | QA UI valid holder/account/IFSC submit; masked readback and lifecycle | Local UI/live Admin masked destination/rejection/resubmission/approval PASS (root QA) |
| Normal Free | Publish, tag, other QA user joins without checkout | PASS local: Activity210 published, QA1 joined, saved/liked/QA-commented |
| Normal On-site Paid | Publish price, PAID tag/direct-payment text, joins without Cashfree, no commission/settlement | PASS local: Activity209 ₹25 onsite, QA1 joined; targeted read no payment attempt; later approval preserves mode |
| Partner Free | Publish and ordinary registration/join behavior | PASS local: Activity211 published and QA2 joined; later Leave confirmation not accepted |
| Partner Platform Paid | Registration/approval if configured, server-authoritative checkout, no confirmed participation before verified payment | PARTIAL local: Activity212 cashfree, QA1 remains unconfirmed and reaches verified-phone requirement; successful payment not tested |
| Server permission negatives | Ordinary user cannot request platform mode; unapproved Partner cannot grant themselves paid-platform access | OFFLINE regression PASS; separate hostile-client browser/server execution not claimed |
| Home avatar removal | No duplicate top-right Profile shortcut, logo/location/search/notification spacing preserved | PASS local visual; production pending |
| Profile expanded reference | Header waves/texture; About mountain/sun; interests Manage; real achievements; Activities/Vibes/Reviews/Communities actions; own/public | Local own/public Light/Dark visual and summary-card checks recorded; linked-social URL and full photo lifecycle still untested |
| Partner signup intent | Individual/Partner selection retained through email/phone, no automatic approved privileges | PARTIAL local form: Individual default -> Partner selected -> Phone preserves intent; no signup or OTP submitted, no approval created by form |
| Full regression | Auth, home, activities, approvals, participants, comments/likes/saves, chat/community/vibes, notifications, verification, Partner/Admin, settings/legal/referrals/points | INCOMPLETE: exact88-group breakdown below; cross-user final poll/history and other normal UI tests pending |
| Performance before/after | Normal-network timings + waterfall counts for boot/Home/list/detail/profile/public profile/chat/community/Vibes/Partner/Admin; repeat deployed | FAILED readiness: actual Auth user504/79440ms unresolved; request-reduction fixtures do not replace production benchmarks |
| Validation/deployment | TypeScript, regression/domain/service checks, export, changed Admin checks, secret scan, reviewed diff, logical normal-repo commits, existing Vercel projects, production QA | Latest34 safe offline scripts PASS; TypeScript/export PASS through bundle prefix189204. No frontend commit/push/deployment; all production QA pending |

## Permitted exceptions

Aadhaar provider, unspecified Apple Auth, automatic live Partner payouts, unresolved automatic refunds, GST/tax/gateway fee policy, bank penny-drop/KYC provider, chargebacks, native persistent SOS, multi-business Partner, full commercial Store catalogue/fulfilment. These do not excuse normal UI bugs. Interactive Google consent and a real SMS OTP can be recorded separately while independent QA continues. Third-party WhatsApp cache rendering should be distinguished from whether our public share page provides valid accessible metadata and thumbnail.

## Final reconciliation fields

- PDF pages visually reviewed: **39 / 39**.
- PDF requirement groups enumerated: **88**.
- Local QA row classifications: **30 PASS, 24 PARTIAL, 33 NOT TESTED/NOT EXECUTED, 1 EXTERNAL**. PASS applies to the specific row scope described, not to the entire application or final build under failed Auth conditions.
- Production PASS proven by this source auditor: **0**.
- Production row classifications: **88 NOT VERIFIED**. No frontend deployment took place in this pass.
- Production failures fixed in this pass: **pending release-owner evidence**.
- Do not reuse previous release screenshots as proof for the new deployed commit.
- Browser evidence should name exact tested deployment/commit, account role, action, observed result, and before/after performance where applicable.

## Local browser evidence — 24 September, existing static build

Environment: `http://localhost:8083`, production-style export (release owner identifies bundle `index72b` as current). QA member 1 signed in through Email UI in a new isolated Chrome tab. This evidence is **local only**, and does not establish production acceptance.

| Check | Observed result |
|---|---|
| Existing QA email sign-in | PASS: login reached the populated Home screen. |
| Vibe -> Share search/selection/progress | PASS: opened existing QA-labelled Vibe 99; searched `Weekend`; selected `Weekend Photography Circle`; Send (1) became Sending; sheet automatically closed. Transient Sent feedback was not captured. |
| Actual share delivery | PASS: Community search preview updated; `/chat/187` displayed the new share at 14:39 with camera thumbnail, QA caption and sender attribution. One QA share was created through the real UI. |
| Delivered card navigation | PASS: newest shared card opened `/vibe/99` with the same QA caption and Golden Hour Photography Walk association. Browser Back returned to the conversation. |
| Share reset | PASS: reopening the sheet showed empty search, no selected recipient and disabled Send. |
| Community chat existing content | PASS: existing poll, date dividers, sender labels and shared-card history rendered; composer available. No poll vote or ordinary message was submitted. |
| Community information navigation | FAILED/PENDING RETEST: tapping Community information navigated to `/community/187` but stayed on Loading for over 30 seconds. Reload then stayed on Loading your Feed for over 45 seconds. No app error appeared in captured console; release owner confirmed current bundle and another agent reproduced a similar hang. Multi-tab authentication locking is being investigated, not yet proven here. Community posts, permission roles and info navigation are not accepted on this evidence. |

Followup source corrections from this browser pass: share-picker handles normalize one leading `@`; new Vibe share payloads preserve server-derived original creator ID/name separately from `shared_by`; both chat renderers display creator attribution when supplied. `scripts/vibe-share-attribution-test.mjs` executes the current share RPC plus proposed guarded migration in an isolated local PostgreSQL instance and verifies creator/sender distinction, legacy payload compatibility, and unchanged private-Vibe/room-membership rejection. **New creator UI and migration remain pending live application/rebuild/browser verification; previous delivery evidence does not cover them.**

### Local retest after auth/creator/realtime changes (14:56–14:59 IST)

Retested the same isolated QA1 tab on export `index-f9f159c0c9507af4c1f221cd6b93f566.js`. Release owner reported the guarded creator migration applied successfully. Results below supersede the pending local Community/creator items above, not the production matrix.

| Check | Observed result |
|---|---|
| Previously stuck Community deep link | PASS: reload `/community/187` loaded Weekend Photography Circle description, rules, six members and owner controls; no persistent Feed or Community spinner. |
| Info -> posts -> chat | PASS: Community Posts opened; existing real post displayed Arjun Sharma, `1d`, title and body. Open community chat reached `/chat/187` and populated history/poll/composer. A QA post draft was typed then cleared without submission. |
| Existing share/history compatibility | PASS: older Vibe shares without creator field still rendered and opened Vibe99; historical sender attribution retained. |
| Picker handle/preview | PASS: people showed one `@`, not `@@`; preview showed Vibe caption, activity title and creator handle. |
| New authoritative creator delivery | PASS: UI sent existing QA-labelled Vibe99 to Weekend Photography Circle at14:58; Sending state then sheet dismissal. Actual recipient card showed camera thumbnail, QA caption, `Created by Arjun Sharma` and separate `Shared by Arjun Sharma`; screenshot visually inspected. This created one additional QA share only. |
| New card click/back | PASS: newest14:58 card opened `/vibe/99`, the same caption and Golden Hour Photography Walk; prior back-navigation also returned correctly. |
| Cross-user live poll/sender fix | OFFLINE PASS, BROWSER PENDING: `scripts/chat-realtime-regression-test.mjs` executes actual App callback/mapper and service hydration helper; insert preserves profile/poll, UPDATE merges and refreshes poll, sender requests coalesce, failed profile fetch retries, account-change/cancelled guards ignore stale callbacks. Release owner must validate two-session Activity209 sender and remote vote update on latest export. |

Remaining boundaries: transient Sent label was not captured; multi-recipient/failure-retry, moderator role browser matrix and production deployment QA are not established by these local checks. No real-user moderation/deletion or new Community post occurred.

### Follow-up multi-recipient and delegated-role evidence

- At15:00 QA1 selected two recipients in a single Vibe99 share: QA2 Priya Nair and `QA Sep24 normal onsite` (Activity209). UI showed Send(2), Sending, then dismissed. Actual card appeared in direct room194 and Activity room193 with creator attribution; the direct card opened Vibe99. This supersedes the multi-recipient pending item above.
- Activity room193 browser exposed a further initial-history gap: existing QA poll rendered only question text because `wenitro.ts` bootstrap/history mappings dropped the poll identifier. Both mappings now preserve it, with regression assertions. Updated export `index-4e0cb437f01e42860e37187a74646eaf.js` contains this fix; two-user live retest remains pending.
- Owner QA1 granted only QA2 `moderator` with `can_post=true`, other three permission flags false, in owned Community187. Reload showed persisted Moderator. Separate QA2 agent verified no Settings/Edit/manage-role/delete/Admin controls; Posts composer and attachment controls available. Community already allows general posts, so this verifies restricted management UI, not an admins-only positive permission test. Original Member restoration was requested through UI and is awaiting confirmation; no real-user role changed.
- Read-only production external-share HTTP returned the correct Vibe99 title, caption, canonical URL, Open Graph/Twitter image metadata and correct `/#/vibe/99` destination. Actual third-party WhatsApp preview caching/render remains outside this evidence.

Role cleanup confirmed: after a prolonged request/recovery interval, a fresh QA1 Community187 member list showed QA2 Priya Nair restored to original **Member**. No test role remains elevated. During this interval both agents hit explicit auth/workspace timeout recovery; QA1 underlying Community navigation remained usable beneath the Feed retry banner. External-share second HTTP read returned502, so stable external preview/image availability is not accepted on the first successful metadata response alone.

Additional safe UI checks: Community Back opened all communities; Chat Create Group opened an inline modal immediately with group photo/name requirement and actual saved participant photos (plus initials where absent), then closed without creation. Live `Pri` search eventually returned only Priya Nair, but stale group-picker results persisted while the request was pending. Derived result filtering now applies the current prefix immediately; actual mapper regression and existing request-count regression both pass. No Group record or real-user relationship was created for this check. Persistent Chats0/Activities0 after a failed workspace load is not accepted as correct counts for the known two/one conversations.

## Final evidence reconciliation — latest release-owner update

Anonymous Chrome at `http://127.0.0.1:8082` executed Welcome -> Use email or phone -> Create account. Individual was default; Partner/Business could be selected. Name `person@example.com` produced the explicit email-as-full-name error; invalid email produced its own validation error. Valid name `Priya Nair` and the existing QA2 email showed validation ticks. Switching to Phone preserved Partner intent and displayed full name, phone and Send OTP. **No signup/OTP submission occurred.** This proves local form validation and intent selection, not new-account authentication, backend application creation or approved Partner privileges. Profanity and every client-provided invalid-handle example were not manually exercised.

Latest reported validation: **34 safe offline regression scripts PASS**, TypeScript PASS, Expo export PASS (bundle prefix `189204`). Those checks do not supersede the observed live **Auth user request504 after79440ms**, which remains unresolved. Two-session final poll/history verification, successful phone OTP, successful payment, remaining normal UI cases and production QA are still pending. Temporary QA Moderator/co-host grants were restored; no real-user role was changed.

**READY FOR CLIENT: NO.** No frontend commit, push or production deployment is claimed. The correct Supabase project was initially accessible and required targeted migrations were applied by the release owner, but current authenticated readiness is not accepted while the observed failure remains unresolved.

## Final release reconciliation — supersedes the pending release state above

The earlier `READY FOR CLIENT: NO` and production-pending statements describe the intermediate audit point. They are superseded by the completed stabilization, deployment and production verification below.

- App commit: `408b7fe` (`Stabilize client flows and release QA`), pushed to the normal App `main`.
- App deployment: `dpl_FPnaMjafPSyaPZ32vrYvSMuU57tt`, Vercel **READY**, production alias `https://wenitro-app.vercel.app`.
- Admin: unchanged and clean at `a426974`; existing production Admin remained live at `https://wenitro-admin-roan.vercel.app`.
- Supabase: only project `klyjzbisgycegkkacbjw`; healthy and shared by App/Admin. Four targeted migrations were applied and committed. No unrelated project or safety repository was used.
- Validation: **34/34** safe regression suites PASS; TypeScript PASS; final Expo/Vercel export PASS. Secret and whitespace checks PASS.
- Auth/performance: existing phone OTP PASS; QA1 production email logout/login PASS in **6431 ms**; three production session restores PASS in **2035/1891/1850 ms**. The historical 79.44-second Auth504 did not reproduce after removing redundant serial validation and coalescing only in-flight same-token validation.
- Partner lifecycle: real QA application, reject, bank resubmit, approve, refreshed active capability, Dashboard and hosting PASS. Production Admin shows QA1/QA2 as Partner active and applications approved.
- Activities: normal free, ordinary on-site paid, Partner free and Partner platform-paid classifications PASS. Exact +10-minute initialization PASS. Join/leave/rejoin, comments pagination, activity chat/poll, co-host, participants, save/like and truthful payment states were exercised with QA data.
- Community/Chat/Vibes: Community information/posts/chat PASS; two-account direct Chat and Realtime reply PASS; routed activity history/poll PASS; production Vibe sharing actually delivered in **3834 ms** and the recipient card opened Vibe 99.
- Profile/verification: own/public layouts, owner-control privacy, all four summary destinations, actual saved Instagram URL, verified badge and truthful +20 breakdown PASS.
- NitroBot: replaced the dead placeholder with a deterministic privacy-preserving product-help assistant; Partner/payment guidance and secure support escalation PASS in production.
- Admin reflection: live production dashboard, QA users, Partner applications and all four Activities PASS. QA Admin transaction-route denial is correct role enforcement; no payment success was fabricated.

The final release has no unresolved browser code/configuration blocker. A successful Cashfree sandbox charge was not executed because the instructed QA email payer lacks a verified phone and another OTP was explicitly prohibited. The production app correctly rejected checkout at that security boundary. Native camera/OS-only behavior remains outside browser proof.

**READY FOR CLIENT: YES for the deployed browser release.**
