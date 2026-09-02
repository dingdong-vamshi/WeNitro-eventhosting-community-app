import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const VIBES_BUCKET = "vibes";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_CAPTION_LENGTH = 2_200;
const MAX_COMMENT_LENGTH = 2_000;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type VibeMediaType = "image" | "video";
export type VibeVisibility = "public" | "private" | "followers" | "activity";
export type VibeShareChannel = "system" | "copy_link" | "direct" | "external";
export type VibeMediaInput =
  | string
  | Blob
  | ArrayBuffer
  | Uint8Array
  | {
      uri: string;
      mimeType?: string | null;
      fileName?: string | null;
    };
export type VibeProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};
export type VibeReel = {
  id: string;
  activityId: string | null;
  userId: string;
  mediaUrl: string;
  mediaType: VibeMediaType;
  caption: string;
  hashtags: string[];
  visibility: VibeVisibility;
  createdAt: string;
  updatedAt: string;
  author: VibeProfile | null;
  likedByMe: boolean;
  likeCount: number;
  commentCount: number;
};
export type VibeComment = {
  id: string;
  vibe_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  status: "published" | "removed";
  created_at: string;
  updated_at: string;
  profiles?: Pick<VibeProfile, "username" | "full_name" | "avatar_url"> | null;
};
export type ReelPage = {
  reels: VibeReel[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type CreateVibeInput = {
  caption?: string;
  media: VibeMediaInput;
  mediaType: VibeMediaType;
  contentType?: string;
  activityId?: string | null;
  hashtags?: string[];
  visibility?: VibeVisibility;
};
export type VibeCommentChange = RealtimePostgresChangesPayload<Record<string, unknown>>;

type ReelCursorValue = { createdAt: string; id: number };
type LegacyVibe = {
  id: number;
  event_id: number | null;
  user_id: number | null;
  media_url: string;
  media_type: string;
  caption: string | null;
  hashtags: string[] | null;
  visibility: string | null;
  created_at: string | null;
  updated_at: string | null;
  likes_count: number | null;
};
type LegacyVibeReference = { vibe_id: number };
type LegacyComment = {
  id: number;
  vibe_id: number;
  user_id: number;
  text: string;
  created_at: string | null;
};
type LegacyUser = {
  id: number;
  username: string;
  fullname: string | null;
  profile_image: string | null;
};

function requireBackend() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
}

function integerId(value: string, field: string) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(field + " must be a positive integer.");
  }
  return Number(value);
}

async function requireAuthUserId() {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user.id;
}

async function currentLegacyUserId(required = false): Promise<number | null> {
  requireBackend();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) {
    if (required) throw new Error("Authentication required.");
    return null;
  }
  const { data, error } = await supabase.rpc("get_current_legacy_user_id");
  if (error) throw error;
  const id = Number(data);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Authenticated account is not linked to a legacy user.");
  }
  return id;
}

function clampPageSize(pageSize: number | undefined) {
  if (pageSize === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be a positive integer.");
  }
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

function encodeCursor(value: ReelCursorValue) {
  return encodeURIComponent(JSON.stringify(value));
}

function decodeCursor(cursor: string): ReelCursorValue {
  try {
    const value = JSON.parse(decodeURIComponent(cursor)) as Partial<ReelCursorValue>;
    if (
      typeof value.createdAt !== "string" ||
      Number.isNaN(Date.parse(value.createdAt)) ||
      !Number.isInteger(value.id) ||
      Number(value.id) <= 0
    ) {
      throw new Error();
    }
    return {
      createdAt: new Date(value.createdAt).toISOString(),
      id: Number(value.id),
    };
  } catch {
    throw new Error("Invalid reels cursor.");
  }
}

function randomId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  );
}

function mediaDescriptor(input: VibeMediaInput) {
  if (typeof input === "string") {
    return { uri: input, fileName: input.split("?")[0].split("/").pop() };
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const fileName = "name" in input ? String(input.name) : undefined;
    return { blob: input, fileName, mimeType: input.type || undefined };
  }
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    return { bytes: input };
  }
  if (!("uri" in input)) {
    throw new Error("This runtime cannot read Blob media input.");
  }
  return {
    uri: input.uri,
    fileName: input.fileName ?? input.uri.split("?")[0].split("/").pop(),
    mimeType: input.mimeType ?? undefined,
  };
}

function inferredContentType(
  input: ReturnType<typeof mediaDescriptor>,
  mediaType: VibeMediaType,
  requested?: string,
) {
  const extension = input.fileName?.split(".").pop()?.toLowerCase();
  const inferred =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : extension === "mov"
          ? "video/quicktime"
          : extension === "mp4"
            ? "video/mp4"
            : mediaType === "video"
              ? "video/mp4"
              : "image/jpeg";
  const contentType = (requested || input.mimeType || inferred)
    .split(";")[0]
    .trim()
    .toLowerCase();
  const allowed =
    mediaType === "video"
      ? ["video/mp4", "video/quicktime"]
      : ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(contentType)) {
    throw new Error("Unsupported " + mediaType + " content type: " + contentType + ".");
  }
  return contentType;
}

function extensionFor(contentType: string) {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
    }[contentType] ?? "bin"
  );
}

async function toArrayBuffer(input: ReturnType<typeof mediaDescriptor>) {
  if (input.bytes instanceof ArrayBuffer) return input.bytes;
  if (input.bytes instanceof Uint8Array) {
    return input.bytes.buffer.slice(
      input.bytes.byteOffset,
      input.bytes.byteOffset + input.bytes.byteLength,
    ) as ArrayBuffer;
  }
  if (input.blob) return input.blob.arrayBuffer();
  if (!input.uri) throw new Error("Media input is empty.");
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error("Could not read the selected media.");
  return response.arrayBuffer();
}

function cleanCaption(caption: string | undefined) {
  const value = caption?.trim() ?? "";
  if (value.length > MAX_CAPTION_LENGTH) {
    throw new Error("Caption cannot exceed " + MAX_CAPTION_LENGTH + " characters.");
  }
  return value;
}

function cleanHashtags(hashtags: string[] | undefined) {
  return [
    ...new Set(
      (hashtags ?? []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()),
    ),
  ]
    .filter(Boolean)
    .slice(0, 30);
}

async function signedMediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("media/vibes/")) {
    throw new Error("Legacy Vibe media is unavailable.");
  }
  const { data, error } = await supabase.storage
    .from(VIBES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

async function profilesFor(ids: number[]) {
  const profiles = new Map<number, VibeProfile>();
  if (!ids.length) return profiles;
  const { data, error } = await supabase
    .from("tbl_users")
    .select("id,username,fullname,profile_image")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  for (const row of (data ?? []) as LegacyUser[]) {
    profiles.set(row.id, {
      id: String(row.id),
      username: row.username,
      full_name: row.fullname,
      avatar_url: row.profile_image,
    });
  }
  return profiles;
}

export async function uploadVibeMedia(
  media: VibeMediaInput,
  mediaType: VibeMediaType,
  requestedContentType?: string,
) {
  const authUserId = await requireAuthUserId();
  const descriptor = mediaDescriptor(media);
  const contentType = inferredContentType(descriptor, mediaType, requestedContentType);
  const body = await toArrayBuffer(descriptor);
  if (body.byteLength === 0) throw new Error("The selected media is empty.");

  const path = authUserId + "/" + randomId() + "." + extensionFor(contentType);
  const { error } = await supabase.storage.from(VIBES_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return {
    path,
    publicUrl: await signedMediaUrl(path),
    contentType,
  };
}

export async function listReels(
  options: { cursor?: string | null; pageSize?: number } = {},
): Promise<ReelPage> {
  requireBackend();
  const pageSize = clampPageSize(options.pageSize);
  const legacyUserId = await currentLegacyUserId(false);
  let query = supabase
    .from("tbl_activity_vibes")
    .select(
      "id,event_id,user_id,media_url,media_type,caption,hashtags,visibility,created_at,updated_at,likes_count",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    query = query.or(
      "created_at.lt." +
        cursor.createdAt +
        ",and(created_at.eq." +
        cursor.createdAt +
        ",id.lt." +
        cursor.id +
        ")",
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as LegacyVibe[];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const vibeIds = pageRows.map((row) => row.id);
  const [profiles, likesResult, commentsResult] = await Promise.all([
    profilesFor(pageRows.flatMap((row) => (row.user_id ? [row.user_id] : []))),
    legacyUserId && vibeIds.length
      ? supabase
          .from("tbl_vibe_likes")
          .select("vibe_id")
          .eq("user_id", legacyUserId)
          .in("vibe_id", vibeIds)
      : Promise.resolve({ data: [] as LegacyVibeReference[], error: null }),
    vibeIds.length
      ? supabase.from("tbl_vibe_comments").select("vibe_id").in("vibe_id", vibeIds)
      : Promise.resolve({ data: [] as LegacyVibeReference[], error: null }),
  ]);
  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const liked = new Set(
    ((likesResult.data ?? []) as LegacyVibeReference[]).map((row) => row.vibe_id),
  );
  const commentCounts = new Map<number, number>();
  for (const row of (commentsResult.data ?? []) as LegacyVibeReference[]) {
    commentCounts.set(row.vibe_id, (commentCounts.get(row.vibe_id) ?? 0) + 1);
  }

  const reels = (
    await Promise.all(
      pageRows.map(async (row): Promise<VibeReel | null> => {
        try {
          return {
            id: String(row.id),
            activityId: row.event_id === null ? null : String(row.event_id),
            userId: row.user_id === null ? "" : String(row.user_id),
            mediaUrl: await signedMediaUrl(row.media_url),
            mediaType: row.media_type === "video" ? "video" : "image",
            caption: row.caption ?? "",
            hashtags: row.hashtags ?? [],
            visibility:
              row.visibility === "private" || row.visibility === "activity"
                ? row.visibility
                : "public",
            createdAt: row.created_at ?? new Date(0).toISOString(),
            updatedAt:
              row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
            author: row.user_id === null ? null : profiles.get(row.user_id) ?? null,
            likedByMe: liked.has(row.id),
            likeCount: Math.max(0, Number(row.likes_count ?? 0)),
            commentCount: commentCounts.get(row.id) ?? 0,
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((reel): reel is VibeReel => reel !== null);
  const last = pageRows.at(-1);
  return {
    reels,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: last.created_at ?? new Date(0).toISOString(),
            id: last.id,
          })
        : null,
  };
}

export async function createVibe(input: CreateVibeInput) {
  await currentLegacyUserId(true);
  const eventId = input.activityId ? integerId(input.activityId, "activityId") : null;
  const upload = await uploadVibeMedia(input.media, input.mediaType, input.contentType);
  const { data, error } = await supabase.rpc("vibe_create", {
    p_event_id: eventId,
    p_media_path: upload.path,
    p_media_type: input.mediaType,
    p_caption: cleanCaption(input.caption),
    p_hashtags: cleanHashtags(input.hashtags),
    p_visibility: input.visibility ?? (eventId ? "activity" : "public"),
  });
  if (error) {
    await supabase.storage.from(VIBES_BUCKET).remove([upload.path]);
    throw error;
  }
  return data;
}

export async function deleteVibe(vibeId: string) {
  await currentLegacyUserId(true);
  const numericVibeId = integerId(vibeId, "vibeId");
  const { data, error } = await supabase.rpc("vibe_delete", {
    p_vibe_id: numericVibeId,
  });
  if (error) throw error;
  const result = (data ?? {}) as { id?: number; media_path?: string | null };
  if (result.media_path) {
    const { error: storageError } = await supabase.storage
      .from(VIBES_BUCKET)
      .remove([result.media_path]);
    if (storageError) {
      console.warn("Vibe media cleanup failed after deletion", storageError);
    }
  }
  return {
    id: result.id ?? numericVibeId,
    mediaRemoved: Boolean(result.media_path),
  };
}

export async function likeVibe(vibeId: string) {
  await currentLegacyUserId(true);
  const { error } = await supabase.rpc("vibe_set_liked", {
    p_vibe_id: integerId(vibeId, "vibeId"),
    p_liked: true,
  });
  if (error) throw error;
}

export async function unlikeVibe(vibeId: string) {
  await currentLegacyUserId(true);
  const { error } = await supabase.rpc("vibe_set_liked", {
    p_vibe_id: integerId(vibeId, "vibeId"),
    p_liked: false,
  });
  if (error) throw error;
}

export async function setVibeLiked(vibeId: string, liked: boolean) {
  return liked ? likeVibe(vibeId) : unlikeVibe(vibeId);
}

export async function listVibeComments(vibeId: string) {
  requireBackend();
  const numericVibeId = integerId(vibeId, "vibeId");
  const { data, error } = await supabase
    .from("tbl_vibe_comments")
    .select("id,vibe_id,user_id,text,created_at")
    .eq("vibe_id", numericVibeId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as LegacyComment[];
  const profiles = await profilesFor(rows.map((row) => row.user_id));
  return rows.map((row): VibeComment => {
    const profile = profiles.get(row.user_id);
    return {
      id: String(row.id),
      vibe_id: String(row.vibe_id),
      author_id: String(row.user_id),
      parent_id: null,
      body: row.text,
      status: "published",
      created_at: row.created_at ?? new Date(0).toISOString(),
      updated_at: row.created_at ?? new Date(0).toISOString(),
      profiles: profile
        ? {
            username: profile.username,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
          }
        : null,
    };
  });
}

export async function createVibeComment(
  vibeId: string,
  body: string,
  parentId?: string | null,
) {
  await currentLegacyUserId(true);
  const cleanedBody = body.trim();
  if (!cleanedBody || cleanedBody.length > MAX_COMMENT_LENGTH) {
    throw new Error("Comment must be 1-" + MAX_COMMENT_LENGTH + " characters.");
  }
  const { data, error } = await supabase.rpc("vibe_create_comment", {
    p_vibe_id: integerId(vibeId, "vibeId"),
    p_body: cleanedBody,
    p_parent_id: parentId ? integerId(parentId, "parentId") : null,
  });
  if (error) throw error;
  return data as VibeComment;
}

export async function deleteVibeComment(commentId: string) {
  await currentLegacyUserId(true);
  const { error } = await supabase.rpc("vibe_delete_comment", {
    p_comment_id: integerId(commentId, "commentId"),
  });
  if (error) throw error;
}

export async function trackVibeShare(vibeId: string, channel: VibeShareChannel) {
  await currentLegacyUserId(true);
  const { data, error } = await supabase.rpc("vibe_track_share", {
    p_vibe_id: integerId(vibeId, "vibeId"),
    p_channel: channel,
  });
  if (error) throw error;
  return data;
}

export function subscribeToVibeComments(
  vibeId: string,
  onChange: (change: VibeCommentChange) => void,
  onStatus?: (status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void,
): RealtimeChannel {
  requireBackend();
  const numericVibeId = integerId(vibeId, "vibeId");
  return supabase
    .channel("vibe:" + numericVibeId + ":comments")
    .on<Record<string, unknown>>(
      "postgres_changes",
      {
        event: "*",
        filter: "vibe_id=eq." + numericVibeId,
        schema: "public",
        table: "tbl_vibe_comments",
      },
      onChange,
    )
    .subscribe(onStatus);
}

export async function unsubscribeFromVibeComments(channel: RealtimeChannel) {
  return supabase.removeChannel(channel);
}

export const vibesProductionService = {
  listReels,
  fetchReels: listReels,
  uploadMedia: uploadVibeMedia,
  createVibe,
  create: createVibe,
  deleteVibe,
  delete: deleteVibe,
  likeVibe,
  unlikeVibe,
  setLiked: setVibeLiked,
  setLike: setVibeLiked,
  listComments: listVibeComments,
  createComment: createVibeComment,
  comment: createVibeComment,
  deleteComment: deleteVibeComment,
  trackShare: trackVibeShare,
  recordShare: trackVibeShare,
  subscribeToComments: subscribeToVibeComments,
  unsubscribeFromComments: unsubscribeFromVibeComments,
};

export const vibeProductionService = vibesProductionService;
export default vibesProductionService;
