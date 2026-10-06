import { Webhook } from "standardwebhooks";
import {
  fast2SmsRequestBody,
  parseSendSmsHookPayload,
} from "./payload.ts";
import { hookError, hookSuccess } from "./responses.ts";

type VeriphoneResult = {
  status?: unknown;
  phone_valid?: unknown;
};

type Fast2SmsResult = {
  return?: unknown;
  status_code?: unknown;
};

type SmsProviderResult = {
  sent: boolean;
  httpStatus: number | null;
  providerCode: number | null;
};

const FAST2SMS_URL = "https://www.fast2sms.com/dev/otp/send";
const VERIPHONE_URL = "https://api.veriphone.io/v3/verify";
const MAX_HOOK_BODY_BYTES = 20 * 1024;
const OTP_EXPIRY_MINUTES = 5;

function requiredSecret(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

async function validateWithVeriphone(
  phoneE164: string,
  apiKey: string,
): Promise<"valid" | "invalid" | "unavailable"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);

  try {
    const url = new URL(VERIPHONE_URL);
    url.searchParams.set("phone", phoneE164);
    url.searchParams.set("mode", "static");
    url.searchParams.set("record", "false");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) return "unavailable";

    const result = (await response.json()) as VeriphoneResult;
    if (result.status !== "success") return "unavailable";
    if (result.phone_valid === false) return "invalid";
    if (result.phone_valid === true) return "valid";
    return "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}

async function sendFast2Sms(
  nationalPhone: string,
  otp: string,
  apiKey: string,
  otpId: string,
): Promise<SmsProviderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);

  try {
    const response = await fetch(FAST2SMS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        fast2SmsRequestBody(
          nationalPhone,
          otp,
          otpId,
          OTP_EXPIRY_MINUTES,
        ),
      ),
      signal: controller.signal,
    });

    const result = (await response.json()) as Fast2SmsResult;
    const sent = response.ok && result.return === true;
    if (!sent) {
      // Never log provider bodies, credentials, phone numbers, or OTPs.
      const code = Number(result.status_code);
      console.warn(JSON.stringify({
        event: "sms_provider_rejected",
        provider: "fast2sms",
        http_status: response.status,
        provider_code: Number.isInteger(code) ? code : null,
        reason: code === 412 ? "invalid_authorization_key" : "provider_rejected",
      }));
    }
    return {
      sent,
      httpStatus: response.status,
      providerCode: Number.isInteger(Number(result.status_code))
        ? Number(result.status_code)
        : null,
    };
  } catch {
    console.warn(JSON.stringify({ event: "sms_provider_unavailable", provider: "fast2sms" }));
    return { sent: false, httpStatus: null, providerCode: null };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const startedAt = Date.now();
  const rawRequestId = request.headers.get("webhook-id") ?? crypto.randomUUID();
  const requestId = /^[A-Za-z0-9_-]{1,100}$/.test(rawRequestId)
    ? rawRequestId
    : crypto.randomUUID();
  const logResult = (input: Record<string, unknown>) => console.info(JSON.stringify({
    event: "verification_operation",
    request_id: requestId,
    provider: "fast2sms",
    duration_ms: Date.now() - startedAt,
    ...input,
  }));
  if (request.method !== "POST") {
    return hookError(405, "Method not allowed");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_HOOK_BODY_BYTES) {
    return hookError(413, "Hook payload is too large");
  }

  const hookSecret = requiredSecret("SEND_SMS_HOOK_SECRET");
  const fast2SmsApiKey = requiredSecret("FAST2SMS_API_KEY");
  const fast2SmsOtpId = requiredSecret("FAST2SMS_OTP_ID");
  const veriphoneApiKey = requiredSecret("VERIPHONE_API_KEY");

  if (!hookSecret || !fast2SmsApiKey || !fast2SmsOtpId) {
    return hookError(500, "SMS service is not configured");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_HOOK_BODY_BYTES) {
    return hookError(413, "Hook payload is too large");
  }

  let payload: unknown;
  try {
    const base64Secret = hookSecret.replace(/^v1,whsec_/, "");
    if (!base64Secret) return hookError(500, "SMS hook is not configured");

    const webhook = new Webhook(base64Secret);
    payload = webhook.verify(
      rawBody,
      Object.fromEntries(request.headers.entries()),
    );
  } catch {
    return hookError(401, "Invalid hook signature");
  }

  const parsed = parseSendSmsHookPayload(payload);
  if (!parsed) {
    logResult({ operation: "send_otp", result: "rejected", http_status: 400, code: "invalid_payload" });
    return hookError(400, "Invalid SMS hook payload");
  }

  if (veriphoneApiKey) {
    const phoneVerdict = await validateWithVeriphone(
      parsed.phone.e164,
      veriphoneApiKey,
    );
    console.info(JSON.stringify({ event: "sms_phone_validation", provider: "veriphone", verdict: phoneVerdict }));
    if (phoneVerdict === "invalid") {
      logResult({ user_id: parsed.userId, operation: parsed.operation, result: "rejected", http_status: 422, code: "invalid_phone" });
      return hookError(422, "Phone number is invalid");
    }
  }

  const providerResult = await sendFast2Sms(
    parsed.phone.national,
    parsed.otp,
    fast2SmsApiKey,
    fast2SmsOtpId,
  );
  if (!providerResult.sent) {
    logResult({
      user_id: parsed.userId,
      operation: parsed.operation,
      result: "provider_rejected",
      http_status: providerResult.httpStatus ?? 502,
      provider_code: providerResult.providerCode,
    });
    return hookError(502, "SMS provider rejected the request");
  }

  logResult({
    user_id: parsed.userId,
    operation: parsed.operation,
    result: "sent",
    http_status: providerResult.httpStatus,
    provider_code: providerResult.providerCode,
  });
  return hookSuccess();
});
