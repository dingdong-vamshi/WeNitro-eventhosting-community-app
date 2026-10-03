# CHAT001 integrated production acceptance plan

This is a work plan, not acceptance evidence. Wait for the integration coordinator to publish the exact App/Admin deployment IDs and applied backend migrations. Use actual deployed URLs, normal authenticated QA identities and scoped synthetic fixtures. Capture the before-action state and resulting state whenever a static image cannot prove the requested interaction. Record URL, viewport, deployment, account role, fixture ID, interaction and screenshot path. Do not expose passwords, JWTs, service keys, payment secrets or real users' private data.

The source index is `docs/chat001-requirement-evidence-index.json`: 249 source-clause occurrences plus 22 badge entries. This is not a deduplicated final requirement count. Split compound requests and reconcile overlaps before calculating final totals. Check every clause, not just each page heading. Newer requirements override older screenshots.

## A — Onboarding, Home, Hero, Activities

- A1: signed-out three-slide Next → Next → Finish; Skip, dots, swipe, replay; short/narrow and desktop spacing. Prior Next evidence remains valid only if integrated flow unchanged.
- A2/B3: rotating welcome taglines across loads; sign-in artwork and readable contrast.
- A3–6/B2: email branding/confirmation, validation tick and Unicode/profanity/name rejection; Google new/existing identity and session; recovery request/reset/login; phone send/verify/mapping. Provider access does not prove actual delivered OTP or mailbox receipt. Retain precise external limitations.
- A7–8/B4–5/B8–9: all four exact approved hero assets, no outer blue patch or duplicate text, reduced height, all CTA destinations, Home header/Store naming, no empty block, Invite/Nitro blue-purple styling and readable responsive type. Capture each distinct hero and CTA destination.
- B6–7/B1: ten-Nitro invite explanation, policy wording, View More and actual external policy/terms destinations.
- A9/B10–11/B17: collapsed/expanded search, notification/filter placement, full-image/fallback cards, complete host identity and click destination, See All and Back Home. Exercise date bounds, free/paid/all, gender, category, Reset/Apply and persisted/reopened state with matching actual results.
- A10–16/B12–15/B22: readable timeline; long-press likers and profile; Host/participant photos/initials; Message; ended participant/nonparticipant states and server denial; participant comments/identity; cancelled/deleted chat hidden and stale-write denial; self/Host No Show rating denial; actual anonymous rating +2 gold popup, multiple legitimate rewards, duplicate zero, Nitro history. Preserve original Host when promoting/demoting Co-host.
- A17–19/B13/B20–21: tribe imagery/filter navigation; Host Responsibly with prominent suspension consequence and Cancel/Continue; upload warning and actual picker continuation; default times/invalid boundaries; ordinary non-Partner Paid switch with no platform price/checkout; accurate Maps/Places provider status.

## B — Communities, Posts, Chat, Vibes

- A20–24/B23–27/B35–38: Community header/search/back, smaller cover and fallback, member count/avatar/list/profile, authorized remove-member and moderator actions, cover edit reload and owner storage authorization; Posts separate from Chat, post video yes and post poll absent; poll voter identities; Chat Back returns originating Community.
- B18/B25–27/B34–38: correct chat names, DPs, timestamps, unread counts/filter, case-insensitive live search; plus opens direct/group create, group avatar pick/preview/reload/fallback; info opens linked Activity; poll create/vote; All includes People and Groups; stories mark seen; quiet indicator absent when inactive. Block/unblock must preserve old history and deny new writes while blocked. Photo/Poll allowed, new Video forbidden in all Chat types.
- A37–38/B16/B19/B32–33: common Vibe composer for direct and activity entry, optional activity media-to-Vibe; reels vertical/newest/all menu, creator identity, linked activity, no obsolete arrows/header; meaningful sharing metadata/thumbnail/branding for Activity/Community/Vibe; recipient chooser loads real identities and fallbacks; delete own chat message/media. Anonymous Community posts/media must hide member-visible author identity while Admin attribution remains available.

## C — Profile, Verification, Badges, Trust

- A25–31/B28–30: owner/public Profile design, Community images, Vibes first, social links/plus/Store, upcoming/completed lists; three-photo add/view/change/delete/set-primary and public read-only gallery, fourth-photo and other-user-write denial; deduplicated Squad with no self; valid Save returns Profile, invalid Save stays editable.
- Camera-only selfie, preview and verification review; verification adds Trust rather than Nitro; stage-dependent verification badge. No simulated approval presented as actual KYC/phone verification. Aadhaar requires licensed provider.
- Trust breakdown: maximum100; email/Google10, phone10, approved selfie10, Aadhaar20, social10, rating4+10 that is removed below4; ten qualifying Activities joined20/twenty30 nonstacking; Nitro independent. Capture own and public breakdown and validate backend calculations.
- All 22 badges: exact DOCX criterion, locked/earned UI, progress/detail, local threshold boundaries, exclusions, idempotency and persisted earned timestamps. Production catalog/read authorization and real current states; do not manufacture every earned production threshold or confuse old free-excluding Popular Partner criterion with corrected 100 qualifying participants including free.

## D — Admin

- A35–36/A38: real target DB login/dashboard; users, Activities, Communities, Vibes, participants, verification, Partner application review; Master role grant/revoke/suspend boundaries and audit using temporary QA users only; revoke all temporary authority after verification.
- Pin/unpin and category correction reflected in App and restored; category add/edit/archive/restore plus immutable historical references; ordinary member/finance role denial. Test local category fetch retry and deployed saved catalog reflected across App selectors.
- Anonymous author audit, member denial, reports review/resolution persistence, user restrictions and restore, Activity moderation and audit. Use private unpaid QA Activity282 where suitable; never cancel/restore financial fixtures incorrectly.
- Targeted login announcement creation/audience/actual recipient popup/read receipt/disable. Campaign/template/settings/rewards forms must persist genuine supported operations or explicitly show unavailable provider state without fake success. Never broadcast to real users during QA.
- New analytics must state measured UTC windows and observation start. Empty evidence cannot be shown as fabricated historical retention, views or DAU. Test authorization of analytics and observation APIs.
- Header search/help/profile/notification count, search query changes, current route links, export and error states.

## E — Partner and Cashfree

- A32–34/B20: application instructions, required terms agreement persisted, category prices/capacity/questions and selected amount/details; dashboard participant data; external URL; visible Partner distinction on every relevant list.
- Ordinary non-Partner costs remain off-platform. Partner requires legitimate paid confirmation and answers before joined. Test ended activity denial, legacy overload protection, changed/missing category, capacity, forged amount, private payment data and idempotent reconciliation.
- Hosted interactive Sandbox checkout must actually complete in provider UI. Existing event280/payment41 proof is valid prior baseline, but payment code changes require focused repeat. No real-money payout/refund/bank transfer.

## F — Backend/API and cross-user verification

- RLS: public/private Activities, memberships, comments, co-host edit/demotion, ended writes, reports, storage, profile gallery, privacy, blocked Chat, deleted Activity Chat, anonymous posts/media/ratings, Admin role and same-session revocation.
- Nitro reward ledger and referrals: legitimate award once, duplicate zero, no self/referral farming, failed/cancelled/removed/suspended exclusions; negative spend history and Store threshold.
- Anonymous media signed capability: no identifiable owner path, authorized mint/read, tamper denial, natural expiry, soft deletion denial, range behavior, storage direct path denial, Admin attribution. Prior authentic one-hour expiry proof may be reused when capability implementation unchanged; deleted fixture36 cannot be blindly reused.
- Cashfree backend/provider validation, all22 badge rules, trust conditions; run current-target cross-user tests after deployment with fixture guards and cleanup.
- No callback status or HTTP200 alone proves semantic success. Inspect returned data, persistent rows and denied unauthorized outcomes.

## Additional requirements / final reconciliation

- A37: Activity creation opens detail; Community Created state; SOS web/native distinction; NitroBot FAQ, support query persistence; one-time Play Store action reward without pretending to verify a review; Hubble threshold and provider hold.
- A38: first-signup policies, original Host, Co-host demotion, leave→rejoin approval, negative Nitro history, Partner URL, privacy/security and developer documentation.
- A39–40: record only genuinely unresolved ambiguities after investigation; no blanket acceptance until fixable bugs and evidence gaps are closed.
- B31 and B39: separator/end pages, retained for traceability, no standalone implementation item.
- Final evidence must distinguish local source contracts, executable local behavior, live authenticated API tests, actual deployed UI interactions and provider/native holds. Final numbers are computed from deduplicated atomic requirements, never filenames or raw assertion totals.
