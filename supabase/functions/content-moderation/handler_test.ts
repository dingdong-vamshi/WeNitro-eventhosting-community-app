import { createContentModerationHandler } from "./handler.ts";

const assert = (condition: unknown, message = "assertion failed") => { if (!condition) throw new Error(message); };
const json = async (response: Response) => JSON.parse(await response.text());
const request = (body: Record<string, unknown>, method = "POST") => new Request("https://example.test/content-moderation", {
  method, headers: { "Content-Type": "application/json", Authorization: "Bearer test" }, body: method === "POST" ? JSON.stringify(body) : undefined,
});
const providerResponse = (flagged = false) => new Response(JSON.stringify({
  id: "modr_test", model: "omni-moderation-latest",
  results: [{ flagged, categories: { violence: flagged }, category_scores: { violence: flagged ? 0.99 : 0.001 } }],
}), { status: 200, headers: { "Content-Type": "application/json", "x-request-id": "req_test" } });

function fixture(options: { fetcher?: typeof fetch; beginData?: Record<string, unknown>; env?: Record<string, string>; image?: Uint8Array } = {}) {
  const calls = { fetch: 0, begin: [] as Record<string, unknown>[][], resolve: [] as Record<string, unknown>[], load: 0, sleeps: 0 };
  const handler = createContentModerationHandler({
    authenticate: async () => ({ authId: "00000000-0000-4000-8000-000000000001", allowed: true }),
    loadImage: async () => { calls.load += 1; return { bytes: options.image ?? new Uint8Array([1, 2, 3]), contentType: "image/png" }; },
    begin: async (_authId, _scope, items) => { calls.begin.push(items); return { data: options.beginData ?? { requestId: "10000000-0000-4000-8000-000000000001", cachedImages: [] }, error: null }; },
    resolve: async (_authId, _requestId, result) => { calls.resolve.push(result); return { data: { status: result.p_status }, error: null }; },
    env: (name) => options.env?.[name] ?? (name === "OPENAI_API_KEY" ? "server-test-key" : undefined),
    fetcher: (async (...args: Parameters<typeof fetch>) => { calls.fetch += 1; return options.fetcher ? options.fetcher(...args) : providerResponse(false); }) as typeof fetch,
    sleep: async () => { calls.sleeps += 1; },
  });
  return { handler, calls };
}

Deno.test("safe text is sent server-side to omni-moderation-latest and resolved safe", async () => {
  let postedModel = "";
  let postedBody = "";
  const { handler, calls } = fixture({ fetcher: async (_url, init) => { postedBody = String(init?.body); postedModel = String(JSON.parse(postedBody).model); return providerResponse(false); } });
  const response = await handler(request({ scope: "activity", fields: [{ field: "title", value: "Morning badminton" }] }));
  const body = await json(response);
  assert(response.status === 200 && body.status === "safe");
  assert(postedModel === "omni-moderation-latest");
  assert(!postedBody.includes("server-test-key"));
  assert(calls.resolve[0].p_status === "safe");
});

Deno.test("flagged provider result blocks publication", async () => {
  const { handler, calls } = fixture({ fetcher: async () => providerResponse(true) });
  const response = await handler(request({ scope: "community_post", fields: [{ field: "body", value: "synthetic policy test" }] }));
  assert(response.status === 422 && (await json(response)).status === "unsafe");
  assert(calls.resolve[0].p_status === "unsafe");
});

Deno.test("429 is retried with bounded backoff then routed to Admin Review", async () => {
  const { handler, calls } = fixture({ fetcher: async () => new Response("rate limited", { status: 429 }) });
  const response = await handler(request({ scope: "profile", fields: [{ field: "bio", value: "Friendly runner" }] }));
  const body = await json(response);
  assert(response.status === 202 && body.status === "review");
  assert(calls.fetch === 3 && calls.sleeps === 2);
  assert(calls.resolve[0].p_status === "review" && calls.resolve[0].p_attempt_count === 3);
});

Deno.test("non-retryable provider errors do not fail open", async () => {
  const { handler, calls } = fixture({ fetcher: async () => new Response("unauthorized secret", { status: 401 }) });
  const response = await handler(request({ scope: "partner", fields: [{ field: "description", value: "Weekend sports" }] }));
  assert(response.status === 202 && (await json(response)).status === "review");
  assert(calls.fetch === 1 && calls.resolve[0].p_status === "review");
  assert(!JSON.stringify(calls.resolve).includes("unauthorized secret"));
});

Deno.test("image ownership is enforced before Storage download", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request({ scope: "vibe", images: [{ field: "media_path", value: "other/image.png", storageBucket: "vibes", storagePath: "other/image.png" }] }));
  assert(response.status === 400 && calls.load === 0 && calls.fetch === 0 && calls.begin.length === 0);
});

Deno.test("image bytes are hashed and a cached immutable image skips OpenAI", async () => {
  const contentHash = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
  const { handler, calls } = fixture({ beginData: { requestId: "10000000-0000-4000-8000-000000000001", cachedImages: [{ contentHash, status: "safe" }] } });
  const owner = "00000000-0000-4000-8000-000000000001";
  const response = await handler(request({ scope: "vibe", images: [{ field: "media_path", value: `${owner}/image.png`, storageBucket: "vibes", storagePath: `${owner}/image.png` }] }));
  assert(response.status === 200 && calls.fetch === 0);
  assert(calls.begin[0][0].contentHash === contentHash);
  assert(calls.resolve[0].p_status === "safe");
});

Deno.test("controlled harmless QA fixture can enter review without becoming public", async () => {
  const { handler, calls } = fixture({ env: { MODERATION_QA_FIXTURES_ENABLED: "true", OPENAI_API_KEY: "server-test-key" } });
  const response = await handler(request({ scope: "community_post", fields: [{ field: "body", value: "[QA MODERATION FIXTURE] harmless review proof" }], qaOutcome: "review" }));
  assert(response.status === 202 && (await json(response)).status === "review");
  assert(calls.fetch === 0 && calls.resolve[0].p_status === "review");
});

Deno.test("empty fields avoid provider calls and unsafe methods are rejected", async () => {
  const { handler, calls } = fixture();
  const empty = await handler(request({ scope: "activity", fields: [{ field: "description", value: "   " }] }));
  const get = await handler(request({}, "GET"));
  assert(empty.status === 200 && (await json(empty)).status === "safe" && calls.fetch === 0);
  assert(get.status === 405);
});
