# WeNitro supplied Android reference analysis

## Reviewed material

- Short login recording: `/Users/vamshipendyala/Downloads/WhatsApp Video 2026-09-08 at 12.30.33.mp4`, 25.7745 seconds, 576×1296.
- Long app tour: `/Users/vamshipendyala/Downloads/WhatsApp Video 2026-09-08 at 12.18.12.mp4`, 107.5448 seconds, 576×1296.
- All six supplied JPEGs: 719×1600.
- Entire short recording reviewed as sequential frames every 0.5s; launch transition additionally at every 0.1s from 2.3–4.1s. Entire long recording reviewed as sequential frames every 2s. This is frame extraction review, not audio review; no audio behavior is needed for the requested UI.
- Contact sheets: `short-sheet-0.jpg` through `short-sheet-2.jpg`, `long-sheet-0.jpg` through `long-sheet-2.jpg`, and `splash-detail-sheet.jpg` in this directory. Individual timestamped full-resolution frames also present.

## Authoritative flow and timing

Short video:

| Recording time | Visible behavior |
| --- | --- |
| 0–1.8s | Android app drawer search. Outside app implementation scope. |
| ~2.0–2.3s | Native Android launch icon centered on system splash, charcoal background. |
| 2.4s | App violet background starts. |
| 2.6–2.9s | Logo, wordmark, tagline and corner circles fade/scale in; from faint/small to full opacity/size. |
| 3.0–3.6s | Fully rendered branded splash. Three tiny dots near bottom, middle dot bright. No evidence these are three marketing slides. |
| 3.7s | Brief crossfade/slide overlap of splash and Welcome. |
| 3.8–6.7s | Welcome stable. No intro shown for this returning user. |
| ~7.0s | Google button becomes light gray, label replaced by centered spinner. Layout retained. |
| 7.5–8.5s | Background darkens under forthcoming native chooser. Spinner remains beneath. |
| 9.0s | Genuine OS Google chooser loads compact dialog. |
| 9.5–10.0s | Native account list visible (four existing identities plus Add another account). Do not recreate this UI in app. |
| 10.5–15.5s | Chooser dismissed; Welcome stays with button spinner while auth resolves. |
| 16.0–17.0s | Feed shell and bottom navbar rendered; gray image/text/card skeletons, subtle changing sheen. |
| 17.5–19.5s | Real Feed content resolves. No profile completion and no first-time interest hero. |
| 20–24s | Existing user briefly visits Vibes, Host, Chat and Profile; then Feed. Future-screen reference only. |
| 24.5–25.7745s | Android recording controls. |

Do not implement fixed eight-second auth delay. Duration is real provider/network latency; spinner lasts only while real auth is pending. Splash itself lasts roughly 1.3s, content entrance roughly 300–400ms, exit roughly 100–200ms. Native account chooser duration is user-controlled.

Long video (future screens, no new screen scope):

- 0–8s: Android launcher/recent-app interaction then launch. Already authenticated.
- 10s: Feed loading skeleton; 12s: real Feed.
- 14–20s: Feed scroll through activities and communities.
- 22s: Activity detail loading skeleton; 24–32s: activity detail and host/participants area.
- 34s: Feed; 36–40s: Vibes.
- 42s: Create & Share; 44s: Chats; 46–48s: Communities tab/membership filters.
- 50s: Profile skeleton; 52–58s: Profile, tabs, trust score.
- 60–68s: Settings and brief loading view.
- 70–72s: Invite Squad.
- 74–76s: Settings; 78–84s: Help & Support chat.
- 86–94s: Settings, Query form, Privacy placeholder, Settings.
- 96–100s: Profile and Social Profiles; 102–104s: Feed; 106s through end: Android controls.
- The long recording does not show fresh intro, Google chooser, profile completion or first-time interest hero. It demonstrates session restoration into Feed.

## Splash geometry and color

Key: `/tmp/wenitro-onboarding-reference/short-003.00.jpg`.

- Full canvas 576×1296; source contains real Android status bar at top and gesture area at bottom. Do not bake either into art.
- Predominant violet approximately #6367EF (JPEG/video shifts from expected brand #6366F1).
- Large paler circle upper right, center roughly (482,94), radius~295; clipped top/right. Lower-left pale circle center~(86,1207), radius~190, clipped left/bottom. Circles fade/expand in.
- White rounded-square logo x191–385,y454–647, size~194, radius~34, slight shadow. Blue/purple intertwined WeNitro icon inside.
- Wordmark centered y704–748, roughly 58px bold, white with soft shadow.
- Tagline centered y789–839, two lines, approximately 26px: `Find your perfect partner for every` / `passion`. Letter spacing roughly 1–2px.
- Three dots centered at y1175, radius~7, spaced~28px; middle white, outer translucent.
- Use dimensions normalized to viewport width, with safe-area-aware vertical adaptation. At width390, scale reference values by 390/576=0.677.

## Welcome geometry and color

Key: `/tmp/wenitro-onboarding-reference/short-004.50.jpg`.

- Dark navy/black vertical background (~#0B0C11 near upper/middle outer area through almost #030709 near bottom); card approx #161824; upper circle approx #191638.
- Purple circle upper-left, spans x−90..350,y−60..350; cropped by viewport edges. Subtle organic/background circle, no complex invented animation.
- Logo outer charcoal rim x223..352,y285..415; white square x231..344,y293..405 (~113 square). Radius~25. Native app icon design, not a generic letter W.
- Center wordmark y469, ~44px bold. Subtitle `ELEVATE YOUR VIBES`, y529, ~20px, letter spacing~2px, gray.
- Welcome card x32,y605,w512,h441; radius~44; subtle 1–2px gray border.
- `Welcome 👋` centered y663, approximately38px bold white.
- Support lines y720 and752: `Join communities, discover trending activities,` / `and connect with your squad securely.` approximately20px, muted gray.
- Google button x79,y832,w418,h80,r20; white; Google G at x157,y859, text black~24px bold. Button row centered.
- Legal y957/983, font~16px: `By continuing, you agree to our Terms & Conditions and` / `Privacy Policy`. Terms/Privacy violet and visibly underlined.
- No email/phone form, no Apple, no Partner choice on this reference screen.
- Loading key: `short-011.50.jpg`; chooser key: `short-009.50.jpg`. Button retains identical dimensions, gray fill, text replaced by center spinner. App must use native chooser and genuine async completion.

## Intro screenshot (no motion recorded)

Source: `/Users/vamshipendyala/Downloads/WhatsApp Image 2026-09-08 at 11.38.38.jpeg`.

- Dark almost-black #08090D/#0A0D14. Header at y110–164: purple WeNitro symbol plus two-tone wordmark x41–245; Skip pill x575,y110,w102,h53,r28, subtle white border.
- Large tilted social UI composition x<0..>719, y~306..1020. Cards rotate roughly −17 degrees. Back phone/feed panel, front left motorcycle card, right nighttime skate card; secondary lower cards. Cyan and violet edge glows, soft radial glow behind, dark edge fade at bottom.
- Distinct card content: `Sunset Canyon Run` (motorcycle photo); `City Lights Night Skate` (skater photo); secondary `5K Run Completed` and `Downtown Coffee Meetup`. These are static marketing artwork, not database fixture content.
- Actual heading x55,y1024: `Real Connections` in white (~61px bold), line2 `Start Here` in violet at y1100. Do not flatten heading into hero image.
- Support x55,y1195, around27px; two lines with `unforgettable memories.` violet bold on second line.
- `Swipe to explore` centered aroundy1361, violet italic, hand-drawn directional flourishes on both sides.
- Next button x42,y1424,w635,h94,r48; horizontal violet→blue→cyan gradient; `Next` centered with right arrow, font~29px bold.
- Screenshot only proves one marketing slide. Next/Skip/swipe should move to Welcome; do not invent more slides. Float/parallax can be subtle but is a design implementation choice, not motion proven by supplied video.

## Profile completion screenshot

Source: `/Users/vamshipendyala/Downloads/WhatsApp Image 2026-09-08 at 11.38.38 (1).jpeg`.

- Background #111828 (source JPEG; intended likely #111827). Inputs/avatar #202938 (likely #1F2937). Brand button #6366F1.
- Avatar circle x276,y219,size166; thin gray border. Center outline-person symbol. Camera badge x396,y337,size46, purple fill with white double outline, overlaps bottom-right.
- `Welcome to WeNitro!` centered y414, approx46px bold. Subtitle centered y473/508, approx26px gray, exact copy `Let's complete your profile setup to get you` / `connected.`
- Fields horizontal padding42, usable width635. Full Name label y600, font~23; input x42,y638,h87,r22. Username labely760, inputy796,h87. DOB labely930,inputy967,h86. Text~26, muted outline-person icons at x67. DOB calendar purple, rightaligned x627.
- Gender label x42,y1116 uppercase muted gray~22. First row pills y1156,h75 with widths104,129,162 and gaps20; second row Prefer not to say x42,y1249,w212,h73. Outlined inactive pills, no selection shown. User may leave gender empty unless backend already requires it.
- Get Started button x42,y1372,w635,h77,r21, violet; text~25px bold and yellow lightning. Generous bottom breathing room before gesture at1584.
- At width390 use scale .5424: padding23, input47px, heading25px, avatar90px, CTA42px, respecting native accessibility minimum touch size44px. Top gap is substantial in reference; screen should scroll at shorter heights/keyboard rather than compress labels invisibly.
- Name/username prefilled, DOB blank, gender unselected. This supports prefill and nullable gender; cannot prove DOB is mandatory or optional from still image alone.

## First-time Feed welcome screenshot

Source: `/Users/vamshipendyala/Downloads/WhatsApp Image 2026-09-08 at 11.38.39.jpeg`.

- Dark navy top fades to black bottom. Green welcome banner x28,y84,w663,h89,r20, checkmark at55, copy at99, close at644. Text `Welcome to WeNitro! ⚡`.
- Central circle x169,y402,diameter381, diagonal/peripheral blue→cyan gradient. Four centered text lines y503,551,602,650: white `Find People.` / `Do Something.`; cyan `Build Real` / `Connections.` around37px bold.
- Six 100–106px image circles with thin violet rings: Workout center(138,339), Travel(580,339), Food(73,584), Hobbies(646,584), Startup(166,809), Social Impact(548,809). Gray labels beneath each around20px.
- Down chevron purple atcenter(359,997); question centered y1055, ~30px bold.
- Explore Activities x49,y1124,w622,h93,r48, horizontal violet→cyan; boldwhite~29px, right arrow.
- Bottom navbar y1496,h104 includes actual Feed/Vibes/Host/Chat/Profile. Preserve existing app navigation implementation, do not redesign other screens as part of this first-time view.
- Image does not show category taps or motion. Categories are presentation elements unless product/backend already supports an observed relevant action. Do not invent category routing. Explore is the explicit transition into existing Activity/Feed content.
- No recording demonstrates this first-time hero. Render only immediately after completing new onboarding; do not impose on legacy users.

## Remaining screenshot context (future screens)

- `11.38.39 (1).jpeg`: Vibes dark navy page with engagement rail and bottom navbar. Not a requested redesign.
- `11.38.40.jpeg`: Create & Share has three gradient tinted cards Host an Activity / Post a Vibe / Create a Community. Not a requested redesign.
- `11.38.40 (1).jpeg`: Messages with Chats/Groups/Communities tabs, search and empty personal chats. Not a requested redesign.

## Evidence boundaries

- Only one intro slide is supplied; three splash dots do not prove three distinct intro screens.
- Existing-user direct Feed is evidenced by both recordings. New-user Profile→first-time Feed is inferred from consecutive screenshot timestamps and required by the written request, not replayed in either video.
- No Google error/cancel screen is shown; safe recovery is a functional requirement, not a visual reference state.
- No DOB picker interaction or image picker is shown; use platform-appropriate functional controls.
- No username availability UI is shown; add minimal nonintrusive validation state.
- Account chooser content includes personal identities; frame should remain private reference, not embedded into app assets or published docs.
