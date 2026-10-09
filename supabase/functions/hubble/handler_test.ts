import assert from "node:assert/strict";
import {
  createHubbleHandler,
  signHubbleJwt,
  type HubbleConfig,
} from "./handler.ts";

const base64Url = (value: ArrayBuffer) => {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const pem = (label: string, value: ArrayBuffer) => {
  const data = base64Url(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = data + "=".repeat((4 - data.length % 4) % 4);
  return `-----BEGIN ${label}-----\n${padded.match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----`;
};
const keyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const privateKey = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
const config: HubbleConfig = {
  environment: "staging",
  clientId: "wenitro-dev-fixture",
  appSecret: "public-sdk-config-fixture",
  sharedSecret: "private-callback-fixture",
  privateKey,
  sdkUrl: "https://sdk.dev.myhubble.money/",
};
const context = {
  userId: 42,
  balance: 201,
  phoneNumber: "9876543210",
  name: "QA Member",
  email: "qa@example.test",
  environment: "staging" as const,
  nitroToInr: 1,
  eligibilityPoints: 200,
  minimumDebitPoints: 1,
  paymentModel: "coins_only" as const,
  eligible: true,
};

const decode = (value: string) => JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4)));

Deno.test("RS256 SSO JWT is verifiable, fresh and expires in exactly 60 seconds", async () => {
  const token = await signHubbleJwt(config, context, 1_800_000_000);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decode(payload), {
    sub: "42",
    iss: config.clientId,
    iat: 1_800_000_000,
    exp: 1_800_000_060,
    phoneNumber: "9876543210",
    name: "QA Member",
    email: "qa@example.test",
  });
  const raw = signature.replaceAll("-", "+").replaceAll("_", "/");
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    keyPair.publicKey,
    Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), character => character.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  assert.equal(verified, true);

  const wrongKeyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const wrongKeyVerified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    wrongKeyPair.publicKey,
    Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), character => character.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  assert.equal(wrongKeyVerified, false);

  const expired = await signHubbleJwt(config, context, 1_799_999_900);
  assert.equal(decode(expired.split(".")[1]).exp < 1_800_000_000, true);
  assert.notEqual(decode(payload).iss, "wrong-client-id");
});

function fixture() {
  const calls: unknown[] = [];
  const logs: Record<string, unknown>[] = [];
  const handler = createHubbleHandler({
    config: async () => config,
    authenticate: async request => {
      if (request.headers.get("Authorization") !== "Bearer valid") throw new Error("Authentication required");
      return "auth-user";
    },
    tokenContext: async authId => {
      calls.push({ tokenContext: authId });
      return context;
    },
    balance: async userId => ({
      userId,
      totalCoins: 201,
      consumptionEligibility: { allowed: true },
    }),
    debit: async args => {
      calls.push({ debit: args });
      return { transactionId: "nitro_txn_1", balance: 200, referenceId: args.referenceId, idempotent: false };
    },
    reverse: async args => {
      calls.push({ reverse: args });
      return { transactionId: "nitro_txn_2", balance: 201, referenceId: args.referenceId, idempotent: false };
    },
    now: () => 1_800_000_000_000,
    log: entry => logs.push(entry),
  });
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await handler(new Request(`https://project.test/functions/v1/hubble/${path}`, init));
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { calls, logs, request };
}

Deno.test("authenticated token response exposes SDK config but never callback secret or private key", async () => {
  const f = fixture();
  const result = await f.request("token", { headers: { Authorization: "Bearer valid" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "SUCCESS");
  assert.equal(result.body.eligible, true);
  assert.equal(result.body.eligibilityPoints, 200);
  assert.equal(result.headers.get("cache-control"), "no-store, max-age=0");
  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes(config.sharedSecret), false);
  assert.equal(serialized.includes("BEGIN PRIVATE KEY"), false);
  assert.equal(JSON.stringify(f.logs).includes(config.sharedSecret), false);
  assert.equal(f.logs.at(-1)?.route, "token");
  assert.equal(f.logs.at(-1)?.userId, 42);
  const unauthenticated = await f.request("token");
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.failureReason, "Authentication required");
});

Deno.test("callback secret, input validation, debit and reverse contracts are enforced", async () => {
  const f = fixture();
  assert.equal((await f.request("balance?userId=42")).status, 401);
  const headers = { "X-Hubble-Secret": config.sharedSecret, "Content-Type": "application/json" };
  assert.deepEqual((await f.request("balance?userId=42", { headers })).body, {
    status: "SUCCESS", userId: 42, totalCoins: 201,
    consumptionEligibility: { allowed: true },
  });
  assert.equal((await f.request("balance?userId=bad", { headers })).status, 404);
  const invalid = await f.request("debit", { method: "POST", headers, body: JSON.stringify({ userId: "42", coins: 1.5, referenceId: "ref" }) });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.failureReason, "Coins must be a positive whole number");
  const debit = await f.request("debit", { method: "POST", headers, body: JSON.stringify({ userId: "42", coins: 1, referenceId: "ref-1", note: "Gift card" }) });
  assert.equal(debit.body.status, "SUCCESS");
  const reverse = await f.request("reverse", { method: "POST", headers, body: JSON.stringify({ userId: "42", referenceId: "ref-1" }) });
  assert.equal(reverse.body.status, "SUCCESS");
  assert.equal(f.calls.filter(value => "debit" in (value as Record<string, unknown>)).length, 1);
  assert.equal(f.calls.filter(value => "reverse" in (value as Record<string, unknown>)).length, 1);
  const debitLog = f.logs.find(row => row.route === "debit" && row.status === 200);
  assert.equal(debitLog?.status, 200);
  assert.equal(debitLog?.reference, "[masked]");
  assert.equal(debitLog?.coins, 1);
  assert.equal(JSON.stringify(f.logs).includes(config.sharedSecret), false);
});

Deno.test("production environment accepts only the production SDK URL", async () => {
  const productionContext = { ...context, environment: "production" as const };
  const productionConfig: HubbleConfig = {
    ...config,
    environment: "production",
    sdkUrl: "https://sdk.myhubble.money/",
  };
  const productionHandler = createHubbleHandler({
    config: async () => productionConfig,
    authenticate: async () => "auth",
    tokenContext: async () => productionContext,
    balance: async () => ({ userId: 1, totalCoins: 1 }),
    debit: async () => ({ transactionId: "x", balance: 0, referenceId: "x", idempotent: false }),
    reverse: async () => ({ transactionId: "x", balance: 0, referenceId: "x", idempotent: false }),
  });
  const success = await productionHandler(new Request("https://project.test/functions/v1/hubble/token", { headers: { Authorization: "Bearer valid" } }));
  assert.equal(success.status, 200);
  assert.equal((await success.json()).environment, "production");

  for (const bad of [
    { ...productionConfig, sdkUrl: "https://sdk.dev.myhubble.money/" },
    { ...config, sdkUrl: "https://sdk.myhubble.money/" },
  ]) {
    const handler = createHubbleHandler({
      config: async () => bad as HubbleConfig,
      authenticate: async () => "auth",
      tokenContext: async () => bad.environment === "production" ? productionContext : context,
      balance: async () => ({ userId: 1, totalCoins: 1 }),
      debit: async () => ({ transactionId: "x", balance: 0, referenceId: "x", idempotent: false }),
      reverse: async () => ({ transactionId: "x", balance: 0, referenceId: "x", idempotent: false }),
    });
    const response = await handler(new Request("https://project.test/functions/v1/hubble/token", { headers: { Authorization: "Bearer valid" } }));
    assert.notEqual(response.status, 200);
  }
});
