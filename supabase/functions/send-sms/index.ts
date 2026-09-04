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
): Promise<boolean> {
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

    if (!response.ok) return false;

    const result = (await response.json()) as Fast2SmsResult;
    return result.return === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
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
    return hookError(400, "Invalid SMS hook payload");
  }

  if (veriphoneApiKey) {
    const phoneVerdict = await validateWithVeriphone(
      parsed.phone.e164,
      veriphoneApiKey,
    );
    if (phoneVerdict === "invalid") {
      return hookError(422, "Phone number is invalid");
    }
  }

  const sent = await sendFast2Sms(
    parsed.phone.national,
    parsed.otp,
    fast2SmsApiKey,
    fast2SmsOtpId,
  );
  if (!sent) {
    return hookError(502, "SMS provider rejected the request");
  }

  return hookSuccess();
});
