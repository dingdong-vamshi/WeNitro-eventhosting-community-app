import type { RealtimeChannel } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const COMMUNITY_BUCKET = "communities";
const MAX_PAGE_SIZE = 50;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CommunityVisibility = "public" | "private";
export type CommunityMembership = "none" | "joined" | "created" | "pending";
export type CommunityReaction = "like" | "love" | "laugh" | "support";
export type CommunityMediaSource = {
  uri: string;
  contentType?: "image/jpeg" | "image/png" | "image/webp";
};
export type CreateCommunityInput = {
  name: string;
  tagline?: string;
  description: string;
  category: string;
  tags?: string[];
  rules?: string[];
  visibility?: CommunityVisibility;
  image?: string | CommunityMediaSource;
  cover?: string | CommunityMediaSource;
};
export type DiscoverCommunitiesOptions = {
  query?: string;
  category?: string;
  membership?: "all" | "joined" | "created";
  page?: number;
  pageSize?: number;
};
export type CommunityFeedOptions = { page?: number; pageSize?: number; category?: string };
export type CommunityCommentOptions = { page?: number; pageSize?: number };
export type CommunityOwner = {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
};
export type CommunitySummary = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  imageUrl: string | null;
  coverUrl: string | null;
  visibility: CommunityVisibility;
  verified: boolean;
  membership: CommunityMembership;
  membershipRole: "member" | "moderator" | "admin" | null;
  memberCount: number | null;
  owner: CommunityOwner | null;
  createdAt: string;
  updatedAt: string;
};
export type CommunityRule = { id: string; position: number; body: string };
export type CommunityDetail = CommunitySummary & { rules: CommunityRule[] };
export type CommunityPost = {
  id: string;
  communityId: string;
  authorId: string;
  title: string;
  body: string;
  category: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  status: "draft" | "published" | "removed";
  author: CommunityOwner | null;
  reactionCount: number;
  commentCount: number;
  myReaction: CommunityReaction | null;
  createdAt: string;
  updatedAt: string;
};
export type CommunityComment = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  author: CommunityOwner | null;
  createdAt: string;
  updatedAt: string;
};
export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
};
export type CommunityPostChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type LegacyUser = {
  id: number;
  username: string;
  fullname: string | null;
  profile_image: string | null;
};
type LegacyRoom = {
  id: number;
  room_type: string;
  created_by: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  category_id: number | null;
  verification_level: string | null;
  join_type: string | null;
  tagline: string | null;
  tags: string[] | null;
  rules: string[] | null;
  visibility: string | null;
  cover_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};
type LegacyParticipant = { room_id: number; role: string | null };
type LegacyJoinRequest = { room_id: number; status: string | null };
type LegacyMessage = {
  id: number;
  room_id: number | null;
  sender_id: number | null;
  content: string;
  message_type: string | null;
  media_url: string | null;
  created_at: string | null;
};

function requireBackend() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured for this build.");
}

function integerId(value: string, field: string) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(field + " must be a positive integer.");
  }
  return Number(value);
}

function pagination(page = 1, pageSize = 20) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  return { page: safePage, pageSize: safePageSize, from, to: from + safePageSize - 1 };
}

function cleanFilterValue(value: string) {
  return value.trim().replace(/[%_,()."\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

function slugify(value: string, id: number) {
  const stem = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (stem || "community") + "-" + id;
}

function normalizeRole(role: string | null): "member" | "moderator" | "admin" {
  return role === "admin" || role === "moderator" ? role : "member";
}

async function currentAuthUserId() {
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

function sourceDescriptor(source: string | CommunityMediaSource): CommunityMediaSource {
  return typeof source === "string" ? { uri: source } : source;
}

function contentTypeFor(source: CommunityMediaSource, response: Response) {
  if (source.contentType) return source.contentType;
  const responseType = response.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (responseType && IMAGE_MIME_TYPES.has(responseType)) return responseType;
  const extension = source.uri.split("?")[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function extensionFor(contentType: string) {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

function uniqueId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
}

async function uploadCommunityImage(
  sourceInput: string | CommunityMediaSource,
  authUserId: string,
  kind: "image" | "cover" | "post",
) {
  const source = sourceDescriptor(sourceInput);
  const response = await fetch(source.uri);
  if (!response.ok) throw new Error("Could not read the selected image.");
  const contentType = contentTypeFor(source, response);
  if (!IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error("Community images must be JPEG, PNG, or WebP.");
  }
  const body = await response.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Community images must be non-empty and 20 MB or smaller.");
  }
  const path = authUserId + "/" + kind + "/" + uniqueId() + "." + extensionFor(contentType);
  const { error } = await supabase.storage.from(COMMUNITY_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return { path };
}

async function signedMediaUrl(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("media/communities/")) return null;
  const { data, error } = await supabase.storage
    .from(COMMUNITY_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

async function removeUploadedImages(paths: string[]) {
  if (paths.length) await supabase.storage.from(COMMUNITY_BUCKET).remove(paths);
}

async function ownersFor(ids: number[]) {
  const result = new Map<number, CommunityOwner>();
  if (!ids.length) return result;
  const { data, error } = await supabase
    .from("tbl_users")
    .select("id,username,fullname,profile_image")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  for (const row of (data ?? []) as LegacyUser[]) {
    result.set(row.id, {
      id: String(row.id),
      username: row.username,
      fullName: row.fullname,
      avatarUrl: row.profile_image,
    });
  }
  return result;
}

async function membershipStateFor(userId: number | null, roomIds: number[]) {
  const participants = new Map<number, LegacyParticipant>();
  const pending = new Set<number>();
  if (!userId || !roomIds.length) return { participants, pending };
  const [participantResult, requestResult] = await Promise.all([
    supabase
      .from("tbl_chat_participants")
      .select("room_id,role")
      .eq("user_id", userId)
      .in("room_id", roomIds),
    supabase
      .from("tbl_community_join_requests")
      .select("room_id,status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .in("room_id", roomIds),
  ]);
  if (participantResult.error) throw participantResult.error;
  if (requestResult.error) throw requestResult.error;
  for (const row of (participantResult.data ?? []) as LegacyParticipant[]) {
    participants.set(row.room_id, row);
  }
  for (const row of (requestResult.data ?? []) as LegacyJoinRequest[]) pending.add(row.room_id);
  return { participants, pending };
}

async function memberCountsFor(roomIds: number[]) {
  const counts = new Map<number, number>();
  if (!roomIds.length) return counts;
  const { data, error } = await supabase
    .from("tbl_chat_participants")
    .select("room_id")
    .in("room_id", roomIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const roomId = Number(row.room_id);
    counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
  }
  return counts;
}

async function mapRoom(
  row: LegacyRoom,
  userId: number | null,
  owners: Map<number, CommunityOwner>,
  participants: Map<number, LegacyParticipant>,
  pending: Set<number>,
  memberCounts: Map<number, number>,
): Promise<CommunitySummary> {
  const participant = participants.get(row.id);
  const created = userId !== null && row.created_by === userId;
  return {
    id: String(row.id),
    ownerId: row.created_by === null ? "" : String(row.created_by),
    name: row.title?.trim() || "Community " + row.id,
    slug: slugify(row.title || "community", row.id),
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    category: row.category_id === null ? "General" : String(row.category_id),
    tags: row.tags ?? [],
    imageUrl: await signedMediaUrl(row.image_url),
    coverUrl: await signedMediaUrl(row.cover_url),
    visibility: row.visibility === "private" || row.join_type === "approval" ? "private" : "public",
    verified: Boolean(row.verification_level && row.verification_level !== "none"),
    membership: created ? "created" : participant ? "joined" : pending.has(row.id) ? "pending" : "none",
    membershipRole: created ? "admin" : participant ? normalizeRole(participant.role) : null,
    memberCount: memberCounts.get(row.id) ?? 0,
    owner: row.created_by === null ? null : owners.get(row.created_by) ?? null,
    createdAt: row.created_at ?? new Date(0).toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}

export async function discoverCommunities(
  options: DiscoverCommunitiesOptions = {},
): Promise<PaginatedResult<CommunitySummary>> {
  requireBackend();
  const userId = await currentLegacyUserId(false);
  const { page, pageSize, from, to } = pagination(options.page, options.pageSize);
  let allowedRoomIds: number[] | null = null;
  if (options.membership === "joined") {
    if (!userId) return { items: [], page, pageSize, total: 0, hasMore: false };
    const { data, error } = await supabase
      .from("tbl_chat_participants")
      .select("room_id")
      .eq("user_id", userId);
    if (error) throw error;
    allowedRoomIds = (data ?? []).map((row) => Number(row.room_id));
    if (!allowedRoomIds.length) return { items: [], page, pageSize, total: 0, hasMore: false };
  }

  let query = supabase
    .from("tbl_chat_rooms")
    .select(
      "id,room_type,created_by,title,description,image_url,category_id,verification_level,join_type,tagline,tags,rules,visibility,cover_url,created_at,updated_at",
      { count: "exact" },
    )
    .eq("room_type", "community")
    .order("created_at", { ascending: false });
  const search = options.query ? cleanFilterValue(options.query) : "";
  if (search) query = query.or("title.ilike.%" + search + "%,description.ilike.%" + search + "%");
  if (options.category && /^\d+$/.test(options.category)) {
    query = query.eq("category_id", Number(options.category));
  }
  if (options.membership === "created") {
    if (!userId) return { items: [], page, pageSize, total: 0, hasMore: false };
    query = query.eq("created_by", userId);
  }
  if (allowedRoomIds) query = query.in("id", allowedRoomIds);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const rooms = (data ?? []) as LegacyRoom[];
  const owners = await ownersFor(rooms.flatMap((room) => (room.created_by ? [room.created_by] : [])));
  const state = await membershipStateFor(userId, rooms.map((room) => room.id));
  const memberCounts = await memberCountsFor(rooms.map((room) => room.id));
  return {
    items: await Promise.all(
      rooms.map((room) =>
        mapRoom(room, userId, owners, state.participants, state.pending, memberCounts),
      ),
    ),
    page,
    pageSize,
    total: count,
    hasMore: count === null ? rooms.length === pageSize : to + 1 < count,
  };
}

export async function getCommunity(communityId: string): Promise<CommunityDetail> {
  requireBackend();
  const roomId = integerId(communityId, "communityId");
  const userId = await currentLegacyUserId(false);
  const { data, error } = await supabase
    .from("tbl_chat_rooms")
    .select(
      "id,room_type,created_by,title,description,image_url,category_id,verification_level,join_type,tagline,tags,rules,visibility,cover_url,created_at,updated_at",
    )
    .eq("id", roomId)
    .eq("room_type", "community")
    .single();
  if (error) throw error;
  const room = data as LegacyRoom;
  const owners = await ownersFor(room.created_by ? [room.created_by] : []);
  const state = await membershipStateFor(userId, [room.id]);
  const memberCounts = await memberCountsFor([room.id]);
  return {
    ...(await mapRoom(
      room,
      userId,
      owners,
      state.participants,
      state.pending,
      memberCounts,
    )),
    rules: (room.rules ?? []).map((body, index) => ({ id: `${room.id}-${index}`, position: index + 1, body })),
  };
}

export async function getCommunityFeed(
  communityId: string,
  options: CommunityFeedOptions = {},
): Promise<PaginatedResult<CommunityPost>> {
  requireBackend();
  const roomId = integerId(communityId, "communityId");
  const { page, pageSize, from, to } = pagination(options.page, options.pageSize);
  const userId = await currentLegacyUserId(false);
  const { data, error, count } = await supabase
    .from("tbl_community_posts")
    .select("id,room_id,user_id,title,body,media_url,media_type,created_at,updated_at", { count: "exact" })
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const messages = (data ?? []) as Array<Record<string, unknown>>;
  const postIds = messages.map((message) => Number(message.id));
  const owners = await ownersFor(
    messages.flatMap((message) => (message.user_id ? [Number(message.user_id)] : [])),
  );
  const [reactionResult, commentResult] = await Promise.all([
    postIds.length ? supabase.from("tbl_community_post_reactions").select("post_id,user_id,reaction").in("post_id", postIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supabase.from("tbl_community_post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reactionResult.error) throw reactionResult.error;
  if (commentResult.error) throw commentResult.error;
  const reactionCounts = new Map<number, number>();
  const commentCounts = new Map<number, number>();
  const myReactions = new Map<number, CommunityReaction>();
  for (const reaction of reactionResult.data ?? []) { const id = Number(reaction.post_id); reactionCounts.set(id, (reactionCounts.get(id) ?? 0) + 1); if (userId === Number(reaction.user_id)) myReactions.set(id, reaction.reaction as CommunityReaction); }
  for (const comment of commentResult.data ?? []) { const id = Number(comment.post_id); commentCounts.set(id, (commentCounts.get(id) ?? 0) + 1); }
  const items = await Promise.all(
    messages.map(async (message): Promise<CommunityPost> => ({
      id: String(message.id),
      communityId: String(message.room_id ?? roomId),
      authorId: message.user_id == null ? "" : String(message.user_id),
      title: String(message.title ?? ""),
      body: String(message.body ?? ""),
      category: options.category?.trim() || "General",
      mediaUrl: await signedMediaUrl(typeof message.media_url === "string" ? message.media_url : null),
      mediaType:
        message.media_type === "image" || message.media_type === "video"
          ? message.media_type
          : null,
      status: "published",
      author: message.user_id == null ? null : owners.get(Number(message.user_id)) ?? null,
      reactionCount: reactionCounts.get(Number(message.id)) ?? 0,
      commentCount: commentCounts.get(Number(message.id)) ?? 0,
      myReaction: myReactions.get(Number(message.id)) ?? null,
      createdAt: String(message.created_at ?? new Date(0).toISOString()),
      updatedAt: String(message.updated_at ?? message.created_at ?? new Date(0).toISOString()),
    })),
  );
  return {
    items,
    page,
    pageSize,
    total: count,
    hasMore: count === null ? items.length === pageSize : to + 1 < count,
  };
}

export async function createCommunity(input: CreateCommunityInput): Promise<string> {
  const authUserId = await currentAuthUserId();
  const uploadedPaths: string[] = [];
  try {
    const imageSource = input.image ? sourceDescriptor(input.image) : null;
    const coverSource = input.cover ? sourceDescriptor(input.cover) : null;
    const image = imageSource?.uri.trim()
      ? await uploadCommunityImage(imageSource, authUserId, "image")
      : null;
    if (image) uploadedPaths.push(image.path);
    const cover = coverSource?.uri.trim()
      ? await uploadCommunityImage(coverSource, authUserId, "cover")
      : null;
    if (cover) uploadedPaths.push(cover.path);
    const { data, error } = await supabase.rpc("community_create", {
      p_name: input.name.trim(),
      p_tagline: input.tagline?.trim() ?? "",
      p_description: input.description.trim(),
      p_category: input.category.trim(),
      p_tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      p_rules: input.rules?.map((rule) => rule.trim()).filter(Boolean) ?? [],
      p_image_path: image?.path ?? null,
      p_cover_path: cover?.path ?? null,
      p_visibility: input.visibility ?? "public",
    });
    if (error) throw error;
    const id =
      typeof data === "object" && data !== null && "id" in data
        ? (data as { id: unknown }).id
        : data;
    return String(id);
  } catch (error) {
    await removeUploadedImages(uploadedPaths).catch(() => undefined);
    throw error;
  }
}

export async function joinCommunity(
  communityId: string,
): Promise<LegacyParticipant & { status: "active" | "pending" }> {
  await currentLegacyUserId(true);
  const { data, error } = await supabase.rpc("community_join", {
    p_room_id: integerId(communityId, "communityId"),
  });
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    room_id: Number(row.room_id ?? communityId),
    role: typeof row.role === "string" ? row.role : "member",
    status: row.status === "pending" ? "pending" : "active",
  };
}

export async function leaveCommunity(communityId: string): Promise<void> {
  await currentLegacyUserId(true);
  const { error } = await supabase.rpc("community_leave", {
    p_room_id: integerId(communityId, "communityId"),
  });
  if (error) throw error;
}

export async function setCommunityMembership(communityId: string, joined: boolean) {
  return joined ? joinCommunity(communityId) : leaveCommunity(communityId);
}

export async function createCommunityPost(input: {
  communityId: string;
  title: string;
  body?: string;
  category?: string;
  image?: string | CommunityMediaSource;
}): Promise<CommunityPost> {
  const authUserId = await currentAuthUserId();
  let uploadedPath: string | null = null;
  try {
    const media = input.image
      ? await uploadCommunityImage(input.image, authUserId, "post")
      : null;
    uploadedPath = media?.path ?? null;
    const { data, error } = await supabase.rpc("community_create_post", {
      p_room_id: integerId(input.communityId, "communityId"),
      p_title: input.title.trim(),
      p_body: input.body?.trim() ?? "",
      p_category: input.category?.trim() || "General",
      p_media_path: media?.path ?? null,
      p_media_type: media ? "image" : null,
    });
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      communityId: String(row.community_id ?? input.communityId),
      authorId: String(row.author_id ?? ""),
      title: String(row.title ?? input.title.trim()),
      body: String(row.body ?? input.body?.trim() ?? ""),
      category: String(row.category ?? input.category?.trim() ?? "General"),
      mediaUrl: await signedMediaUrl((row.media_path as string | null) ?? media?.path ?? null),
      mediaType: media ? "image" : null,
      status: "published",
      author: null,
      reactionCount: 0,
      commentCount: 0,
      myReaction: null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    };
  } catch (error) {
    if (uploadedPath) await removeUploadedImages([uploadedPath]).catch(() => undefined);
    throw error;
  }
}

export async function setPostReaction(
  postId: string,
  reaction: CommunityReaction | null,
): Promise<void> {
  await currentLegacyUserId(true);
  const { error } = await supabase.rpc("community_set_post_reaction", {
    p_post_id: integerId(postId, "postId"),
    p_reaction: reaction,
  });
  if (error) throw error;
}

export async function listPostComments(
  postId: string,
  options: CommunityCommentOptions = {},
): Promise<PaginatedResult<CommunityComment>> {
  requireBackend();
  const { page, pageSize } = pagination(options.page, options.pageSize);
  const { data, error } = await supabase.rpc("community_list_post_comments", {
    p_post_id: integerId(postId, "postId"),
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  const envelope = (data ?? {}) as {
    items?: Record<string, unknown>[];
    total?: number | null;
    has_more?: boolean;
  };
  const items = (envelope.items ?? []).map(
    (row): CommunityComment => ({
      id: String(row.id),
      postId: String(row.post_id ?? postId),
      authorId: String(row.author_id ?? ""),
      parentId: row.parent_id == null ? null : String(row.parent_id),
      body: String(row.body ?? ""),
      author: null,
      createdAt: String(row.created_at ?? new Date(0).toISOString()),
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date(0).toISOString()),
    }),
  );
  return {
    items,
    page,
    pageSize,
    total: envelope.total ?? null,
    hasMore: envelope.has_more ?? items.length === pageSize,
  };
}

export async function createPostComment(input: {
  postId: string;
  body: string;
  parentId?: string;
}): Promise<CommunityComment> {
  await currentLegacyUserId(true);
  const { data, error } = await supabase.rpc("community_create_post_comment", {
    p_post_id: integerId(input.postId, "postId"),
    p_body: input.body.trim(),
    p_parent_id: input.parentId ? integerId(input.parentId, "parentId") : null,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    postId: String(row.post_id ?? input.postId),
    authorId: String(row.author_id ?? ""),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    body: String(row.body ?? input.body.trim()),
    author: null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export function subscribeToCommunityPosts(
  communityId: string,
  onChange: (change: CommunityPostChange) => void,
): RealtimeChannel {
  requireBackend();
  const roomId = integerId(communityId, "communityId");
  return supabase
    .channel("community-posts:" + roomId + ":" + uniqueId())
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tbl_community_posts",
        filter: "room_id=eq." + roomId,
      },
      (payload) =>
        onChange({
          eventType: payload.eventType,
          new: payload.new,
          old: payload.old,
        }),
    )
    .subscribe();
}

export const communitiesProductionService = {
  discover: discoverCommunities,
  getCommunity,
  getFeed: getCommunityFeed,
  create: createCommunity,
  join: joinCommunity,
  leave: leaveCommunity,
  setMembership: setCommunityMembership,
  createPost: createCommunityPost,
  setPostReaction,
  listComments: listPostComments,
  createComment: createPostComment,
  subscribeToPosts: subscribeToCommunityPosts,
};

export default communitiesProductionService;
