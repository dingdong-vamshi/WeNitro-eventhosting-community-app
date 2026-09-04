import type { RealtimeChannel } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { activitiesProductionService } from "./activities-production";
import type {
  Activity as ProductionActivity,
  ActivityType,
  ActivityVisibility,
  DiscoverActivitiesInput,
} from "./activities-production";
import { communitiesProductionService } from "./communities-production";
import { createMessageClientId, realtimeChatService } from "./realtime-chat";
import { profileProductionService } from "./profile-production";
import { storiesProductionService } from "./stories-production";
import { vibesProductionService } from "./vibes-production";

export type CommunityInput = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  rules: string[];
  visibility: "public" | "private";
  imageUri?: string;
  coverUri?: string;
};

type Row = Record<string, any>;

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

const currentLegacyUserId = async () => {
  await currentUserId();
  const { data, error } = await supabase.rpc("get_current_app_user_id");
  if (error) throw error;
  const value = Array.isArray(data)
    ? data[0]?.user_id ?? data[0]?.id ?? data[0]
    : (data as Row | null)?.user_id ?? (data as Row | null)?.id ?? data;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("Your account is not linked to a WeNitro profile.");
  return id;
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
  bucket:
    | "avatars"
    | "activity-media"
    | "vibes"
    | "communities"
    | "messages"
    | "stories",
  uri: string,
  contentType = "image/jpeg",
) {
  const userId = await currentUserId();
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(uri, contentType)}`;
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected media.");
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: bucket === "avatars" ? "31536000" : "3600",
  });
  if (error) throw error;
  if (bucket !== "avatars") {
    const { data, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (signedError) throw signedError;
    return { path, publicUrl: data.signedUrl };
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

const safeProfile = (profile: Row | null | undefined) =>
  profile
    ? {
        id: String(profile.id),
        username: profile.username ?? "member",
        full_name: profile.fullname ?? profile.full_name ?? null,
        avatar_url: profile.profile_image ?? profile.avatar_url ?? null,
        bio: profile.bio ?? null,
        location: profile.location ?? null,
        last_active_at: profile.updated_at ?? profile.last_login ?? null,
      }
    : null;

export async function loadRemoteWorkspace() {
  if (!isSupabaseConfigured) return null;
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;

  const loadStage = async <T>(
    label: string,
    task: PromiseLike<T>,
  ): Promise<T> => {
    try {
      return await task;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Workspace ${label} failed: ${message}`, { cause: error });
    }
  };
  const workspaceError = (label: string, error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String(error.message)
          : String(error);
    return new Error(`Workspace ${label} failed: ${message}`, { cause: error });
  };

  const userId = await currentLegacyUserId();
  const [
    activityPage,
    communityPage,
    profileDetails,
    peopleResult,
    friendResult,
    vibePage,
    stories,
  ] =
    await Promise.all([
      loadStage(
        "activities",
        activitiesProductionService.discover({
          pageSize: 50,
          upcomingOnly: false,
          sort: "newest",
        }),
      ),
      loadStage(
        "communities",
        communitiesProductionService.discover({ pageSize: 30 }),
      ),
      loadStage("profile", profileProductionService.loadProfile()),
      loadStage(
        "people",
        (supabase.rpc as unknown as (
          name: "list_discoverable_people",
          args: { p_limit: number },
        ) => PromiseLike<{ data: Row[] | null; error: unknown }>)(
          "list_discoverable_people",
          { p_limit: 50 },
        ),
      ),
      loadStage(
        "friends",
        supabase
          .from("tbl_friends")
          .select("id", { count: "exact", head: true })
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`),
      ),
      loadStage("vibes", vibesProductionService.listReels({ pageSize: 50 })),
      loadStage("stories", storiesProductionService.listActive(50)),
    ]);
  if (peopleResult.error) throw workspaceError("people", peopleResult.error);
  if (friendResult.error) throw workspaceError("friends", friendResult.error);

  const eventIds = activityPage.items.map((item) => Number(item.id));
  const inboxTask = (
    supabase.rpc as unknown as (
      fn: "list_chat_inbox",
      args: { p_message_limit: number },
    ) => PromiseLike<{ data: Row[] | null; error: unknown }>
  )("list_chat_inbox", { p_message_limit: 50 });
  const [participantResult, inboxResult] = await Promise.all([
    eventIds.length
      ? supabase
          .from("tbl_event_participants")
          .select("event_id,user_id,status")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    loadStage(
      "conversations",
      inboxTask,
    ),
  ]);
  if (participantResult.error)
    throw workspaceError("participants", participantResult.error);
  if (inboxResult.error)
    throw workspaceError("conversations", inboxResult.error);
  const participants = (participantResult.data ?? []) as Row[];
  const participantCount = new Map<number, number>();
  for (const row of participants) {
    if (["approved", "going"].includes(String(row.status)))
      participantCount.set(
        Number(row.event_id),
        (participantCount.get(Number(row.event_id)) ?? 0) + 1,
      );
  }

  const communityRows = communityPage.items.map((community) => ({
    ...community,
    owner_id: community.ownerId,
    is_private: community.visibility === "private",
    is_verified: community.verified,
    image_url: community.imageUrl,
    cover_url: community.coverUrl,
    member_count: community.memberCount,
    memberships: [{ count: community.memberCount ?? 0 }],
    community_rules: [],
    community_posts: [],
  }));

  const inboxRows = inboxResult.data ?? [];
  const inboxMessages = inboxRows.flatMap((room) =>
    Array.isArray(room.chat_messages) ? (room.chat_messages as Row[]) : [],
  );
  const inboxMediaPaths = [
    ...new Set(
      inboxMessages
        .map((message) => message.media_url)
        .filter(
          (path): path is string =>
            typeof path === "string" &&
            path.length > 0 &&
            !/^https?:\/\//i.test(path),
        ),
    ),
  ];
  const signedInboxMedia = new Map<string, string>();
  if (inboxMediaPaths.length) {
    const signedResult = await loadStage(
      "chat media",
      supabase.storage.from("messages").createSignedUrls(inboxMediaPaths, 3_600),
    );
    if (signedResult.error)
      throw workspaceError("chat media", signedResult.error);
    for (const item of signedResult.data ?? []) {
      if (item.path && item.signedUrl)
        signedInboxMedia.set(item.path, item.signedUrl);
    }
  }

  const conversationRows = inboxRows.map((room) => {
    const members = Array.isArray(room.chat_members)
      ? (room.chat_members as Row[])
      : [];
    const messages = Array.isArray(room.chat_messages)
      ? (room.chat_messages as Row[])
      : [];
    const chatMessages = messages.map((message) => {
      const sender = message.sender as Row | null;
      const mediaPath =
        typeof message.media_url === "string" ? message.media_url : null;
      return {
        id: String(message.id),
        sender_id: String(message.sender_id),
        body: String(message.content ?? message.body ?? ""),
        media_url: mediaPath
          ? signedInboxMedia.get(mediaPath) ?? mediaPath
          : null,
        message_type: String(message.message_type ?? "text"),
        share_payload: message.share_payload ?? null,
        created_at: String(message.created_at),
        profiles: sender?.id
          ? {
              id: String(sender.id),
              username: String(sender.username ?? ""),
              full_name: sender.fullname == null ? null : String(sender.fullname),
              avatar_url:
                sender.profile_image == null
                  ? null
                  : String(sender.profile_image),
            }
          : null,
      };
    });
    return {
      id: String(room.id),
      name: room.title ?? room.name ?? room.room_name ?? "WeNitro chat",
      kind: room.room_type === "personal" ? "direct" : "group",
      last_message_at:
        room.last_message_at == null ? null : String(room.last_message_at),
      unread_count: Math.max(0, Number(room.unread_count) || 0),
      viewer_last_read_at:
        room.viewer_last_read_at == null
          ? null
          : String(room.viewer_last_read_at),
      chat_members: members.map((member) => {
        const profile = member.user as Row | null;
        return {
          user_id: String(member.user_id),
          role: member.role,
          last_read_at: member.last_read_at ?? null,
          muted: Boolean(member.muted),
          profiles: profile?.id
            ? {
                id: String(profile.id),
                username: String(profile.username ?? ""),
                full_name:
                  profile.fullname == null ? null : String(profile.fullname),
                avatar_url:
                  profile.profile_image == null
                    ? null
                    : String(profile.profile_image),
              }
            : null,
        };
      }),
      chat_messages: chatMessages,
      last_message: chatMessages.at(-1) ?? null,
    };
  });

  const activities = await loadStage(
    "activity media",
    Promise.all(activityPage.items.map(async (item) => ({
      id: item.id,
      owner_id: item.ownerId,
      title: item.title,
      description: item.description,
      category: item.category,
      cover_url: await signedActivityCoverUrl(item.coverUrl),
      location_name: item.locationName,
      price_inr: item.priceInr,
      capacity: item.capacity,
      match_score: item.matchScore,
      starts_at: item.startsAt,
      ends_at: item.endsAt,
      registration_closes_at: item.registrationClosesAt,
      profiles: item.owner
        ? {
            full_name: item.owner.fullName,
            username: item.owner.username,
            avatar_url: item.owner.avatarUrl,
          }
        : null,
      participants: [{ count: participantCount.get(Number(item.id)) ?? 0 }],
      viewer_status: item.viewerState.participation?.status ?? null,
    }))),
  );
  const profile = profileDetails.profile;
  const normalizedProfile = {
    id: String(profile.id),
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    location: profile.location,
    trust_score: profile.trust_score,
    email: session.session.user.email,
    nitro_points: profile.nitro_points,
    date_of_birth: profile.date_of_birth,
    onboarding_completed: profile.onboarding_completed,
  };

  return {
    profile: normalizedProfile,
    people: (peopleResult.data ?? []).map((person: Row) => safeProfile(person)),
    friendCount: friendResult.count ?? 0,
    activities,
    vibes: vibePage.reels.map((reel) => ({
      id: reel.id,
      owner_id: reel.userId,
      caption: reel.caption || "WeNitro Vibe",
      media_url: reel.mediaUrl,
      media_type: reel.mediaType,
      profiles: reel.author
        ? {
            username: reel.author.username,
            full_name: reel.author.full_name,
            avatar_url: reel.author.avatar_url,
          }
        : null,
      likes: [{ count: reel.likeCount }],
      vibe_comments: [],
    })),
    communities: communityRows,
    memberships: communityPage.items
      .filter((item) => item.membership === "joined" || item.membership === "created")
      .map((item) => ({ community_id: item.id })),
    conversations: conversationRows,
    stories: stories.map((story) => ({
      id: String(story.id),
      owner_id: String(story.userId),
      media_url: story.mediaUrl,
      media_type: story.mediaType,
      caption: story.caption,
      created_at: story.createdAt,
      profiles: {
        username: story.author.username,
        full_name: story.author.fullName,
        avatar_url: story.author.avatarUrl,
      },
      story_views: story.viewed ? [{ viewer_id: String(userId) }] : [],
    })),
    likes: activityPage.items
      .filter((item) => item.viewerState.liked)
      .map((item) => ({ activity_id: item.id })),
    saves: activityPage.items
      .filter((item) => item.viewerState.saved)
      .map((item) => ({ activity_id: item.id })),
    interests: profileDetails.interests.map((interest) => interest.name),
    profileInterests: profileDetails.interests,
    badges: profileDetails.badges,
    likedVibeIds: vibePage.reels
      .filter((reel) => reel.likedByMe)
      .map((reel) => reel.id),
  };
}

const unsupportedLegacyFeature = (feature: string): never => {
  throw new Error(
    `${feature} is not available until its legacy Supabase bridge is deployed.`,
  );
};

export const vibeService = {
  async create(input: {
    caption: string;
    mediaUri: string;
    mediaType?: "image" | "video";
    activityId?: string;
  }) {
    const result = await vibesProductionService.create({
      caption: input.caption,
      media: { uri: input.mediaUri },
      mediaType: input.mediaType ?? "image",
      activityId: input.activityId,
    });
    const resultRow = result && typeof result === "object" ? (result as Row) : {};
    const id = String(resultRow.id ?? resultRow.vibe_id ?? "");
    const page = await vibesProductionService.listReels({ pageSize: 50 });
    const reel = page.reels.find((item) => item.id === id) ?? page.reels[0];
    if (!reel) throw new Error("The Vibe was saved but could not be reloaded.");
    return {
      id: reel.id,
      media_url: reel.mediaUrl,
      caption: input.caption,
    };
  },
  setLike(vibeId: string, liked: boolean) {
    return vibesProductionService.setLiked(vibeId, liked);
  },
  comment(vibeId: string, body: string, parentId?: string) {
    return vibesProductionService.createComment(vibeId, body, parentId);
  },
  recordShare(vibeId: string, channel: "system" | "copy_link" | "direct" | "external") {
    return vibesProductionService.recordShare(vibeId, channel);
  },
  listComments(vibeId: string) {
    return vibesProductionService.listComments(vibeId);
  },
  list() {
    return vibesProductionService.listReels({ pageSize: 50 });
  },
  delete(vibeId: string) {
    return vibesProductionService.delete(vibeId);
  },
};

export const communityService = {
  create(input: CommunityInput) {
    return communitiesProductionService.create({
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      tags: input.tags,
      rules: input.rules,
      visibility: input.visibility,
      image: input.imageUri ? { uri: input.imageUri } : undefined,
      cover: input.coverUri ? { uri: input.coverUri } : undefined,
    });
  },
  setMembership(communityId: string, joined: boolean) {
    return communitiesProductionService.setMembership(communityId, joined);
  },
  async publishPost(
    communityId: string,
    title: string,
    body: string,
    mediaUri?: string,
  ) {
    return communitiesProductionService.createPost({
      communityId,
      title,
      body,
      image: mediaUri ? { uri: mediaUri } : undefined,
    });
  },
  setPostReaction(postId: string, liked: boolean) {
    return communitiesProductionService.setPostReaction(
      postId,
      liked ? "like" : null,
    );
  },
  commentPost(postId: string, body: string) {
    return communitiesProductionService.createComment({ postId, body });
  },
  listPostComments(postId: string, page = 1) {
    return communitiesProductionService.listComments(postId, {
      page,
      pageSize: 50,
    });
  },
};

export const chatService = {
  async sendMessage(conversationId: string, body: string, mediaUri?: string) {
    const media = mediaUri ? await uploadMedia("messages", mediaUri) : null;
    const message = await realtimeChatService.sendMessage({
      conversationId: Number(conversationId),
      clientId: createMessageClientId(),
      body,
      media: media ? { path: media.path, type: "image" } : undefined,
    });
    return {
      ...message,
      id: String(message.id),
      media_url: message.media_signed_url ?? media?.publicUrl ?? null,
    };
  },
  async createGroup(name: string, memberIds: string[]) {
    return String(
      await realtimeChatService.createGroupConversation(
        name,
        memberIds.map(Number),
      ),
    );
  },
  async createDirect(memberId: string) {
    return String(
      await realtimeChatService.createDirectConversation(Number(memberId)),
    );
  },
  async share(
    conversationIds: string[],
    kind: import("./realtime-chat").ChatShareKind,
    entityId: string,
  ) {
    return realtimeChatService.sendShare(conversationIds.map(Number), kind, Number(entityId));
  },
  async loadMessagesPage(
    conversationId: string,
    cursor?: { createdAt: string; id: number } | null,
  ) {
    const ownId = await currentLegacyUserId();
    const page = await realtimeChatService.loadMessagesPage(
      Number(conversationId),
      { limit: 50, cursor },
    );
    return {
      items: page.items.map((message) => ({
        id: String(message.id),
        sender:
          message.sender_id === ownId
            ? "You"
            : message.profiles?.full_name ||
              message.profiles?.username ||
              "Member",
        text: message.body,
        time: new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        mine: message.sender_id === ownId,
        image: message.media_signed_url || undefined,
        messageType: message.message_type,
        share: message.share_payload,
        createdAt: message.created_at,
      })),
      nextCursor: page.nextCursor,
    };
  },
  subscribe(
    conversationId: string,
    onMessage: (record: Record<string, unknown>) => void,
  ) {
    return realtimeChatService.subscribeToConversation({
      conversationId: Number(conversationId),
      onMessageChange: (change) => {
        if (change.message) onMessage(change.message as unknown as Row);
      },
    });
  },
};

export const storyService = {
  async create(
    mediaUri: string,
    caption = "A new WeNitro moment",
  ): Promise<{
    id: string;
    media_url: string;
    media_type: "image" | "video";
    caption: string | null;
  }> {
    const story = await storiesProductionService.create({
      uri: mediaUri,
      caption,
    });
    return {
      id: String(story.id),
      media_url: story.mediaUrl,
      media_type: story.mediaType,
      caption: story.caption,
    };
  },
  markViewed(storyId: string) {
    return storiesProductionService.markViewed(storyId);
  },
  async list() {
    return (await storiesProductionService.listActive(50)).map((story) => ({
      id: String(story.id),
      name: story.isMine ? "Your Story" : story.author.fullName || story.author.username || "Member",
      image: story.mediaUrl,
      mediaType: story.mediaType,
      text: story.caption || "A WeNitro moment",
      viewed: story.viewed,
      mine: story.isMine,
      authorId: String(story.userId),
      authorAvatar: story.author.avatarUrl || undefined,
      createdAt: story.createdAt,
    }));
  },
  delete(storyId: string) {
    return storiesProductionService.delete(storyId);
  },
  subscribe(onChange: () => void) {
    return storiesProductionService.subscribe(onChange);
  },
};

export const profileService = {
  updateAvatar(mediaUri: string) {
    return profileProductionService.uploadAvatar(mediaUri);
  },
  load() {
    return profileProductionService.loadProfile();
  },
  edit(input: Parameters<typeof profileProductionService.editProfile>[0]) {
    return profileProductionService.editProfile(input);
  },
  listInterests() {
    return profileProductionService.listAvailableInterests();
  },
  setInterests(ids: Array<number | string>) {
    return profileProductionService.setInterests(ids);
  },
};

type ActivityWriteInput = {
  title: string;
  category: string;
  startsAt: string;
  endsAt?: string | null;
  registrationClosesAt?: string | null;
  location: string;
  description: string;
  priceInr: number;
  capacity: number;
  activityType: ActivityType;
  visibility: ActivityVisibility;
  communityId?: string | null;
  joinType: "direct" | "approval";
  coverMedia?: { uri: string; contentType?: string };
};

const signedActivityCoverUrl = async (coverUrl: string | null) => {
  if (!coverUrl || /^https?:\/\//i.test(coverUrl)) return coverUrl;
  if (coverUrl.startsWith("media/events/")) return null;
  const { data, error } = await supabase.storage
    .from("activity-media")
    .createSignedUrl(coverUrl, 3_600);
  if (error) {
    return null;
  }
  return data.signedUrl;
};

const activityForWorkspace = async (
  activity: ProductionActivity,
  viewerStatus: string | null,
  participantCount: number,
) => ({
  id: activity.id,
  owner_id: activity.ownerId,
  title: activity.title,
  description: activity.description,
  category: activity.category,
  cover_url: await signedActivityCoverUrl(activity.coverUrl),
  location_name: activity.locationName,
  price_inr: activity.priceInr,
  capacity: activity.capacity,
  match_score: activity.matchScore,
  starts_at: activity.startsAt,
  ends_at: activity.endsAt,
  registration_closes_at: activity.registrationClosesAt,
  visibility: activity.visibility,
  status: activity.status,
  activity_type: activity.activityType,
  community_id: activity.communityId,
  profiles: activity.owner
    ? {
        full_name: activity.owner.fullName,
        username: activity.owner.username,
        avatar_url: activity.owner.avatarUrl,
      }
    : null,
  participants: [{ count: participantCount }],
  viewer_status: viewerStatus,
});

const loadActivityParticipantCounts = async (activityIds: string[]) => {
  const counts = new Map<string, number>();
  if (!activityIds.length) return counts;
  const { data, error } = await supabase
    .from("tbl_event_participants")
    .select("event_id,status")
    .in("event_id", activityIds.map(Number));
  if (error) throw error;
  for (const row of (data ?? []) as Row[]) {
    if (!["approved", "going"].includes(String(row.status))) continue;
    const id = String(row.event_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
};

const activityIdFromRpc = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value;
  const candidate =
    typeof first === "object" && first !== null
      ? (first as Row).id ?? (first as Row).event_id
      : first;
  const id = Number(candidate);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("Activity creation did not return a valid ID.");
  return String(id);
};

const writeActivityFromUi = async (
  input: ActivityWriteInput,
  status: "draft" | "published",
) => {
  await currentLegacyUserId();
  let uploadedCoverPath: string | null = null;
  try {
    if (input.coverMedia) {
      const uploaded = await uploadMedia(
        "activity-media",
        input.coverMedia.uri,
        input.coverMedia.contentType ?? "image/jpeg",
      );
      uploadedCoverPath = uploaded.path;
    }
    const { data, error } = await supabase.rpc("create_activity", {
      p_payload: {
        title: input.title.trim(),
        category: input.category.trim(),
        description: input.description.trim(),
        event_start_time: input.startsAt,
        event_end_time: input.endsAt ?? null,
        registration_close_time: input.registrationClosesAt ?? null,
        location: input.location.trim(),
        display_location: input.location.trim(),
        price_inr: input.priceInr,
        is_paid: input.priceInr > 0,
        max_participants: input.capacity,
        activity_type: input.activityType,
        visibility_type: input.visibility,
        community_id: input.communityId ? Number(input.communityId) : null,
        join_type: input.joinType,
        cover_url: uploadedCoverPath,
      },
      p_status: status,
    });
    if (error) throw error;
    const createdActivityId = activityIdFromRpc(data);
    const details =
      await activitiesProductionService.getDetails(createdActivityId);
    if (details.activity.joinType !== input.joinType) {
      throw new Error(
        "The saved joining method did not match your selection. Please retry.",
      );
    }
    return activityForWorkspace(
      details.activity,
      details.viewerState.participation?.status ?? null,
      0,
    );
  } catch (error) {
    if (uploadedCoverPath) {
      await supabase.storage
        .from("activity-media")
        .remove([uploadedCoverPath])
        .catch(() => undefined);
    }
    throw error;
  }
};

export const activityService = {
  async discover(input: DiscoverActivitiesInput = {}) {
    const page = await activitiesProductionService.discover(input);
    const counts = await loadActivityParticipantCounts(
      page.items.map((item) => item.id),
    );
    return {
      ...page,
      items: await Promise.all(
        page.items.map((item) =>
          activityForWorkspace(
            item,
            item.viewerState.participation?.status ?? null,
            counts.get(item.id) ?? 0,
          ),
        ),
      ),
    };
  },
  create(input: ActivityWriteInput) {
    return writeActivityFromUi(input, "published");
  },
  createDraft(input: ActivityWriteInput) {
    return writeActivityFromUi(input, "draft");
  },
  async update(activityId: string, input: ActivityWriteInput & { status?: "draft" | "published" }) {
    let uploadedCoverPath: string | null = null;
    try {
      if (input.coverMedia) {
        const uploaded = await uploadMedia(
          "activity-media",
          input.coverMedia.uri,
          input.coverMedia.contentType ?? "image/jpeg",
        );
        uploadedCoverPath = uploaded.path;
      }
      const activity = await activitiesProductionService.update(activityId, {
        title: input.title,
        category: input.category,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        registrationClosesAt: input.registrationClosesAt ?? null,
        locationName: input.location,
        priceInr: input.priceInr,
        capacity: input.capacity,
        activityType: input.activityType,
        visibility: input.visibility,
        communityId: input.communityId,
        joinType: input.joinType,
        coverUrl: uploadedCoverPath ?? undefined,
        status: input.status,
      });
      return await activityForWorkspace(activity, null, 0);
    } catch (error) {
      if (uploadedCoverPath) await supabase.storage.from("activity-media").remove([uploadedCoverPath]).catch(() => undefined);
      throw error;
    }
  },
  async publish(activityId: string) {
    const activity = await activitiesProductionService.publish(activityId);
    return await activityForWorkspace(activity, null, 0);
  },
  async getDetails(activityId: string) {
    const [details, participantRows, eventResult, legacyUserId] =
      await Promise.all([
        activitiesProductionService.getDetails(activityId, {
          commentPageSize: 100,
        }),
        supabase
          .from("tbl_event_participants")
          .select("id,event_id,user_id,status,created_at,responded_at")
          .eq("event_id", Number(activityId))
          .neq("status", "left")
          .order("created_at", { ascending: true }),
        supabase
          .from("tbl_events")
          .select("created_by,join_type")
          .eq("id", Number(activityId))
          .single(),
        currentLegacyUserId(),
      ]);
    if (participantRows.error) throw participantRows.error;
    if (eventResult.error) throw eventResult.error;
    const rows = (participantRows.data ?? []) as Row[];
    const userIds = [...new Set(rows.map((row) => Number(row.user_id)))];
    const profilesResult = userIds.length
      ? await supabase
          .from("tbl_users")
          .select("id,username,fullname,profile_image")
          .in("id", userIds)
      : { data: [] as Row[], error: null };
    if (profilesResult.error) throw profilesResult.error;
    const profiles = new Map(
      ((profilesResult.data ?? []) as Row[]).map((profile) => [
        Number(profile.id),
        profile,
      ]),
    );
    const approvedCount = rows.filter((row) =>
      ["approved", "going"].includes(String(row.status)),
    ).length;
    return {
      activity: await activityForWorkspace(
        details.activity,
        details.viewerState.participation?.status ?? null,
        approvedCount,
      ),
      viewerStatus: details.viewerState.participation?.status ?? null,
      liked: details.viewerState.liked,
      saved: details.viewerState.saved,
      isHost: Number(eventResult.data.created_by) === legacyUserId,
      joinType:
        eventResult.data.join_type === "approval" ? "approval" : "direct",
      participants: rows.map((row) => {
        const profile = profiles.get(Number(row.user_id));
        return {
          id: String(row.id),
          userId: String(row.user_id),
          name: profile?.fullname ?? profile?.username ?? "WeNitro member",
          username: profile?.username ?? "member",
          avatarUrl: profile?.profile_image ?? null,
          status: String(row.status),
        };
      }),
      comments: details.comments.items.map((item) => ({
        id: item.id,
        author: item.author?.fullName ?? item.author?.username ?? "Member",
        body: item.body,
        createdAt: item.createdAt,
      })),
    };
  },
  subscribe(activityId: string, onRefresh: () => void) {
    return activitiesProductionService.subscribeToActivity(activityId, { onRefresh });
  },
  join(activityId: string) {
    return activitiesProductionService.join(activityId);
  },
  leave(activityId: string) {
    return activitiesProductionService.leave(activityId);
  },
  respondJoin(
    activityId: string,
    userId: string,
    status: "approved" | "rejected" | "waitlist",
  ) {
    return activitiesProductionService.respondJoin(activityId, userId, status);
  },
  setLiked(activityId: string, liked: boolean) {
    return activitiesProductionService.setLiked(activityId, liked);
  },
  setSaved(activityId: string, saved: boolean) {
    return activitiesProductionService.setSaved(activityId, saved);
  },
  addComment(activityId: string, body: string) {
    return activitiesProductionService.addComment(activityId, body);
  },
  cancel(activityId: string) {
    return activitiesProductionService.delete(activityId);
  },
};

export const privacyService = {
  saveConsent(purpose: string, granted: boolean, policyVersion: string) {
    return profileProductionService.recordConsent(
      purpose as Parameters<typeof profileProductionService.recordConsent>[0],
      granted,
      policyVersion,
    );
  },
  request(
    kind: "access" | "correction" | "erasure" | "grievance",
    details = "",
  ) {
    return profileProductionService.submitDataSubjectRequest(kind, details);
  },
  async savePreference(
    key:
      | "discoverable"
      | "allow_message_requests"
      | "show_online_status"
      | "show_distance"
      | "follower_approval"
      | "analytics"
      | "personalization"
      | "marketing",
    enabled: boolean,
  ) {
    return profileProductionService.updatePrivacyPreferences({ [key]: enabled });
  },
  loadPreferences() {
    return profileProductionService.getPrivacyPreferences();
  },
};

export type { RealtimeChannel };
