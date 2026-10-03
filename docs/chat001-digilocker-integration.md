# Sandbox DigiLocker integration

Original source: `Must changesimplementations.pdf`, page 26, says: “Whatever is required for Aadhar verification, let me know”, “It was working in the Old Android App.”, “We were using Sandobox I guess.” and links `https://console.sandbox.co.in/`. The Sandbox suggestion is explicit; this is no longer classified as an unspecified-provider implementation gap.

## Implemented locally

`aadhaar-verification` is an authenticated Edge function with `availability`, `begin` and `refresh` actions. The client sends no account ID, provider session ID, Aadhaar number or OTP. The server binds each session to the validated Supabase Auth identity and active account, records versioned explicit consent, and checks provider status using the owned session reference. A redirect alone is never proof. Test responses never award verification or Trust.

A successful production status must identify that exact session, include Aadhaar consent, and return UIDAI-issued Aadhaar XML metadata from the session's Aadhaar endpoint. Only then does the private ledger store the verified outcome. The existing Trust function reads that outcome for the existing +20 Aadhaar component; verified-badge eligibility still requires the other existing verified signals. Existing legacy approved verification is preserved. No Nitro grant or selfie review state is changed.

The private ledger stores account references, consent version/time, environment, session/transaction UUIDs, status and timestamps. It stores no Aadhaar number, OTP, image, demographics, document URL or document content. The Edge adapter inspects issued-document metadata only and never downloads the document. Provider response bodies are neither logged nor returned to clients. Ordinary authenticated/anonymous callers cannot read or write the ledger or execute its service RPC. Every service operation rechecks active, nondeleted, nondeactivated, nonbanned ownership; finalization is idempotent, expiry checked, and begin/refresh calls are throttled.

The Verification card provides explicit consent, hosted DigiLocker redirect, a reopen action and manual status refresh after return. It gives a truthful unavailable state while disabled and labels test mode. Account-switch/unmount guards discard stale asynchronous results. Existing live-selfie camera UI is preserved.

## Official contract reviewed

- [DigiLocker overview](https://developer.sandbox.co.in/api-reference/kyc/digilocker/overview): consent and authorized Requestor organization requirements.
- [Authentication](https://developer.sandbox.co.in/guides/get-started/quickstart): key/secret authentication; raw access token in Authorization, without Bearer.
- [Initiate](https://developer.sandbox.co.in/api-reference/kyc/digilocker/endpoints/initiate_session), [session status](https://developer.sandbox.co.in/api-reference/kyc/digilocker/endpoints/session_status), [issued document](https://developer.sandbox.co.in/api-reference/kyc/digilocker/endpoints/fetch_document).
- [OpenAPI](https://developer.sandbox.co.in/api-reference/kyc/openapi-specification.md): exact request/response entities, UUID references, created/succeeded/failed/expired statuses, documents_consented and UIDAI XML file metadata.
- [Old OTP endpoint](https://developer.sandbox.co.in/api-reference/kyc/aadhaar/endpoints/generate_otp) is explicitly deprecated by UIDAI; the supported DigiLocker flow is used instead.

These were public documentation requests only. No Sandbox API authentication, session, identity-data or chargeable request was executed.

## Activation and rollout

Keep disabled for the coordinated release. Apply `20261003205431_sandbox_digilocker_verification.sql` before deploying the new Edge function and frontend. Root owns the integrated gate and deployment. The migration deliberately fails if the existing Trust/sync function contract differs, instead of silently dropping the signal integration.

Names only, never put values in source or client configuration:

| Server environment variable | Purpose |
| --- | --- |
| `AADHAAR_DIGILOCKER_ENABLED` | Exact `true` required; missing/default is disabled. |
| `SANDBOX_ENVIRONMENT` | Exact `test` or `production`; selects fixed official API origin. |
| `SANDBOX_API_KEY`, `SANDBOX_API_SECRET` | Authorized environment-specific credentials, server only. |
| `AADHAAR_DIGILOCKER_REDIRECT_URL` | Fixed HTTPS provider-registered App return URL, for example the configured public App origin plus `/#/verification`. No client-supplied redirect is accepted. The existing route parser supports verification. |
| `AADHAAR_DIGILOCKER_PRODUCTION_APPROVED` | Additional exact `true` required for production. Do not set until authorized onboarding and acceptance. |

Prerequisites remaining: authorized Sandbox account and DigiLocker entitlement/Requestor onboarding, agreed applicable terms/consent, environment credentials, registered HTTPS redirect and a consenting person's real hosted-flow acceptance. None is replaced by local mocks. Authorization URLs are restricted to the documented DigiLocker government hosts; a legitimate provider host change must be reviewed explicitly, not accepted through a wildcard.

Configuration inventory found no matching names in inspected local `.env.local` / `supabase/.env.local`. Available MCP tools did not expose secret-name listing. CLI secret-name inventory timed out and was stopped; remote credential absence is **not established**. No values were printed or changed.

## Verification and limits

See `chat001-digilocker-local-proof.json` for exact test scope. The isolated PostgreSQL test uses synthetic local users and current captured function fixtures; no production records are fabricated. The Deno fetch tests use mock responses only. Local provider protocol, authorization, test-mode non-award, idempotency, privacy and UI behavior are verified. Actual provider entitlement/delivery and deployed visual/real identity acceptance remain unverified.

Disabling the Edge feature prevents new verification sessions but deliberately does not erase an already legitimate verified outcome. Account deletion cascades the private ledger. Historic nonverified attempts contain only minimum references and consent/status metadata; retention-policy review can be applied without retaining identity documents.
