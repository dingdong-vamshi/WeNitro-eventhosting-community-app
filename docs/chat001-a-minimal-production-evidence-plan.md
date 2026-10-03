# A126 production evidence reconciliation

This is an evidence plan, not a new acceptance run. The paired `chat001-a-assessments-proposed.json` preserves 126 exact canonical IDs, their local checks, technical checks, current coordinator screenshots and specific prior production observations. Every row remains `releaseReviewed: false`.

The earlier all-308 draft's 68 production-field gaps and 129 screenshot-field gaps must not be described as 68/129 untested features. Those were missing mappings across all owners. For A126, this reconciliation locates current screenshot records for 46 rows, prior scoped production observations for 75, technical checks for 45 and historical screenshot candidates for 17. These sets overlap. Thirteen A rows still have no mapped production observation, technical check or screenshot in the inspected inputs; they are listed explicitly in the JSON. A file's existence is not final screenshot acceptance.

## Priority 1: changed implementation after final batch deployment

1. **Cold load / first-signup Profile Completion:** capture purple splash over successive loads showing different original slogans (`AUTH-TAGLINE`). At the actual first-signup photo action, capture Upload Responsibly; Cancel must leave the draft untouched; Continue must open the intended picker (`UPLOAD-WARNING`, `UPLOAD-WARNING-CANCEL`, `UPLOAD-WARNING-CONTINUE`). Earlier Profile and Activity picker proof does not cover this newly repaired path. Do not create a false phone-verified fixture for it.
2. **Existing Activity detail:** show actual participant photos and missing/broken-photo initials with round presentation (`AVATAR-PHOTOS`, `AVATAR-FALLBACK`, `AVATAR-SHAPE`). Home/Profile avatar proof is already available but cannot substitute for the newly repaired inline participant path.
3. **Settings → NitroBot:** ask the Community poll question and capture the corrected answer that polls live in the Community conversation (`HELP-NITROBOT`). The earlier successful Activity FAQ is preserved.
4. **Activity → SOS / notification:** capture the actual safety sheet, share/copy result and saved-contact access (`SOS-ACTION`). Separately retain real deployed scheduler/recipient proof of the exact ten-minute reminder and its notification (`SOS-SAFETY-REMINDER`). Current emergency-contact empty validation is only a setup check, not SOS flow evidence.

## Priority 2: one Activity and one Host-form batch fill the largest visual gaps

- **Home → See All → Activity → Activity Chat → Back → detail → Back → Activities → Back → Home:** capture actual destinations (`ACT-SEE-ALL`, `ACT-CHAT-OPEN`, `ACT-CHAT-BACK`, `ACT-DETAIL-BACK`, `ACT-BACK-HOME`). Existing Activity Chat API success does not show return navigation.
- **On the same Activity:** capture title Public/Private label, emphasized full Host, tags beneath About, timeline without overlap and eligible comment identity (`ACT-VISIBILITY-LABEL`, `ACT-HOST-IDENTITY`, `ACT-TAGS-POSITION`, `ACT-TIMELINE`, `UI-TYPE-READABILITY`, `ACT-COMMENT-IDENTITY`). Open Like's liker list and an actual liker profile (`ACT-LIKERS-LIST`, `ACT-LIKER-PROFILE`); current evidence proves liker data, not those exact gestures. Host Message from a host profile has prior proof; exercise the direct Activity control if that is distinct.
- **Open a fresh Host draft:** capture creation time and start now+10 minutes, end=start+1 hour, registration=start with all values visible (`HOST-START-DEFAULT`, `HOST-END-DEFAULT`, `HOST-REGISTRATION-DEFAULT`, `HOST-TIMEZONE`). Existing error screenshots prove invalid schedules, not defaults. `production-host-schedule-defaults.png` was visually inspected and crops the actual values: do not use it as numeric proof.
- **If a synthetic future Activity is needed anyway:** publish once and capture its created detail (`ACT-CREATE-DESTINATION`), inspect role-appropriate edit/delete controls (`ACT-HOST-EDIT`, `ACT-HOST-DELETE`) without cancelling shared fixtures. Existing authenticated backend lifecycle/authorization proof remains reusable. The old grouped UI-creation ledger does not conclusively isolate destination behavior.
- **Existing ended synthetic Activity:** capture participant Rate Participants / nonparticipant Activity Ended and rating list Host/self/No Show controls (`ACT-ENDED-PARTICIPANT`, `ACT-ENDED-NONPARTICIPANT`, `RATE-HOST-LABEL`, `RATE-NO-SELF`, `RATE-NO-SHOW`, `RATE-HOST-NO-SHOW`, ended edit/remove/leave restrictions). Do not manufacture another legitimate rating merely to reproduce reward evidence: actual prior +2 gold receipt, two distinct awards, no duplicate award and persisted history are already documented.

## Priority 3: small missing interaction proof during ordinary smoke

- Swipe one intro slide (`ONB-SWIPE`): prior deployed swipe is recorded, while the recent Next/dots/Skip/Finish/replay screenshots already cover their own actions.
- Open a Tribe and verify category-filtered Activities (`TRIBE-PRESENTATION`, `TRIBE-NAVIGATION`). Fitness→filtered Activities has an explicit earlier production record; a current screenshot fills the visual provenance gap.
- Capture Home's header, reduced hero and blue/purple Nitro/Invite card in the same scroll (`HOME-HEADER`, `HERO-SIZE`, `HOME-NITRO-CARD`). The no-outer-blue-patch screenshot was visually rechecked and is valid prior layout proof.
- Fresh Google new-account vs existing-account behavior still needs distinct scopes if both are to be marked accepted: the prior ledger proves real Google login, unique target identity and reload restoration, but does not identify which account-lifecycle case was exercised. Do not discard that existing provider success or claim it covers both cases.

## Prior production evidence that does not need to be rediscovered

- **Co-host:** Activity277 promotion and demotion were actually clicked and reloaded; original creator remained Host; demoted member lost edit access. Earlier authenticated checks separately cover approve/reject/remove/edit and rejoin. The promotion screenshot was visually rechecked. These remain prior-release proofs, not fresh final-release claims.
- **Ratings/Nitro:** actual anonymous rating233 showed a gold +2 receipt (visually rechecked); separate API tests prove named/anonymous rewards, two distinct awards, retry zero, self/Host-No-Show denial and ended edit/remove/leave denial. Positive ledger screenshot exists. Negative live spend remains unproved while Hubble is disabled.
- **Legal:** both actual View More controls opened the intended external privacy/terms headings. Four exact screenshots exist. Repeating external navigation is a smoke choice, not an evidence-from-zero requirement.
- **Discovery:** real date+Free matching QA277, retained filter sheet and Reset are recorded; latest integrated screenshots repeat those scopes. Service-level gender/category/verified-only checks exist; native date picker remains device-specific.
- **Host/upload warnings:** Partner and ordinary cost-mode forms, warning/cancel, and Profile Continue→picker→upload have prior records. They do not prove the new first-signup warning.
- **Policy / rewards / private access:** first-signup policy receipt idempotency/privacy and completion gate, Play Store once-only reward, referral anti-abuse and private Activity RLS have actual authenticated backend proof. Do not issue duplicate rewards solely for screenshots. Hubble UI must remain honest about unavailable redemption.

## Provider execution that UI screenshots cannot resolve

Controlled real inbox verification/recovery/reset/login and a real configured sender; actual physical SMS OTP send/verify/new/existing-phone identity; the separate Google redirect callback configuration; client-authorized Google Maps credentials; real Hubble redemption. Record the exact current dependency and existing configuration/API proof. A synthetic confirmed fixture, generated recovery URL, Photon fallback or disabled Store is not successful provider execution.

## Exclusions retained

The earlier no-Next interpretation, old first-signup omission, old bottom-only Partner Terms gate, broad A38 media claim and native SOS-tracker interpretation are not reused as acceptance. Earlier failed technical attempts remain in their original records; only named later successful retests are linked. The three genuinely stale Admin screenshots are outside this A-only report and remain excluded by their owner.
