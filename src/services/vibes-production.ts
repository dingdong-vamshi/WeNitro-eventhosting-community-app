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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REEL_SELECT = `
  id,
  activity_id,
  user_id,
  media_url,
  media_type,
  caption,
  hashtags,
  visibility,
  created_at,
  updated_at,
  profiles!vibes_user_id_fkey(id, username, full_name, avatar_url),
  likes(user_id),
  vibe_comments(count)
`;

export type VibeMediaType = "image" | "video";
export type VibeVisibility = "public" | "followers" | "activity";
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

export type VibeCommentChange =
  RealtimePostgresChangesPayload<VibeComment>;

type ReelCursorValue = { createdAt: string; id: string };
type RawReel = Record<string, unknown>;

function requireBackend() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
}

async function requireUserId() {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user.id;
}

function requireUuid(value: string, field: string) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a valid UUID.`);
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
      typeof value.id !== "string" ||
      !UUID_PATTERN.test(value.id)
    ) {
      throw new Error();
    }
    return { createdAt: new Date(value.createdAt).toISOString(), id: value.id };
  } catch {
    throw new Error("Invalid reels cursor.");
  }
}

function randomId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
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
    throw new Error(`Unsupported ${mediaType} content type: ${contentType}.`);
  }
  return contentType;
}

function extensionFor(contentType: string) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  }[contentType] ?? "bin";
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

function storagePathFromPublicUrl(publicUrl: string) {
  try {
    const marker = `/storage/v1/object/public/${VIBES_BUCKET}/`;
    const pathname = new URL(publicUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return pathname
      .slice(markerIndex + marker.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return null;
  }
}

function cleanCaption(caption: string | undefined) {
  const value = caption?.trim() ?? "";
  if (value.length > MAX_CAPTION_LENGTH) {
    throw new Error(`Caption cannot exceed ${MAX_CAPTION_LENGTH} characters.`);
  }
  return value;
}

function cleanHashtags(hashtags: string[] | undefined) {
  return [...new Set((hashtags ?? []).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()))]
    .filter(Boolean)
    .slice(0, 30);
}

function mapReel(row: RawReel): VibeReel {
  const likes = Array.isArray(row.likes) ? row.likes : [];
  const commentCounts = Array.isArray(row.vibe_comments)
    ? (row.vibe_comments as { count?: number }[])
    : [];
  return {
    id: String(row.id),
    activityId: row.activity_id ? String(row.activity_id) : null,
    userId: String(row.user_id),
    mediaUrl: String(row.media_url),
    mediaType: row.media_type as VibeMediaType,
    caption: String(row.caption ?? ""),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags.map(String) : [],
    visibility: row.visibility as VibeVisibility,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    author: (row.profiles as VibeProfile | null) ?? null,
    likedByMe: likes.length > 0,
    commentCount: Number(commentCounts[0]?.count ?? 0),
  };
}

export async function uploadVibeMedia(
  media: VibeMediaInput,
  mediaType: VibeMediaType,
  requestedContentType?: string,
) {
  const userId = await requireUserId();
  const descriptor = mediaDescriptor(media);
  const contentType = inferredContentType(descriptor, mediaType, requestedContentType);
  const body = await toArrayBuffer(descriptor);
  if (body.byteLength === 0) throw new Error("The selected media is empty.");

  const path = `${userId}/${randomId()}.${extensionFor(contentType)}`;
  const { error } = await supabase.storage.from(VIBES_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(VIBES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl, contentType };
}

export async function listReels(options: {
  cursor?: string | null;
  pageSize?: number;
} = {}): Promise<ReelPage> {
  requireBackend();
  const pageSize = clampPageSize(options.pageSize);
  let query = supabase
    .from("vibes")
    .select(REEL_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawReel[];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const last = pageRows.at(-1);
  return {
    reels: pageRows.map(mapReel),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: String(last.created_at), id: String(last.id) })
        : null,
  };
}

export async function createVibe(input: CreateVibeInput) {
  const userId = await requireUserId();
  if (input.activityId) requireUuid(input.activityId, "activityId");
  const upload = await uploadVibeMedia(
    input.media,
    input.mediaType,
    input.contentType,
  );

  const { data, error } = await supabase
    .from("vibes")
    .insert({
      activity_id: input.activityId || null,
      caption: cleanCaption(input.caption),
      hashtags: cleanHashtags(input.hashtags),
      media_type: input.mediaType,
      media_url: upload.publicUrl,
      user_id: userId,
      visibility: input.visibility ?? "public",
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(VIBES_BUCKET).remove([upload.path]);
    throw error;
  }
  return data;
}

export async function deleteVibe(vibeId: string) {
  requireUuid(vibeId, "vibeId");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("vibes")
    .delete()
    .eq("id", vibeId)
    .eq("user_id", userId)
    .select("id, media_url")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Vibe not found or you do not own it.");

  const storagePath = storagePathFromPublicUrl(data.media_url);
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from(VIBES_BUCKET)
      .remove([storagePath]);
    if (storageError) {
      throw new Error(`Vibe deleted, but media cleanup failed: ${storageError.message}`);
    }
  }
  return { id: data.id, mediaRemoved: Boolean(storagePath) };
}

export async function likeVibe(vibeId: string) {
  requireUuid(vibeId, "vibeId");
  const userId = await requireUserId();
  const { error } = await supabase
    .from("likes")
    .insert({ user_id: userId, vibe_id: vibeId, activity_id: null });
  if (error && error.code !== "23505") throw error;
}

export async function unlikeVibe(vibeId: string) {
  requireUuid(vibeId, "vibeId");
  const userId = await requireUserId();
  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("user_id", userId)
    .eq("vibe_id", vibeId);
  if (error) throw error;
}

export async function setVibeLiked(vibeId: string, liked: boolean) {
  return liked ? likeVibe(vibeId) : unlikeVibe(vibeId);
}

export async function listVibeComments(vibeId: string) {
  requireBackend();
  requireUuid(vibeId, "vibeId");
  const { data, error } = await supabase
    .from("vibe_comments")
    .select(
      "*, profiles!vibe_comments_author_id_fkey(username, full_name, avatar_url)",
    )
    .eq("vibe_id", vibeId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as VibeComment[];
}

export async function createVibeComment(
  vibeId: string,
  body: string,
  parentId?: string | null,
) {
  requireUuid(vibeId, "vibeId");
  if (parentId) requireUuid(parentId, "parentId");
  const userId = await requireUserId();
  const cleanedBody = body.trim();
  if (!cleanedBody || cleanedBody.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be 1-${MAX_COMMENT_LENGTH} characters.`);
  }
  const { data, error } = await supabase
    .from("vibe_comments")
    .insert({
      author_id: userId,
      body: cleanedBody,
      parent_id: parentId || null,
      vibe_id: vibeId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as VibeComment;
}

export async function deleteVibeComment(commentId: string) {
  requireUuid(commentId, "commentId");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("vibe_comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Comment not found or you do not own it.");
}

export async function trackVibeShare(
  vibeId: string,
  channel: VibeShareChannel,
) {
  requireUuid(vibeId, "vibeId");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("content_shares")
    .insert({ channel, user_id: userId, vibe_id: vibeId })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToVibeComments(
  vibeId: string,
  onChange: (change: VibeCommentChange) => void,
  onStatus?: (status: `${REALTIME_SUBSCRIBE_STATES}`, error?: Error) => void,
): RealtimeChannel {
  requireBackend();
  requireUuid(vibeId, "vibeId");
  return supabase
    .channel(`vibe:${vibeId}:comments`)
    .on<VibeComment>(
      "postgres_changes",
      {
        event: "*",
        filter: `vibe_id=eq.${vibeId}`,
        schema: "public",
        table: "vibe_comments",
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
