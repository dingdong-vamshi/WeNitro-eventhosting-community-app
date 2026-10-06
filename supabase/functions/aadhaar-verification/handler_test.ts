import assert from "node:assert/strict";
import { createAadhaarHandler } from "./handler.ts";
import {
  CONSENT_VERSION,
  digilockerConfiguration,
  hasIssuedAadhaar,
  parseSdkSessionStatus,
} from "../_shared/digilocker.ts";
import {
  AADHAAR_CONSENT_VERSION,
  AADHAAR_REASON,
} from "../_shared/aadhaar-okyc.ts";
import { AADHAAR_ACTIONS } from "../_shared/aadhaar-actions.ts";

const providerId = "11111111-1111-4111-8111-111111111111";
const localId = "22222222-2222-4222-8222-222222222222";
const transactionId = "33333333-3333-4333-8333-333333333333";
const settings: Record<string, string> = {
  AADHAAR_DIGILOCKER_ENABLED: "true",
  AADHAAR_OKYC_ENABLED: "true",
  SANDBOX_ENVIRONMENT: "production",
  SANDBOX_BASE_URL: "https://api.sandbox.co.in",
  SANDBOX_API_KEY: "key_live_mock_public_value",
  SANDBOX_API_SECRET: "secret_live_mock_private_value",
};

function fixture(options: {
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  allowed?: boolean;
  session?: Record<string, unknown> | null;
  providerStatus?: string;
  consented?: boolean;
  issuer?: string;
  wrongSession?: boolean;
  providerErrorStatus?: number;
  ledgerError?: boolean;
} = {}) {
  const calls: {
    url: string;
    method: string;
    body: unknown;
    headers: Headers;
  }[] = [];
  const writes: Record<string, unknown>[] = [];
  const sync: string[] = [];
  let session = options.session === undefined
    ? {
      id: localId,
      environment: options.env?.SANDBOX_ENVIRONMENT ??
        options.secrets?.SANDBOX_ENVIRONMENT ?? "production",
      provider_session_id: providerId,
      status: "created",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      verified_at: null,
    }
    : options.session;
  const handler = createAadhaarHandler({
    env: (name) => (options.env ?? settings)[name],
    secrets: options.secrets ? async () => options.secrets! : undefined,
    authenticate: async () => ({
      authId: "owner-from-validated-auth",
      allowed: options.allowed !== false,
      syncVerified: async () => {
        sync.push("sync");
      },
    }),
    ledger: async (authId, args) => {
      writes.push({ authId, ...args });
      if (options.ledgerError) {
        return { data: null, error: { message: "PRIVATE_DATABASE_SENTINEL" } };
      }
      if (args.p_action === "begin") {
        session = {
          id: localId,
          environment: args.p_environment,
          provider_session_id: null,
          status: "initializing",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          verified_at: null,
        };
      }
      if (args.p_action === "update") {
        session = {
          ...session,
          provider_session_id: args.p_provider_session_id ??
            (session as Record<string, unknown>)?.provider_session_id,
          status: args.p_status,
          verified_at: args.p_verified ? "mock-production-proof-time" : null,
        };
      }
      return { data: session, error: null };
    },
    legacyLedger: async () => ({ data: null, error: null }),
    fetcher: async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: new Headers(init?.headers),
      });
      if (options.providerErrorStatus) {
        return new Response(
          JSON.stringify({ message: "AADHAAR_PRIVATE_SENTINEL" }),
          {
            status: options.providerErrorStatus,
          },
        );
      }
      let data: unknown;
      if (url.endsWith("/authenticate")) {
        data = { access_token: "mock-access-token" };
      } else if (url.endsWith("/digilocker-sdk/sessions/create")) {
        data = {
          "@entity": "in.co.sandbox.kyc.digilocker.sdk.session",
          id: providerId,
          status: "created",
          created_at: Date.now(),
        };
      } else if (url.endsWith("/status")) {
        data = {
          "@entity": "in.co.sandbox.kyc.digilocker.sdk.session",
          id: options.wrongSession ? localId : providerId,
          status: options.providerStatus ?? "succeeded",
          documents_consented: options.consented === false
            ? ["pan"]
            : ["aadhaar"],
          created_at: Date.now(),
        };
      } else if (url.endsWith("/documents/aadhaar")) {
        data = {
          files: [{
            "@entity": "org.quicko.drive.file",
            url: "https://provider.invalid/private?aadhaar=RAW_SENTINEL",
            size: 500,
            metadata: {
              ContentType: "application/xml",
              issuer_id: options.issuer ?? "in.gov.uidai",
            },
          }],
        };
      } else throw new Error("Unexpected outbound request in mock");
      return new Response(
        JSON.stringify({ code: 200, data, transaction_id: transactionId }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  const run = async (body: unknown) => {
    const response = await handler(
      new Request("https://local.test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return { handler, run, calls, writes, sync };
}

Deno.test("disabled or environment-mismatched configuration performs no provider calls", async () => {
  for (
    const env of [
      {},
      { ...settings, AADHAAR_DIGILOCKER_ENABLED: "false" },
      { ...settings, SANDBOX_API_KEY: "key_test_wrong_environment" },
    ]
  ) {
    const f = fixture({ env });
    const result = await f.run({
      action: "begin",
      consent: true,
      consentVersion: CONSENT_VERSION,
    });
    assert.equal(result.body.available, false);
    assert.equal(f.calls.length, 0);
  }
});

Deno.test("Vault fallback configuration is accepted without exposing the secret", async () => {
  const f = fixture({ env: {}, secrets: settings, session: null });
  const result = await f.run({
    action: "begin",
    consent: true,
    consentVersion: CONSENT_VERSION,
  });
  assert.equal(result.body.publicApiKey, settings.SANDBOX_API_KEY);
  assert.equal(
    JSON.stringify(result.body).includes(settings.SANDBOX_API_SECRET),
    false,
  );
});

Deno.test("account, action and versioned consent gates run before provider access", async () => {
  const denied = fixture({ allowed: false });
  assert.equal((await denied.run({ action: "begin" })).status, 403);
  assert.equal(denied.calls.length, 0);
  const f = fixture({ session: null });
  assert.equal(
    (await f.run({ action: "digilocker" })).body.error,
    "Invalid verification action.",
  );
  assert.equal((await f.run({ action: "begin", consent: false })).status, 400);
  assert.equal(
    (await f.run({ action: "begin", consent: true, consentVersion: "old" }))
      .status,
    400,
  );
  assert.equal(f.calls.length, 0);
});

Deno.test("begin creates a current SDK session and binds it to the authenticated actor", async () => {
  const f = fixture({ session: null });
  const result = await f.run({
    action: "begin",
    consent: true,
    consentVersion: CONSENT_VERSION,
    authId: "attacker-chosen",
    sessionId: "attacker-chosen",
  });
  assert.equal(result.body.sessionId, providerId);
  assert.equal(result.body.status, "created");
  assert.equal(result.body.verified, false);
  assert(
    f.writes.every((write) => write.authId === "owner-from-validated-auth"),
  );
  assert.deepEqual(f.calls[1].body, {
    "@entity": "in.co.sandbox.kyc.digilocker.sdk.session.request",
    flow: "signin",
    doc_types: ["aadhaar"],
  });
  assert.equal(
    f.calls[0].headers.get("x-api-secret"),
    settings.SANDBOX_API_SECRET,
  );
  assert.equal(f.calls[1].headers.get("x-api-secret"), null);
  assert.equal(f.calls[1].headers.get("Authorization"), "mock-access-token");
  assert.equal(
    JSON.stringify([f.writes, result.body]).includes(
      settings.SANDBOX_API_SECRET,
    ),
    false,
  );
});

Deno.test("only server-confirmed production success with Aadhaar consent and UIDAI document verifies", async () => {
  const f = fixture();
  const result = await f.run({
    action: "refresh",
    verified: true,
    providerSessionId: "forged",
  });
  assert.equal(result.body.verified, true);
  assert.equal(f.sync.length, 1);
  const update = f.writes.find((write) => write.p_action === "update")!;
  assert.equal(update.p_verified, true);
  assert.equal(update.p_provider_session_id, providerId);
  assert.equal(
    f.calls[1].url.endsWith(`/digilocker-sdk/sessions/${providerId}/status`),
    true,
  );
  assert.equal(
    f.calls[2].url.endsWith(
      `/digilocker-sdk/sessions/${providerId}/documents/aadhaar`,
    ),
    true,
  );
  assert.equal(
    JSON.stringify([f.writes, result.body]).includes("RAW_SENTINEL"),
    false,
  );
});

Deno.test("test mode success never grants real verification or Trust", async () => {
  const f = fixture({
    env: {
      ...settings,
      SANDBOX_ENVIRONMENT: "test",
      SANDBOX_API_KEY: "key_test_mock_public_value",
      SANDBOX_API_SECRET: "secret_test_mock_private_value",
    },
  });
  const result = await f.run({ action: "refresh" });
  assert.equal(result.body.verified, false);
  assert.equal(result.body.testMode, true);
  assert.equal(f.sync.length, 0);
  assert(
    f.calls.every((call) =>
      call.url.startsWith("https://test-api.sandbox.co.in/")
    ),
  );
});

for (
  const status of ["created", "initialized", "authorized", "failed", "expired"]
) {
  Deno.test(`provider ${status} cannot grant verification`, async () => {
    const f = fixture({ providerStatus: status });
    const result = await f.run({ action: "refresh" });
    assert.equal(result.body.verified, false);
    assert.equal(f.sync.length, 0);
    assert.equal(f.calls.length, 2);
    assert.equal(
      Boolean(result.body.sessionId),
      !["failed", "expired"].includes(status),
    );
  });
}

Deno.test("missing Aadhaar consent and wrong issuer cannot verify", async () => {
  for (
    const options of [
      { consented: false },
      { issuer: "uploaded-document" },
    ]
  ) {
    const f = fixture(options);
    const result = await f.run({ action: "refresh" });
    assert.equal(result.body.verified, false);
    assert.equal(f.sync.length, 0);
  }
});

Deno.test("a provider session belonging to another request fails closed", async () => {
  const f = fixture({ wrongSession: true });
  const result = await f.run({ action: "refresh" });
  assert.equal(result.body.verified, undefined);
  assert.equal(f.sync.length, 0);
  assert.equal(f.writes.some((write) => write.p_action === "update"), false);
});

Deno.test("provider account and availability errors are safe and specific", async () => {
  const cases = [
    [401, "provider_authentication"],
    [403, "digilocker_access_not_enabled"],
    [429, "provider_rate_limit"],
    [503, "provider_unavailable"],
  ] as const;
  for (const [providerStatus, code] of cases) {
    const f = fixture({ session: null, providerErrorStatus: providerStatus });
    const result = await f.run({
      action: "begin",
      consent: true,
      consentVersion: CONSENT_VERSION,
    });
    assert.equal(result.body.code, code);
    assert.equal(
      JSON.stringify(result.body).includes("PRIVATE_SENTINEL"),
      false,
    );
  }
});

Deno.test("verified retry is idempotent and skips provider and score sync", async () => {
  const f = fixture({
    session: {
      id: localId,
      status: "succeeded",
      verified_at: "mock-time",
      environment: "production",
      provider_session_id: providerId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  assert.equal((await f.run({ action: "refresh" })).body.verified, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.sync.length, 0);
});

Deno.test("parsers reject forged sessions and unissued documents", () => {
  assert.equal(
    hasIssuedAadhaar({
      code: 200,
      data: { files: [{ metadata: { issuer_id: "in.gov.uidai" } }] },
    }),
    false,
  );
  assert.throws(() =>
    parseSdkSessionStatus({
      code: 200,
      data: {
        id: providerId,
        "@entity": "in.co.sandbox.kyc.digilocker.sdk.session",
        status: "unknown",
      },
      transaction_id: transactionId,
    }, providerId)
  );
  assert.equal(
    digilockerConfiguration((name) =>
      ({ ...settings, SANDBOX_ENVIRONMENT: "unknown" })[name]
    ),
    null,
  );
});

Deno.test("invalid JSON, methods and ledger failures return fixed errors", async () => {
  const f = fixture();
  const invalid = await f.handler(
    new Request("https://local.test", {
      method: "POST",
      body: "SECRET_INVALID_JSON",
    }),
  );
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes("SECRET"), false);
  assert.equal(
    (await f.handler(new Request("https://local.test"))).status,
    405,
  );
  const failed = await fixture({ ledgerError: true }).run({
    action: "availability",
  });
  assert.equal(
    JSON.stringify(failed.body).includes("PRIVATE_DATABASE_SENTINEL"),
    false,
  );
});

function legacyFixture(options: {
  authId?: string;
  allowed?: boolean;
  session?: Record<string, unknown> | null;
  providerStatus?: number;
  verifyValid?: boolean;
  ledgerError?: string;
} = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const writes: Record<string, unknown>[] = [];
  const sync: string[] = [];
  let session = options.session === undefined ? null : options.session;
  const handler = createAadhaarHandler({
    env: (name) => settings[name],
    authenticate: async () => ({
      authId: options.authId ?? "owner-from-validated-auth",
      allowed: options.allowed !== false,
      syncVerified: async () => {
        sync.push("sync");
      },
    }),
    ledger: async () => ({ data: null, error: null }),
    legacyLedger: async (authId, args) => {
      writes.push({ authId, ...args });
      if (options.ledgerError) {
        return { data: null, error: { message: options.ledgerError } };
      }
      if (args.p_action === "begin") {
        session = {
          id: localId,
          environment: args.p_environment,
          provider_reference_id: null,
          status: "initializing",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          verified_at: null,
          aadhaar_last4: args.p_aadhaar_last4,
        };
      }
      if (args.p_action === "update") {
        session = {
          ...session,
          provider_reference_id: args.p_provider_reference_id ??
            (session as Record<string, unknown> | null)?.provider_reference_id,
          status: args.p_status,
          verified_at: args.p_verified ? "mock-production-proof-time" : null,
        };
      }
      if (args.p_action === "claim_verify") {
        session = { ...session, status: "verifying" };
      }
      return { data: session, error: null };
    },
    fetcher: async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (
        options.providerStatus &&
        (options.providerStatus !== 422 || !url.endsWith("/authenticate"))
      ) {
        return new Response("PRIVATE_PROVIDER_BODY", {
          status: options.providerStatus,
        });
      }
      let data: unknown;
      if (url.endsWith("/authenticate")) {
        data = { access_token: "mock-access-token" };
      } else if (url.endsWith("/otp")) {
        data = {
          "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.response",
          reference_id: 1234567,
        };
      } else if (url.endsWith("/otp/verify")) {
        data = {
          "@entity": "in.co.sandbox.kyc.aadhaar.okyc",
          reference_id: 1234567,
          status: options.verifyValid === false ? "INVALID" : "VALID",
          name: "PRIVATE_NAME_SENTINEL",
          photo: "PRIVATE_PHOTO_SENTINEL",
        };
      } else throw new Error("Unexpected provider endpoint");
      return new Response(
        JSON.stringify({ code: 200, data, transaction_id: transactionId }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  const run = async (body: unknown) => {
    const response = await handler(
      new Request("https://local.test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return { run, calls, writes, sync };
}

for (
  const accountType of ["email", "phone", "google", "linked", "new", "existing"]
) {
  Deno.test(`legacy OTP request is accepted for ${accountType} account`, async () => {
    const f = legacyFixture({
      authId: `${accountType}-validated-auth-id`,
      session: null,
    });
    const result = await f.run({
      action: AADHAAR_ACTIONS.legacySendOtp,
      aadhaarNumber: "123456789012",
      consent: true,
      consentVersion: AADHAAR_CONSENT_VERSION,
      authId: "attacker-chosen",
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "otp_sent");
    assert.equal(result.body.maskedAadhaar, "•••• •••• 9012");
    assert(
      f.writes.every((write) =>
        write.authId === `${accountType}-validated-auth-id`
      ),
    );
    assert.equal(f.writes.some((write) => write.p_action === "begin"), true);
    assert.equal(
      JSON.stringify([result.body, f.writes]).includes("123456789012"),
      false,
    );
  });
}

Deno.test("legacy OTP format, consent and unknown actions fail before provider access", async () => {
  const f = legacyFixture();
  assert.equal(
    (await f.run({
      action: AADHAAR_ACTIONS.legacySendOtp,
      aadhaarNumber: "123",
      consent: true,
      consentVersion: AADHAAR_CONSENT_VERSION,
    })).status,
    400,
  );
  assert.equal(
    (await f.run({
      action: AADHAAR_ACTIONS.legacySendOtp,
      aadhaarNumber: "123456789012",
      consent: false,
      consentVersion: AADHAAR_CONSENT_VERSION,
    })).status,
    400,
  );
  assert.equal(
    (await f.run({ action: "send-aadhaar-otp" })).body.error,
    "Invalid verification action.",
  );
  assert.equal(f.calls.length, 0);
});

Deno.test("legacy OTP success is private, server-bound and syncs Trust once", async () => {
  const f = legacyFixture({
    session: {
      id: localId,
      environment: "production",
      provider_reference_id: "1234567",
      status: "otp_sent",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      verified_at: null,
      aadhaar_last4: "9012",
    },
  });
  const result = await f.run({
    action: AADHAAR_ACTIONS.legacyVerifyOtp,
    otp: "121212",
    providerReference: "attacker-chosen",
  });
  assert.equal(result.body.verified, true);
  assert.equal(f.sync.length, 1);
  assert.equal(
    f.writes.find((write) => write.p_action === "update")
      ?.p_provider_reference_id,
    "1234567",
  );
  assert.equal(
    JSON.stringify([result.body, f.writes]).includes("121212"),
    false,
  );
  assert.equal(
    JSON.stringify([result.body, f.writes]).includes("PRIVATE_"),
    false,
  );
});

Deno.test("legacy verified retry is idempotent and skips provider and score sync", async () => {
  const f = legacyFixture({
    session: {
      id: localId,
      environment: "production",
      provider_reference_id: "1234567",
      status: "succeeded",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      verified_at: "mock-time",
      aadhaar_last4: "9012",
    },
  });
  const result = await f.run({
    action: AADHAAR_ACTIONS.legacyVerifyOtp,
    otp: "121212",
  });
  assert.equal(result.body.verified, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.sync.length, 0);
});

Deno.test("legacy provider errors are specific and never expose raw bodies", async () => {
  for (
    const [providerStatus, code] of [
      [401, "provider_authentication"],
      [402, "provider_credits"],
      [404, "provider_api_disabled"],
      [429, "provider_rate_limit"],
      [500, "provider_unavailable"],
    ] as const
  ) {
    const f = legacyFixture({ providerStatus });
    const result = await f.run({
      action: AADHAAR_ACTIONS.legacySendOtp,
      aadhaarNumber: "123456789012",
      consent: true,
      consentVersion: AADHAAR_CONSENT_VERSION,
    });
    assert.equal(result.body.code, code);
    assert.equal(
      JSON.stringify(result.body).includes("PRIVATE_PROVIDER_BODY"),
      false,
    );
  }
});
