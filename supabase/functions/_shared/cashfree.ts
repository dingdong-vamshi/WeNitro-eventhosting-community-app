import {
  createClient,
  type SupabaseClient,
  type User,
} from "npm:@supabase/supabase-js@2.112.4";

export const CASHFREE_API_VERSION = "2025-01-01";
export const CASHFREE_BASE_URL = "https://sandbox.cashfree.com";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class CashfreeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CashfreeHttpError";
  }
}

type JsonRecord = Record<string, unknown>;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(name + " is not configured.");
  return value;
};

const keyFromDictionary = (name: string) => {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
};

const publishableKey = () =>
  Deno.env.get("SUPABASE_ANON_KEY") ??
  keyFromDictionary("SUPABASE_PUBLISHABLE_KEYS") ??
  requiredEnv("SUPABASE_ANON_KEY");

const secretKey = () =>
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  keyFromDictionary("SUPABASE_SECRET_KEYS") ??
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const errorResponse = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Payment request failed.";
  const status =
    error instanceof CashfreeHttpError
      ? 502
      : /Authentication required|Missing bearer token/.test(message)
        ? 401
        : /not found|unavailable/.test(message)
          ? 404
          : 400;
  return jsonResponse({ error: message }, status);
};

export const positiveInteger = (value: unknown, label: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(label + " must be a positive integer.");
  }
  return number;
};

export const amountToPaisa = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Provider returned an invalid payment amount.");
  }
  const paisa = Math.round(amount * 100);
  if (Math.abs(amount * 100 - paisa) > 0.000001) {
    throw new Error("Provider amount has more than two decimal places.");
  }
  return paisa;
};

const cashfreeCredentials = () => {
  const environment = requiredEnv("CASHFREE_ENV").toLowerCase();
  if (environment !== "test" && environment !== "sandbox") {
    throw new Error("Cashfree is locked to TEST/SANDBOX mode.");
  }
  return {
    appId: requiredEnv("CASHFREE_APP_ID"),
    secret: requiredEnv("CASHFREE_SECRET_KEY"),
  };
};

export const cashfreeRequest = async (
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
) => {
  const credentials = cashfreeCredentials();
  const response = await fetch(CASHFREE_BASE_URL + path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-version": CASHFREE_API_VERSION,
      "x-client-id": credentials.appId,
      "x-client-secret": credentials.secret,
      ...(idempotencyKey
        ? { "x-idempotency-key": idempotencyKey }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new CashfreeHttpError(
      "Cashfree request failed with status " + response.status + ".",
      response.status,
    );
  }
  return data;
};

const userClient = (authorization: string) =>
  createClient(requiredEnv("SUPABASE_URL"), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const adminClient = (): SupabaseClient =>
  createClient(requiredEnv("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const authenticatedContext = async (
  request: Request,
): Promise<{ client: SupabaseClient; user: User }> => {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }
  const client = userClient(authorization);
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Authentication required.");
  return { client, user: data.user };
};

export const firstRecord = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export const safeProviderMetadata = (value: JsonRecord) => {
  const allowed = [
    "order_status",
    "cf_order_id",
    "payment_status",
    "payment_group",
    "payment_message",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
};

export const checkoutReturnUrl = (
  request: Request,
  eventId: number,
  orderId: string,
) => {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowedOrigins = (Deno.env.get("CASHFREE_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin)) return null;
  return (
    origin +
    "/#/activity/" +
    encodeURIComponent(String(eventId)) +
    "?cashfree_order_id=" +
    encodeURIComponent(orderId)
  );
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
};

export const verifyWebhookSignature = async (
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
) => {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  // Cashfree can retry or manually resend a signed delivery well after its
  // original timestamp. Authenticity comes from the HMAC over the exact
  // timestamp and raw body; database finalization provides replay safety.
  const { secret } = cashfreeCredentials();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(timestamp + rawBody),
    ),
  );
  let received: Uint8Array;
  try {
    received = Uint8Array.from(atob(signature), (character) =>
      character.charCodeAt(0)
    );
  } catch {
    return false;
  }
  return constantTimeEqual(digest, received);
};
