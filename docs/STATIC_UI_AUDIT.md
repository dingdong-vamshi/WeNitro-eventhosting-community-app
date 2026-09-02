# WeNitro Static UI Audit

Scope: `App.tsx` production UX review. This document identifies static, demo, and wireframe behavior and gives line-level integration priorities. It does not change application behavior.

## Executive finding

The interface has mature visual sections, but its data-state contract still treats seeded demo content as a universal fallback. A production user can therefore see convincing but false content, receive local success before a server mutation succeeds, or encounter a blank list with no loading, retry, or explanation. The first integration pass should establish explicit `idle | loading | refreshing | success | empty | error` states per remote resource and keep demo data isolated to `mode === "demo"`.

## P0: User trust and data integrity

1. **Separate demo and authenticated stores** — `App.tsx:669-714`, `App.tsx:721-871`, `App.tsx:6276-6376`
   - `initialData` is a complete fictional user workspace. `hydrateRemoteData` spreads `fallback` before remote fields, so profile identity, preferences, and metrics can remain demo-shaped when remote values are absent.
   - Replace the shared initializer with `createDemoData()` and `createAuthenticatedData(sessionUser)`. The authenticated initializer must use empty collections, nullable profile fields, and server-backed preferences.
   - Render a full-screen session bootstrap state while auth and first workspace queries resolve. On failure, show a retry action and a sign-out escape hatch; do not silently log and continue with seeded content (`App.tsx:6351-6353`).

2. **Remove authenticated seed substitution in Vibes** — `App.tsx:2217-2229`
   - `data.vibes.length ? data.vibes : seedVibes` makes an empty account look populated and makes modulo/index access depend on fictional media.
   - Use a paginated vertical reel with explicit first-load skeleton, incremental footer loader, retry overlay, end-of-feed treatment, and a real empty state with “Create a vibe” and “Explore activities” commands.
   - Guard all reel access when the collection is empty; reset the index when pagination or deletion changes list length.

3. **Remove authenticated seed substitution in Profile Vibes** — `App.tsx:4214`
   - The profile grid currently displays seeded reels for users with no posts.
   - Render a profile-specific empty state. Owners should see “Share your first vibe”; visitors should see “No public vibes yet.”

4. **Make optimistic mutations reversible and visible** — `App.tsx:2233-2266`, `App.tsx:4820-4830`, `App.tsx:5036-5066`
   - Likes, comments, membership, and reactions mutate local state before server acknowledgement. Errors produce alerts but do not consistently roll state back.
   - Introduce mutation state by entity ID, disable duplicate submission, reconcile authoritative counts, roll back failed optimistic changes, and show an inline/toast retry rather than a blocking alert.

5. **Replace static verification claims with server status** — `App.tsx:5860-5943`
   - Verification checks and the trust score are hard-coded, and the primary button has no action.
   - Bind each check to verified email/phone, submitted identity review, linked social account, qualifying activity count, and review aggregate. Add document upload progress, consent copy, review status, rejection reason, resubmission, and a durable success receipt.

## P1: Loading, error, empty, and realtime states

6. **Activities discovery** — `App.tsx:2190-2203`
   - `visible.map` has no first-load, no-results, request-error, refresh, or pagination UI.
   - Add activity-card skeletons, pull-to-refresh, filter-aware “No matches” copy with clear-filters action, offline/error banner with retry, and cursor pagination. Preserve search/filter controls while results refresh.

7. **Home content bands** — `App.tsx:1936-2025`
   - Community and vibe rails directly map loaded arrays and collapse when empty.
   - Give every band an independent loading/error/empty state so one failing query does not blank the rest of Home. Use stable card dimensions to prevent layout shift.

8. **Vibe comments** — `App.tsx:2385-2423`
   - The sheet renders only local comments and a basic no-comments label.
   - Add initial loader, paginated history, realtime insertion/deletion, failed-send status, retry, moderation affordance, keyboard-safe composer, and an empty invitation that keeps the composer prominent.

9. **Post Vibe prerequisite** — `App.tsx:2690-2769`
   - The existing empty state correctly explains the event requirement, but it needs loading/error distinctions before declaring that no events exist.
   - Add upload thumbnail/video preview, compression/upload progress, cancellation, retry, draft persistence, and disabled-state reason on publish.

10. **Community creation** — `App.tsx:2820-3098`
    - The form has client validation and a success modal but needs field-level server errors and durable media state.
    - Add upload progress and retry per image, category-loading state, rule editing as structured rows, duplicate-name feedback, unsaved-change confirmation, and a server-returned community route after creation.

11. **Chat subscriptions and threads** — `App.tsx:3436-3640`, `App.tsx:3667-4029`
    - Chat has realtime hooks, but its visual contract does not distinguish connecting, reconnecting, loading older messages, an empty thread, send failure, or unavailable media.
    - Add conversation-list skeletons, connection banner, per-message pending/sent/failed/read state, retry affordance, pagination at thread top, typing/presence indicators, image upload progress, and safe-area/keyboard handling.
    - The empty chat screen should offer “Find people” and “Create group” commands instead of only illustration/copy.

12. **Stories and people discovery** — `App.tsx:4049`, `App.tsx:4109`
    - Both lists render directly from app state with no fetch lifecycle.
    - Add story upload/view progress, expiry handling, viewed state from the server, people-list skeletons, zero-result guidance, privacy-aware presence, and blocked-user filtering.

13. **Search results** — `App.tsx:4574-4920`
    - Search maps locally available content and uses alert-based mutation failure.
    - Debounce remote search, expose query/loading/error/no-result states, group result types with counts, preserve recent searches, and provide retry without clearing the query.

14. **Community directory and feed** — `App.tsx:4696-5227`
    - Directory and post feed rely on mapped in-memory collections. Joining/reacting can fail after local UI has already changed.
    - Add list/feed pagination, refresh, membership request state, private-community handling, post composer upload progress, comment drawer lifecycle, moderation states, and rollback for failed reactions.

## P1: Prototype-only modules

15. **Legal content** — `App.tsx:5730-5761`
    - The screen explicitly says it is a demo and uses repeated placeholder blocks.
    - Load versioned Terms, Privacy Policy, Cookies, and community rules from a trusted CMS or bundled signed release. Display effective date, version, acceptance state, accessible headings, and external contact details.

16. **Help chat** — `App.tsx:5766-5790`
    - Topics and composer are non-interactive presentation elements.
    - Add selectable help flows, support conversation creation, safety escalation, attachment support, operating-hours/status messaging, send progress, and ticket reference.

17. **Feedback** — `App.tsx:5793-5825`
    - Rating selection is fixed to five and submit only reports local demo success.
    - Store selected rating, category, message, optional diagnostic consent, and attachment. Add submitting/success/error states and prevent empty submissions.

18. **Phone, emergency contact, and social forms** — `App.tsx:5829-5857`
    - `SimpleForm` is generic local state and always reports a demo save.
    - Replace with module-specific validation and server mutations: OTP lifecycle for phone, verified ownership/visibility for social links, and encrypted/private handling plus consent for emergency contacts.

19. **Shop and Nitro ledger** — `App.tsx:5947-6000`, `App.tsx:6026-6050`
    - Product inventory, balance, prices, and ledger rows are static.
    - Load server products and immutable ledger entries. Add loading/empty/error states, transaction confirmation, insufficient-balance state, idempotent purchase processing, and server-derived balance.

20. **History and collections** — `App.tsx:6004-6023`, `App.tsx:6054-6080`
    - History has no empty/error state; collections only distinguish empty content.
    - Add status/date filters, pagination, skeletons, recoverable error, and separate “nothing saved” from “could not load saved items.”

## P2: Visual system integration

21. **Replace local color constants with semantic roles** — `App.tsx:201-220`
    - Import `themes` or `createTheme` from `src/theme/production-theme.ts`. Components should consume `background`, `surface`, `textPrimary`, `border`, and state colors instead of selecting raw purple/neutral values.
    - Keep `#1910C2` as the primary brand action in light mode and use the accessible lighter primary token on dark surfaces.

22. **Theme persistence and screen consistency** — `App.tsx:198-201`, `App.tsx:6276-6376`
    - A context exists, but semantic colors must be applied at the screen root, navigation, modal, status bar, and portal layers to avoid mixed light/dark screens.
    - Persist only the user preference; resolve system mode separately. Animate color/opacity transitions using `motion.duration.standard`, respect reduced motion, and never animate layout-critical dimensions.

23. **Mature controls and feedback** — throughout `App.tsx`
    - Standardize button, icon button, text input, segmented control, toggle, sheet, toast, skeleton, empty state, error state, and confirmation dialog around the exported tokens.
    - Use 44px minimum touch targets, stable control dimensions, visible focus rings on web, disabled/loading states that preserve labels, and radii no greater than 8px except true pills/avatars.

24. **Remove blocking alerts for routine failures** — examples at `App.tsx:2245-2248`, `App.tsx:2896-2898`, `App.tsx:3496-3498`, `App.tsx:5097-5099`
    - Reserve dialogs for destructive confirmation or consequential decisions. Use inline field errors, banners, message failure rows, and transient toasts for recoverable network failures.

## Recommended integration order

1. Introduce an authenticated store/query boundary and global session bootstrap.
2. Adopt semantic theme tokens at app root and shared primitives.
3. Convert Home, Activities, Vibes, Chat, Communities, and Profile to explicit resource states.
4. Add realtime reconciliation and reversible optimistic mutations.
5. Replace verification, legal, help, feedback, shop, and history placeholders with server contracts.
6. Add cross-platform accessibility, reduced-motion behavior, offline recovery, analytics, and end-to-end tests for empty/error paths.

## Definition of done

- No authenticated screen imports or substitutes `seed*` content.
- Every remote collection has loading, refreshing, success, empty, and recoverable error presentation.
- Every mutation has pending, success, failure, retry, and duplicate-submit protection.
- Realtime updates reconcile with fetched state without duplicate rows or count drift.
- Theme choice persists and applies to every root, modal, navigation surface, and system status bar.
- Demo mode remains explicitly entered from the login screen and cannot leak into authenticated state.
- Production text contains no “demo,” “placeholder,” “local database,” or “structured content block” copy.
