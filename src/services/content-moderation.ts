import { supabase } from "../lib/supabase";

export type ModerationScope =
  | "activity" | "community" | "community_post" | "activity_comment"
  | "community_comment" | "vibe_comment" | "profile" | "partner" | "vibe" | "story"
  | "registration_question" | "poll";
export type ModerationText = { field: string; value: string | null | undefined };
export type ModerationImage = {
  field: string;
  value: string;
  storageBucket: "activity-media" | "communities" | "vibes" | "stories" | "avatars";
  storagePath: string;
};
export type ModerationStatus = "safe" | "unsafe" | "review";

export class ContentModerationError extends Error {
  constructor(public readonly status: Exclude<ModerationStatus, "safe">, message: string, public readonly requestId?: string) {
    super(message);
    this.name = "ContentModerationError";
  }
}

const qaOutcomeFromFields = (fields: ModerationText[]): "blocked" | "review" | undefined => {
  const combined = fields.map((item) => item.value ?? "").join("\n");
  if (combined.includes("[QA MODERATION FIXTURE][BLOCKED]")) return "blocked";
  if (combined.includes("[QA MODERATION FIXTURE][REVIEW]")) return "review";
  return undefined;
};

const responseBody = async (error: unknown): Promise<Record<string, unknown> | null> => {
  const context = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;
  if (!(context instanceof Response)) return null;
  try {
    const value = await context.clone().json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
};

export async function moderatePublicContent(input: {
  scope: ModerationScope;
  fields?: ModerationText[];
  images?: ModerationImage[];
  qaOutcome?: "blocked" | "review";
}): Promise<{ status: "safe"; requestId?: string }> {
  const fields = (input.fields ?? []).filter((item) => typeof item.value === "string" && item.value.trim().length > 0)
    .map((item) => ({ field: item.field, value: item.value as string }));
  const images = input.images ?? [];
  if (!fields.length && !images.length) return { status: "safe" };
  const qaOutcome = input.qaOutcome ?? qaOutcomeFromFields(fields);
  const { data, error } = await supabase.functions.invoke("content-moderation", {
    body: { scope: input.scope, fields, images, ...(qaOutcome ? { qaOutcome } : {}) },
  });
  const payload = (data && typeof data === "object" ? data : await responseBody(error)) as Record<string, unknown> | null;
  const status = payload?.status;
  const message = typeof payload?.message === "string" ? payload.message
    : typeof payload?.error === "string" ? payload.error
    : error ? "Safety checks could not complete. The content was not published." : "Invalid safety response.";
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : undefined;
  if (status === "safe") return { status: "safe", requestId };
  if (status === "review") throw new ContentModerationError("review", message, requestId);
  if (status === "unsafe") throw new ContentModerationError("unsafe", message, requestId);
  throw new Error(message);
}

export const moderationArrayValue = (values: readonly string[] | null | undefined) =>
  (values ?? []).map((value) => value.trim()).filter(Boolean).join("\n");

export const moderationJsonArrayValue = (values: unknown[] | null | undefined) =>
  (values ?? []).map((value) => typeof value === "string" ? value : JSON.stringify(value)).join("\n");
