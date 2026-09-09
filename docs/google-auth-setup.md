# WeNitro Google sign-in configuration

The local implementation uses native Google Sign-In on Android/iOS and Google's rendered Identity Services button on web. Both obtain an ID token and exchange it with Supabase. It does not use the old browser OAuth authorization-code flow, request offline Google access, or require a Google client secret in the application. Never add a client secret to an `EXPO_PUBLIC_*` variable.

## Verified on 2026-09-08 (Phase 3)

- Correct project: `klyjzbisgycegkkacbjw`, healthy and accessible through Supabase MCP.
- Google is now enabled in Supabase Authentication → Sign In / Providers → Google. The existing Web client ID and the supplied secret were saved in provider settings only. Nonce verification remains enabled; “Allow users without an email” remains disabled.
- Public `/auth/v1/settings`: HTTP 200; Google, email, and phone all enabled.
- Public Web client ID: `866660461050-r2ijj81pp8g0kmrln2pucihne79ul5l3.apps.googleusercontent.com`.
- The current Google Cloud account cannot see owning project number `866660461050`. Its available project is unrelated; no changes were made there.
- The embedded browser Google attempt returned `FedCM get() rejects with NetworkError: Error retrieving a token.` No Google credential or Supabase Google session was returned. This does not establish whether the cause is origin/consent configuration or embedded-browser FedCM support.
- Owner access is needed to inspect the existing Web client's origins/consent settings and Android registration. Google E2E, existing/new Google routing, and Google session restoration remain unverified. Email/phone identities were preserved.

## Required public configuration

1. The supplied OAuth **Web application client ID** is configured as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. This is a public identifier, not a secret. Android uses this Web ID as its server/token audience; an Android client ID must not be substituted into this environment variable.
2. Google's provider is enabled in the correct Supabase project with the existing Web client ID; verify additional audiences only if native configuration requires them. The issued ID token's audience must be accepted. Native ID-token verification does not exchange an authorization code and does not require a client secret in the app. Do not change nonce checks just to suppress an error; the web flow supplies a random nonce and its SHA-256 digest as documented by Supabase.
3. In Google Cloud, ensure an Android OAuth client exists for the actual installed application's package, currently `com.wenitro.app`, and the actual SHA-1 of its signing certificate. Development, uploaded release, and Play App Signing certificates can differ. Verify the applicable certificates and their Google registrations; do not invent a fingerprint. If the existing Play Store application uses a different package, that registration cannot silently authenticate this package.
4. For web, add each actual reviewing/serving origin to the Web client's **Authorized JavaScript origins**. Examples for this task are `http://localhost:8081` when that is the local review port , `http://127.0.0.1:8081` for the isolated local sign-in test, and `https://wenitro-app.vercel.app` only if it remains the intended deployed origin. Include the exact scheme, hostname, and non-default port; do not use wildcard domains or URL paths. No deployment is performed by this implementation.
5. Confirm the Google consent screen audience/scopes and authorized test users if the Google project is still in Testing. Request only basic identity/profile/email access.

Optional iOS Google support needs `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` registered for `com.wenitro.app`. `app.config.ts` derives the corresponding reversed URL scheme and conditionally enables the non-Firebase config plugin. No iOS identifier or URL scheme is fabricated when it is absent. Apple authentication is separate and remains unimplemented in this flow.

After changing public client IDs, restart Expo/rebuild so they are inlined. The native Google SDK is autolinked on Android. The real Android account chooser requires an installed development/release build containing the native dependency; Expo Go can review the UI but cannot verify this chooser. Do not use a simulated chooser as an auth test.

The Supabase callback shown in provider settings is `https://klyjzbisgycegkkacbjw.supabase.co/auth/v1/callback`. Register that exact callback for any authorization-code flow. The current application uses ID-token exchange, so it does not navigate through this callback during its GIS/native sign-in. Do not add callback paths to JavaScript origins.

## Validation limits

The ID-token exchange uses a separate non-persisting Supabase client with a 30-second abortable network deadline. Unmount/cancellation before the commit boundary prevents publishing that result into the application's session. After the final cancellation check, the regular Supabase client's `setSession` validates and persists the session; this is the explicit commit boundary. Supabase does not offer atomic cancellation of `setSession`, so the implementation awaits it rather than claiming a timeout while letting a hidden session write continue. The application's shared transport is unchanged.

TypeScript and Expo config checks pass. Isolated tests verify native success/cancellation handling, duplicate-tap prevention, and safe configuration errors without creating users or sessions on the real backend. Actual Google account selection, token exchange, new-user onboarding, and restored Google sessions require the missing public configuration and an appropriate test device/browser. They are not claimed as end-to-end passes.

## Primary references

- [Supabase Google native/ID-token setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google Sign-In native API](https://react-native-google-signin.github.io/docs/original)
- [Expo native Google Sign-In setup](https://react-native-google-signin.github.io/docs/setting-up/expo)
- [Google Identity Services JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
