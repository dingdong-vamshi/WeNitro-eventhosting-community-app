import assert from "node:assert/strict";
import { createAadhaarHandler } from "./handler.ts";
import {
  AADHAAR_CONSENT_VERSION,
  AADHAAR_REASON,
  aadhaarOkycConfiguration,
  createAadhaarOkycProvider,
} from "../_shared/aadhaar-okyc.ts";

const localId = "22222222-2222-4222-8222-222222222222";
const transactionId = "33333333-3333-4333-8333-333333333333";
const settings: Record<string, string> = {
  AADHAAR_OKYC_ENABLED: "true",
  SANDBOX_ENVIRONMENT: "production",
  SANDBOX_BASE_URL: "https://api.sandbox.co.in",
  SANDBOX_API_KEY: "mock-key",
  SANDBOX_API_SECRET: "mock-secret",
};

function fixture(options: {
  env?: Record<string, string>;
  allowed?: boolean;
  session?: Record<string, unknown> | null;
  providerStatus?: number;
  verifyValid?: boolean;
  ledgerError?: string;
} = {}) {
  const calls: { url: string; body: unknown; headers: Headers }[] = [];
  const writes: Record<string, unknown>[] = [];
  let session = options.session === undefined ? null : options.session;
  const handler = createAadhaarHandler({
    env: name => (options.env ?? settings)[name],
    authenticate: async () => ({ authId: "owner-from-validated-auth", allowed: options.allowed !== false }),
    ledger: async (authId, args) => {
      writes.push({ authId, ...args });
      if (options.ledgerError) return { data: null, error: { message: options.ledgerError } };
      if (args.p_action === "begin") {
        session = {
          id: localId,
          environment: args.p_environment,
          provider_reference_id: null,
          status: "initializing",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          verified_at: null,
          aadhaar_last4: args.p_aadhaar_last4,
        };
      }
      if (args.p_action === "update") {
        session = {
          ...session,
          provider_reference_id: args.p_provider_reference_id,
          status: args.p_status,
          verified_at: args.p_verified ? "mock-production-proof-time" : null,
        };
      }
      if (args.p_action === "claim_verify") session = { ...session, status: "verifying" };
      return { data: session, error: null };
    },
    fetcher: async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init?.headers) });
      if (options.providerStatus && (options.providerStatus !== 422 || !url.endsWith("/authenticate"))) {
        return new Response("PRIVATE_PROVIDER_BODY", { status: options.providerStatus });
      }
      let data: unknown;
      if (url.endsWith("/authenticate")) data = { access_token: "mock-access-token" };
      else if (url.endsWith("/otp")) data = {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.response",
        reference_id: 1234567,
        message: "OTP sent successfully",
      };
      else if (url.endsWith("/otp/verify")) data = {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc",
        reference_id: 1234567,
        status: options.verifyValid === false ? "INVALID" : "VALID",
        name: "PRIVATE_NAME_SENTINEL",
        full_address: "PRIVATE_ADDRESS_SENTINEL",
        photo: "PRIVATE_PHOTO_SENTINEL",
      };
      else throw new Error("Unexpected provider endpoint");
      return new Response(JSON.stringify({ code: 200, data, transaction_id: transactionId }), { headers: { "Content-Type": "application/json" } });
    },
  });
  const run = async (body: unknown) => {
    const response = await handler(new Request("https://local.test", { method: "POST", body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  return { handler, run, calls, writes };
}

Deno.test("disabled or unsafe configuration performs no provider calls", async () => {
  for (const env of [{}, { ...settings, SANDBOX_API_KEY: "" }, { ...settings, SANDBOX_BASE_URL: "https://evil.example" }]) {
    const f = fixture({ env });
    const result = await f.run({ action: "sendOtp", aadhaarNumber: "123456789012", consent: true, consentVersion: AADHAAR_CONSENT_VERSION });
    assert.equal(result.body.available, false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.writes.length, 0);
  }
  assert.equal(aadhaarOkycConfiguration(name => ({ ...settings, SANDBOX_ENVIRONMENT: "unknown" })[name]), null);
});

Deno.test("format and explicit versioned consent are mandatory before provider access", async () => {
  const f = fixture();
  assert.equal((await f.run({ action: "sendOtp", aadhaarNumber: "123", consent: true, consentVersion: AADHAAR_CONSENT_VERSION })).status, 400);
  assert.equal((await f.run({ action: "sendOtp", aadhaarNumber: "123456789012", consent: false, consentVersion: AADHAAR_CONSENT_VERSION })).status, 400);
  assert.equal((await f.run({ action: "sendOtp", aadhaarNumber: "123456789012", consent: true, consentVersion: "old" })).status, 400);
  assert.equal(f.calls.length, 0);
});

Deno.test("OTP request sends required official payload and persists only masked reference data", async () => {
  const f = fixture();
  const result = await f.run({ action: "sendOtp", aadhaarNumber: "123456789012", consent: true, consentVersion: AADHAAR_CONSENT_VERSION });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "otp_sent");
  assert.equal(result.body.maskedAadhaar, "•••• •••• 9012");
  assert(!JSON.stringify(result.body).includes("123456789012"));
  assert.deepEqual(f.calls[1].body, {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
    aadhaar_number: "123456789012",
    consent: "Y",
    reason: AADHAAR_REASON,
  });
  assert.equal(f.calls[0].headers.get("x-api-secret"), "mock-secret");
  assert.equal(f.calls[1].headers.get("Authorization"), "mock-access-token");
  assert.equal(f.writes.find(write => write.p_action === "begin")?.p_aadhaar_last4, "9012");
  assert(!JSON.stringify(f.writes).includes("123456789012"));
});

Deno.test("valid production OTP verifies without persisting provider demographics or OTP", async () => {
  const f = fixture({ session: {
    id: localId, environment: "production", provider_reference_id: "1234567", status: "otp_sent",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), verified_at: null, aadhaar_last4: "9012",
  } });
  const result = await f.run({ action: "verifyOtp", otp: "121212", providerReference: "attacker-value" });
  assert.equal(result.body.verified, true);
  const update = f.writes.find(write => write.p_action === "update")!;
  assert.equal(update.p_provider_reference_id, "1234567");
  assert.equal(update.p_verified, true);
  assert(!JSON.stringify([result.body, f.writes]).includes("121212"));
  assert(!JSON.stringify([result.body, f.writes]).includes("PRIVATE_"));
  assert.deepEqual(f.calls[1].body, {
    "@entity": "in.co.sandbox.kyc.aadhaar.okyc.request",
    reference_id: "1234567",
    otp: "121212",
  });
});

Deno.test("test environment can never grant Trust verification", async () => {
  const env = { ...settings, SANDBOX_ENVIRONMENT: "test", SANDBOX_BASE_URL: "https://test-api.sandbox.co.in" };
  const f = fixture({ env, session: {
    id: localId, environment: "test", provider_reference_id: "1234567", status: "otp_sent",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), verified_at: null, aadhaar_last4: "9012",
  } });
  const result = await f.run({ action: "verifyOtp", otp: "121212" });
  assert.equal(result.body.verified, false);
  assert.equal(result.body.testMode, true);
  assert.equal(f.writes.find(write => write.p_action === "update")?.p_verified, false);
  assert(f.calls.every(call => call.url.startsWith("https://test-api.sandbox.co.in/")));
});

Deno.test("provider errors are safe, actionable, and never expose raw bodies", async () => {
  for (const [providerStatus, code] of [[401, "provider_authentication"], [402, "provider_credits"], [404, "provider_api_disabled"], [429, "provider_rate_limit"], [500, "provider_unavailable"]] as const) {
    const f = fixture({ providerStatus });
    const result = await f.run({ action: "sendOtp", aadhaarNumber: "123456789012", consent: true, consentVersion: AADHAAR_CONSENT_VERSION });
    assert.equal(result.body.code, code);
    assert(!JSON.stringify(result.body).includes("PRIVATE_PROVIDER_BODY"));
  }
});

Deno.test("invalid OTP is cleared server-side and retry remains on the active session", async () => {
  const f = fixture({ providerStatus: 422, session: {
    id: localId, environment: "production", provider_reference_id: "1234567", status: "otp_sent",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), verified_at: null, aadhaar_last4: "9012",
  } });
  const result = await f.run({ action: "verifyOtp", otp: "121212" });
  assert.equal(result.body.code, "invalid_or_expired_otp");
  assert.equal(f.writes.at(-1)?.p_action, "error");
  assert(!JSON.stringify(result.body).includes("121212"));
});

Deno.test("completed session retry is idempotent and avoids provider calls", async () => {
  const f = fixture({ session: {
    id: localId, environment: "production", provider_reference_id: "1234567", status: "succeeded",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), verified_at: "mock-time", aadhaar_last4: "9012",
  } });
  assert.equal((await f.run({ action: "verifyOtp", otp: "121212" })).body.verified, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.writes.length, 1);
});

Deno.test("provider helper rejects mismatched references and malformed responses", async () => {
  const config = aadhaarOkycConfiguration(name => settings[name])!;
  let call = 0;
  const provider = createAadhaarOkycProvider(config, async input => {
    call += 1;
    if (String(input).endsWith("/authenticate")) return new Response(JSON.stringify({ code: 200, data: { access_token: "token" } }));
    return new Response(JSON.stringify({ code: 200, transaction_id: transactionId, data: { "@entity": "in.co.sandbox.kyc.aadhaar.okyc", reference_id: 999, status: "VALID" } }));
  });
  await assert.rejects(() => provider.verifyOtp("123", "121212"));
  assert.equal(call, 2);
});

Deno.test("unavailable account, invalid JSON, and methods fail before provider access", async () => {
  const blocked = fixture({ allowed: false });
  assert.equal((await blocked.run({ action: "availability" })).status, 403);
  assert.equal(blocked.calls.length, 0);
  const f = fixture();
  const invalid = await f.handler(new Request("https://local.test", { method: "POST", body: "PRIVATE_INVALID_JSON" }));
  assert.equal(invalid.status, 400);
  assert(!(await invalid.text()).includes("PRIVATE"));
  assert.equal((await f.handler(new Request("https://local.test", { method: "GET" }))).status, 405);
});
