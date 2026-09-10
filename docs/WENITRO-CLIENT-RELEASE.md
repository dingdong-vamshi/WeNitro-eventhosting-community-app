# WeNitro — Client Update & Release Report

10 September 2026

## Release status

Local checks passed and the App is deployed. Final signed-in production checks are waiting for the user's Google interaction in the in-app browser; this is not yet a full release sign-off. Admin needs no source changes and its existing production workspace is accessible.

## Implemented changes

| Area | Client-facing update | Local verification |
| --- | --- | --- |
| Home | Refreshed host carousel, clearer discovery, highlighted invitation card, four additional activities, legal links and actual V-Nitro balance | Navigation and mobile/desktop presentation checked |
| Activities | Newest-first discovery, searchable results, additional pages, clearer cards and independent cost/entry labels | Search returned the intended activity; pagination increased results from 30 to 60 |
| Hosting | Separate “Costs may apply” and “Entry fee required” choices; no numeric price in normal hosting | Form and all four flag combinations checked; existing paid-payment code preserved |
| Activity detail | Three-comment preview, Activity Vibes, direct photo/video selection, participant feedback and editable latest response | Comment persisted; file picker opened; feedback update retained one review |
| Communities | Discovery/creation presentation, creator/member details, verified badges and clearer chat/poll controls | Existing community, creation form, posts and two-member chat checked |
| Profile | Organized content tabs, social-link states, Trust/Reviews presentation and visible verification | Own/public profiles, activity tabs, Reviews, saved and liked items checked |
| Vibes & Chat | Search within eligible activities, correct activity attachment, clearer conversation labels and latest-message positioning | Media-selection flow, Vibes feed, personal/activity/community conversations checked |
| Google sign-in | Removed the stuck loading state; successful sign-in routes to the feed | User completed Google's button; the existing account and feed were verified |

We aligned the interface with the supplied references while preserving live product data and working interaction logic. Illustrative numbers, discounts and unsupported reward promises were not added.

## Verification and V-Nitro rewards

Confirmed email, confirmed phone and a successful private Live Photo upload each earn **10 points once**, up to **30 verification points**. Any completed method enables the public verified badge. A missing Trust Score is shown honestly, not invented.

The QA account retained 20 verification points after uploading and replacing its private photo and reloading. The ledger showed separate email and photo rewards. Replacing a photo did not grant more points. Private verification photos are not avatars or public Vibes; another account could not read the private object or submit it as its own.

## Testing

Local in-app browser checks covered representative signed-in flows and Light, Dark and System appearance. Home was checked at 390 × 844, 430 × 932 and a centered mobile shell at 1440 × 900. Both intro slides were verified again on production at 390 × 844. Welcome was reviewed in a component preview and in the real app; Google authentication was tested separately.

App type checks, web production build, eight isolated regression suites, Admin build and targeted secret checks passed. Existing Admin users, activities, communities, verification records and payment records loaded. No new payment or SMS was triggered in this release pass. These checks do not certify every device, permission prompt or payment-provider outcome.

## Intentionally deferred / remaining

- Native Activity SOS persistent notification: deferred to the APK/native implementation; web cannot faithfully provide that OS behavior.
- Partner work remains paused. Native Google/camera behavior still needs device-build testing.
- Store, achievements and NitroBot remain clearly marked as unavailable; no new eligibility or reward rules are implied.
- Live SMS and new payment processing were not rerun. Existing behavior was preserved.
- A separate dependency-maintenance pass remains: the dependency audit reports 20 moderate findings and no high or critical findings.

## Production links and test access

[WeNitro App](https://wenitro-app.vercel.app/) · [WeNitro Admin](https://wenitro-admin-roan.vercel.app/)

Use the existing QA accounts shared privately. Passwords and tokens are intentionally excluded from this report.

## Evidence

[Screenshot index and check boundaries](client-release-evidence/README.md). Files prefixed `local-` were captured locally; `production-` files were captured from the actual deployed URLs.
