# Phase 4 reference inventory — September 8, 2026

Completed before code changes. Both entire video timelines were inspected through a sequential 4-fps frame review, with full-size details used for implementation. This is not continuous video playback.

Short recording: 50.10 seconds, 200 frames, seven chronological contact sheets.
Long recording: 126.19 seconds, 505 frames, sixteen chronological contact sheets.
Frames/contact sheets: `/tmp/wenitro-phase4-reference/{short,long}`.

## Short recording

- 0–2s, 5.25–6s, 12.25–14.5s: Feed, compact WeNitro header, search/bell, locked Nitro Store card (500 unlock target shown), horizontal All/Trending/Nearby/Today chips, Activity for You/filter, image cards, Upcoming overlay, title/heart, TBD date, location, creator/member avatars, five equal bottom navigation items.
- 2.25–5s: notifications navigation (header Activity), list skeleton then bell/No notifications yet. Preserve existing notifications internals per explicit user scope.
- 6.25–12s: Search; Activities/People/Communities pills, search placeholder switches per tab, empty initial surface. No invented suggestions.
- 14.5–16.5s: Messages Chats and Groups underline tabs, specific search fields and empty text.
- 16.5–20.5s: Communities tab, All/Joined/Created filters, row skeletons then real avatar/name/category/You preview/time, purple floating plus.
- 20.75–21.5s and 47.25–48.5s: Profile, handle header with store/menu actions, avatar/name/indicator, Connect Social, trust-badge CTA, four Activities/Squad/Nitro/Karma cards, Edit profile/Contact, locked achievements, trust score ring and contributions, My Vibes/Upcoming/Completed/Drafts tabs.
- 21.5–23s, 41.5–47s: Settings, Appearance System/Light/Dark, Security & Privacy, Squad Referrals, Support, Legal, Account, version line. Only hierarchy is evidenced; preserve current implementations behind unopened rows.
- 23.25–41.25s: Privacy grouped PROFILE/CONTACT INFO/INTERACTIONS/AVAILABILITY. Centered dark selection dialogs, selected purple/check, Cancel footer. Profile Public/Squad Only; messaging Everyone/Squad Only; email and phone Everyone/Squad Only/Private (None). Selection values update. Online Status toggle changes. Sync note.
- 48.75–end: Android system shade; not an application screen.

## Long recording

- 0–3s: Android task switcher and profile restoration.
- 3–6.5s: Profile/Feed/Vibes navigation; preserve successful Vibes viewer.
- 6.5–10.75s: Post a Vibe no-events state, back to Feed, Host entry.
- 11–12.5s: Create & Share landing.
- 12.5–19s: Create Community bottom sheet over Host; field focus/keyboard adjusts sheet, category initially loading then available.
- 20–25.5s: Avatar system picker and actual Edit Photo crop; circle preview with bottom red remove strip.
- 27.75–42s: Category dropdown anchored over form: search top, narrow row dividers, long scrolling list, purple selected row/check. 22 entries: [QA] Automation, Business, Career, Creative, Education, Entertainment, Fitness, Food, Jobs, Music, Networking, Outdoors, Party, Politics, Professional, Social, Social Work, Socialize, Sports, Study, Technology, Travel.
- 42.75–47.75s: Create loading/disabled CTA, green success check/X toast, direct conversation skeleton then empty.
- 48–51.5s: Community conversation header/back/name, keyboard composer, text send/right purple bubble, timestamp/check, actual date separator.
- 52.5–54.5s: Chat Options bottom sheet: Share Photo, Share Video, Create Poll, Cancel.
- 54.5–60s: Create a Poll sheet, Question, Options (2 to 6 options), Option 1/2, + Add Option, Post Poll; keyboard-aware, CTA disabled until valid.
- 60–62s: Poll card/right aligned, question, option rows/percentages, Total Votes. No vote change interaction demonstrated: choose one persistent vote per member, permit deliberate change only if explicitly implemented and tested.
- 62–66.5s: Share Video → picker → purple outlined black preview card, film icon/Play Video; no auto-download/playback.
- 66.5–72.5s: Share Photo → picker → purple outlined image message; scroll retained history.
- 73.5–77.5s: Community Info header/back/share/settings, avatar/name, category/description card, Members (1), scoped member search, creator row with handle; member tap opens profile skeleton.
- 77.5–84s: Profile skeleton, app leaves/relaunches and existing splash. Do not imitate crash/system screens.
- 84–89.5s: Feed skeleton → real cards; Host, Messages and Communities loading/list. Created community reappears with You: image.jpg preview and timestamp.
- 90–92.5s: Reopen same persisted conversation; header → Community Info.
- 92.75–96.25s: Community Settings; INFORMATION/Edit Community Profile, PREFERENCES three toggles, Delete Community outlined red. Edit Community Info sheet uses same create fields, Close and Save Changes.
- 96.5–101.5s: Verified Only Check/Only blue ticks can join; Requires Admin Approval/Requests go to list (reveals View Pending Join Requests); Only Admins can post/Announcements mode.
- 101.75–103.5s: Join Requests page, small loading indicator then No pending join requests.
- 105.5–109s: Delete Community confirmation centered modal, explanation, Cancel/Delete. User cancels; never imitate a deletion without confirmation.
- 111.25–114.75s: Community system share text/name/stable wenitro://community/join/<id>.
- 115–120.25s: Return to conversation/Communities list/Groups/Chats. Tab and filter state retained.
- 120.5–125s: Host → Post a Vibe, Loading active events... → No events found.
- 125.25–end: Android shade; not application UI.

## Boundaries

Preserve Google/provider configuration, fallback, onboarding, successful Vibe editor/viewer, Host Activity, Activity Detail/Join, personal chat detail, group internals, notifications, Cashfree and frozen Partner files. No commits, pushes, App/Admin/frontend deployments or emulator work. Only missing backend functions/security fields are added to the verified Supabase project. No fake social data or economy/verification claims.
