import { Webhook } from "standardwebhooks";
import {
  fast2SmsRequestBody,
  normalizeIndianMobile,
  parseSendSmsHookPayload,
} from "./payload.ts";
import { hookError, hookSuccess } from "./responses.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function assertJsonResponse(
  response: Response,
  status: number,
  expectedBody: unknown,
) {
  assertEquals(response.status, status, "response status");
  assertEquals(
    response.headers.get("content-type"),
    "application/json",
    "response Content-Type",
  );
  assertEquals(await response.json(), expectedBody, "response JSON body");
}

async function signedHeaders(secret: string, body: string) {
  const id = "msg_sanitized_fixture";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bytes = Uint8Array.from(atob(secret), (character) =>
    character.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`),
    ),
  );
  const signature = btoa(String.fromCharCode(...signatureBytes));

  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

Deno.test("normalizes the three supported Indian phone formats", () => {
  const expected = { e164: "+919876543210", national: "9876543210" };
  assertEquals(normalizeIndianMobile("9876543210"), expected, "national format");
  assertEquals(normalizeIndianMobile("919876543210"), expected, "country-code format");
  assertEquals(normalizeIndianMobile("+919876543210"), expected, "E.164 format");
  assertEquals(normalizeIndianMobile("+91+919876543210"), null, "duplicated prefix");
  assertEquals(normalizeIndianMobile("+14155552671"), null, "non-Indian number");
});

Deno.test("accepts a signed Supabase Send SMS fixture and maps Fast2SMS fields", async () => {
  const secret = btoa("wenitro-sanitized-hook-test-key");
  const body = JSON.stringify({
    user: { phone: "919876543210" },
    sms: { otp: "123456" },
  });
  const headers = await signedHeaders(secret, body);
  const verified = new Webhook(secret).verify(body, headers);
  const parsed = parseSendSmsHookPayload(verified);

  assert(parsed, "signed fixture should satisfy the Send SMS contract");
  assertEquals(parsed.phone, {
    e164: "+919876543210",
    national: "9876543210",
  }, "normalized phone");
  assertEquals(
    fast2SmsRequestBody(parsed.phone.national, parsed.otp, "otp-template", 5),
    {
      mobile: "9876543210",
      otp_id: "otp-template",
      otp: "123456",
      otp_length: 6,
      otp_expiry: 5,
    },
    "Fast2SMS request",
  );
});

Deno.test("rejects an invalid hook signature", async () => {
  const secret = btoa("wenitro-sanitized-hook-test-key");
  const body = JSON.stringify({
    user: { phone: "+919876543210" },
    sms: { otp: "123456" },
  });
  const headers = await signedHeaders(secret, body);
  headers["webhook-signature"] = "v1,invalid";

  let rejected = false;
  try {
    new Webhook(secret).verify(body, headers);
  } catch {
    rejected = true;
  }
  assert(rejected, "invalid signature must be rejected");
});

Deno.test("rejects a validly signed malformed payload", async () => {
  const secret = btoa("wenitro-sanitized-hook-test-key");
  const body = JSON.stringify({
    user: { phone: "919876543210" },
    sms: { otp: "not-an-otp" },
  });
  const headers = await signedHeaders(secret, body);
  const verified = new Webhook(secret).verify(body, headers);

  assertEquals(
    parseSendSmsHookPayload(verified),
    null,
    "malformed payload",
  );
});

Deno.test("success response satisfies the Supabase hook response contract", async () => {
  await assertJsonResponse(hookSuccess(), 200, {});
});

Deno.test("invalid signature response is valid JSON", async () => {
  await assertJsonResponse(hookError(401, "Invalid hook signature"), 401, {
    error: { http_code: 401, message: "Invalid hook signature" },
  });
});

Deno.test("malformed payload response is valid JSON", async () => {
  await assertJsonResponse(hookError(400, "Invalid SMS hook payload"), 400, {
    error: { http_code: 400, message: "Invalid SMS hook payload" },
  });
});

Deno.test("provider failure response is valid JSON", async () => {
  await assertJsonResponse(hookError(502, "SMS provider rejected the request"), 502, {
    error: { http_code: 502, message: "SMS provider rejected the request" },
  });
});
