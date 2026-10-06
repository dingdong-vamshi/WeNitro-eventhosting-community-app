export type HubbleTokenContext = {
  userId: number;
  balance: number;
  phoneNumber: string;
  name?: string | null;
  email?: string | null;
  environment: "staging" | "production";
  nitroToInr: number;
  eligibilityPoints: number;
  minimumDebitPoints: number;
  paymentModel: "coins_only" | "mixed";
  eligible: boolean;
};

export type HubbleLedgerResult = {
  transactionId: string;
  balance: number;
  referenceId: string;
  idempotent: boolean;
};

export type HubbleConfig = {
  environment: "staging";
  clientId: string;
  appSecret: string;
  sharedSecret: string;
  privateKey: string;
  sdkUrl: "https://sdk.dev.myhubble.money/";
};

type Dependencies = {
  config: () => Promise<HubbleConfig>;
  authenticate: (request: Request) => Promise<string>;
  tokenContext: (authId: string) => Promise<HubbleTokenContext>;
  balance: (userId: number) => Promise<{
    userId: number;
    totalCoins: number;
    consumptionEligibility?: { allowed: boolean; message?: string };
  }>;
  debit: (args: {
    userId: number;
    coins: number;
    referenceId: string;
    note: string | null;
  }) => Promise<HubbleLedgerResult>;
  reverse: (args: {
    userId: number;
    referenceId: string;
    note: string | null;
  }) => Promise<HubbleLedgerResult>;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hubble-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });

const bytes = new TextEncoder();
const base64Url = (value: Uint8Array | string) => {
  const input = typeof value === "string" ? bytes.encode(value) : value;
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const privateKeyBytes = (pem: string) => {
  const compact = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/g, "");
  if (!compact) throw new Error("Hubble RSA private key is unavailable.");
  const binary = atob(compact);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export async function signHubbleJwt(
  config: Pick<HubbleConfig, "clientId" | "privateKey">,
  context: Pick<HubbleTokenContext, "userId" | "phoneNumber" | "name" | "email">,
  nowSeconds: number,
) {
  const phoneNumber = context.phoneNumber.replaceAll(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(phoneNumber)) {
    throw new Error("A verified 10-digit phone number is required for Hubble rewards.");
  }
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: String(context.userId),
    iss: config.clientId,
    iat: nowSeconds,
    exp: nowSeconds + 60,
    phoneNumber,
    ...(context.name ? { name: context.name } : {}),
    ...(context.email ? { email: context.email } : {}),
  }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(config.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    bytes.encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

const constantTimeEqual = (left: string, right: string) => {
  const a = bytes.encode(left);
  const b = bytes.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(a.length, 1)] ?? 0) ^
      (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return difference === 0;
};

const positiveUserId = (value: string | null) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("No user with this ID");
  }
  return number;
};

const bodyValue = (body: Record<string, unknown>, key: string) => body[key];
const referenceId = (value: unknown) => {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed || parsed.length > 180) throw new Error("Invalid referenceId");
  return parsed;
};
const wholeCoins = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Coins must be a positive whole number");
  }
  return parsed;
};
const note = (value: unknown) => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid note");
  const parsed = value.trim();
  if (parsed.length > 240) throw new Error("Note is too long");
  return parsed || null;
};

const referenceHint = (value: string) =>
  value.length <= 8 ? "[masked]" : `${value.slice(0, 4)}…${value.slice(-4)}`;

const routeName = (request: Request) => {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const hubbleIndex = parts.lastIndexOf("hubble");
  return hubbleIndex >= 0 ? parts[hubbleIndex + 1] ?? "" : parts.at(-1) ?? "";
};

const safeFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Request failed";
  const allowed = [
    "Authentication required",
    "Missing bearer token",
    "A verified phone number is required for Hubble rewards",
    "A verified 10-digit phone number is required for Hubble rewards",
    "Hubble staging is unavailable",
    "No user with this ID",
    "Insufficient balance",
    "Original debit not found",
    "referenceId belongs to another user",
    "referenceId conflicts with an existing debit",
    "Coins must be a positive whole number",
    "Invalid referenceId",
    "Invalid note",
    "Note is too long",
    "Redemption amount is below the configured minimum",
  ];
  if (allowed.some((candidate) => message.includes(candidate)) ||
      /^At least \d+ Nitro Points are required to redeem$/.test(message)) return message;
  return "Request failed";
};

export function createHubbleHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const route = routeName(request);
    const startedAt = performance.now();
    const requestId = crypto.randomUUID();
    let context: Record<string, unknown> = {};
    const respond = (body: Record<string, unknown>, status = 200) => {
      const entry = {
        event: "hubble_request",
        requestId,
        route,
        method: request.method,
        status,
        result: body.status,
        failureReason: body.status === "FAILED" ? body.failureReason : undefined,
        durationMs: Math.round(performance.now() - startedAt),
        ...context,
      };
      if (deps.log) deps.log(entry);
      else console.info(JSON.stringify(entry));
      return json(body, status);
    };
    try {
      const config = await deps.config();
      if (config.environment !== "staging" ||
          config.sdkUrl !== "https://sdk.dev.myhubble.money/") {
        throw new Error("Hubble staging is unavailable.");
      }

      if (route === "token") {
        if (request.method !== "GET") return respond({ status: "FAILED", failureReason: "Method not allowed" }, 405);
        const authId = await deps.authenticate(request);
        const tokenContext = await deps.tokenContext(authId);
        if (tokenContext.environment !== "staging") throw new Error("Hubble staging is unavailable.");
        // Auth UUID, access token, phone and email are deliberately not logged.
        context = { userId: tokenContext.userId };
        const issuedAt = Math.floor((deps.now?.() ?? Date.now()) / 1000);
        const token = await signHubbleJwt(config, tokenContext, issuedAt);
        return respond({
          status: "SUCCESS",
          token,
          clientId: config.clientId,
          appSecret: config.appSecret,
          sdkUrl: config.sdkUrl,
          balance: tokenContext.balance,
          eligible: tokenContext.eligible,
          eligibilityPoints: tokenContext.eligibilityPoints,
          minimumDebitPoints: tokenContext.minimumDebitPoints,
          nitroToInr: tokenContext.nitroToInr,
          paymentModel: tokenContext.paymentModel,
          environment: tokenContext.environment,
        });
      }

      const suppliedSecret = request.headers.get("X-Hubble-Secret") ?? "";
      if (!constantTimeEqual(suppliedSecret, config.sharedSecret)) {
        return respond({ status: "FAILED", failureReason: "Unauthorized" }, 401);
      }

      if (route === "balance") {
        if (request.method !== "GET") return respond({ status: "FAILED", failureReason: "Method not allowed" }, 405);
        const userId = positiveUserId(new URL(request.url).searchParams.get("userId"));
        context = { userId };
        const result = await deps.balance(userId);
        context = { ...context, balance: result.totalCoins };
        return respond({ status: "SUCCESS", ...result });
      }

      if (route === "debit" || route === "reverse") {
        if (request.method !== "POST") return respond({ status: "FAILED", failureReason: "Method not allowed" }, 405);
        let body: Record<string, unknown>;
        try {
          body = await request.json() as Record<string, unknown>;
        } catch {
          return respond({ status: "FAILED", failureReason: "Invalid JSON body" }, 400);
        }
        const userId = positiveUserId(String(bodyValue(body, "userId") ?? ""));
        const requestReference = referenceId(bodyValue(body, "referenceId"));
        const requestNote = note(bodyValue(body, "note"));
        const requestedCoins = route === "debit" ? wholeCoins(bodyValue(body, "coins")) : undefined;
        context = {
          userId,
          reference: referenceHint(requestReference),
          ...(requestedCoins ? { coins: requestedCoins } : {}),
        };
        const result = route === "debit"
          ? await deps.debit({
            userId,
            coins: requestedCoins!,
            referenceId: requestReference,
            note: requestNote,
          })
          : await deps.reverse({ userId, referenceId: requestReference, note: requestNote });
        context = { ...context, transactionId: result.transactionId, balance: result.balance, idempotent: result.idempotent };
        return respond({ status: "SUCCESS", ...result });
      }

      return respond({ status: "FAILED", failureReason: "Not found" }, 404);
    } catch (error) {
      const failureReason = safeFailure(error);
      const status = /Authentication required|Missing bearer token/.test(
          error instanceof Error ? error.message : "",
        ) ? 401
        : /No user with this ID|Original debit not found/.test(failureReason) ? 404
        : failureReason === "Request failed" ? 500
        : 400;
      return respond({ status: "FAILED", failureReason }, status);
    }
  };
}
