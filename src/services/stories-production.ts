import type { RealtimeChannel } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BUCKET = "stories";
const MAX_BYTES = 50 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

export type StoryMediaType = "image" | "video";

export type StoryAuthor = {
  id: number;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type Story = {
  id: number;
  userId: number;
  mediaPath: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  isMine: boolean;
  author: StoryAuthor;
};

export type CreateStoryInput = {
  uri: string;
  caption?: string;
  contentType?: string;
};

type Row = Record<string, unknown>;
type SupportedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4";

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const asRecord = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

const relationRecord = (value: unknown): Row =>
  Array.isArray(value) ? asRecord(value[0]) : asRecord(value);

const positiveInteger = (value: unknown, field: string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field}.`);
  }
  return parsed;
};

const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const currentIdentity = async () => {
  requireBackend();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Authentication required.");
  const { data: legacyId, error: legacyError } = await supabase.rpc(
    "get_current_legacy_user_id",
  );
  if (legacyError) throw legacyError;
  return {
    authId: authData.user.id,
    legacyId: positiveInteger(legacyId, "legacy user id"),
  };
};

const detectMedia = (bytes: Uint8Array): {
  contentType: SupportedMime;
  extension: string;
  mediaType: StoryMediaType;
} => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: "jpg", mediaType: "image" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png", mediaType: "image" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp", mediaType: "image" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
  ) {
    return { contentType: "video/mp4", extension: "mp4", mediaType: "video" };
  }
  throw new Error("Story media must be JPEG, PNG, WebP, or MP4.");
};

const readMedia = async (input: CreateStoryInput) => {
  if (!input.uri.trim()) throw new Error("Story media URI is required.");
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error("Could not read the selected story media.");
  const body = await response.arrayBuffer();
  if (body.byteLength <= 0 || body.byteLength > MAX_BYTES) {
    throw new Error("Story media must be non-empty and no larger than 50 MB.");
  }
  const detected = detectMedia(new Uint8Array(body));
  const requested = input.contentType?.split(";")[0]?.trim().toLowerCase();
  if (requested && requested !== detected.contentType) {
    throw new Error("Story media contents do not match the selected MIME type.");
  }
  return { body, ...detected };
};

const signedUrl = async (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};

const avatarUrl = (value: unknown) => {
  const pathOrUrl = nullableText(value);
  if (!pathOrUrl || /^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return supabase.storage.from("avatars").getPublicUrl(pathOrUrl).data.publicUrl;
};

const mapStory = async (
  value: unknown,
  currentUserId: number,
  viewedIds: Set<number>,
): Promise<Story> => {
  const row = asRecord(value);
  const author = relationRecord(row.author);
  const id = positiveInteger(row.id, "story id");
  const userId = positiveInteger(row.user_id, "story user id");
  const path = String(row.media_url ?? "");
  if (!path) throw new Error("Story media path is missing.");
  return {
    id,
    userId,
    mediaPath: path,
    mediaUrl: await signedUrl(path),
    mediaType: String(row.media_type).startsWith("video") ? "video" : "image",
    caption: String(row.caption ?? ""),
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    viewed: viewedIds.has(id),
    isMine: userId === currentUserId,
    author: {
      id: positiveInteger(author.id ?? userId, "story author id"),
      username: String(author.username ?? ""),
      fullName: nullableText(author.fullname),
      avatarUrl: avatarUrl(author.profile_image),
    },
  };
};

const selectStory =
  "id,user_id,media_url,media_type,caption,created_at,expires_at,author:tbl_users!tbl_stories_user_id_fkey(id,username,fullname,profile_image)";

const loadStoryById = async (
  storyId: number,
  currentUserId: number,
): Promise<Story> => {
  const { data, error } = await supabase
    .from("tbl_stories")
    .select(selectStory)
    .eq("id", storyId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  const { data: view, error: viewError } = await supabase
    .from("tbl_story_views")
    .select("story_id")
    .eq("story_id", storyId)
    .eq("viewer_id", currentUserId)
    .maybeSingle();
  if (viewError) throw viewError;
  return mapStory(data, currentUserId, new Set(view ? [storyId] : []));
};

export const storiesProductionService = {
  async listActive(limit = 50): Promise<Story[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Story limit must be between 1 and 100.");
    }
    const { legacyId } = await currentIdentity();
    const { data, error } = await supabase
      .from("tbl_stories")
      .select(selectStory)
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    const ids = rows.map((row) => positiveInteger(row.id, "story id"));
    const { data: views, error: viewsError } = ids.length
      ? await supabase
          .from("tbl_story_views")
          .select("story_id")
          .eq("viewer_id", legacyId)
          .in("story_id", ids)
      : { data: [], error: null };
    if (viewsError) throw viewsError;
    const viewedIds = new Set(
      (views ?? []).map((row) => positiveInteger(row.story_id, "story id")),
    );
    return Promise.all(rows.map((row) => mapStory(row, legacyId, viewedIds)));
  },

  async listMine(limit = 50): Promise<Story[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Story limit must be between 1 and 100.");
    }
    const { legacyId } = await currentIdentity();
    const { data, error } = await supabase
      .from("tbl_stories")
      .select(selectStory)
      .eq("user_id", legacyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return Promise.all(
      (data ?? []).map((row) => mapStory(row, legacyId, new Set())),
    );
  },

  async create(input: CreateStoryInput | string): Promise<Story> {
    const normalized = typeof input === "string" ? { uri: input } : input;
    const caption = normalized.caption?.trim() ?? "";
    if (caption.length > 500) {
      throw new Error("Story caption must be 500 characters or fewer.");
    }
    const identity = await currentIdentity();
    const media = await readMedia(normalized);
    const randomUUID = globalThis.crypto?.randomUUID;
    if (!randomUUID) {
      throw new Error("Secure random UUID generation is unavailable.");
    }
    const path = `${identity.authId}/${randomUUID.call(globalThis.crypto)}.${media.extension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, media.body, {
        contentType: media.contentType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from("tbl_stories")
      .insert({
        user_id: identity.legacyId,
        media_url: path,
        media_type: media.mediaType,
        caption,
      })
      .select("id")
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    return loadStoryById(
      positiveInteger(data.id, "story id"),
      identity.legacyId,
    );
  },

  async markViewed(storyId: number | string): Promise<void> {
    const id = positiveInteger(storyId, "story id");
    const { legacyId } = await currentIdentity();
    const { error } = await supabase.from("tbl_story_views").upsert(
      { story_id: id, viewer_id: legacyId, viewed_at: new Date().toISOString() },
      { onConflict: "story_id,viewer_id" },
    );
    if (error) throw error;
  },

  async delete(storyId: number | string): Promise<void> {
    const id = positiveInteger(storyId, "story id");
    const { legacyId } = await currentIdentity();
    const { data, error: readError } = await supabase
      .from("tbl_stories")
      .select("media_url")
      .eq("id", id)
      .eq("user_id", legacyId)
      .is("deleted_at", null)
      .single();
    if (readError) throw readError;

    const path = String(data.media_url ?? "");
    const { error: deleteError } = await supabase
      .from("tbl_stories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", legacyId);
    if (deleteError) throw deleteError;
    if (path && !/^https?:\/\//i.test(path)) {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([path]);
    if (storageError) console.warn("Story media cleanup failed after deletion", storageError);
    }
  },

  subscribe(onChange: () => void): RealtimeChannel {
    requireBackend();
    return supabase
      .channel(`stories:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tbl_stories" },
        onChange,
      )
      .subscribe();
  },
};

export const storyService = storiesProductionService;
export default storiesProductionService;
