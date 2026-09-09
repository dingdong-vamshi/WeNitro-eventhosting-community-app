# WENITRO GOOGLE + COMMUNITY + VIBE ENTRY

September 8 local baseline, `/Users/vamshipendyala/Desktop/wenitro-phone-app-`.
Supabase project: `klyjzbisgycegkkacbjw` (reverified healthy before migrations).

## GOOGLE

| Check | Result |
|---|---|
| Client ID | CONFIGURED — existing Web OAuth client reused |
| Client Secret | CONFIGURED SERVER-SIDE in Supabase provider settings only |
| Secret exposed in frontend | NO — source, local frontend environment and final export checked |
| Supabase Google provider | PASS — Dashboard enabled; public Auth settings HTTP 200, Google true |
| Google login | FAIL — live Google credential acquisition unverified |
| Supabase Google session | FAIL — no Google credential/session returned |
| Existing Google user | FAIL — live login unverified; isolated routing/exchange regressions pass |
| New Google user routing | FAIL — live login unverified; isolated onboarding regressions pass |
| Email/Phone fallback preserved | PASS — both provider flags enabled, fallback browser navigation works; existing QA identity mappings unchanged |

The current implementation uses GIS on web and native Google Sign-In on Android/iOS, then Supabase ID-token exchange. Nonce checks remain enabled. The browser attempt at `http://127.0.0.1:8081` returned a FedCM NetworkError before returning a Google token. This is not evidence of a Supabase provider rejection. Origin/consent configuration and embedded-browser FedCM behavior remain possible causes.

The connected Google Cloud account cannot see project number `866660461050`, which owns Web client `866660461050-r2ijj81pp8g0kmrln2pucihne79ul5l3.apps.googleusercontent.com`. No unrelated Cloud project was modified. Owner-account access was requested while UI work continued.

Owner verification: Google Auth Platform → Clients → existing Web client → Authorized JavaScript origins. Check the actual local origins `http://localhost:8081` and `http://127.0.0.1:8081`. Verify the intended deployed origin before adding it. Callback, for authorization-code flows: `https://klyjzbisgycegkkacbjw.supabase.co/auth/v1/callback`; the current ID-token flow does not navigate through it. Check consent audience/test users and Android package `com.wenitro.app` with its real signing certificate fingerprints. No fabricated native client IDs or fingerprints were added. Optional iOS client registration remains unverified.

No Google-driven users were created, converted, or reset. Google logout/login and restoration therefore remain unverified. The existing phone session restored after browser reload.

## COMMUNITY CREATION

| Check | Result |
|---|---|
| Host entry | PASS |
| Bottom sheet over Host | PASS |
| Community Name | PASS — existing 3–100 character constraint |
| Description | PASS — 10-character minimum evidenced in video |
| Avatar picker | PASS — existing Storage service, upload at create |
| Avatar preview/remove | PASS — circular preview, removal/reselection and actual square crop |
| Interest Category | PASS — shared 11-category taxonomy, searchable |
| Create Community | PASS — one actual UI creation |
| Duplicate protection | PASS — synchronous submission lock, disabled controls during save |
| Success toast | PASS — green/check/X, 3.2-second dismissal; isolated visual and manual dismissal verified |

Created exactly one temporary QA community, room 140. Creator 44 became its sole admin member through the existing `community_create` RPC. No new Community database or Storage bucket was introduced. The existing default rules are preserved. The old creation screen was replaced; posts, comments, reactions and media-post implementations were retained.

## COMMUNITY CHAT

| Check | Result |
|---|---|
| Post-create routing | PASS — directly into the same room ID |
| Header | PASS — back, avatar and community name |
| Empty state | PASS |
| Composer | PASS — plus, text field, send |
| Send | PASS — one actual message through existing RPC |
| Persistence | PASS — SQL verified, page reloaded, conversation reopened from inbox |

The one QA message was persisted as message 118, sender 44, delivered true. A rollback test reused its client UUID and confirmed there was still exactly one message. The new UI reuses client UUIDs for unchanged retries, subscribes to existing private room channels, paginates history, and only displays confirmed messages. A single check reflects persistence; double checks require an actual read event. No unread/read status is fabricated.

An existing `list_chat_inbox` filter excluded every community. The migration removes that exclusion while preserving the current-user membership predicate and all personal/group inbox behavior. Room type now reaches the UI so community chats use the reference layout. Existing community details/posts remain accessible from the conversation header, with an Open conversation action for members.

## VIBE

| Check | Result |
|---|---|
| Post Vibe entry | PASS |
| Eligible-event loading | PASS |
| No-events state | PASS — isolated browser visual plus real database empty-account branch |
| Existing working Vibe creation preserved | PASS — editor/upload/RPC retained; viewer unchanged |
| Eligible user reaches existing editor | PASS — signed-in user 44 saw its five eligible activities |

Eligibility uses real hosts or approved/going participants on nondeleted, noncancelled published/completed events. Completed/past activities remain eligible for highlights. Pending, interested, payment-required and unrelated activities do not qualify. A bounded cursor query retrieves 50 items at a time; the editor can load further eligible pages. Errors are distinct from no-events results.

A trigger enforces the same eligibility when creating or changing a linked Vibe. Historical Vibes and null-event posts are retained; trusted service-role maintenance keeps its existing access. No events or Vibes were created for QA.

The post-save response now uses the exact returned Vibe ID. If media URL signing fails after the RPC commits, the UI retains that upload's local preview rather than reloading a discovery feed, choosing an unrelated reel, or encouraging another publication. Isolated tests cover successful signing, signing errors/throws, RPC rejection, pagination and abort-signal forwarding.

## VISUAL FIDELITY

| Surface | Result |
|---|---|
| Create Community | MATCH — reference structure, colors, fields, crop, CTA and overlay |
| Community Chat | MATCH — navy background, header, right purple bubble, timestamp, composer |
| No Events Vibe | MATCH — calendar, title and reference copy |

The complete 51.23-second recording was decoded at 4 fps (205 frames), and all nine timeline contact sheets plus detailed transition frames were inspected. This was full-timeline frame review, not continuous video playback. Browser views were checked at 390×844, 360×800 and 412×915 across the new flows, with settled layout bounds and no horizontal overflow. This is a visual comparison, not a pixel-identical claim. Native keyboard, native photo crop differences and final device feel remain manual QA; keyboard-aware containers and scrollable fields are implemented.

## REGRESSION

| Check | Result |
|---|---|
| Onboarding | PASS — existing isolated suite |
| Auth fallback | PASS — isolated suite and browser entry |
| Activities | PASS — Host suite; original hosting flow preserved |
| Existing Communities | PASS — records/memberships preserved, inbox reopening verified |
| Existing Vibes | PASS — 44 records retained; viewer implementation unchanged |
| Chat | PASS — actual send/reload/reopen; membership and sender SQL checks |
| Cashfree | UNCHANGED — no payment configuration/deployment changes |
| Partner | PAUSED/UNCHANGED — all 12 protected file hashes match |

18 SQL assertions passed in a transaction and rolled back: owner/admin linkage, inbox membership, host/participant eligibility, zero-eligible branch, duplicate message retry, delivered record, sender spoof rejection, private room/message invisibility, nonmember send rejection, unauthorized Vibe rejection, RLS and anonymous RPC access.

All four protected users retain their existing Auth links, completed onboarding and verification levels: Priya 34 and Suchit 35 verified; Vamshi phone 44 and email 47 unverified. No password, provider identity, account type or verification conversion was performed.

Cleanup was completed with exact-ID and ownership/content guards. Room 140 and message 118 were removed, and its single uploaded avatar was deleted using Supabase Storage Dashboard (not a metadata-only SQL delete). Counts returned to the pre-QA baseline: **16 communities, 115 messages, 7 posts, 44 Vibes**. No QA room/message/avatar remains.

Security advisors remain at the existing baseline: 63 exposed authenticated SECURITY DEFINER notices and one leaked-password-protection notice; no new finding category/count. Existing notices were not expanded into unrelated security changes. References: [function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## BUILDS

- TypeScript: PASS — `npx tsc --noEmit`, zero errors.
- Web: PASS — `npx expo export --platform web --output-dir /tmp/wenitro-phase3-export-final`.
- Mobile browser: PASS — no app runtime error logs during the final Community/Vibe check.
- Tests: Google auth, onboarding profile, Host activity, 12 Partner/auth cases, 21 registration-question assertions, Phase 3 Vibe recovery and 18 database assertions all pass.
- Android emulator used: NO.
- `git diff --check`: PASS.

## SOURCE CONTROL

Commit: NO. Push: NO. App/Admin/frontend deploy: NO.

Source changes remain local. The authorized Supabase Google settings and these two database migrations were applied remotely to the correct project:

- `20260908095617_phase3_vibe_activity_eligibility.sql`
- `20260908100659_phase3_community_chat_inbox.sql`

No Partner rules or Admin source were changed. Existing unrelated working-tree changes were preserved.

## MANUAL QA

1. **Google Login:** after the owner verifies the existing client's configuration, open Welcome in a regular supported browser/native build → Continue with Google → choose an account. Completed linked profiles should go to Feed; new/incomplete profiles should go to Profile Completion. Then reload, log out and log in again. Confirm exactly one identity/profile relationship.
2. **Email/Phone fallback:** Welcome → Use email or phone instead → sign in using an existing QA account's current credentials/OTP. Confirm Feed, without resetting or converting the account.
3. **Create Community:** Host → Create a Community. Check short-field errors, valid name/description, avatar crop/remove/reselect, category search, and Create. Confirm one community and the temporary green toast.
4. **Community Chat:** confirm direct routing; send a message; back to Messages; reopen and reload. Confirm one persisted message. Open the header to reach the preserved community posts/details.
5. **No eligible Activity:** use an account without hosted or approved/going activities → Host → Post a Vibe. Confirm loading then calendar/No events found and the reference explanation. Do not modify existing user relationships just to force this state.
6. **Eligible Activity:** use an existing QA account with real eligible relationships → Host → Post a Vibe. Confirm the existing editor and only eligible activity choices. Pick real media, add a caption and publish only if intended; inspect the existing Vibes viewer.

NOT READY — ONLY THIS GENUINELY EXTERNAL BLOCKER REMAINS: owner-account access to Google Cloud project 866660461050 and a successful real Google credential exchange to verify its origins/consent/native configuration and complete Google login QA.
