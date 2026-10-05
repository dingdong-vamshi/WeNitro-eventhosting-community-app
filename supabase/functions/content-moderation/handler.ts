export type ModerationScope =
  | "activity" | "community" | "community_post" | "activity_comment"
  | "community_comment" | "vibe_comment" | "profile" | "partner" | "vibe" | "story"
  | "registration_question" | "poll";

type TextInput = { field: string; value: string };
type ImageInput = { field: string; value: string; storageBucket: string; storagePath: string };
type LoadedImage = ImageInput & { bytes: Uint8Array; contentType: string };
type Dependencies = {
  authenticate: (request: Request) => Promise<{ authId: string; allowed: boolean }>;
  loadImage: (authId: string, image: ImageInput) => Promise<{ bytes: Uint8Array; contentType: string }>;
  begin: (authId: string, scope: ModerationScope, items: Record<string, unknown>[]) => Promise<{ data: unknown; error: { message: string } | null }>;
  resolve: (authId: string, requestId: string, result: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  env: (name: string) => string | undefined;
  secrets?: () => Promise<Record<string, string>>;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const scopes = new Set<ModerationScope>([
  "activity", "community", "community_post", "activity_comment", "community_comment",
  "profile", "partner", "vibe", "story", "vibe_comment", "registration_question", "poll",
]);
const allowedImageBuckets = new Set(["activity-media", "communities", "vibes", "stories", "avatars"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const decoder = new TextDecoder();

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const parseTextInputs = (value: unknown): TextInput[] => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 40) throw new Error("Invalid moderation fields.");
  return value.map((candidate) => {
    const row = object(candidate);
    if (!row || typeof row.field !== "string" || typeof row.value !== "string" || row.field.length > 80 || row.value.length > 40000) {
      throw new Error("Invalid moderation field.");
    }
    return { field: row.field, value: row.value };
  }).filter((item) => item.value.trim().length > 0);
};

const parseImageInputs = (value: unknown): ImageInput[] => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) throw new Error("Invalid moderation images.");
  return value.map((candidate) => {
    const row = object(candidate);
    if (!row || typeof row.field !== "string" || typeof row.value !== "string" ||
      typeof row.storageBucket !== "string" || typeof row.storagePath !== "string" ||
      !allowedImageBuckets.has(row.storageBucket) || row.field.length > 80 || row.value.length > 1000 || row.storagePath.length > 500) {
      throw new Error("Invalid moderation image.");
    }
    return { field: row.field, value: row.value, storageBucket: row.storageBucket, storagePath: row.storagePath };
  });
};

const sha256 = async (bytes: Uint8Array) => {
  const exactBuffer = bytes.slice().buffer as ArrayBuffer;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", exactBuffer));
  return [...hash].map((value) => value.toString(16).padStart(2, "0")).join("");
};
const base64 = (bytes: Uint8Array) => {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(result);
};

type ProviderDecision = {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  requestId: string | null;
};

async function callOpenAi(
  apiKey: string,
  textInputs: TextInput[],
  images: Array<LoadedImage & { contentHash: string }>,
  fetcher: typeof fetch,
): Promise<ProviderDecision> {
  const input: Record<string, unknown>[] = [];
  const combinedText = textInputs.map((item) => `${item.field}: ${item.value}`).join("\n\n");
  if (combinedText) input.push({ type: "text", text: combinedText });
  for (const image of images) {
    input.push({ type: "image_url", image_url: { url: `data:${image.contentType};base64,${base64(image.bytes)}` } });
  }
  const response = await fetcher("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const error = new Error(retryable ? "provider_retryable" : "provider_rejected");
    (error as Error & { retryable?: boolean }).retryable = retryable;
    throw error;
  }
  const payload = object(await response.json());
  const results = Array.isArray(payload?.results) ? payload.results.map(object).filter(Boolean) as Record<string, unknown>[] : [];
  if (!results.length) throw new Error("provider_invalid_response");
  const categories: Record<string, boolean> = {};
  const categoryScores: Record<string, number> = {};
  let flagged = false;
  for (const result of results) {
    flagged ||= result.flagged === true;
    const resultCategories = object(result.categories) ?? {};
    const resultScores = object(result.category_scores) ?? {};
    for (const [key, value] of Object.entries(resultCategories)) categories[key] ||= value === true;
    for (const [key, value] of Object.entries(resultScores)) {
      if (typeof value === "number" && Number.isFinite(value)) categoryScores[key] = Math.max(categoryScores[key] ?? 0, value);
    }
  }
  return { flagged, categories, categoryScores, requestId: response.headers.get("x-request-id") };
}

export function createContentModerationHandler(deps: Dependencies) {
  const fetcher = deps.fetcher ?? fetch;
  const sleep = deps.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  return async function handleContentModeration(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    let authId = "";
    let requestId = "";
    try {
      const actor = await deps.authenticate(request);
      authId = actor.authId;
      if (!actor.allowed) return jsonResponse({ error: "Account unavailable." }, 403);
      const runtimeSecrets: Record<string, string> = deps.secrets
        ? await deps.secrets().catch(() => ({} as Record<string, string>))
        : {};
      const runtimeValue = (name: string) => deps.env(name) ?? runtimeSecrets[name];
      const body = object(await request.json().catch(() => null));
      const scope = body?.scope;
      if (typeof scope !== "string" || !scopes.has(scope as ModerationScope)) return jsonResponse({ error: "Invalid moderation scope." }, 400);
      const textInputs = parseTextInputs(body?.fields);
      const imageInputs = parseImageInputs(body?.images);
      if (!textInputs.length && !imageInputs.length) return jsonResponse({ status: "safe", message: "No public content required moderation." });

      const loadedImages: LoadedImage[] = [];
      for (const image of imageInputs) {
        if (!image.storagePath.startsWith(`${authId}/`)) throw new Error("Image ownership could not be verified.");
        const loaded = await deps.loadImage(authId, image);
        if (!allowedImageTypes.has(loaded.contentType) || !loaded.bytes.length || loaded.bytes.length > 20 * 1024 * 1024) {
          throw new Error("Only JPEG, PNG, or WebP images up to 20 MB can be moderated.");
        }
        loadedImages.push({ ...image, ...loaded });
      }
      const imagesWithHash = await Promise.all(loadedImages.map(async (image) => ({ ...image, contentHash: await sha256(image.bytes) })));
      const items: Record<string, unknown>[] = [
        ...textInputs.map((item) => ({ ...item, kind: "text" })),
        ...imagesWithHash.map(({ bytes: _bytes, contentType: _contentType, ...item }) => ({ ...item, kind: "image" })),
      ];
      const started = await deps.begin(authId, scope as ModerationScope, items);
      if (started.error) throw new Error("Moderation session could not start.");
      const envelope = object(started.data);
      requestId = typeof envelope?.requestId === "string" ? envelope.requestId : "";
      if (!requestId) throw new Error("Moderation session could not start.");
      const cachedImages = Array.isArray(envelope?.cachedImages) ? envelope.cachedImages.map(object).filter(Boolean) as Record<string, unknown>[] : [];
      const cachedByHash = new Map(cachedImages.map((item) => [String(item.contentHash), String(item.status)]));
      const uncachedImages = imagesWithHash.filter((image) => !cachedByHash.has(image.contentHash));
      const cachedUnsafe = cachedImages.some((item) => item.status === "unsafe");

      const fixture = runtimeValue("MODERATION_QA_FIXTURES_ENABLED") === "true" &&
        textInputs.some((item) => item.value.includes("[QA MODERATION FIXTURE]"))
        ? body?.qaOutcome : null;
      if (fixture === "blocked" || fixture === "review") {
        const status = fixture === "blocked" ? "unsafe" : "review";
        await deps.resolve(authId, requestId, {
          p_status: status, p_model: "controlled-qa-fixture", p_attempt_count: 1,
          p_categories: { controlled_qa: true }, p_error_code: fixture === "review" ? "controlled_qa_review" : null,
          p_image_results: [],
        });
        return jsonResponse({ requestId, status, message: status === "unsafe" ? "This content cannot be published because it did not pass safety checks." : "This content is not public and has been sent to Admin Review." }, status === "unsafe" ? 422 : 202);
      }

      const apiKey = runtimeValue("OPENAI_API_KEY")?.trim();
      if (!apiKey) throw new Error("provider_not_configured");
      let attempts = 0;
      let decision: ProviderDecision | null = null;
      let lastError = "provider_unavailable";
      if (cachedUnsafe) {
        decision = { flagged: true, categories: { cached_image_unsafe: true }, categoryScores: {}, requestId: null };
      } else if (!textInputs.length && !uncachedImages.length) {
        decision = { flagged: false, categories: { cached_image_safe: true }, categoryScores: {}, requestId: null };
      } else {
        while (attempts < 3 && !decision) {
          attempts += 1;
          try {
            decision = await callOpenAi(apiKey, textInputs, uncachedImages, fetcher);
          } catch (error) {
            lastError = error instanceof Error ? error.message : "provider_unavailable";
            const retryable = (error as Error & { retryable?: boolean }).retryable !== false;
            if (!retryable || attempts >= 3) break;
            await sleep(attempts === 1 ? 250 : 750);
          }
        }
      }
      if (!decision) {
        await deps.resolve(authId, requestId, {
          p_status: "review", p_model: "omni-moderation-latest", p_attempt_count: Math.max(attempts, 1),
          p_categories: {}, p_error_code: lastError.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 80), p_image_results: [],
        });
        return jsonResponse({ requestId, status: "review", message: "Safety checks are temporarily unavailable. This content is not public and has been sent to Admin Review." }, 202);
      }
      const status = decision.flagged ? "unsafe" : "safe";
      const categories = { categories: decision.categories, scores: decision.categoryScores };
      const imageResults = uncachedImages.map((image) => ({ contentHash: image.contentHash, status, categories }));
      const resolved = await deps.resolve(authId, requestId, {
        p_status: status, p_model: "omni-moderation-latest", p_attempt_count: Math.max(attempts, 1),
        p_categories: categories, p_provider_request_id: decision.requestId, p_error_code: null,
        p_image_results: imageResults,
      });
      if (resolved.error) throw new Error("Moderation result could not be saved.");
      return jsonResponse({
        requestId,
        status,
        message: status === "safe" ? "Safety check passed." : "This content cannot be published because it did not pass safety checks.",
      }, status === "safe" ? 200 : 422);
    } catch (error) {
      if (requestId && authId) {
        await deps.resolve(authId, requestId, {
          p_status: "review", p_model: "omni-moderation-latest", p_attempt_count: 1,
          p_categories: {}, p_error_code: "internal_moderation_error", p_image_results: [],
        }).catch(() => ({ data: null, error: { message: "unavailable" } }));
      }
      const candidate = error instanceof Error ? error.message : "";
      const publicMessage = /^(Invalid moderation|Image ownership|Only JPEG|Account unavailable|Authentication required|Missing bearer token|Moderation session)/.test(candidate)
        ? candidate : "Safety checks could not complete. The content was not published.";
      const status = /^(Authentication required|Missing bearer token)/.test(publicMessage) ? 401 : requestId ? 202 : 400;
      return jsonResponse({ requestId: requestId || undefined, status: requestId ? "review" : "error", error: publicMessage }, status);
    }
  };
}

export const _test = { sha256, parseTextInputs, parseImageInputs, callOpenAi, decoder };
