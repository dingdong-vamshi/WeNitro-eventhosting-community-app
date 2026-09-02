import { RealtimeChannel } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type CommunityInput = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  rules: string[];
  visibility: "public" | "private";
  imageUri: string;
  coverUri: string;
};

const requireBackend = () => {
  if (!isSupabaseConfigured)
    throw new Error("Supabase is not configured for this build.");
};

const currentUserId = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Authentication required.");
  return data.user.id;
};

const extensionFor = (uri: string, contentType: string) => {
  const fromUri = uri.split("?")[0].split(".").pop()?.toLowerCase();
  if (fromUri && /^[a-z0-9]{2,5}$/.test(fromUri)) return fromUri;
  if (contentType.includes("video")) return "mp4";
  return contentType.includes("png") ? "png" : "jpg";
};

export const authService = {
  async signInWithProvider(provider: "google" | "apple") {
    requireBackend();
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw error;
    return data;
  },
  async signIn(email: string, password: string) {
    requireBackend();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },
  async signUp(fullName: string, email: string, password: string) {
    requireBackend();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  },
  async signOut() {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  },
};

export async function uploadMedia(
  bucket: "avatars" | "vibes" | "communities" | "messages" | "stories",
  uri: string,
  contentType = "image/jpeg",
) {
  const userId = await currentUserId();
  const extension = extensionFor(uri, contentType);
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected media.");
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw error;
  if (bucket === "messages") {
    const { data, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (signedError) throw signedError;
    return { path, publicUrl: data.signedUrl };
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function loadRemoteWorkspace() {
  if (!isSupabaseConfigured) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const userId = session.session.user.id;
  const [
    profile,
    people,
    activities,
    vibes,
    communities,
    currentMemberships,
    conversations,
    stories,
    likes,
    saves,
    profileInterests,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url,bio,location,last_active_at")
      .neq("id", userId)
      .eq("is_private", false)
      .is("deleted_at", null)
      .order("last_active_at", { ascending: false })
      .limit(50),
    supabase
      .from("activities")
      .select(
        "*, profiles!activities_owner_id_fkey(full_name), participants(count)",
      )
      .eq("status", "published")
      .order("starts_at")
      .limit(50),
    supabase
      .from("vibes")
      .select(
        "*, profiles!vibes_user_id_fkey(username,full_name,avatar_url), likes(count), vibe_comments(*, profiles!vibe_comments_author_id_fkey(username,full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("communities")
      .select(
        "*, memberships(count), community_rules(*), community_posts(*, community_post_reactions(count), community_post_comments(count))",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("memberships")
      .select("community_id,role")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("chat_conversations")
      .select(
        "*, chat_members(*, profiles(*)), chat_messages(*, profiles!chat_messages_sender_id_fkey(full_name,username))",
      )
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("stories")
      .select(
        "*, profiles!stories_owner_id_fkey(username,full_name,avatar_url), story_views(viewer_id)",
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("likes").select("activity_id,vibe_id").eq("user_id", userId),
    supabase.from("saves").select("activity_id,vibe_id").eq("user_id", userId),
    supabase
      .from("profile_interests")
      .select("interests(name)")
      .eq("profile_id", userId),
  ]);
  const firstError = [
    profile,
    people,
    activities,
    vibes,
    communities,
    currentMemberships,
    conversations,
    stories,
    likes,
    saves,
    profileInterests,
  ].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  for (const conversation of conversations.data ?? []) {
    for (const message of conversation.chat_messages ?? []) {
      if (message.media_url && !String(message.media_url).startsWith("http")) {
        const { data: signed } = await supabase.storage
          .from("messages")
          .createSignedUrl(message.media_url, 3600);
        if (signed?.signedUrl) message.media_url = signed.signedUrl;
      }
    }
  }
  return {
    email: session.session.user.email ?? "",
    profile: profile.data,
    interests: (profileInterests.data ?? []).flatMap((row: any) => {
      const interest = Array.isArray(row.interests) ? row.interests[0] : row.interests;
      return interest?.name ? [interest.name] : [];
    }),
    people: people.data ?? [],
    activities: activities.data ?? [],
    vibes: vibes.data ?? [],
    communities: communities.data ?? [],
    memberships: currentMemberships.data ?? [],
    conversations: conversations.data ?? [],
    stories: stories.data ?? [],
    likedIds: (likes.data ?? []).flatMap((item) =>
      [item.activity_id, item.vibe_id].filter(Boolean),
    ),
    savedIds: (saves.data ?? []).flatMap((item) =>
      [item.activity_id, item.vibe_id].filter(Boolean),
    ),
  };
}

export const vibeService = {
  async create(input: {
    caption: string;
    mediaUri: string;
    mediaType?: "image" | "video";
    activityId?: string;
  }) {
    const userId = await currentUserId();
    const mediaType = input.mediaType ?? "image";
    const media = await uploadMedia(
      "vibes",
      input.mediaUri,
      mediaType === "video" ? "video/mp4" : "image/jpeg",
    );
    const { data, error } = await supabase
      .from("vibes")
      .insert({
        user_id: userId,
        activity_id: input.activityId || null,
        media_url: media.publicUrl,
        media_type: mediaType,
        caption: input.caption,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async setLike(vibeId: string, liked: boolean) {
    const userId = await currentUserId();
    const query = supabase.from("likes");
    const { error } = liked
      ? await query.insert({ user_id: userId, vibe_id: vibeId })
      : await query.delete().eq("user_id", userId).eq("vibe_id", vibeId);
    if (error && error.code !== "23505") throw error;
  },
  async comment(vibeId: string, body: string, parentId?: string) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("vibe_comments")
      .insert({
        vibe_id: vibeId,
        author_id: userId,
        parent_id: parentId || null,
        body,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async recordShare(vibeId: string, channel: string) {
    const userId = await currentUserId();
    const { error } = await supabase
      .from("content_shares")
      .insert({ user_id: userId, vibe_id: vibeId, channel });
    if (error) throw error;
  },
};

export const communityService = {
  async create(input: CommunityInput) {
    const [image, cover] = await Promise.all([
      uploadMedia("communities", input.imageUri),
      uploadMedia("communities", input.coverUri),
    ]);
    const { data, error } = await supabase.rpc("create_community_with_owner", {
      community_name: input.name,
      community_tagline: input.tagline,
      community_description: input.description,
      community_category: input.category,
      community_tags: input.tags,
      community_rules: input.rules,
      community_image_url: image.publicUrl,
      community_cover_url: cover.publicUrl,
      community_is_private: input.visibility === "private",
    });
    if (error) throw error;
    return data as string;
  },
  async setMembership(communityId: string, joined: boolean) {
    const userId = await currentUserId();
    const { error } = joined
      ? await supabase.from("memberships").upsert({
          community_id: communityId,
          user_id: userId,
          status: "active",
        })
      : await supabase
          .from("memberships")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", userId);
    if (error) throw error;
  },
  async publishPost(
    communityId: string,
    title: string,
    body: string,
    mediaUri?: string,
  ) {
    const userId = await currentUserId();
    const media = mediaUri ? await uploadMedia("communities", mediaUri) : null;
    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        community_id: communityId,
        author_id: userId,
        title,
        body,
        media_url: media?.publicUrl ?? null,
        media_type: media ? "image" : null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async setPostReaction(postId: string, liked: boolean) {
    const userId = await currentUserId();
    const { error } = liked
      ? await supabase
          .from("community_post_reactions")
          .upsert({ post_id: postId, user_id: userId, reaction: "like" })
      : await supabase
          .from("community_post_reactions")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", userId);
    if (error) throw error;
  },
  async commentPost(postId: string, body: string) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("community_post_comments")
      .insert({ post_id: postId, author_id: userId, body })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const chatService = {
  async sendMessage(conversationId: string, body: string, mediaUri?: string) {
    const userId = await currentUserId();
    const media = mediaUri ? await uploadMedia("messages", mediaUri) : null;
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body,
        media_url: media?.path ?? null,
        media_type: media ? "image" : null,
      })
      .select()
      .single();
    if (error) throw error;
    return { ...data, media_url: media?.publicUrl ?? null };
  },
  async createGroup(name: string, memberIds: string[]) {
    const { data, error } = await supabase.rpc("create_chat_group", {
      group_name: name,
      member_ids: memberIds,
    });
    if (error) throw error;
    return data as string;
  },
  async createDirect(memberId: string) {
    const { data, error } = await supabase.rpc("create_direct_conversation", {
      other_user_id: memberId,
    });
    if (error) throw error;
    return data as string;
  },
  subscribe(
    conversationId: string,
    onMessage: (record: Record<string, unknown>) => void,
  ): RealtimeChannel {
    return supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => onMessage(payload.new),
      )
      .subscribe();
  },
};

export const storyService = {
  async create(mediaUri: string, caption = "A new WeNitro moment") {
    const userId = await currentUserId();
    const media = await uploadMedia("stories", mediaUri);
    const { data, error } = await supabase
      .from("stories")
      .insert({ owner_id: userId, media_url: media.publicUrl, caption })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async markViewed(storyId: string) {
    const userId = await currentUserId();
    const { error } = await supabase
      .from("story_views")
      .upsert({ story_id: storyId, viewer_id: userId });
    if (error) throw error;
  },
};

export const profileService = {
  async updateAvatar(mediaUri: string) {
    const userId = await currentUserId();
    const media = await uploadMedia("avatars", mediaUri);
    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: media.publicUrl,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;
    return media.publicUrl;
  },
};

export const activityService = {
  async create(input: {
    title: string;
    category: string;
    startsAt: string;
    location: string;
    description: string;
    priceInr: number;
  }) {
    const userId = await currentUserId();
    const startsAt = new Date(input.startsAt);
    const normalizedStart = Number.isNaN(startsAt.getTime())
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : startsAt;
    const { data, error } = await supabase
      .from("activities")
      .insert({
        owner_id: userId,
        title: input.title,
        category: input.category,
        starts_at: normalizedStart.toISOString(),
        ends_at: new Date(
          normalizedStart.getTime() + 2 * 60 * 60 * 1000,
        ).toISOString(),
        location_name: input.location,
        description: input.description,
        price_inr: input.priceInr,
        capacity: 20,
        status: "published",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const privacyService = {
  async saveConsent(purpose: string, granted: boolean, policyVersion: string) {
    const userId = await currentUserId();
    const { error } = await supabase.from("user_consents").insert({
      user_id: userId,
      purpose,
      granted,
      policy_version: policyVersion,
      source: "app",
    });
    if (error) throw error;
  },
  async request(
    kind: "access" | "correction" | "erasure" | "grievance",
    details = "",
  ) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("data_subject_requests")
      .insert({ user_id: userId, request_type: kind, details })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async savePreference(
    key:
      | "discoverable"
      | "allow_message_requests"
      | "show_distance"
      | "follower_approval"
      | "analytics"
      | "personalization"
      | "marketing",
    value: boolean,
  ) {
    const userId = await currentUserId();
    const { error } = await supabase
      .from("privacy_preferences")
      .upsert({ user_id: userId, [key]: value }, { onConflict: "user_id" });
    if (error) throw error;
  },
};
