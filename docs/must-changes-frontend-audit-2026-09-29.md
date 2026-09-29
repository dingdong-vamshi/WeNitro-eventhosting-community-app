# WeNitro must-changes implementation and release notes

Audited on 29 September 2026 against all 40 pages of
`Must changesimplementations.pdf`, the App, the Admin dashboard, and Supabase
project `klyjzbisgycegkkacbjw`.

## Product changes

- Onboarding uses the requested spacing, swipe guidance, rotating taglines, and
  no first-slide Next action.
- Email login exposes a real password-reset request. Google OAuth and phone OTP
  remain real Supabase Auth flows; neither has a fake success path.
- Home uses lighter, shorter hero art and a blue/purple visual family for Invite
  Friends and Nitro Points. Tribe cards route into the corresponding Activity
  category.
- All Activities supports search, filters, cover fallbacks, and host-profile
  navigation without oversized descriptions.
- A normal host may mark an Activity as paid onsite, but cannot enter a platform
  price and never enters Cashfree checkout. An approved Partner may configure
  one to eight named entry categories with server-authoritative INR prices.
- The original creator remains labelled HOST / ORIGINAL CREATOR. Promoted
  participants are labelled CO-HOST, and only the original host can add or
  remove co-hosts.
- Ended Activities block join, participant-management, and content mutation
  actions. Leave/rejoin follows the current join or approval path.
- Normal personal, Activity, and Community chat attachment menus expose Photo
  and Poll. Video remains available for Vibes and Community Posts.
- Community posts may be anonymous to members. The database withholds the author
  identifier from ordinary clients while an authorised Admin audit RPC retains
  safety attribution.
- Chat authors may soft-delete their own messages. Stored message media cleanup
  is attempted after the database tombstone is committed.
- Public profiles open on Vibes, use the PDF-aligned purple presentation, expose
  honest Trust/verification state, de-duplicate Squad identities, and preserve
  the three-photo gallery.
- The Play Store rating reward is a one-time server ledger event. Nitro spends
  use negative ledger entries instead of silently changing the balance.
- Activity, Vibe, Community, and Community Post media pickers show the requested
  responsible-upload warning.
- Partner dashboards show registration category, paid amount, fee, GST, refund,
  and expected settlement values. External Partner links accept HTTPS only.

## Supabase repairs

- `tbl_vibe_reports` now matches the current RPC contract, has its reporter
  foreign key/index, has RLS enabled, and exposes only the report RPC to signed-in
  users.
- `private.enforce_vibe_activity_eligibility` and its trigger reject invalid
  Activity associations.
- `private.validate_host_activity_fields` is attached to `tbl_events` and
  validates capacity, schedule, location, and payment fields.
- All 73 public tables have RLS enabled. RPC-only Partner/history/category
  tables have no direct client grants.
- `tbl_activity_entry_categories` stores approved-Partner category prices and
  optional capacities. Payment and participant rows retain the selected category
  snapshot.
- Cashfree order preparation derives the amount from the persisted category,
  enforces activity/category capacity, prevents host self-payment, and reuses an
  unexpired attempt only when category and amount are unchanged.
- The Cashfree create-order function is deployed with JWT validation. The
  webhook remains deliberately public because it verifies the provider
  signature and persists a replay-safe delivery key.
- Repository migration filenames match the live migration ledger. The last
  applied versions are `20260929101239` and `20260929102058`.

## Security and privacy boundaries

- The App uses the Supabase publishable credential only. No service-role,
  Cashfree secret, SMS secret, or provider credential is shipped in the bundle.
- Admin-only RPCs verify the authenticated Auth identity and Admin role inside
  the database; client-side hiding is not treated as authorization.
- Private verification media remains in private Storage and is accessed through
  short-lived signed URLs.
- Missing or legacy media paths render deterministic fallbacks instead of
  manufacturing public URLs.
- Security-definer RPCs are an intentional part of the legacy integer-ID bridge.
  Each externally executable function must retain its internal identity and
  permission checks.

## External and native boundaries

- Phone Auth reaches the deployed Send SMS hook. A recent request failed in
  about one second at the Fast2SMS provider stage. The project secrets exist,
  but provider account status, template approval, balance, and allowlisting must
  be checked in Fast2SMS or with a dedicated QA phone.
- Google is enabled in Supabase and has the production Site URL, redirect
  allowlist, client ID, and secret configured. Completing the chooser is an
  interactive account action.
- Supabase is using its built-in email sender. Production email branding and
  delivery capacity require saving the WeNitro template and configuring custom
  SMTP.
- Aadhaar/KYC, persistent native SOS/background delivery, Hubble production
  redemption, and automatic real-money payouts/refunds are not simulated.

## Release validation

Run from the App repository:

```sh
npm run typecheck
for test_file in scripts/*test*.mjs; do node "$test_file"; done
npm run vercel-build
npm audit --omit=dev
git diff --check
```

Run from the Admin repository:

```sh
npm run lint
npm run build
npm audit --omit=dev
git diff --check
```

The browser release checklist must cover session restoration, Home, Activities,
Communities, Vibes, Stories, all Chat types, Notifications, Profile,
verification, Partner application/approval, Admin finance, and Cashfree sandbox.
Provider-dependent flows must be reported as blocked unless the provider returns
a real successful sandbox result.
