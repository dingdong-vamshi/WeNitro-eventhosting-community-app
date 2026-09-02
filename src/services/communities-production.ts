import type { RealtimeChannel } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const COMMUNITY_BUCKET = "communities";
const MAX_PAGE_SIZE = 50;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
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
  image: string | CommunityMediaSource;
  cover: string | CommunityMediaSource;
};

export type DiscoverCommunitiesOptions = {
  query?: string;
  category?: string;
  membership?: "all" | "joined" | "created";
  page?: number;
  pageSize?: number;
};

export type CommunityFeedOptions = {
  page?: number;
  pageSize?: number;
  category?: string;
};

export type CommunityCommentOptions = {
  page?: number;
  pageSize?: number;
};

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

export type CommunityRule = {
  id: string;
  position: number;
  body: string;
};

export type CommunityDetail = CommunitySummary & {
  rules: CommunityRule[];
};

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

type RawProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

type RawMembership = {
  community_id: string;
  role: "member" | "moderator" | "admin";
  status: "active" | "pending" | "blocked";
};

type RawCommunity = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  category: string;
  tags: string[] | null;
  image_url: string | null;
  cover_url: string | null;
  is_private: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  owner?: RawProfile | RawProfile[] | null;
  memberships?: Array<{ count: number }> | null;
  community_rules?: Array<{ id: string; position: number; body: string }> | null;
};

type RawPost = {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  status: "draft" | "published" | "removed";
  created_at: string;
  updated_at: string;
  author?: RawProfile | RawProfile[] | null;
  reaction_counts?: Array<{ count: number }> | null;
  comment_counts?: Array<{ count: number }> | null;
  my_reaction?: Array<{ reaction: CommunityReaction; user_id: string }> | null;
};

type RawComment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: RawProfile | RawProfile[] | null;
};

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const currentUserId = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new Error("Authentication required.");
  }
  return data.user.id;
};

const sessionUserId = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
};

const pagination = (page = 1, pageSize = 20) => {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  return { page: safePage, pageSize: safePageSize, from, to: from + safePageSize - 1 };
};

const cleanFilterValue = (value: string) =>
  value
    .trim()
    .replace(/[%_,()."\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);

const firstRelation = <T>(relation: T | T[] | null | undefined): T | null =>
  Array.isArray(relation) ? relation[0] ?? null : relation ?? null;

const relationCount = (relation: Array<{ count: number }> | null | undefined) =>
  relation?.[0]?.count ?? 0;

const mapOwner = (profile: RawProfile | RawProfile[] | null | undefined): CommunityOwner | null => {
  const owner = firstRelation(profile);
  return owner
    ? {
        id: owner.id,
        username: owner.username,
        fullName: owner.full_name,
        avatarUrl: owner.avatar_url,
      }
    : null;
};

const membershipLabel = (
  community: RawCommunity,
  membership: RawMembership | undefined,
  userId: string | null,
): CommunityMembership => {
  if (userId && community.owner_id === userId) return "created";
  if (membership?.status === "active") return "joined";
  if (membership?.status === "pending") return "pending";
  return "none";
};

const mapCommunity = (
  row: RawCommunity,
  membership: RawMembership | undefined,
  userId: string | null,
): CommunitySummary => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  slug: row.slug,
  tagline: row.tagline ?? "",
  description: row.description ?? "",
  category: row.category,
  tags: row.tags ?? [],
  imageUrl: row.image_url,
  coverUrl: row.cover_url,
  visibility: row.is_private ? "private" : "public",
  verified: row.is_verified,
  membership: membershipLabel(row, membership, userId),
  membershipRole: membership?.role ?? (row.owner_id === userId ? "admin" : null),
  memberCount:
    row.memberships &&
    (row.owner_id === userId || membership?.role === "admin" || membership?.role === "moderator")
      ? relationCount(row.memberships)
      : null,
  owner: mapOwner(row.owner),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPost = (row: RawPost): CommunityPost => ({
  id: row.id,
  communityId: row.community_id,
  authorId: row.author_id,
  title: row.title,
  body: row.body,
  category: row.category,
  mediaUrl: row.media_url,
  mediaType: row.media_type,
  status: row.status,
  author: mapOwner(row.author),
  reactionCount: relationCount(row.reaction_counts),
  commentCount: relationCount(row.comment_counts),
  myReaction: row.my_reaction?.[0]?.reaction ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapComment = (row: RawComment): CommunityComment => ({
  id: row.id,
  postId: row.post_id,
  authorId: row.author_id,
  parentId: row.parent_id,
  body: row.body,
  author: mapOwner(row.author),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mediaSource = (source: string | CommunityMediaSource): CommunityMediaSource =>
  typeof source === "string" ? { uri: source } : source;

const mimeTypeFor = (source: CommunityMediaSource, response: Response) => {
  if (source.contentType) return source.contentType;
  const responseType = response.headers.get("content-type")?.split(";")[0].toLowerCase();
  if (responseType && IMAGE_MIME_TYPES.has(responseType)) return responseType;
  const extension = source.uri.split("?")[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
};

const extensionFor = (contentType: string) => {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
};

const uniqueId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const uploadCommunityImage = async (
  sourceInput: string | CommunityMediaSource,
  userId: string,
  kind: "image" | "cover" | "post",
) => {
  const source = mediaSource(sourceInput);
  const response = await fetch(source.uri);
  if (!response.ok) throw new Error("Could not read the selected image.");
  const contentType = mimeTypeFor(source, response);
  if (!IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error("Community images must be JPEG, PNG, or WebP.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Community images must be 20 MB or smaller.");
  }

  const path = `${userId}/${kind}/${uniqueId()}.${extensionFor(contentType)}`;
  const { error } = await supabase.storage.from(COMMUNITY_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(COMMUNITY_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
};

const removeUploadedImages = async (paths: string[]) => {
  if (!paths.length) return;
  await supabase.storage.from(COMMUNITY_BUCKET).remove(paths);
};

const membershipsFor = async (userId: string | null, communityIds: string[]) => {
  const result = new Map<string, RawMembership>();
  if (!userId || !communityIds.length) return result;
  const { data, error } = await supabase
    .from("memberships")
    .select("community_id,role,status")
    .eq("user_id", userId)
    .in("community_id", communityIds);
  if (error) throw error;
  for (const membership of (data ?? []) as RawMembership[]) {
    result.set(membership.community_id, membership);
  }
  return result;
};

export async function discoverCommunities(
  options: DiscoverCommunitiesOptions = {},
): Promise<PaginatedResult<CommunitySummary>> {
  requireBackend();
  const userId = await sessionUserId();
  const { page, pageSize, from, to } = pagination(options.page, options.pageSize);
  if (options.membership === "joined" && !userId) {
    return { items: [], page, pageSize, total: 0, hasMore: false };
  }
  const membershipFilter =
    options.membership === "joined"
      ? ", membership_filter:memberships!inner(user_id,status)"
      : "";
  const select = userId
    ? `*, owner:profiles!communities_owner_id_fkey(id,username,full_name,avatar_url), memberships(count)${membershipFilter}`
    : "*, owner:profiles!communities_owner_id_fkey(id,username,full_name,avatar_url)";
  let query = supabase
    .from("communities")
    .select(select, { count: "exact" })
    .order("is_verified", { ascending: false })
    .order("created_at", { ascending: false });

  const search = options.query ? cleanFilterValue(options.query) : "";
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,tagline.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`,
    );
  }
  const category = options.category ? cleanFilterValue(options.category) : "";
  if (category) query = query.eq("category", category);
  if (options.membership === "created") {
    if (!userId) return { items: [], page, pageSize, total: 0, hasMore: false };
    query = query.eq("owner_id", userId);
  }
  if (options.membership === "joined" && userId) {
    query = query
      .eq("membership_filter.user_id", userId)
      .eq("membership_filter.status", "active")
      .neq("owner_id", userId);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawCommunity[];
  const membershipMap = await membershipsFor(userId, rows.map((row) => row.id));
  const items = rows.map((row) => mapCommunity(row, membershipMap.get(row.id), userId));
  return {
    items,
    page,
    pageSize,
    total: count,
    hasMore: count === null ? rows.length === pageSize : to + 1 < count,
  };
}

export async function getCommunity(communityId: string): Promise<CommunityDetail> {
  requireBackend();
  const userId = await sessionUserId();
  const select = userId
    ? "*, owner:profiles!communities_owner_id_fkey(id,username,full_name,avatar_url), memberships(count), community_rules(id,position,body)"
    : "*, owner:profiles!communities_owner_id_fkey(id,username,full_name,avatar_url), community_rules(id,position,body)";
  const { data, error } = await supabase
    .from("communities")
    .select(select)
    .eq("id", communityId)
    .single();
  if (error) throw error;
  const row = data as unknown as RawCommunity;
  const membershipMap = await membershipsFor(userId, [communityId]);
  return {
    ...mapCommunity(row, membershipMap.get(communityId), userId),
    rules: (row.community_rules ?? [])
      .map((rule) => ({ id: rule.id, position: rule.position, body: rule.body }))
      .sort((left, right) => left.position - right.position),
  };
}

export async function getCommunityFeed(
  communityId: string,
  options: CommunityFeedOptions = {},
): Promise<PaginatedResult<CommunityPost>> {
  requireBackend();
  const userId = await sessionUserId();
  const { page, pageSize, from, to } = pagination(options.page, options.pageSize);
  let query = supabase
    .from("community_posts")
    .select(
      "*, author:profiles!community_posts_author_id_fkey(id,username,full_name,avatar_url), reaction_counts:community_post_reactions(count), comment_counts:community_post_comments(count), my_reaction:community_post_reactions(reaction,user_id)",
      { count: "exact" },
    )
    .eq("community_id", communityId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (userId) query = query.eq("my_reaction.user_id", userId);
  else query = query.eq("my_reaction.user_id", "00000000-0000-0000-0000-000000000000");
  const category = options.category ? cleanFilterValue(options.category) : "";
  if (category) query = query.eq("category", category);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawPost[];
  return {
    items: rows.map(mapPost),
    page,
    pageSize,
    total: count,
    hasMore: count === null ? rows.length === pageSize : to + 1 < count,
  };
}

export async function createCommunity(input: CreateCommunityInput): Promise<string> {
  const userId = await currentUserId();
  const uploadedPaths: string[] = [];
  try {
    const image = await uploadCommunityImage(input.image, userId, "image");
    uploadedPaths.push(image.path);
    const cover = await uploadCommunityImage(input.cover, userId, "cover");
    uploadedPaths.push(cover.path);
    const { data, error } = await supabase.rpc("create_community_with_owner", {
      community_name: input.name.trim(),
      community_tagline: input.tagline?.trim() ?? "",
      community_description: input.description.trim(),
      community_category: input.category.trim(),
      community_tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      community_rules: input.rules?.map((rule) => rule.trim()).filter(Boolean) ?? [],
      community_image_url: image.publicUrl,
      community_cover_url: cover.publicUrl,
      community_is_private: input.visibility === "private",
    });
    if (error) throw error;
    return data as string;
  } catch (error) {
    await removeUploadedImages(uploadedPaths).catch(() => undefined);
    throw error;
  }
}

export async function joinCommunity(communityId: string): Promise<RawMembership> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("memberships")
    .upsert(
      { community_id: communityId, user_id: userId, status: "active" },
      { onConflict: "community_id,user_id" },
    )
    .select("community_id,role,status")
    .single();
  if (error) throw error;
  return data as RawMembership;
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const userId = await currentUserId();
  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (communityError) throw communityError;
  if (community.owner_id === userId) {
    throw new Error("A community owner cannot leave their own community.");
  }
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", userId);
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
  const userId = await currentUserId();
  let uploadedPath: string | null = null;
  try {
    const media = input.image
      ? await uploadCommunityImage(input.image, userId, "post")
      : null;
    uploadedPath = media?.path ?? null;
    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        community_id: input.communityId,
        author_id: userId,
        title: input.title.trim(),
        body: input.body?.trim() ?? "",
        category: input.category?.trim() || "General",
        media_url: media?.publicUrl ?? null,
        media_type: media ? "image" : null,
      })
      .select(
        "*, author:profiles!community_posts_author_id_fkey(id,username,full_name,avatar_url), reaction_counts:community_post_reactions(count), comment_counts:community_post_comments(count), my_reaction:community_post_reactions(reaction,user_id)",
      )
      .single();
    if (error) throw error;
    return mapPost(data as unknown as RawPost);
  } catch (error) {
    if (uploadedPath) await removeUploadedImages([uploadedPath]).catch(() => undefined);
    throw error;
  }
}

export async function setPostReaction(
  postId: string,
  reaction: CommunityReaction | null,
): Promise<void> {
  const userId = await currentUserId();
  const { error } = reaction
    ? await supabase
        .from("community_post_reactions")
        .upsert(
          { post_id: postId, user_id: userId, reaction },
          { onConflict: "post_id,user_id" },
        )
    : await supabase
        .from("community_post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
  if (error) throw error;
}

export async function listPostComments(
  postId: string,
  options: CommunityCommentOptions = {},
): Promise<PaginatedResult<CommunityComment>> {
  requireBackend();
  const { page, pageSize, from, to } = pagination(options.page, options.pageSize);
  const { data, error, count } = await supabase
    .from("community_post_comments")
    .select(
      "*, author:profiles!community_post_comments_author_id_fkey(id,username,full_name,avatar_url)",
      { count: "exact" },
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawComment[];
  return {
    items: rows.map(mapComment),
    page,
    pageSize,
    total: count,
    hasMore: count === null ? rows.length === pageSize : to + 1 < count,
  };
}

export async function createPostComment(input: {
  postId: string;
  body: string;
  parentId?: string;
}): Promise<CommunityComment> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("community_post_comments")
    .insert({
      post_id: input.postId,
      author_id: userId,
      parent_id: input.parentId ?? null,
      body: input.body.trim(),
    })
    .select(
      "*, author:profiles!community_post_comments_author_id_fkey(id,username,full_name,avatar_url)",
    )
    .single();
  if (error) throw error;
  return mapComment(data as unknown as RawComment);
}

export function subscribeToCommunityPosts(
  communityId: string,
  onChange: (change: CommunityPostChange) => void,
): RealtimeChannel {
  requireBackend();
  return supabase
    .channel(`community-posts:${communityId}:${uniqueId()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_posts",
        filter: `community_id=eq.${communityId}`,
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
