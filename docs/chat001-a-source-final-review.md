# Final bounded source review against original PDFs

Reviewed original extracted clauses in `tmp/pdfs/must.txt` and `tmp/pdfs/issues.txt`, plus rendered original A02 and B11. Review followed active `App.tsx` dispatch to the actual screens, rather than treating similarly named legacy components as reachable.

Concrete gaps fixed in this change:

- **A02 / AUTH-TAGLINE:** the illustrated requirement is the purple splash, not the later Google Welcome card. Its original left-hand tagline plus four example slogans now rotate in persisted order. Concurrent requests serialize, invalid local state recovers, and unavailable local storage retains in-memory rotation. No consecutive ordinary launch repeats when persistence is available. Storage is a nonessential preference, not account data.
- **A19 / UPLOAD-WARNING:** the first-signup profile camera/library handler previously opened the picker without the warning used by the rest of the application. It now awaits the existing cancellable Upload Responsibly warning before requesting permission or opening either picker. Cancellation preserves the existing draft photo; picker cancellation also retains it.
- **A37 NitroBot / B24:** the Community FAQ incorrectly suggested polls in posts. It now directs polls to the Community conversation, consistent with the requested separation.

Additional concrete gap handed to the App agent, who owns `App.tsx`: the active Activity detail's inline Host participant rows used `neutralAvatar` for missing photos and the small participant stack used a fixed-color `name[0]` fallback. Original A11 requires initials for missing display pictures; those paths should use the existing shared UserAvatar. The separate Manage Participants screen already used it.

Review bounds / other paths checked:

- Active intro dispatch, three slide controls, skip/finish/replay and profile completion/policy gate; email/phone fallback and recovery entry are present. External Google, email delivery and physical OTP acceptance are not proven by source inspection.
- Active Home is `ReferenceFeed`, with the four supplied hero assets and destination handlers, category-to-Activities dispatch, current UserAvatar in discovery, store/referral/policy navigation and observed loading states.
- Active All Activities is `ClientActivitiesScreen`: collapsed search, notifications, Home back, date/price/gender/verified/category filters with apply/reset, server request generation, card host navigation and intentional cover fallback. B11's exact visible date, All/Free/Paid and All/Male/Female/Non-binary controls were compared with the original rendered page.
- Active detail has timeline sections, original Host and Co-host separation, participant management, ended-state edit/remove/leave controls, comments, participant rating entry and self/Host-No-Show constraints. Server enforcement remains established by the separate backend tests, not this source pass.
- Active hosting uses `HostActivityScreen` and its domain schedule defaults/validation, Host Responsibly/Upload Responsibly, current category state and private/Partner collection distinctions. Existing provider-dependent Maps limitations remain explicit dependencies.
- Active Settings uses the reconstruction settings/utility screens. Support query confirms after RPC success; Play Store reward, Nitro ledger/store and emergency contact use their existing service paths. The unavailable Hubble provider is not promoted to implemented redemption.
- Partner application now contains the prior accepted bullet/pre-entry Terms fix; current-price categories, required answers and paid-versus-secured status remain subject to the coordinated hosted checkout retest.
- SOS has reachable sharing/copy/contact controls and exact reminder wording in the current coordinated backend change. This source pass is not proof of scheduled delivery, native background push or automatic location tracking.

Parallel owners already address the separately discovered active Communities header/cover edit, Chat filters/counts and A38 Activity-media option. These were deliberately not edited here.

This is a bounded independent source audit, not a claim that all126 requirements received a new browser interaction or every visual layout was reaccepted. Provider execution, full local integration and final deployed screenshots remain the coordinator's release gates.

Local checks:

- `onboarding-responsibility-taglines-test.mjs`: PASS, executable actual selection service and actual signup picker handler, including persistence/new module, concurrent selection, wrap, invalid storage, read/write failure, warning cancellation, both pickers and OS cancellation.
- `onboarding-completion-test.mjs`: PASS.
- `acceptance-ui-contract-test.mjs`: PASS.
- `partner-preflight-test.mjs`: PASS.
- `npm run typecheck`: PASS in isolated worktree.
- The isolated older `onboarding-profile-test.mjs` initially failed because its historical require mock does not handle the already-existing category-catalog import. The current primary version contains the newer mock and passes. No unrelated test/source edits were made to mask this baseline mismatch.

No production mutations, pushes or deployments were performed for this review.
