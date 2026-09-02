# WeNitro Production Web Smoke Suite

`scripts/e2e-production.mjs` is a standalone Playwright smoke suite for the Expo web build. It uses the app's explicit demo entry point and tests the real mobile UI without requiring Playwright Test configuration.

## Coverage

- Explicit **Explore the interactive demo** login
- Feed, Vibes, Host, Chat, and Profile bottom navigation
- Vibes/Reels rendering and next-reel control
- Dark/light theme switching and persistence across screens
- Activities list and activity search
- Community discovery, filters, and search
- Profile settings and appearance controls
- Standard `390x844` and compact Android-style `360x740` viewports
- Horizontal overflow checks on mobile
- Uncaught page errors and browser `console.error` messages
- Optional authenticated-account smoke when credentials and an email/password UI are available

## Prerequisites

Install project dependencies and Playwright's Chromium binary once:

```bash
npm install
npx playwright install chromium
```

Start the Expo web app in another terminal:

```bash
npm run web -- --port 8090
```

## Run

The default target is `http://127.0.0.1:8090`:

```bash
node scripts/e2e-production.mjs
```

Run against another local, preview, or production deployment:

```bash
BASE_URL=https://wenitro1.vercel.app node scripts/e2e-production.mjs
```

Show the browser while debugging:

```bash
HEADLESS=false BASE_URL=http://127.0.0.1:8090 node scripts/e2e-production.mjs
```

## Optional Authenticated Coverage

Provide a dedicated test account through environment variables:

```bash
E2E_EMAIL='qa@example.com' \
E2E_PASSWORD='use-a-secret-manager' \
BASE_URL=http://127.0.0.1:8090 \
node scripts/e2e-production.mjs
```

`AUTH_EMAIL` and `AUTH_PASSWORD` are accepted as aliases. Do not commit credentials. When credentials are absent, the authenticated check is reported as `SKIP`. If the current login screen supports only OAuth, the suite also reports the credential check as skipped because browser automation must not bypass the application's authentication flow.

## Artifacts

Every run recreates `artifacts/e2e/` and writes:

- Numbered screenshots for the exercised screens
- `demo-trace.zip`, openable with `npx playwright show-trace artifacts/e2e/demo-trace.zip`
- `summary.json` with pass, fail, and skip counts
- Full-page failure screenshots when a required step fails

The process exits with a nonzero status for required workflow failures, browser bootstrap failures, uncaught page errors, and browser console errors. Optional authenticated-only coverage never masks a demo-flow failure.

## CI Example

```bash
set -euo pipefail
npx expo export --platform web
npx serve dist -l 8090 > /tmp/wenitro-web.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID"' EXIT
npx wait-on http://127.0.0.1:8090
BASE_URL=http://127.0.0.1:8090 node scripts/e2e-production.mjs
```

The CI example assumes `serve` and `wait-on` are available in the CI image. The smoke script itself adds no package or configuration requirement beyond the existing `playwright` dependency.
