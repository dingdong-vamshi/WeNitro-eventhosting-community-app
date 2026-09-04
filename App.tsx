import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  activityService,
  authService,
  chatService,
  communityService,
  loadRemoteWorkspace,
  privacyService,
  profileService,
  storyService,
  vibeService,
} from "./src/services/wenitro";
import {
  notificationService,
  type ProductionNotification,
} from "./src/services/notifications-production";
import {
  bootstrapSession,
  loginWithPassword,
  requestPhoneOtp,
  signUpWithPassword,
  subscribeToAuthRedirects,
  verifyPhoneOtp,
  requestEmailVerification,
} from "./src/services/auth-production";
import {
  createActivityPayment,
  launchCashfreeCheckout,
  verifyActivityPayment,
} from "./src/services/payments";
import { realtimeChatService, type ChatSharePayload } from "./src/services/realtime-chat";
import { profileProductionService } from "./src/services/profile-production";
import { normalizeOnboardingDateOfBirth } from "./src/utils/onboarding";
import {
  communitiesProductionService,
  createCommunityPost,
} from "./src/services/communities-production";
import { vibesProductionService } from "./src/services/vibes-production";
import { subscribeToAppForeground } from "./src/services/app-freshness";
import {
  openSharedContent,
  requestInternalShare,
  subscribeToInternalShareRequests,
  subscribeToSharedContentNavigation,
  type InternalShareEntity,
} from "./src/services/internal-share";
import { ShareToChatModal } from "./src/components/ShareToChatModal";
import {
  verificationService,
  type VerificationRequest,
} from "./src/services/verification-production";

type IconName = keyof typeof Ionicons.glyphMap;
type Screen =
  | "login"
  | "signup"
  | "onboarding"
  | "feed"
  | "activities"
  | "vibes"
  | "host"
  | "chat"
  | "profile"
  | "search"
  | "notifications"
  | "communities"
  | "editProfile"
  | "settings"
  | "privacy"
  | "cookies"
  | "terms"
  | "privacyPolicy"
  | "help"
  | "feedback"
  | "phone"
  | "emergency"
  | "socialLinks"
  | "verification"
  | "shop"
  | "activityHistory"
  | "nitroHistory"
  | "saved"
  | "liked"
  | "activityDetail"
  | "createActivity"
  | "postVibe"
  | "createCommunity"
  | "communityDetail";

type WebRoute = { screen: Screen; entityId?: string };

const routableScreens = new Set<Screen>([
  "login", "signup", "onboarding", "feed", "activities", "vibes", "host",
  "chat", "profile", "search", "notifications", "communities", "editProfile",
  "settings", "privacy", "cookies", "terms", "privacyPolicy", "help",
  "feedback", "phone", "emergency", "socialLinks", "verification", "shop",
  "activityHistory", "nitroHistory", "saved", "liked", "createActivity",
  "postVibe", "createCommunity",
]);

const readWebRoute = (): WebRoute | null => {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const [name, encodedId] = window.location.hash.replace(/^#\/?/, "").split("/");
  const entityId = encodedId ? decodeURIComponent(encodedId) : undefined;
  if (name === "activity" && entityId) return { screen: "activityDetail", entityId };
    if (name === "community" && entityId) return { screen: "communityDetail", entityId };
    if (name === "vibe" && entityId) return { screen: "vibes", entityId };
  if (name === "profile" && entityId) return { screen: "profile", entityId };
  if (name === "chat") return { screen: "chat", entityId };
  if (routableScreens.has(name as Screen)) return { screen: name as Screen };
  return null;
};

const webHashFor = (screen: Screen, entityId?: string) => {
  const encodedId = entityId ? `/${encodeURIComponent(entityId)}` : "";
  if (screen === "activityDetail") return `#/activity${encodedId}`;
  if (screen === "communityDetail") return `#/community${encodedId}`;
  if (screen === "profile") return `#/profile${encodedId}`;
    if (screen === "chat") return `#/chat${encodedId}`;
    if (screen === "vibes" && entityId) return `#/vibe${encodedId}`;
  return `#/${screen}`;
};

type Activity = {
  id: string;
  title: string;
  category: string;
  when: string;
  where: string;
  price: string;
  seats: number;
  joined: number;
  image: any;
  host: string;
  description?: string;
  match?: number;
  end?: string;
  closes?: string;
  endsAt?: string;
  registrationClosesAt?: string;
  viewerStatus?:
    | "going"
    | "approved"
    | "pending"
    | "interested"
    | "declined"
    | "rejected"
    | "waitlist"
    | "payment_pending"
    | "approved_pending_payment"
    | "paid"
    | "payment_failed"
    | null;
  ownerId?: string;
  startsAt?: string;
  visibility?: "public" | "community" | "private";
  status?: "draft" | "published" | "cancelled" | "completed";
  activityType?: "meetup" | "sport" | "study" | "cowork" | "tournament";
  joinType?: "direct" | "approval";
  communityId?: string | null;
  hostAvatar?: string;
};

type ActivityParticipantView = {
  id: string;
  userId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  status: string;
};

type ActivityCommentView = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type Vibe = {
  id: string;
  text: string;
  event: string;
  author: string;
  likes: number;
  saved: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  comments?: { id: string; author: string; body: string }[];
  mine?: boolean;
  authorAvatar?: string;
};

type CommunityPost = {
  id: string;
  author: string;
  title: string;
  body: string;
  category: string;
  reactions: number;
  comments: number;
  liked: boolean;
  image?: string;
  commentItems?: { id: string; author: string; body: string }[];
  authorAvatar?: string;
  createdAt?: string;
};

type Community = {
  id: string;
  name: string;
  tagline: string;
  category: string;
  tags: string[];
  memberCount: number;
  onlineCount: number;
  visibility: "Public" | "Private";
  membership: "none" | "joined" | "created" | "pending";
  verified?: boolean;
  image: string;
  cover: string;
  rules: string[];
  posts: CommunityPost[];
};

type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  time: string;
  mine: boolean;
  image?: string;
  createdAt?: string;
  messageType?: string;
  share?: ChatSharePayload | null;
};

type ChatConversation = {
  id: string;
  name: string;
  type: "People" | "Groups";
  avatar: string;
  memberCount: number;
  online: boolean;
  unread: number;
  messages: ChatMessage[];
  memberIds?: string[];
  userId?: string;
  lastMessageAt?: string;
};

type ChatStory = {
  id: string;
  name: string;
  image: string;
  mediaType?: "image" | "video";
  text: string;
  viewed: boolean;
  mine?: boolean;
  createdAt?: string;
  authorId?: string;
  authorAvatar?: string;
};

type AppBadge = {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
};

type DiscoverablePerson = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  location: string;
  online: boolean;
};

type AppData = {
  mode: "authenticated" | "unauthenticated";
  name: string;
  username: string;
  email: string;
  userId?: string;
  bio: string;
  location: string;
  trustScore: number;
  interests: string[];
  badges: AppBadge[];
  activities: Activity[];
  vibes: Vibe[];
  communities: Community[];
  conversations: ChatConversation[];
  stories: ChatStory[];
  people: DiscoverablePerson[];
  savedIds: string[];
  likedIds: string[];
  nitro: number;
  onboarded: boolean;
  avatarUri?: string;
  theme: "light" | "dark";
  friendCount: number;
};

const ThemeContext = React.createContext<"light" | "dark">("light");
const UnreadContext = React.createContext({ notifications: 0, chats: 0 });

const colors = {
  bg: "#F7F6FA",
  card: "#FFFFFF",
  tint: "#EFEEFF",
  purple50: "#EFEEFF",
  purple100: "#DEDCFF",
  purple500: "#4E46E5",
  purple600: "#1910C2",
  purple800: "#10077F",
  ink: "#15101E",
  text: "#15101E",
  muted: "#686273",
  soft: "#97919F",
  border: "#E8E5EC",
  coral: "#FF6B6B",
  mint: "#19A974",
  good: "#16A34A",
  warn: "#F59E0B",
  danger: "#DC2626",
};

const bundledUri = (asset: any) => Asset.fromModule(asset).uri;

const photoAssets = {
  study: bundledUri(require("./assets/photos/study.jpg")),
  sport: bundledUri(require("./assets/photos/sport.jpg")),
  cowork: bundledUri(require("./assets/photos/cowork.jpg")),
  friends: bundledUri(require("./assets/photos/friends.jpg")),
  cycling: bundledUri(require("./assets/photos/cycling.jpg")),
  food: bundledUri(require("./assets/photos/food.jpg")),
  bicycle: bundledUri(require("./assets/photos/bicycle.jpg")),
  camera: bundledUri(require("./assets/photos/camera.jpg")),
  bonfire: bundledUri(require("./assets/photos/bonfire.jpg")),
  mic: bundledUri(require("./assets/photos/mic.jpg")),
  ride: bundledUri(require("./assets/photos/ride.jpg")),
  suchit: bundledUri(require("./assets/photos/avatar-suchit.jpg")),
};

const mediaSource = (source: any) =>
  typeof source === "string" ? { uri: source } : source;
const neutralAvatar =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%23162B4D'/%3E%3Ccircle cx='80' cy='62' r='27' fill='%235E7EAC'/%3E%3Cpath d='M31 142c8-31 26-47 49-47s41 16 49 47' fill='%235E7EAC'/%3E%3C/svg%3E";
const neutralMediaPlaceholder =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540' viewBox='0 0 960 540'%3E%3Crect width='960' height='540' fill='%2309192D'/%3E%3Ccircle cx='480' cy='238' r='68' fill='%231E4F91'/%3E%3Cpath d='M452 238h56M480 210v56' stroke='%23D9E8FF' stroke-width='14' stroke-linecap='round'/%3E%3Ctext x='480' y='350' text-anchor='middle' font-family='sans-serif' font-size='32' fill='%238EA6C7'%3EWeNitro%3C/text%3E%3C/svg%3E";

const activityFallbackCover = (category?: string, activityType?: string) => {
  const value = `${category || ""} ${activityType || ""}`.toLowerCase();
  if (/sport|badminton|cricket|football|tennis|fitness|tournament/.test(value))
    return photoAssets.sport;
  if (/study|learn|book|class/.test(value)) return photoAssets.study;
  if (/music|concert|sing|dance/.test(value)) return photoAssets.mic;
  if (/cowork|startup|work|business/.test(value)) return photoAssets.cowork;
  if (/food|coffee|cafe/.test(value)) return photoAssets.food;
  return neutralMediaPlaceholder;
};

const communityFallbackCover = photoAssets.friends;

const runtimeField = (value: unknown, keys: readonly string[]): unknown => {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    const candidate = Reflect.get(value, key);
    if (candidate !== undefined && candidate !== null) return candidate;
  }
  return undefined;
};
const runtimeString = (value: unknown, keys: readonly string[]): string | undefined => {
  const candidate = runtimeField(value, keys);
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
};
const runtimeId = (value: unknown, keys: readonly string[]): string | undefined => {
  const candidate = runtimeField(value, keys);
  return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : undefined;
};
const runtimeNumber = (value: unknown, keys: readonly string[]): number | undefined => {
  const candidate = runtimeField(value, keys);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
};
const formatRuntimeTime = (value?: string): string => {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};



const initialData: AppData = {
  mode: "unauthenticated",
  name: "",
  username: "",
  email: "",
  bio: "",
  location: "",
  trustScore: 0,
  interests: [],
  badges: [],
  activities: [],
  vibes: [],
  communities: [],
  conversations: [],
  stories: [],
  people: [],
  savedIds: [],
  likedIds: [],
  nitro: 0,
  onboarded: false,
  theme: "light",
  friendCount: 0,
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const isBackendId = (value: string) => /^[1-9]\d*$/.test(value);
const activityReactionId = (id: string) => `activity:${id}`;
const vibeReactionId = (id: string) => `vibe:${id}`;

const activityFromRemote = (item: any): Activity => ({
  id: String(item.id),
  ownerId: item.owner_id ? String(item.owner_id) : undefined,
  title: item.title,
  category: item.category,
  when: new Date(item.starts_at).toLocaleString(),
  startsAt: item.starts_at,
  end: item.ends_at ? new Date(item.ends_at).toLocaleString() : undefined,
  endsAt: item.ends_at ?? undefined,
  closes: item.registration_closes_at
    ? new Date(item.registration_closes_at).toLocaleString()
    : undefined,
  registrationClosesAt: item.registration_closes_at ?? undefined,
  where: item.location_name,
  price: Number(item.price_inr) ? `₹${item.price_inr}` : "Free",
  seats: item.capacity,
  joined: item.participants?.[0]?.count ?? 0,
  host: item.profiles?.full_name ?? item.profiles?.username ?? "",
  hostAvatar: runtimeString(item.profiles, ["profile_image", "avatar_url", "avatar"]) ?? runtimeString(item, ["hostAvatar", "host_avatar"]),
  match: item.match_score ?? 0,
  description: item.description ?? "",
  image:
    item.cover_url || activityFallbackCover(item.category, item.activity_type),
  viewerStatus: item.viewer_status ?? null,
  visibility: item.visibility ?? "public",
  status: item.status ?? "published",
  activityType: item.activity_type ?? "meetup",
  communityId: item.community_id ? String(item.community_id) : null,
});

const chatMessageFromRemote = (message: any, userId: string | undefined): ChatMessage => {
  const rawShare = message.share_payload;
  const share = rawShare
    ? {
        version: 1 as const,
        kind: rawShare.kind,
        entityId: String(rawShare.entityId ?? rawShare.entity_id ?? ""),
        parentId:
          rawShare.parentId == null && rawShare.parent_id == null
            ? null
            : String(rawShare.parentId ?? rawShare.parent_id),
        title: String(rawShare.title ?? "Shared from WeNitro"),
        preview: String(rawShare.preview ?? ""),
        deepLink: String(rawShare.deepLink ?? rawShare.deep_link ?? ""),
        sharedBy: Number(rawShare.sharedBy ?? rawShare.shared_by) || 0,
        thumbnailBucket: rawShare.thumbnailBucket ?? rawShare.thumbnail_bucket ?? null,
        thumbnailPath: rawShare.thumbnailPath ?? rawShare.thumbnail_path ?? null,
        thumbnailUrl:
          rawShare.thumbnailUrl ??
          rawShare.thumbnail_url ??
          (/^https?:\/\//i.test(rawShare.thumbnail_path ?? "") ? rawShare.thumbnail_path : null),
      }
    : null;
  return {
  id: String(message.id),
  sender:
    String(message.sender_id) === String(userId)
      ? "You"
      : message.profiles?.full_name || message.profiles?.username || "Member",
  text: String(message.body ?? message.content ?? ""),
  time: new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  mine: String(message.sender_id) === String(userId),
  image: message.media_signed_url || message.media_url || undefined,
  createdAt: String(message.created_at),
  messageType: String(message.message_type ?? "text"),
  share,
  };
};

function hydrateRemoteData(remote: any, fallback: AppData): AppData {
  const profile = remote.profile;
  const userId = profile?.id;
  const activities: Activity[] = remote.activities.map(activityFromRemote);
  const vibes: Vibe[] = remote.vibes.map((item: any) => ({
    id: item.id,
    author: item.profiles?.username || item.profiles?.full_name || "",
    authorAvatar: runtimeString(item.profiles, ["profile_image", "avatar_url", "avatar"]),
    event: item.caption || "",
    text: item.caption,
    likes: item.likes?.[0]?.count ?? 0,
    saved: false,
    mediaUrl: item.media_url,
    mediaType: item.media_type === "video" ? "video" : "image",
    mine: item.owner_id === userId,
    comments: (item.vibe_comments || []).map((comment: any) => ({
      id: comment.id,
      author:
        comment.profiles?.username || comment.profiles?.full_name || "Member",
      body: comment.body,
    })),
  }));
  const people: DiscoverablePerson[] = remote.people.map((item: any) => ({
    id: item.id,
    name: item.full_name || item.username || "",
    username: item.username ? `@${item.username}` : "",
    avatar: item.avatar_url || neutralAvatar,
    bio: item.bio || "",
    location: item.location || "",
    online: item.last_active_at
      ? Date.now() - new Date(item.last_active_at).getTime() < 15 * 60 * 1000
      : false,
  }));
  const communities: Community[] = remote.communities.map((item: any) => ({
    id: item.id,
    name: item.name,
    tagline: item.tagline || item.description || "",
    category: item.category,
    tags: item.tags || [],
    memberCount: item.memberships?.[0]?.count ?? 0,
    onlineCount: 0,
    visibility: item.is_private ? "Private" : "Public",
    membership:
      item.owner_id === userId
        ? "created"
        : remote.memberships.some(
              (membership: any) => membership.community_id === item.id,
            )
          ? "joined"
          : "none",
    verified: item.is_verified,
    image: item.image_url || communityFallbackCover,
    cover: item.cover_url || communityFallbackCover,
    rules: (item.community_rules || []).map((rule: any) => rule.body),
    posts: (item.community_posts || []).map((post: any) => ({
      id: post.id,
      author: post.profiles?.full_name || post.profiles?.username || "",
      authorAvatar: runtimeString(post.profiles, ["profile_image", "avatar_url", "avatar"]),
      createdAt: runtimeString(post, ["createdAt", "created_at"]),
      title: post.title,
      body: post.body,
      category: post.category,
      reactions: post.community_post_reactions?.[0]?.count ?? 0,
      comments: post.community_post_comments?.[0]?.count ?? 0,
      liked: false,
      image: post.media_url,
    })),
  }));
  const conversations: ChatConversation[] = remote.conversations.map(
    (item: any) => {
      const members = item.chat_members || [];
      const other = members.find((member: any) => member.user_id !== userId);
      return {
        id: item.id,
        name:
          item.kind === "group"
            ? item.name
            : other?.profiles?.full_name ||
              other?.profiles?.username ||
              "WeNitro member",
        type: item.kind === "group" ? "Groups" : "People",
        avatar:
          item.avatar_url || other?.profiles?.avatar_url || neutralAvatar,
        memberCount: members.length,
        online: false,
        unread: Number(item.unread_count ?? 0),
        lastMessageAt:
          item.last_message_at || item.updated_at || item.created_at,
        memberIds: members.map((member: any) => member.user_id),
        userId: other?.user_id,
        messages: (item.chat_messages || [])
          .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
          .map((message: any) => chatMessageFromRemote(message, userId)),
      };
    },
  );
  conversations.sort((a, b) =>
    String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")),
  );
  const stories: ChatStory[] = remote.stories.map((item: any) => ({
    id: item.id,
    name:
      item.owner_id === userId
        ? "Your Story"
        : item.profiles?.username || item.profiles?.full_name || "Member",
    image: item.media_url,
    mediaType: item.media_type === "video" ? "video" : "image",
    text: item.caption,
    viewed: (item.story_views || []).some(
      (view: any) => view.viewer_id === userId,
    ),
    mine: item.owner_id === userId,
    createdAt: item.created_at,
    authorId: String(item.owner_id),
    authorAvatar: runtimeString(item.profiles, ["profile_image", "avatar_url", "avatar"]),
  }));
  return {
    mode: "authenticated",
    name: profile?.full_name || "New member",
    username: profile?.username ? `@${profile.username}` : "@member",
    email: remote.email || "",
    userId: userId ? String(userId) : undefined,
    bio: profile?.bio || "",
    location: profile?.location || "",
    trustScore: Number(profile?.trust_score ?? 0),
    interests: remote.interests || [],
    badges: (remote.badges || []).map((badge: any) => ({
      id: String(badge.id),
      name: badge.name,
      description: badge.description || "Awarded by WeNitro",
      icon: badge.icon,
    })),
    avatarUri: profile?.avatar_url || undefined,
    nitro: profile?.nitro_points ?? 0,
    activities,
    vibes,
    communities,
    conversations,
    stories,
    people,
    likedIds: [
      ...(remote.likedIds || []).map((id: string) => activityReactionId(String(id))),
      ...(remote.likedVibeIds || []).map((id: string) => vibeReactionId(String(id))),
    ],
    savedIds: (remote.savedIds || []).map((id: string) => activityReactionId(String(id))),
    onboarded: Boolean(profile?.onboarding_completed),
    theme: fallback.theme,
    friendCount: runtimeNumber(remote, ["friendCount", "friend_count"]) ?? 0,
  };
}

let clickAudioContext: any;
function playClickSound() {
  if (Platform.OS === "web") {
    const AudioContextClass =
      (globalThis as any).AudioContext ||
      (globalThis as any).webkitAudioContext;
    if (!AudioContextClass) return;
    clickAudioContext ??= new AudioContextClass();
    const oscillator = clickAudioContext.createOscillator();
    const gain = clickAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(620, clickAudioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      420,
      clickAudioContext.currentTime + 0.07,
    );
    gain.gain.setValueAtTime(0.0001, clickAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.045,
      clickAudioContext.currentTime + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      clickAudioContext.currentTime + 0.08,
    );
    oscillator.connect(gain);
    gain.connect(clickAudioContext.destination);
    oscillator.start();
    oscillator.stop(clickAudioContext.currentTime + 0.09);
    return;
  }
  Haptics.selectionAsync().catch(() => undefined);
}

function Icon({
  name,
  size = 20,
  color = colors.purple600,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function DepthIcon({
  name,
  size = 20,
  color = colors.purple600,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <View style={styles.depthIcon}>
      <Icon name={name} size={size} color={color} />
    </View>
  );
}

function Pill({
  children,
  selected = false,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  const dark = React.useContext(ThemeContext) === "dark";
  return (
    <View
      style={[
        styles.pill,
        dark && styles.pillDark,
        selected && styles.pillSelected,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          dark && styles.pillTextDark,
          selected && styles.pillTextSelected,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function ThemeToggle({ onToggle }: { onToggle: () => void }) {
  const theme = React.useContext(ThemeContext);
  const dark = theme === "dark";
  const progress = useRef(new Animated.Value(dark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: dark ? 1 : 0,
      damping: 13,
      stiffness: 190,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [dark, progress]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: dark }}
      accessibilityLabel={`Switch to ${dark ? "light" : "dark"} mode`}
      onPress={() => {
        playClickSound();
        onToggle();
      }}
      style={({ pressed }) => [
        styles.themeToggle,
        dark && styles.themeToggleDark,
        pressed && styles.themeTogglePressed,
      ]}
    >
      <Icon name="sunny" color={dark ? "#8791A7" : "#F59E0B"} size={13} />
      <Icon name="moon" color={dark ? "#C9BEFF" : "#A8A2B6"} size={12} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.themeToggleThumb,
          dark && styles.themeToggleThumbDark,
          {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 22],
                }),
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "180deg"],
                }),
              },
            ],
          },
        ]}
      >
        <Icon
          name={dark ? "moon" : "sunny"}
          color={dark ? "#EEE9FF" : "#F59E0B"}
          size={12}
        />
      </Animated.View>
    </Pressable>
  );
}

function BrandHeader({
  go,
  onToggleTheme,
  notificationsOnly = false,
  integrated = false,
}: {
  go: (s: Screen) => void;
  onToggleTheme: () => void;
  notificationsOnly?: boolean;
  integrated?: boolean;
}) {
  const { notifications } = React.useContext(UnreadContext);
  return (
    <LinearGradient
      colors={integrated ? ["transparent", "transparent"] : ["#1910C2", "#4E46E5"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.brandHeader, integrated && styles.brandHeaderIntegrated]}
    >
      <View style={styles.brandLogo}>
        <Image
          source={require("./assets/wenitro-logo-transparent.png")}
          style={styles.brandLogoImage}
          resizeMode="contain"
        />
      </View>
      <View style={styles.brandIdentity}>
        <Text style={styles.brandName}>WeNitro</Text>
        <View style={styles.brandLocation}>
          <Icon name="location" color="#fff" size={12} />
        </View>
      </View>
      <View style={styles.brandActions}>
        <ThemeToggle onToggle={onToggleTheme} />
        {notificationsOnly ? null : (
          <Pressable
            onPress={() => go("activities")}
            accessibilityLabel="Explore activities"
          >
            <Icon name="search-outline" color="#fff" size={27} />
          </Pressable>
        )}
        <Pressable
          onPress={() => go("notifications")}
          accessibilityLabel="Open notifications"
        >
          <Icon name="notifications-outline" color="#fff" size={25} />
          {notifications > 0 ? <View style={styles.notificationDot} /> : null}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function AvatarStack({ count = 0, extra = 0 }: { count?: number; extra?: number }) {
  const total = Math.max(0, count + extra);
  if (total === 0) return null;
  return (
    <View style={styles.row}>
      <Icon name="people-outline" size={17} color={colors.purple600} />
      <Text style={styles.metaStrong}>{total}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        playClickSound();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !disabled && styles.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon ? (
        <DepthIcon
          name={icon}
          color={variant === "primary" ? "#fff" : colors.purple600}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          variant !== "primary" && styles.buttonTextAlt,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  inputType = "text",
  isValid,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  inputType?: "text" | "datetime-local";
  isValid?: boolean;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, multiline && styles.textareaShell]}>
        {Platform.OS === "web" &&
        (secureTextEntry || inputType === "datetime-local")
          ? React.createElement("input", {
              "aria-label": label,
              autoComplete: secureTextEntry ? "current-password" : "off",
              defaultValue: secureTextEntry ? value : undefined,
              value: secureTextEntry ? undefined : value,
              onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
                onChangeText(event.currentTarget.value),
              onInput: (event: React.FormEvent<HTMLInputElement>) =>
                onChangeText(event.currentTarget.value),
              placeholder,
              spellCheck: false,
              type: secureTextEntry ? "text" : inputType,
              style: {
                backgroundColor: "transparent",
                border: 0,
                color: colors.ink,
                flex: 1,
                fontFamily: "Manrope_500Medium",
                fontSize: 15,
                minHeight: 48,
                outline: "none",
                colorScheme: "light",
                WebkitTextSecurity: secureTextEntry
                  ? passwordVisible
                    ? "none"
                    : "disc"
                  : undefined,
              },
            })
          : (
              <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.soft}
                secureTextEntry={secureTextEntry && !passwordVisible}
                multiline={multiline}
                style={[styles.input, multiline && styles.textarea]}
              />
            )}
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
          >
            <Icon
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.soft}
            />
          </Pressable>
        ) : !multiline && (isValid ?? Boolean(value)) ? (
          <Icon name="checkmark-circle" size={18} color={colors.mint} />
        ) : null}
      </View>
    </View>
  );
}

function ScreenFrame({
  title,
  subtitle,
  children,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const theme = React.useContext(ThemeContext);
  return (
    <SafeAreaView style={[styles.safe, theme === "dark" && styles.safeDark]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={[
          styles.screen,
          theme === "dark" && styles.screenDark,
        ]}
      >
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={styles.iconButton}
              accessibilityLabel="Back"
            >
              <Icon name="chevron-back" />
            </Pressable>
          ) : null}
          <View style={styles.headerTitle}>
            <Text style={[styles.title, theme === "dark" && styles.titleDark]}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  theme === "dark" && styles.subtitleDark,
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ?? <View style={{ width: 42 }} />}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.authWrap}>
        <LinearGradient
          colors={["#1910C2", "#4E46E5"]}
          style={styles.authBrandPanel}
        >
          <Image
            source={require("./assets/wenitro-auth-illustration.png")}
            style={styles.authIllustration}
            resizeMode="cover"
          />
          <View style={styles.authIllustrationShade} />
          <View style={styles.authBrandCopy}>
            <Image
              source={require("./assets/wenitro-logo-transparent.png")}
              style={styles.authLogo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>WeNitro</Text>
            <Text style={styles.authSub}>
              Meet with intent. Make real plans.
            </Text>
          </View>
        </LinearGradient>
        <View style={styles.authCard}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthMethodTabs({
  method,
  setMethod,
}: {
  method: "email" | "phone";
  setMethod: (method: "email" | "phone") => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
      {(["email", "phone"] as const).map((item) => (
        <Pressable
          key={item}
          onPress={() => setMethod(item)}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: method === item ? colors.purple600 : colors.purple50,
          }}
        >
          <Text
            style={{
              color: method === item ? "#fff" : colors.purple600,
              fontWeight: "800",
            }}
          >
            {item === "email" ? "Email" : "Phone"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PhoneOtpForm({
  createAccount,
  go,
  setData,
}: {
  createAccount: boolean;
  go: (screen: Screen) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [cooldown]);

  const sendOtp = async () => {
    if (submitting || (sentPhone && cooldown > 0)) return;
    setSubmitting(true);
    setError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
      const result = await requestPhoneOtp({
        phone,
        fullName: createAccount ? fullName : undefined,
        createAccount,
      });
      setSentPhone(result.phone);
      setCooldown(30);
      setOtp("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await verifyPhoneOtp({ phone: sentPhone, token: otp });
      const remote = await loadRemoteWorkspace();
      if (!remote) throw new Error("Could not load your WeNitro profile.");
      setData((current) => hydrateRemoteData(remote, current));
      go(remote.profile.onboarding_completed ? "feed" : "onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OTP verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentPhone) {
    const maskedPhone = `${sentPhone.slice(0, 3)}${"•".repeat(
      Math.max(0, sentPhone.length - 7),
    )}${sentPhone.slice(-4)}`;
    return (
      <>
        <Text style={styles.formIntro}>
          Verify your phone. Enter the six-digit OTP sent to {maskedPhone}.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Field
          label="OTP"
          value={otp}
          onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit OTP"
        />
        <Button
          label={
            submitting
              ? "Verifying..."
              : createAccount
                ? "Verify & Create Account"
                : "Verify & Continue"
          }
          icon="shield-checkmark"
          onPress={verify}
        />
        <Pressable onPress={sendOtp} disabled={cooldown > 0 || submitting}>
          <Text style={styles.centerLink}>
            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setSentPhone("");
            setOtp("");
            setCooldown(0);
            setError("");
          }}
        >
          <Text style={styles.centerLink}>Edit phone number</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {createAccount ? (
        <Field
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
        />
      ) : null}
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
      />
      <Button
        label={submitting ? "Sending OTP..." : "Send OTP"}
        icon="phone-portrait-outline"
        onPress={sendOtp}
      />
    </>
  );
}

function LoginScreen({ go, setData }: {
  go: (s: Screen) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const resend = async () => {
    setResendStatus("Sending...");
    try {
      await requestEmailVerification({ email });
      setResendStatus("If verification is pending, a new email has been sent.");
    } catch (caught) {
      setResendStatus(caught instanceof Error ? caught.message : "Could not resend verification.");
    }
  };
  const passwordLogin = async () => {
    if (!email.includes("@") || password.length < 8) {
      setError("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
      await loginWithPassword({ email, password });
      const remote = await loadRemoteWorkspace();
      if (!remote) throw new Error("Could not load your WeNitro workspace.");
      setData((current) => hydrateRemoteData(remote, current));
      go(remote.profile.onboarding_completed ? "feed" : "onboarding");
    } catch (caught) {
      const source = caught as { code?: string; message?: string };
      const needsVerification = source?.code === "email_not_confirmed" || /email.*not.*confirm/i.test(source?.message ?? "");
      setVerificationPending(needsVerification);
      setError(needsVerification ? "Please verify your email before signing in." : caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthCard>
      <View style={styles.loginHeading}>
        <Text style={styles.authEyebrow}>WELCOME BACK</Text>
        <Text style={styles.formTitle}>Log in to WeNitro</Text>
        <Text style={styles.formIntro}>Continue with your real WeNitro account.</Text>
      </View>
      <AuthMethodTabs method={method} setMethod={setMethod} />
      {method === "phone" ? (
        <PhoneOtpForm createAccount={false} go={go} setData={setData} />
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />
            <Button label={submitting ? "Signing in..." : "Sign in"} icon="log-in" onPress={passwordLogin} />
            {verificationPending ? <Pressable onPress={() => void resend()}><Text style={styles.centerLink}>Resend verification email</Text></Pressable> : null}
            {resendStatus ? <Text style={styles.meta}>{resendStatus}</Text> : null}
        </>
      )}
      <Pressable onPress={() => go("signup")}>
        <Text style={styles.centerLink}>New to WeNitro? Create an account</Text>
      </Pressable>
      <Text style={styles.meta}>Google sign-in is paused.</Text>
      <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
    </AuthCard>
  );
}

function SignupScreen({ go, setData }: {
  go: (s: Screen) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendStatus, setResendStatus] = useState("");
  const submit = async () => {
    if (!name.trim() || !email.includes("@") || password.length < 8) {
      setError("Enter your name, a valid email, and a password of at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
      const result = await signUpWithPassword({ fullName: name.trim(), email: email.trim(), password });
      if (result.verificationRequired) {
        setVerificationEmail(email.trim().toLowerCase());
        return;
      }
      const remote = await loadRemoteWorkspace();
      if (!remote) throw new Error("Could not load your new WeNitro profile.");
      setData((current) => hydrateRemoteData(remote, current));
      go(remote.profile.onboarding_completed ? "feed" : "onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create account.");
    } finally {
      setSubmitting(false);
    }
  };
  if (verificationEmail) {
    const [localPart, domain = ""] = verificationEmail.split("@");
    const maskedEmail = `${localPart.slice(0, 1)}${"•".repeat(Math.max(2, localPart.length - 1))}@${domain}`;
    const resend = async () => {
      setResendStatus("Sending...");
      try {
        await requestEmailVerification({ email: verificationEmail });
        setResendStatus("A new verification email has been sent.");
      } catch (caught) {
        setResendStatus(caught instanceof Error ? caught.message : "Could not resend verification.");
      }
    };
    return (
      <AuthCard>
        <View style={{ alignItems: "center", gap: 14, paddingVertical: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: "#E8E7FF", alignItems: "center", justifyContent: "center" }}>
            <Icon name="mail-unread-outline" color="#1D16CE" size={36} />
          </View>
          <Text style={[styles.formTitle, { textAlign: "center" }]}>Check your email</Text>
          <Text style={[styles.formIntro, { textAlign: "center" }]}>We sent a verification link to {maskedEmail}. Verify your email to continue.</Text>
        </View>
        {resendStatus ? <Text style={styles.meta}>{resendStatus}</Text> : null}
        <Button label="Resend Verification Email" icon="refresh" onPress={() => void resend()} />
        <Pressable onPress={() => go("login")}><Text style={styles.centerLink}>Back to Sign In</Text></Pressable>
      </AuthCard>
    );
  }
  return (
    <AuthCard>
      <Text style={styles.authEyebrow}>JOIN THE COMMUNITY</Text>
      <Text style={styles.formTitle}>Create your account</Text>
      <Text style={styles.formIntro}>Create a real account backed by Supabase.</Text>
      <AuthMethodTabs method={method} setMethod={setMethod} />
      {method === "phone" ? (
        <PhoneOtpForm createAccount go={go} setData={setData} />
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
          <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry />
          <View style={styles.requirements}>
            <Text style={[styles.req, password.length >= 8 && styles.reqOk]}>
              {password.length >= 8 ? "✓" : "○"} 8+ characters
            </Text>
            <Text style={[styles.req, Boolean(confirmPassword) && password === confirmPassword && styles.reqOk]}>
              {Boolean(confirmPassword) && password === confirmPassword ? "✓" : "○"} Passwords match
            </Text>
          </View>
          <Button label={submitting ? "Creating account..." : "Sign up"} icon="person-add" onPress={submit} />
        </>
      )}
      <Pressable onPress={() => go("login")}>
        <Text style={styles.centerLink}>Already have an account? Sign in</Text>
      </Pressable>
      <Text style={styles.meta}>Google sign-up is paused.</Text>
    </AuthCard>
  );
}

function OnboardingScreen({
  go,
  data,
  setData,
}: {
  go: (s: Screen) => void;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const [name, setName] = useState(data.name);
  const [username, setUsername] = useState(data.username.replace("@", ""));
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Prefer not to say");
  const [interests, setInterests] = useState<string[]>(data.interests);
  const [avatarUri, setAvatarUri] = useState(data.avatarUri || "");
  const [pendingAvatarUri, setPendingAvatarUri] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const choices = ["Women", "Men", "Non-binary", "Prefer not to say"];
  const topicChoices = [
    "Sports",
    "Coffee",
    "Startups",
    "Films",
    "Fitness",
    "Food",
    "Music",
    "Travel",
  ];
  const toggle = (item: string) =>
    setInterests((list) =>
      list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
    );
  const chooseAvatar = async () => {
    if (pickingPhoto || submitting) return;
    setError("");
    setPickingPhoto(true);
    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError("Photo-library permission is required to add your picture.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) {
        setAvatarUri(uri);
        setPendingAvatarUri(uri);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not open your photo library.",
      );
    } finally {
      setPickingPhoto(false);
    }
  };
  const completeOnboarding = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      let savedAvatarUri = avatarUri || undefined;
      if (data.mode === "authenticated" && isSupabaseConfigured) {
        const normalizedDob = normalizeOnboardingDateOfBirth(dob);
        const catalog = await profileProductionService.listAvailableInterests();
        await profileProductionService.setInterests(
          catalog
            .filter((interest) => interests.includes(interest.name))
            .map((interest) => interest.id),
        );
        if (pendingAvatarUri) {
          savedAvatarUri = await profileProductionService.uploadAvatar(
            pendingAvatarUri,
          );
        }
        await profileProductionService.editProfile({
          full_name: name.trim(),
          username: username.trim(),
          date_of_birth: normalizedDob,
          gender,
        });
      }
      setData((current) => ({
        ...current,
        name: name.trim(),
        username: `@${username.trim()}`,
        interests,
        avatarUri: savedAvatarUri,
        onboarded: true,
      }));
      go("feed");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Profile could not be saved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ScreenFrame
      title="Make it yours"
      subtitle="Step 1 of 1 · Build a profile people can trust."
    >
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>
      <View style={styles.onboardingIntro}>
        <View style={styles.profileAvatarLarge}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.profileAvatarText}>{name[0] || "W"}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={avatarUri ? "Change profile photo" : "Add profile photo"}
          accessibilityState={{ disabled: pickingPhoto || submitting }}
          disabled={pickingPhoto || submitting}
          onPress={() => void chooseAvatar()}
          style={styles.photoButton}
        >
          <Icon name="camera" size={17} color="#fff" />
        </Pressable>
        <Text style={styles.meta}>
          {pickingPhoto
            ? "Opening photo library..."
            : avatarUri
              ? "Change profile photo"
              : "Add a profile photo"}
        </Text>
      </View>
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Username" value={username} onChangeText={setUsername} />
      <Field
        label="Date of birth"
        value={dob}
        onChangeText={setDob}
        placeholder="DD-MM-YYYY"
      />
      <Text style={styles.label}>Gender</Text>
      <View style={styles.wrap}>
        {choices.map((item) => (
          <Pressable key={item} onPress={() => setGender(item)}>
            <Pill selected={gender === item}>{item}</Pill>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Interests</Text>
      <View style={styles.wrap}>
        {topicChoices.map((item) => (
          <Pressable key={item} onPress={() => toggle(item)}>
            <Pill selected={interests.includes(item)}>{item}</Pill>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={submitting ? "Saving profile..." : "Get Started"}
        icon="sparkles"
        disabled={submitting || pickingPhoto}
        onPress={() => void completeOnboarding()}
      />
    </ScreenFrame>
  );
}

function ActivityCard({
  item,
  compact = false,
  onPress,
  onSave,
}: {
  item: Activity;
  compact?: boolean;
  onPress?: () => void;
  onSave?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, compact && styles.compactCard]}
    >
      <View style={styles.imageWrap}>
        <Image source={mediaSource(item.image)} style={styles.activityImage} />
        <View style={styles.imageScrim} />
        <View style={styles.floatingPill}>
          <Text style={styles.floatingPillText}>{item.category}</Text>
        </View>
        <Pressable
          style={styles.saveButton}
          onPress={onSave}
          accessibilityLabel={`Save ${item.title}`}
        >
          <Icon name="bookmark-outline" color="#fff" size={19} />
        </Pressable>
        <View style={styles.cardImageCopy}>
          <Text style={styles.cardImageTitle}>{item.title}</Text>
          <Text style={styles.cardImageMeta}>{item.when}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.rowBetween}>
          <View style={styles.inlineAction}>
            <Icon name="location-outline" size={17} color={colors.muted} />
            <Text style={styles.meta}>{item.where}</Text>
          </View>
          <Text style={styles.price}>{item.price}</Text>
        </View>
        <View style={styles.rowBetween}>
          <View style={styles.hostRow}>
            <View style={styles.tinyAvatar}>
              <Text style={styles.tinyAvatarText}>{item.host[0]}</Text>
            </View>
            <Text style={styles.meta}>
              Hosted by <Text style={styles.metaStrong}>{item.host}</Text>
            </Text>
          </View>
          <Text style={styles.seatText}>
            {item.joined}/{item.seats} going
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function HomeActivityTile({
  title,
  tag,
  meta,
  price,
  image,
  onPress,
  saved,
  onSave,
}: {
  title: string;
  tag: string;
  meta: string;
  price: string;
  image: any;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.homeActivityTile}>
      <Image source={mediaSource(image)} style={styles.homeTileImage} />
      <LinearGradient
        colors={["transparent", "rgba(6,5,14,0.88)"]}
        style={styles.homeTileShade}
      />
      <View style={styles.homeTileTag}>
        <Text style={styles.homeTileTagText}>{tag}</Text>
      </View>
      <Pressable
        style={styles.homeTileHeart}
        onPress={(event) => {
          event.stopPropagation();
          onSave();
        }}
      >
        <Icon
          name={saved ? "bookmark" : "bookmark-outline"}
          color="#fff"
          size={16}
        />
      </Pressable>
      <View style={styles.homeTileCopy}>
        <Text style={styles.homeTileTitle}>{title}</Text>
        <Text style={styles.homeTileMeta}>{meta}</Text>
        <View style={styles.rowBetween}>
          <View style={styles.pricePill}>
            <Text style={styles.pricePillText}>{price}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function DiscoveryActivityCard({
  item,
  onPress,
  saved,
  onSave,
}: {
  item: Activity;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.discoveryCard}>
      <View style={styles.discoveryImageWrap}>
        <Image source={mediaSource(item.image)} style={styles.discoveryImage} />
        <Pressable
          style={styles.saveButton}
          onPress={(event) => {
            event.stopPropagation();
            onSave();
          }}
          accessibilityLabel={`${saved ? "Unsave" : "Save"} ${item.title}`}
        >
          <Icon
            name={saved ? "bookmark" : "bookmark-outline"}
            color="#fff"
            size={19}
          />
        </Pressable>
        <View style={styles.discoveryTag}>
          <Icon
            name={
              item.category === "Study"
                ? "sparkles"
                : item.category === "Sport"
                  ? "tennisball"
                  : "laptop-outline"
            }
            size={13}
            color={colors.purple600}
          />
          <Text style={styles.discoveryTagText}>{item.category}</Text>
        </View>
      </View>
      <View style={styles.discoveryBody}>
        <Text style={styles.discoveryMeta}>
          {item.when.replace(",", "  •")} • {item.where}
        </Text>
        <Text style={styles.discoveryTitle}>{item.title}</Text>
        <Text style={styles.discoveryDescription}>{item.description}</Text>
        <View style={styles.rowBetween}>
          <View style={styles.hostIdentity}>
            <Image
              source={mediaSource(item.hostAvatar || neutralAvatar)}
              style={styles.hostAvatar}
            />
            <Text style={styles.hostName}>{item.host}</Text>
          </View>
          <AvatarStack count={item.joined} />
        </View>
      </View>
    </Pressable>
  );
}

function FeedScreen({
  data,
  setData,
  go,
  openActivity,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
  openActivity: (id: string) => void;
}) {
  const dark = data.theme === "dark";
  const [activeFilter, setActiveFilter] = useState("Trending");
  const [promoIndex, setPromoIndex] = useState(0);
  const promoRef = useRef<ScrollView>(null);
  const toggleActivitySave = async (activity: Activity) => {
    const reactionId = activityReactionId(activity.id);
    const saved = data.savedIds.includes(reactionId);
    try {
      if (isSupabaseConfigured) {
        if (!isBackendId(activity.id))
          throw new Error("This activity is not connected to WeNitro yet.");
        await activityService.setSaved(activity.id, !saved);
      }
      setData((current) => ({
        ...current,
        savedIds: saved
          ? current.savedIds.filter((id) => id !== reactionId)
          : [...current.savedIds, reactionId],
      }));
    } catch (caught) {
      Alert.alert(
        "Save not synced",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const promoSlides = [
    {
      title: "Host Activities.\nBring people together.",
      text: "Create an activity, meet amazing people and make memories.",
      action: "Create Activity",
      screen: "createActivity" as Screen,
      image: neutralMediaPlaceholder,
      colors: ["#1F16C6", "#4E46E5"] as const,
    },
    {
      title: "Find your\nstudy people.",
      text: "Match with focused partners nearby and make the session happen.",
      action: "Find a buddy",
      screen: "activities" as Screen,
      image: photoAssets.study,
      colors: ["#1910C2", "#4E46E5"] as const,
    },
    {
      title: "Play more.\nSearch less.",
      text: "Badminton, cricket, cycling and more with people at your level.",
      action: "Explore sports",
      screen: "activities" as Screen,
      image: photoAssets.sport,
      colors: ["#1F16C6", "#4E46E5"] as const,
    },
    {
      title: "Your moments\nbelong in Vibes.",
      text: "Share the people and plans that made today worth remembering.",
      action: "Watch Vibes",
      screen: "vibes" as Screen,
      image: neutralMediaPlaceholder,
      colors: ["#1910C2", "#4E46E5"] as const,
    },
    {
      title: "Earn Nitro.\nUnlock more.",
      text: "Invite friends, participate and build trust across the community.",
      action: "Explore Store",
      screen: "shop" as Screen,
      image: photoAssets.bonfire,
      colors: ["#1F16C6", "#4E46E5"] as const,
    },
  ];
  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((current) => {
        const next = (current + 1) % promoSlides.length;
        promoRef.current?.scrollTo({ x: next * 365, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, []);
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView
        contentContainerStyle={[
          styles.referenceScreen,
          dark && styles.referenceScreenDark,
        ]}
      >
        <LinearGradient
          colors={["#1910C2", "#4E46E5"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.homeHeroShell}
        >
          <BrandHeader
            integrated
            go={go}
            onToggleTheme={() =>
              setData((current) => ({
                ...current,
                theme: current.theme === "dark" ? "light" : "dark",
              }))
            }
          />
          <ScrollView
            ref={promoRef}
            horizontal
            pagingEnabled
            snapToInterval={365}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoRow}
            onMomentumScrollEnd={(event) =>
              setPromoIndex(Math.round(event.nativeEvent.contentOffset.x / 365))
            }
          >
            {promoSlides.map((slide) => (
              <LinearGradient
                key={slide.title}
                colors={slide.colors}
                style={styles.promoMain}
              >
                <View style={styles.promoCopy}>
                  <Text style={styles.promoTitle}>{slide.title}</Text>
                  <Text style={styles.promoText}>{slide.text}</Text>
                  <Pressable
                    style={styles.whiteCta}
                    onPress={() => go(slide.screen)}
                  >
                    <Text style={styles.whiteCtaText}>{slide.action}</Text>
                    <Icon name="arrow-forward" size={14} color={colors.purple600} />
                  </Pressable>
                </View>
                <Image source={{ uri: slide.image }} style={styles.promoImage} />
              </LinearGradient>
            ))}
          </ScrollView>
          <View style={styles.promoDots}>
            {promoSlides.map((slide, index) => (
              <View
                key={slide.title}
                style={[
                  styles.promoDot,
                  index === promoIndex && styles.promoDotActive,
                ]}
              />
            ))}
          </View>
        </LinearGradient>
        <SectionTitle
          title="Discover Activities ✨"
          action="Explore all activities  ›"
          onAction={() => go("activities")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.homeFilters}
        >
          {["Trending", "Nearby", "Today", "Tomorrow", "This weekend"].map(
            (x) => (
              <Pressable key={x} onPress={() => setActiveFilter(x)}>
                <Pill selected={activeFilter === x}>{x}</Pill>
              </Pressable>
            ),
          )}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.homeActivitySlider}
        >
          {data.activities.slice(0, 10).map((item, index) => (
            <HomeActivityTile
              key={item.id}
              title={item.title}
              tag={
                ""
              }
              meta={`${item.where} · ${item.when}`}
              price={item.price}
              image={item.image}
              onPress={() => openActivity(item.id)}
              saved={data.savedIds.includes(activityReactionId(item.id))}
              onSave={() => toggleActivitySave(item)}
            />
          ))}
          <Pressable
            style={styles.viewAllActivityTile}
            onPress={() => go("activities")}
          >
            <View style={styles.viewAllActivityIcon}>
              <Icon name="arrow-forward" color="#fff" />
            </View>
            <Text style={styles.viewAllActivityTitle}>View all activities</Text>
            <Text style={styles.viewAllActivityText}>
              See every plan near you
            </Text>
          </Pressable>
        </ScrollView>
        <LinearGradient
          colors={dark ? ["#171D2D", "#201A38"] : ["#F7F2FF", "#F1EEFF"]}
          style={styles.rewardBanner}
        >
          <Text style={styles.giftEmoji}>🎁</Text>
          <View style={styles.messageBody}>
            <Text style={[styles.cardTitle, dark && styles.titleDark]}>
              Create your first activity
            </Text>
            <Text style={[styles.meta, dark && styles.subtitleDark]}>
              and get a <Text style={styles.link}>surprise reward!</Text>
            </Text>
          </View>
          <Pressable
            style={styles.smallPrimary}
            onPress={() => go("createActivity")}
          >
            <Text style={styles.smallPrimaryText}>Create Activity</Text>
            <Icon name="add-circle-outline" color="#fff" size={15} />
          </Pressable>
        </LinearGradient>
        <SectionTitle
          title="People on WeNitro"
          action="See all  ›"
          onAction={() => go("search")}
        />
        <View style={styles.peopleRow}>
          {data.people.slice(0, 3).map((person) => (
            <Pressable
              key={person.id}
              style={styles.personTile}
              onPress={() => go("search")}
            >
              <View>
                <Image
                  source={{ uri: person.avatar }}
                  style={styles.personAvatar}
                />
                {person.online ? <View style={styles.personOnline} /> : null}
              </View>
              <Text style={[styles.personName, dark && styles.titleDark]}>
                {person.name}
              </Text>
              <Text style={[styles.personRole, dark && styles.subtitleDark]}>
                {person.username}
              </Text>
            </Pressable>
          ))}
        </View>
        <SectionTitle
          title="👥 Communities"
          action="Explore all communities  ›"
          onAction={() => go("communities")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.communityCards}
        >
          {data.communities.slice(0, 4).map((item) => (
            <Pressable
              key={item.id}
              style={styles.communityImageCard}
              onPress={() => go("communities")}
            >
              <Image
                source={{ uri: item.image }}
                style={styles.communityImage}
              />
              <View style={styles.communityShade} />
              <View style={styles.communityCardCopy}>
                <Text style={styles.communityCardTitle}>{item.name}</Text>
                <Text style={styles.communityCardMeta}>
                  {item.memberCount} Members
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <SectionTitle
          title="Discover Your Tribe ✨"
          action="See all  ›"
          onAction={() => go("activities")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tribeRow}
        >
          {[
            ["Find Study Partner", "book", "#4E46E5"],
            ["Find Workout Partner", "barbell", "#E45295"],
            ["Find Travel Buddy", "airplane", "#5485EB"],
            ["Find Music Partner", "musical-note", "#F28A45"],
            ["Find Co-work Partner", "laptop", "#2D9F90"],
          ].map(([label, icon, color]) => (
            <Pressable
              key={label}
              style={[styles.tribeChip, { backgroundColor: color }]}
              onPress={() => go("activities")}
            >
              <Icon name={icon as IconName} color="#fff" size={18} />
              <Text style={styles.tribeText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.inviteBanner, dark && styles.surfaceDark]}>
          <Icon name="people" color={colors.purple600} size={34} />
          <View style={styles.messageBody}>
            <Text style={[styles.cardTitle, dark && styles.titleDark]}>
              Invite your friends
            </Text>
            <Text style={[styles.meta, dark && styles.subtitleDark]}>
              More friends, more fun!{" "}
              <Text style={styles.inviteReward}>Earn 10 Nitro Points</Text>
            </Text>
          </View>
          <Pressable style={styles.inviteButton}>
            <Text style={styles.inviteText}>Invite Now</Text>
          </Pressable>
        </View>
        <SectionTitle
          title="Vibes from the community"
          action="See all vibes  ›"
          onAction={() => go("vibes")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.vibePreviewRow}
        >
          {data.vibes.map((item) => (
            <Pressable
              key={item.id}
              style={styles.vibePreview}
              onPress={() => go("vibes")}
            >
              <Image
                source={{ uri: item.mediaUrl || neutralMediaPlaceholder }}
                style={styles.vibePreviewImage}
              />
              <View style={styles.communityShade} />
              <Text style={styles.vibePreviewText} numberOfLines={2}>
                {item.text}
              </Text>
              <View style={styles.vibePreviewPlay}>
                <Icon name="play" color="#fff" size={11} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <SectionTitle title="Earn Nitro Points" action="How it works?" />
        <View style={styles.nitroRow}>
          {[
            ["star-outline", "Rate Participants", "2 Points"],
            ["people-outline", "Invite Friends", "10 Points"],
            ["trophy-outline", "Milestone Achieved", "20 Points"],
          ].map(([icon, label, value]) => (
            <View
              key={label}
              style={[styles.nitroCard, dark && styles.surfaceDark]}
            >
              <Icon name={icon as IconName} size={20} />
              <View>
                <Text style={[styles.nitroTitle, dark && styles.titleDark]}>
                  {label}
                </Text>
                <Text style={[styles.nitroValue, dark && styles.subtitleDark]}>
                  {value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivitiesScreen({
  data,
  setData,
  go,
  openActivity,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
  openActivity: (id: string) => void;
}) {
  const dark = data.theme === "dark";
  const [filter, setFilter] = useState("All");
  const [category, setCategory] = useState("Any category");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [highMatchOnly, setHighMatchOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dateLabel = (date: Date) =>
    date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const filters = [
    "All",
    "Trending",
    "Nearby",
    dateLabel(today),
    dateLabel(tomorrow),
  ];
  useEffect(() => {
    if (!isSupabaseConfigured || data.mode !== "authenticated") return;
    let active = true;
    setRefreshing(true);
    activityService
      .discover({
        pageSize: 50,
        upcomingOnly: true,
        categories: category === "Any category" ? undefined : [category],
        sort: filter === "Trending" ? "latest" : "newest",
      })
      .then((page) => {
        if (!active) return;
        setData((current) => ({
          ...current,
          activities: page.items.map(activityFromRemote),
        }));
      })
      .catch((caught) => {
        if (active)
          Alert.alert(
            "Activities could not refresh",
            caught instanceof Error ? caught.message : "Please try again.",
          );
      })
      .finally(() => active && setRefreshing(false));
    return () => {
      active = false;
    };
  }, [category, filter]);
  const visible = data.activities
    .filter((item) => category === "Any category" || item.category === category)
    .filter((item) => !freeOnly || item.price === "Free")
    .filter((item) => !availableOnly || item.joined < item.seats)
    .filter((item) => !highMatchOnly || (item.match ?? 0) >= 90)
    .filter((item) => {
      if (![dateLabel(today), dateLabel(tomorrow)].includes(filter)) return true;
      const target = filter === dateLabel(today) ? today : tomorrow;
      const start = item.startsAt ? new Date(item.startsAt) : new Date(item.when);
      return (
        start.getFullYear() === target.getFullYear() &&
        start.getMonth() === target.getMonth() &&
        start.getDate() === target.getDate()
      );
    });
  const toggleSave = async (activity: Activity) => {
    const reactionId = activityReactionId(activity.id);
    const saved = data.savedIds.includes(reactionId);
    try {
      if (isSupabaseConfigured)
        await activityService.setSaved(activity.id, !saved);
      setData((current) => ({
        ...current,
        savedIds: saved
          ? current.savedIds.filter((id) => id !== reactionId)
          : [...current.savedIds, reactionId],
      }));
    } catch (caught) {
      Alert.alert(
        "Save not synced",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView
        contentContainerStyle={[
          styles.referenceScreen,
          dark && styles.referenceScreenDark,
        ]}
      >
        <BrandHeader
          go={go}
          onToggleTheme={() =>
            setData((current) => ({
              ...current,
              theme: current.theme === "dark" ? "light" : "dark",
            }))
          }
        />
        <Pressable
          style={[styles.activitySearch, dark && styles.surfaceDark]}
          onPress={() => go("search")}
        >
          <Icon name="search-outline" color={dark ? "#fff" : colors.text} />
          <Text style={[styles.searchPlaceholder, dark && styles.subtitleDark]}>
            Search Activities
          </Text>
          <Icon name="options-outline" color={dark ? "#fff" : colors.text} />
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activityFilterRow}
        >
          {filters.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)}>
              <Pill selected={filter === item}>{item}</Pill>
            </Pressable>
          ))}
          <Pressable
            style={[
              styles.filterDropdown,
              filtersOpen && styles.filterDropdownActive,
            ]}
            onPress={() => setFiltersOpen((current) => !current)}
          >
            <Text style={styles.pillText}>Filters</Text>
            <Icon
              name={filtersOpen ? "chevron-up" : "chevron-down"}
              size={14}
            />
          </Pressable>
        </ScrollView>
        {filtersOpen ? (
          <View style={[styles.filterPanel, dark && styles.surfaceDark]}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.filterPanelTitle}>Filter activities</Text>
                <Text style={styles.filterPanelText}>
                  Choose what you want to do nearby.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setCategory("Any category");
                  setFilter("All");
                }}
              >
                <Text style={styles.link}>Reset</Text>
              </Pressable>
            </View>
            <View style={styles.wrap}>
              {["Any category", "Study", "Sport", "Co-work", "Music"].map(
                (item) => (
                  <Pressable key={item} onPress={() => setCategory(item)}>
                    <Pill selected={category === item}>{item}</Pill>
                  </Pressable>
                ),
              )}
            </View>
            <View style={styles.filterToggles}>
              {["Free only", "Available spots", "90%+ match"].map(
                (item, index) => (
                  <Pressable
                    key={item}
                    style={styles.filterToggle}
                    onPress={() =>
                      index === 0
                        ? setFreeOnly((value) => !value)
                        : index === 1
                          ? setAvailableOnly((value) => !value)
                          : setHighMatchOnly((value) => !value)
                    }
                  >
                    <Icon
                      name={
                        index === 0
                          ? "wallet-outline"
                          : index === 1
                            ? "people-outline"
                            : "sparkles-outline"
                      }
                      color={colors.purple600}
                    />
                    <Text style={styles.filterToggleText}>{item}</Text>
                    <Icon
                      name={
                        [freeOnly, availableOnly, highMatchOnly][index]
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      color={colors.soft}
                    />
                  </Pressable>
                ),
              )}
            </View>
          </View>
        ) : null}
        <View style={styles.activitiesHeading}>
          <Text style={styles.activityHeadingText}>
            Activities
          </Text>
          <Text style={styles.sortText}>
            Sort by: <Text style={styles.link}>Recommended</Text>
          </Text>
        </View>
        {refreshing ? <ActivityIndicator color={colors.purple600} /> : null}
        {visible.map((item) => (
          <DiscoveryActivityCard
            key={item.id}
            item={item}
            onPress={() => openActivity(item.id)}
            saved={data.savedIds.includes(activityReactionId(item.id))}
            onSave={() => toggleSave(item)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReelVideo({ uri, muted }: { uri: string; muted: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.play();
  });

  useEffect(() => {
    player.muted = muted;
    player.play();
    return () => player.pause();
  }, [muted, player]);

  return (
    <VideoView
      player={player}
      style={styles.fullReelImage}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

function ReelMedia({ vibe, muted }: { vibe: Vibe; muted: boolean }) {
  if (vibe.mediaType === "video" && vibe.mediaUrl) {
    return <ReelVideo uri={vibe.mediaUrl} muted={muted} />;
  }
  if (Platform.OS === "web" && vibe.mediaUrl) {
    return React.createElement("img", {
      src: vibe.mediaUrl,
      alt: "WeNitro vibe",
      style: {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "contain",
        backgroundColor: "#000",
      },
    });
  }
  return (
    <Image
      source={mediaSource(vibe.mediaUrl || neutralMediaPlaceholder)}
      style={styles.fullReelImage}
      resizeMode="contain"
    />
  );
}

function StoryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.dynamicStoryHero}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function StoryMedia({ story }: { story: ChatStory }) {
  return story.mediaType === "video" ? (
    <StoryVideo uri={story.image} />
  ) : (
    <Image source={{ uri: story.image }} style={styles.dynamicStoryHero} />
  );
}

function VibesScreen({
  data,
  go,
  setData,
  initialVibeId,
}: {
  data: AppData;
  go: (s: Screen) => void;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  initialVibeId?: string | null;
}) {
  const [vibeIndex, setVibeIndex] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [muted, setMuted] = useState(true);
  const availableVibes = data.vibes;
  const vibe = availableVibes.length
    ? availableVibes[vibeIndex % availableVibes.length]
    : undefined;
  useEffect(() => {
    if (!initialVibeId) return;
    const index = availableVibes.findIndex((item) => item.id === initialVibeId);
    if (index >= 0) setVibeIndex(index);
  }, [initialVibeId, availableVibes]);
  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured || !vibe || !isBackendId(vibe.id)) return;
    const channel = vibesProductionService.subscribeToComments(vibe.id, () => {
      vibeService.listComments(vibe.id).then((comments) => {
        setData((current) => ({
          ...current,
          vibes: current.vibes.map((item) => item.id === vibe.id ? {
            ...item,
            comments: comments.map((entry) => ({ id: entry.id, author: entry.profiles?.full_name || entry.profiles?.username || "Member", body: entry.body })),
          } : item),
        }));
      }).catch(() => undefined);
    });
    return () => { void supabase.removeChannel(channel); };
  }, [data.mode, vibe?.id]);
  useEffect(() => {
    if (
      data.mode !== "authenticated" ||
      !isSupabaseConfigured ||
      !vibe ||
      !isBackendId(vibe.id)
    )
      return;
    let active = true;
    vibeService
      .listComments(vibe.id)
      .then((comments) => {
        if (!active) return;
        setData((current) => ({
          ...current,
          vibes: current.vibes.map((item) =>
            item.id === vibe.id
              ? {
                  ...item,
                  comments: comments.map((entry) => ({
                    id: entry.id,
                    author:
                      entry.profiles?.full_name ||
                      entry.profiles?.username ||
                      "Member",
                    body: entry.body,
                  })),
                }
              : item,
          ),
        }));
      })
      .catch((caught) =>
        Alert.alert(
          "Comments unavailable",
          caught instanceof Error ? caught.message : "Please try again.",
        ),
      );
    return () => {
      active = false;
    };
  }, [data.mode, vibe?.id]);
  if (!vibe) {
    return (
      <SafeAreaView style={styles.vibesSafe}>
        <View style={styles.fullReel}>
          <LinearGradient
            colors={["#090A12", "#17162A", "#10077F"]}
            style={styles.fullReelShade}
          />
          <View style={styles.reelHeader}>
            <BrandHeader
              go={go}
              onToggleTheme={() =>
                setData((current) => ({
                  ...current,
                  theme: current.theme === "dark" ? "light" : "dark",
                }))
              }
            />
          </View>
          <View style={styles.empty}>
            <Icon name="film-outline" size={52} color="#fff" />
            <Text style={[styles.cardTitle, { color: "#fff" }]}>Your vibe feed is ready</Text>
            <Text style={[styles.meta, { color: "#C9C7D6", textAlign: "center" }]}>Follow people or share a real moment from an activity to start the reel.</Text>
            <Button label="Share your first vibe" icon="add" onPress={() => go("postVibe")} />
            <Button label="Explore activities" icon="compass-outline" variant="outline" onPress={() => go("activities")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }
  const moveVibe = (direction: 1 | -1) => {
    setCommentsOpen(false);
    setComment("");
    setVibeIndex(
      (current) =>
        (current + direction + availableVibes.length) % availableVibes.length,
    );
    playClickSound();
  };
  const reactionId = vibeReactionId(vibe.id);
  const liked = data.likedIds.includes(reactionId);
  const toggleLike = async () => {
    if (
      data.mode === "authenticated" &&
      isSupabaseConfigured &&
      isBackendId(vibe.id)
    ) {
      try {
        await vibeService.setLike(vibe.id, !liked);
      } catch (caught) {
        Alert.alert(
          "Like not saved",
          caught instanceof Error ? caught.message : "Please try again.",
        );
        return;
      }
    }
    setData((d) => ({
      ...d,
      likedIds: liked
        ? d.likedIds.filter((x) => x !== reactionId)
        : [...d.likedIds, reactionId],
      vibes: d.vibes.map((item) =>
        item.id === vibe.id
          ? { ...item, likes: Math.max(0, item.likes + (liked ? -1 : 1)) }
          : item,
      ),
    }));
  };
  const postComment = async () => {
    const body = comment.trim();
    if (!body) return;
    let commentId = `vc${Date.now()}`;
    if (
      data.mode === "authenticated" &&
      isSupabaseConfigured &&
      isBackendId(vibe.id)
    ) {
      try {
        const created = await vibeService.comment(vibe.id, body);
        commentId = String(created.id);
      } catch (caught) {
        Alert.alert(
          "Comment not saved",
          caught instanceof Error ? caught.message : "Please try again.",
        );
        return;
      }
    }
    const localComment = { id: commentId, author: data.username, body };
    setData((current) => ({
      ...current,
      vibes: current.vibes.map((item) =>
        item.id === vibe.id
          ? { ...item, comments: [...(item.comments || []), localComment] }
          : item,
      ),
    }));
    setComment("");
  };
  const shareVibe = async () => {
    requestInternalShare({ kind: "vibe", id: vibe.id, title: vibe.event || "WeNitro Vibe", preview: vibe.text });
  };
  const deleteVibe = async () => {
    const remove = async () => {
      try {
        if (
          data.mode === "authenticated" &&
          isSupabaseConfigured &&
          isBackendId(vibe.id)
        )
          await vibeService.delete(vibe.id);
        setCommentsOpen(false);
        setVibeIndex((current) =>
          Math.max(0, Math.min(current, availableVibes.length - 2)),
        );
        setData((current) => ({
          ...current,
          vibes: current.vibes.filter((item) => item.id !== vibe.id),
          likedIds: current.likedIds.filter((id) => id !== reactionId),
        }));
      } catch (caught) {
        Alert.alert(
          "Vibe not deleted",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this Vibe and its uploaded media?")) {
        await remove();
      }
      return;
    }
    Alert.alert("Delete Vibe?", "This removes the Vibe and its uploaded media.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove() },
    ]);
  };
  const commentCount = vibe.comments?.length ?? 0;
  const actions: [IconName, string, () => void][] = [
    [liked ? "heart" : "heart-outline", String(vibe.likes), toggleLike],
    ["chatbubble-outline", String(commentCount), () => setCommentsOpen(true)],
    ["paper-plane-outline", "Share", shareVibe],
  ];
  return (
    <SafeAreaView style={styles.vibesSafe}>
      <View
        style={styles.fullReel}
        onTouchStart={(event) => setTouchStartY(event.nativeEvent.pageY)}
        onTouchEnd={(event) => {
          const distance = touchStartY - event.nativeEvent.pageY;
          if (Math.abs(distance) > 55) moveVibe(distance > 0 ? 1 : -1);
        }}
      >
        <ReelMedia key={vibe.id} vibe={vibe} muted={muted} />
        <LinearGradient
          colors={["rgba(0,0,0,0.02)", "rgba(4,5,12,0.9)"]}
          style={styles.fullReelShade}
        />
        <View style={styles.reelsTabs}>
          <Text style={styles.reelsTabMuted}>Following</Text>
          <View style={styles.reelsTabActiveWrap}>
            <Text style={styles.reelsTabActive}>Nearby</Text>
            <View style={styles.reelsTabUnderline} />
          </View>
        </View>
        <View style={styles.reelHeader}>
          <BrandHeader
            go={go}
            onToggleTheme={() =>
              setData((current) => ({
                ...current,
                theme: current.theme === "dark" ? "light" : "dark",
              }))
            }
          />
        </View>
        <View style={styles.reelNavigator}>
          <Pressable
            accessibilityLabel={muted ? "Turn reel sound on" : "Mute reel"}
            onPress={() => setMuted((current) => !current)}
            style={styles.reelNavButton}
          >
            <Icon name={muted ? "volume-mute" : "volume-high"} color="#fff" />
          </Pressable>
          <Pressable
            accessibilityLabel="Previous vibe"
            onPress={() => moveVibe(-1)}
            style={styles.reelNavButton}
          >
            <Icon name="chevron-up" color="#fff" />
          </Pressable>
          <Text style={styles.reelCounter}>
            {vibeIndex + 1}/{availableVibes.length}
          </Text>
          <Pressable
            accessibilityLabel="Next vibe"
            onPress={() => moveVibe(1)}
            style={styles.reelNavButton}
          >
            <Icon name="chevron-down" color="#fff" />
          </Pressable>
        </View>
        <View style={styles.fullReelActions}>
          {actions.map(([icon, label, onPress], index) => (
            <Pressable
              key={`${icon}-${label}`}
              onPress={onPress}
              style={styles.fullReelAction}
            >
              <Icon
                name={icon}
                color={index === 0 && liked ? "#FF4D8D" : "#fff"}
                size={29}
              />
              <Text style={styles.fullReelActionText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityLabel={vibe.mine ? "Delete this vibe" : "More vibe options"}
            disabled={!vibe.mine}
            onPress={vibe.mine ? deleteVibe : undefined}
            style={styles.moreVibe}
          >
            <Icon
              name={vibe.mine ? "trash-outline" : "ellipsis-horizontal"}
              color="#fff"
            />
          </Pressable>
        </View>
        <View style={styles.fullReelCopy}>
          <View style={styles.vibeIdentity}>
            <Image
              source={mediaSource(data.avatarUri || neutralAvatar)}
              style={styles.vibeAvatar}
            />
            <View>
              <View style={styles.row}>
                <Text style={styles.vibeUser}>{vibe.author}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.vibeMood}>{vibe.event}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.vibeCaption}>{vibe.text}</Text>
          <Text style={styles.vibeHashtags}></Text>
        </View>
        {commentsOpen ? (
          <View style={styles.vibeCommentsSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.vibeCommentsTitle}>Comments</Text>
              <Pressable onPress={() => setCommentsOpen(false)}>
                <Icon name="close" color="#fff" size={24} />
              </Pressable>
            </View>
            <ScrollView style={styles.vibeCommentsList}>
              {(vibe.comments || []).map((item) => (
                <View key={item.id} style={styles.vibeComment}>
                  <View style={styles.vibeCommentAvatar}>
                    <Text style={styles.vibeCommentInitial}>
                      {item.author[0]}
                    </Text>
                  </View>
                  <View style={styles.messageBody}>
                    <Text style={styles.vibeCommentAuthor}>{item.author}</Text>
                    <Text style={styles.vibeCommentBody}>{item.body}</Text>
                  </View>
                </View>
              ))}
              {!commentCount ? (
                <Text style={styles.vibeNoComments}>
                  Start the conversation.
                </Text>
              ) : null}
            </ScrollView>
            <View style={styles.vibeCommentComposer}>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment..."
                placeholderTextColor="#8994A6"
                style={styles.vibeCommentInput}
              />
              <Pressable onPress={postComment} style={styles.vibeCommentSend}>
                <Icon name="send" color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function HostScreen({
  go,
  data,
  setData,
}: {
  go: (s: Screen) => void;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const dark = data.theme === "dark";
  const actions: [IconName, string, string, Screen, string, string][] = [
    [
      "calendar-clear-outline",
      "Host an Activity",
      "Plan a meet-up, sports gathering, match, or custom event with others.",
      "createActivity",
      "#1910C2",
      "#F3F0FF",
    ],
    [
      "film-outline",
      "Post a Vibe",
      "Share photos and video highlights of active experiences in real-time.",
      "postVibe",
      "#4E46E5",
      "#EFEEFF",
    ],
    [
      "people-outline",
      "Create a Community",
      "Start a new group chat room for your interests, vibe, or events.",
      "createCommunity",
      "#1910C2",
      "#EFEEFF",
    ],
  ];
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView
        contentContainerStyle={[
          styles.referenceScreen,
          dark && styles.referenceScreenDark,
        ]}
      >
        <BrandHeader
          go={go}
          notificationsOnly
          onToggleTheme={() =>
            setData((current) => ({
              ...current,
              theme: current.theme === "dark" ? "light" : "dark",
            }))
          }
        />
        <View style={styles.createIntro}>
          <Text style={[styles.createTitle, dark && styles.titleDark]}>
            Create & Share
          </Text>
          <Text style={[styles.createSubtitle, dark && styles.subtitleDark]}>
            Plan an activity, capture your experiences, or build group
            communities
          </Text>
        </View>
        <View style={styles.createCards}>
          {actions.map(([icon, title, text, screen, color, tint]) => (
            <Pressable
              key={title}
              style={[
                styles.createActionCard,
                { backgroundColor: tint },
                dark && styles.surfaceDark,
              ]}
              onPress={() => go(screen)}
            >
              <View
                style={[styles.createActionIcon, { backgroundColor: color }]}
              >
                <Icon name={icon} color="#fff" size={31} />
              </View>
              <View style={styles.messageBody}>
                <Text
                  style={[styles.createActionTitle, dark && styles.titleDark]}
                >
                  {title}
                </Text>
                <Text
                  style={[styles.createActionText, dark && styles.subtitleDark]}
                >
                  {text}
                </Text>
              </View>
              <View
                style={[
                  styles.createChevron,
                  { backgroundColor: `${color}18` },
                ]}
              >
                <Icon name="chevron-forward" color={colors.text} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CreateActivityScreen({
  data,
  setData,
  go,
  back,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
  back: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Study");
  const [intent, setIntent] = useState<
    "meetup" | "sport" | "study" | "cowork" | "tournament" | "custom"
  >("study");
  const [customIntent, setCustomIntent] = useState("");
  const [date, setDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [closesDate, setClosesDate] = useState(
    new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("Free");
  const [capacity, setCapacity] = useState("20");
  const [visibility, setVisibility] = useState<
    "public" | "community" | "private"
  >("public");
  const [joinType, setJoinType] = useState<"direct" | "approval" | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState("");
  const [coverContentType, setCoverContentType] = useState("image/jpeg");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const startTimestamp = Date.parse(date);
  const endTimestamp = Date.parse(endDate);
  const closesTimestamp = Date.parse(closesDate);
  const datesValid =
    Number.isFinite(startTimestamp) &&
    Number.isFinite(endTimestamp) &&
    Number.isFinite(closesTimestamp) &&
    endTimestamp > startTimestamp &&
    closesTimestamp <= startTimestamp;
  const valid =
    title.length > 4 &&
    location.length > 2 &&
    description.length > 15 &&
    Number.isInteger(Number(capacity)) &&
    Number(capacity) > 0 &&
    datesValid &&
    joinType !== null &&
    (intent !== "custom" || customIntent.trim().length > 2) &&
    (visibility !== "community" || Boolean(communityId));
  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setCoverUri(result.assets[0].uri);
      setCoverContentType(result.assets[0].mimeType || "image/jpeg");
    }
  };
  const save = async (status: "draft" | "published") => {
    if (publishing) return;
    if (!valid) {
      Alert.alert(
        "Continue validation",
        "Complete every required field, choose a joining method, and check that the end and registration-close times are valid.",
      );
      return;
    }
    if (!joinType) return;
    setPublishing(true);
    try {
      const parsedStart = new Date(date);
      const parsedEnd = new Date(endDate);
      const parsedClose = new Date(closesDate);
      if (
        [parsedStart, parsedEnd, parsedClose].some((value) =>
          Number.isNaN(value.getTime()),
        )
      )
        throw new Error(
          "Enter valid start, end, and registration close times.",
        );
      if (parsedEnd <= parsedStart)
        throw new Error("End time must be after start time.");
      if (parsedClose > parsedStart)
        throw new Error("Registration must close before the activity starts.");
      const resolvedCategory =
        intent === "custom" ? customIntent.trim() : category;
      const activityInput = {
              title,
              category: resolvedCategory,
              startsAt: parsedStart.toISOString(),
              endsAt: parsedEnd.toISOString(),
              registrationClosesAt: parsedClose.toISOString(),
              location,
              description,
              priceInr: Number(price.replace(/[^0-9.]/g, "")) || 0,
              capacity: Number(capacity),
              activityType: intent === "custom" ? "meetup" : intent,
              visibility,
              communityId: visibility === "community" ? communityId : null,
              joinType,
              coverMedia: coverUri
                ? { uri: coverUri, contentType: coverContentType }
                : undefined,
            };
      const created = isSupabaseConfigured
        ? draftId
          ? await activityService.update(draftId, { ...activityInput, status })
          : await (status === "draft" ? activityService.createDraft : activityService.create)(activityInput)
        : null;
      const next: Activity = {
        id: created?.id || `a${Date.now()}`,
        title,
        category: resolvedCategory,
        when: parsedStart.toLocaleString(),
        startsAt: parsedStart.toISOString(),
        end: parsedEnd.toLocaleString(),
        closes: parsedClose.toLocaleString(),
        where: location,
        price,
        seats: Number(capacity),
        joined: status === "published" ? 1 : 0,
        host: data.name,
        image: created?.cover_url || coverUri || neutralMediaPlaceholder,
        description,
        ownerId: created?.owner_id,
        visibility,
        status,
        activityType: intent === "custom" ? "meetup" : intent,
        joinType,
        communityId,
      };
      setData((d) => ({
        ...d,
        activities: [
          next,
          ...d.activities.filter((item) => item.id !== draftId),
        ],
        nitro: status === "published" ? d.nitro + 50 : d.nitro,
      }));
      if (status === "draft") {
        setDraftSaved(true);
        setDraftId(next.id);
        Alert.alert("Draft saved", "Your activity draft is stored in WeNitro.");
      } else {
        go("host");
      }
    } catch (caught) {
      Alert.alert(
        status === "draft"
          ? "Could not save draft"
          : "Could not publish activity",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setPublishing(false);
    }
  };
  return (
    <ScreenFrame
      title="Create a plan"
      subtitle="Tell people what you want to do and who should join."
      onBack={back}
    >
      <Pressable style={styles.photoDrop} onPress={pickCover}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.postImage} />
        ) : null}
        <Icon name="image" size={34} />
        <Text style={styles.cardTitle}>
          {coverUri ? "Change cover photo" : "Add cover photo"}
        </Text>
        <Text style={styles.meta}>
          The selected image is stored privately with this activity.
        </Text>
      </Pressable>
      <Field
        label="What are you looking for?"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Study buddy for CAT prep"
      />
      <Text style={styles.label}>Category</Text>
      <View style={styles.wrap}>
        {["Study", "Sports", "Social", "Professional", "Outdoors"].map(
          (item) => (
            <Pressable key={item} onPress={() => setCategory(item)}>
              <Pill selected={category === item}>{item}</Pill>
            </Pressable>
          ),
        )}
      </View>
      <Text style={styles.label}>Intent</Text>
      <View style={styles.wrap}>
        {(
          [
            "meetup",
            "sport",
            "study",
            "cowork",
            "tournament",
            "custom",
          ] as const
        ).map((item) => (
          <Pressable key={item} onPress={() => setIntent(item)}>
            <Pill selected={intent === item}>
              {item === "custom"
                ? "Custom"
                : item[0].toUpperCase() + item.slice(1)}
            </Pill>
          </Pressable>
        ))}
      </View>
      {intent === "custom" ? (
        <Field
          label="Custom intent"
          value={customIntent}
          onChangeText={setCustomIntent}
          placeholder="e.g. Photography walk"
        />
      ) : null}
      <Field
        label="Start date and time"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DDTHH:mm"
        inputType="datetime-local"
        isValid={Number.isFinite(startTimestamp)}
      />
      <Field
        label="End date and time"
        value={endDate}
        onChangeText={setEndDate}
        placeholder="YYYY-MM-DDTHH:mm"
        inputType="datetime-local"
        isValid={
          Number.isFinite(endTimestamp) &&
          Number.isFinite(startTimestamp) &&
          endTimestamp > startTimestamp
        }
      />
      <Field
        label="Registration closes"
        value={closesDate}
        onChangeText={setClosesDate}
        placeholder="YYYY-MM-DDTHH:mm"
        inputType="datetime-local"
        isValid={
          Number.isFinite(closesTimestamp) &&
          Number.isFinite(startTimestamp) &&
          closesTimestamp <= startTimestamp
        }
      />
      <Field
        label="Location"
        value={location}
        onChangeText={setLocation}
        placeholder="Venue, area, or online link"
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="What will people do, who should join, and what should they bring?"
      />
      <Field
        label="Contribution"
        value={price}
        onChangeText={setPrice}
        placeholder="Free or ₹350"
      />
      <Field
        label="Capacity"
        value={capacity}
        onChangeText={setCapacity}
        placeholder="20"
      />
      <Text style={styles.label}>Visibility</Text>
      <View style={styles.wrap}>
        {(["public", "community", "private"] as const).map((item) => (
          <Pressable key={item} onPress={() => setVisibility(item)}>
            <Pill selected={visibility === item}>
              {item[0].toUpperCase() + item.slice(1)}
            </Pill>
          </Pressable>
        ))}
      </View>
      {visibility === "community" ? (
        <>
          <Text style={styles.label}>Community</Text>
          <View style={styles.wrap}>
            {data.communities
              .filter((item) => item.membership !== "none")
              .map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setCommunityId(item.id)}
                >
                  <Pill selected={communityId === item.id}>{item.name}</Pill>
                </Pressable>
              ))}
          </View>
        </>
      ) : null}
      <Text style={styles.label}>Joining</Text>
      <View style={styles.wrap}>
        {(["direct", "approval"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={
              item === "direct" ? "Join instantly" : "Host approval"
            }
            accessibilityState={{ selected: joinType === item }}
            onPress={() => setJoinType(item)}
          >
            <Pill selected={joinType === item}>
              {item === "direct" ? "Join instantly" : "Host approval"}
            </Pill>
          </Pressable>
        ))}
      </View>
      <View style={styles.rowBetween}>
        <Button
          label={draftSaved ? "Draft Saved" : "Save Draft"}
          icon="document-text"
          variant="outline"
          onPress={() => save("draft")}
          disabled={!valid || publishing}
        />
        <Button
          label={
            publishing ? "Publishing..." : draftId ? "Publish" : "Continue"
          }
          icon="arrow-forward"
          onPress={() => save("published")}
          disabled={!valid || publishing}
        />
      </View>
      {!valid ? (
        <Text style={styles.error}>
          Validation: complete the required text, dates, capacity, visibility,
          and joining method.
        </Text>
      ) : (
        <Text style={styles.success}>Ready to continue.</Text>
      )}
      <View style={{ height: Platform.OS === "web" ? 116 : 32 }} />
    </ScreenFrame>
  );
}

function PostVibeScreen({
  data,
  setData,
  go,
  back,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
  back: () => void;
}) {
  const [text, setText] = useState("");
  const [mediaUri, setMediaUri] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [selectedActivityId, setSelectedActivityId] = useState(
    data.activities[0]?.id || "",
  );
  const [posting, setPosting] = useState(false);
  const hasEvents = data.activities.length > 0;
  const selectedActivity =
    data.activities.find((item) => item.id === selectedActivityId) ||
    data.activities[0];
  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const isVideo =
        asset.type === "video" ||
        asset.mimeType?.startsWith("video/") ||
        /\.(mp4|m4v|mov|webm)$/i.test(asset.fileName ?? asset.uri);
      setMediaUri(asset.uri);
      setMediaType(isVideo ? "video" : "image");
    }
  };
  const post = async () => {
    if (!hasEvents || text.trim().length < 8) {
      Alert.alert(
        "Post Vibe",
        hasEvents
          ? "Write a little more before posting."
          : "Join or host an activity first.",
      );
      return;
    }
    if (!mediaUri)
      return Alert.alert(
        "Add media",
        "Choose a photo or short video for this vibe.",
      );
    setPosting(true);
    try {
      let id = `v${Date.now()}`;
      let remoteMedia = mediaUri;
      if (isSupabaseConfigured && data.mode === "authenticated") {
        const created: { id: string; media_url: string } = await vibeService.create({
          caption: text.trim(),
          mediaUri,
          mediaType,
          activityId: isBackendId(selectedActivity.id)
            ? selectedActivity.id
            : undefined,
        });
        id = created.id;
        remoteMedia = created.media_url;
      }
      setData((d) => ({
        ...d,
        vibes: [
          {
            id,
            author: d.name,
            event: selectedActivity.title,
            text: text.trim(),
            likes: 0,
            saved: false,
            mediaUrl: remoteMedia,
            mediaType,
            comments: [],
            mine: true,
          },
          ...d.vibes,
        ],
        nitro: d.nitro + 15,
      }));
      go("vibes");
    } catch (caught) {
      Alert.alert(
        "Could not post vibe",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setPosting(false);
    }
  };
  return (
    <ScreenFrame
      title="Post Vibe"
      subtitle="Share a real moment from an activity with people nearby."
      onBack={back}
    >
      {!hasEvents ? (
        <View style={styles.empty}>
          <Icon name="calendar-clear" size={40} />
          <Text style={styles.cardTitle}>No joined or hosted events yet</Text>
          <Text style={styles.meta}>
            Create or join an activity before posting event-linked vibes.
          </Text>
          <Button
            label="Create Activity"
            icon="add-circle"
            onPress={() => go("createActivity")}
          />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Choose an activity</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.activityPickerRow}>
                {data.activities.map((activity) => (
                  <Pressable
                    key={activity.id}
                    onPress={() => setSelectedActivityId(activity.id)}
                    style={[
                      styles.activityPickerChip,
                      selectedActivity.id === activity.id &&
                        styles.activityPickerChipActive,
                    ]}
                  >
                    <Image
                      source={mediaSource(activity.image)}
                      style={styles.activityPickerImage}
                    />
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.activityPickerText,
                        selectedActivity.id === activity.id &&
                          styles.activityPickerTextActive,
                      ]}
                    >
                      {activity.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.meta}>
              {selectedActivity.when} · {selectedActivity.where}
            </Text>
          </View>
          <Pressable style={styles.photoDrop} onPress={pickMedia}>
            {mediaUri ? (
              mediaType === "video" ? (
                <ReelVideo uri={mediaUri} muted />
              ) : (
                <Image source={{ uri: mediaUri }} style={styles.postImage} />
              )
            ) : (
              <>
                <Icon name="images-outline" size={34} />
                <Text style={styles.cardTitle}>Add photo or video</Text>
                <Text style={styles.meta}>Up to 60 seconds for video</Text>
              </>
            )}
          </Pressable>
          <Field
            label="Vibe"
            value={text}
            onChangeText={setText}
            multiline
            placeholder="What is the update, request, or moment?"
          />
          <View style={styles.rowBetween}>
            <Text style={styles.meta}>Public · Visible in Nearby</Text>
            <Text style={styles.meta}>{text.length}/2200</Text>
          </View>
          <Button
            label={posting ? "Posting..." : "Post Vibe"}
            icon="radio"
            onPress={post}
          />
        </>
      )}
    </ScreenFrame>
  );
}

function CreateCommunityScreen({
  data,
  setData,
  back,
  openCommunity,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
  openCommunity: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState(
    "Be respectful to others\nNo spam or self-promotion\nNo hate speech or harassment\nKeep content relevant to the community",
  );
  const [image, setImage] = useState("");
  const [cover, setCover] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const nameLength = name.trim().length;
  const descriptionLength = description.trim().length;
  const rulesLength = rules.trim().length;
  const nameValid = nameLength >= 3;
  const categoryValid = Boolean(category);
  const descriptionValid = descriptionLength >= 20;
  const rulesValid = rulesLength >= 10;
  const valid =
    nameValid && categoryValid && descriptionValid && rulesValid;
  const Requirement = ({ valid: requirementValid, text }: { valid: boolean; text: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6 }}>
      <Icon name={requirementValid ? "checkmark-circle" : "information-circle-outline"} color={requirementValid ? "#13A66B" : "#D64545"} size={16} />
      <Text style={[styles.communityHelp, { color: requirementValid ? "#137A55" : "#B42318", marginTop: 0 }]}>{text}</Text>
    </View>
  );
  const pickImage = async (kind: "image" | "cover") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
      allowsEditing: true,
      aspect: kind === "image" ? [1, 1] : [16, 7],
    });
    if (!result.canceled && result.assets[0]?.uri)
      (kind === "image" ? setImage : setCover)(result.assets[0].uri);
  };
  const create = async () => {
    if (!valid)
      return Alert.alert(
        "Complete required fields",
        "Add a title, category, description, and community rules.",
      );
    setCreating(true);
    try {
      const parsedRules = rules
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const id = isSupabaseConfigured
        ? await communityService.create({
            name: name.trim(),
            tagline: description.trim().slice(0, 160),
            description: description.trim(),
            category,
            tags: [category, "Local", "New"],
            rules: parsedRules,
            visibility: "public",
            imageUri: image,
            coverUri: cover,
          })
        : `c${Date.now()}`;
      const community: Community = {
        id,
        name: name.trim(),
        tagline: description.trim(),
        category,
        tags: [category, "Local", "New"],
        memberCount: 1,
        onlineCount: 1,
        visibility: "Public",
        membership: "created",
        image: image || communityFallbackCover,
        cover: cover || communityFallbackCover,
        rules: parsedRules,
        posts: [],
      };
      setData((current) => ({
        ...current,
        communities: [community, ...current.communities],
      }));
      setCreatedId(id);
    } catch (caught) {
      Alert.alert(
        "Could not create community",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };
  return (
    <SafeAreaView style={styles.communitySafe}>
      <ScrollView
        contentContainerStyle={styles.communityCreateScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.communityCreateHeader}>
          <Pressable onPress={back} style={styles.communityBack}>
            <Icon name="arrow-back" color="#fff" size={26} />
          </Pressable>
          <View>
            <Text style={styles.communityCreateTitle}>Create Community</Text>
            <Text style={styles.communityCreateSubtitle}>
              Build a space for like-minded people
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.communityLabel}>
          Community Title <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.communityInputRow}>
          <TextInput
            value={name}
            onChangeText={(value) => setName(value.slice(0, 80))}
            placeholder="Enter community name"
            placeholderTextColor="#7D8798"
            style={styles.communityInput}
          />
          <Text style={styles.counter}>{name.length}/80</Text>
        </View>
        <Text style={styles.communityHelp}>
          Choose a name that represents your community
        </Text>
        <Requirement valid={nameValid} text={nameValid ? "At least 3 characters" : `${3 - nameLength} more character${3 - nameLength === 1 ? "" : "s"} required`} />
        <Text style={styles.communityLabel}>
          Category <Text style={styles.required}>*</Text>
        </Text>
        <Pressable
          style={styles.communitySelect}
          onPress={() => setCategoryOpen(!categoryOpen)}
        >
          <Icon name="grid-outline" color="#4E46E5" />
          <Text
            style={[
              styles.communitySelectText,
              !category && styles.communityPlaceholder,
            ]}
          >
            {category || "Select category"}
          </Text>
          <Icon
            name={categoryOpen ? "chevron-up" : "chevron-down"}
            color="#9AA4B5"
          />
        </Pressable>
        {categoryOpen ? (
          <View style={styles.categoryMenu}>
            {[
              "Travel",
              "Sports",
              "Food & Drinks",
              "Music",
              "Social",
              "Professional",
            ].map((item) => (
              <Pressable
                key={item}
                style={styles.categoryOption}
                onPress={() => {
                  setCategory(item);
                  setCategoryOpen(false);
                }}
              >
                <Text style={styles.categoryOptionText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.communityHelp}>
          Choose the category that best fits your community
        </Text>
        <Requirement valid={categoryValid} text={categoryValid ? "Category selected" : "Select one category"} />
        <Text style={styles.communityLabel}>
          Description <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.communityTextAreaWrap}>
          <TextInput
            value={description}
            onChangeText={(value) => setDescription(value.slice(0, 500))}
            multiline
            placeholder="Tell people what your community is about..."
            placeholderTextColor="#7D8798"
            style={styles.communityTextArea}
          />
          <Text style={styles.counter}>{description.length}/500</Text>
        </View>
        <Text style={styles.communityHelp}>
          A clear description helps people understand your community
        </Text>
        <Requirement valid={descriptionValid} text={descriptionValid ? "At least 20 characters" : `${20 - descriptionLength} more character${20 - descriptionLength === 1 ? "" : "s"} required`} />
        <Text style={styles.communityLabel}>
          Community Image <Text style={styles.meta}>(optional)</Text>
        </Text>
        <Text style={styles.communityHelp}>
          This image will represent your community
        </Text>
        <Pressable
          style={styles.roundUploader}
          onPress={() => pickImage("image")}
        >
          <Image source={{ uri: image }} style={styles.uploadPreview} />
          <View style={styles.uploadEdit}>
            <Icon name="camera" color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.uploadTitle}>Upload Image</Text>
        <Text style={styles.communityHelpCenter}>JPG, PNG (Max. 5MB)</Text>
        <Text style={styles.communityLabel}>
          Community Cover Image <Text style={styles.meta}>(optional)</Text>
        </Text>
        <Text style={styles.communityHelp}>
          This cover image will appear at the top of your community
        </Text>
        <Pressable
          style={styles.coverUploader}
          onPress={() => pickImage("cover")}
        >
          <Image source={{ uri: cover }} style={styles.coverUploadImage} />
          <View style={styles.coverUploadShade} />
          <Icon name="images-outline" color="#4E46E5" size={37} />
          <Text style={styles.uploadTitle}>Upload Cover Image</Text>
          <Text style={styles.communityHelpCenter}>JPG, PNG (Max. 10MB)</Text>
        </Pressable>
        <Text style={styles.communityLabel}>
          Rules <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.communityHelp}>
          Set clear rules and guidelines for your community
        </Text>
        <View style={styles.rulesWrap}>
          <View style={styles.rulesTitle}>
            <Icon name="shield-outline" color="#4E46E5" />
            <Text style={styles.rulesTitleText}>Community Rules</Text>
          </View>
          <TextInput
            value={rules}
            onChangeText={(value) => setRules(value.slice(0, 1000))}
            multiline
            style={styles.rulesInput}
          />
          <Text style={styles.counter}>{rules.length}/1000</Text>
        </View>
        <Requirement valid={rulesValid} text={rulesValid ? "At least 10 characters" : `${10 - rulesLength} more character${10 - rulesLength === 1 ? "" : "s"} required`} />
        <Pressable
          onPress={create}
          disabled={!valid || creating}
          style={[
            styles.communityPrimary,
            (!valid || creating) && styles.communityPrimaryDisabled,
          ]}
        >
          <Text style={styles.communityPrimaryText}>
            {creating ? "Creating Community..." : "Create Community"}
          </Text>
        </Pressable>
      </ScrollView>
      {createdId ? (
        <View style={styles.successOverlay}>
          <View style={styles.successModal}>
            <Pressable
              style={styles.successClose}
              onPress={() => setCreatedId(null)}
            >
              <Icon name="close" color="#fff" />
            </Pressable>
            <View style={styles.successMark}>
              <Icon name="checkmark" color="#fff" size={42} />
            </View>
            <Text style={styles.successTitle}>Community Created!</Text>
            <Text style={styles.successText}>
              Your community has been created successfully.
            </Text>
            <View style={styles.successCommunity}>
              <Image source={{ uri: image || communityFallbackCover }} style={styles.successAvatar} />
              <View style={styles.messageBody}>
                <Text style={styles.successCommunityName}>{name}</Text>
                <Text style={styles.successCategory}>{category}</Text>
                <Text style={styles.successTextSmall}>
                  Be the first member and grow your community!
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.communityPrimary}
              onPress={() => openCommunity(createdId)}
            >
              <Text style={styles.communityPrimaryText}>View Community</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ActivityDetailScreen({
  activity,
  data,
  setData,
  back,
  go,
  openActivity,
  openProfile,
}: {
  activity: Activity;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
  go: (screen: Screen) => void;
  openActivity: (id: string) => void;
  openProfile: (id: string) => void;
}) {
  const isPaidActivity = activity.price !== "Free" && Number(activity.price.replace(/[^0-9.]/g, "")) > 0;
  const [paymentState, setPaymentState] = useState<
    "idle" | "pending" | "paid" | "failed"
  >("idle");
  const [joined, setJoined] = useState(
    ["going", "paid"].includes(String(activity.viewerStatus)) ||
      (!isPaidActivity && activity.viewerStatus === "approved"),
  );
  const [joining, setJoining] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<ActivityCommentView[]>([]);
  const [participants, setParticipants] = useState<ActivityParticipantView[]>(
    [],
  );
  const [isHost, setIsHost] = useState(false);
  const [joinType, setJoinType] = useState<"direct" | "approval">("direct");
  const [viewerStatus, setViewerStatus] = useState<string | null>(
    activity.viewerStatus ?? null,
  );
  const [loadingDetails, setLoadingDetails] = useState(false);
  const reactionId = activityReactionId(activity.id);
  const liked = data.likedIds.includes(reactionId);
  const saved = data.savedIds.includes(reactionId);
  const requestPending = ["pending", "waitlist"].includes(String(viewerStatus));
  const paymentRequired =
    isPaidActivity &&
    ["payment_required", "approved_pending_payment", "payment_pending", "payment_failed"].includes(
      String(viewerStatus),
    );
  const activityEnded = activity.status === "completed" || Boolean(activity.endsAt && Date.parse(activity.endsAt) <= Date.now());
  const registrationClosed = !joined && !requestPending && (activityEnded || Boolean(activity.registrationClosesAt && Date.parse(activity.registrationClosesAt) <= Date.now()));
  const refreshDetails = async () => {
    if (!isSupabaseConfigured || !isBackendId(activity.id)) return;
    setLoadingDetails(true);
    try {
      const details = await activityService.getDetails(activity.id);
      const refreshed = activityFromRemote(details.activity);
      setParticipants(details.participants);
      setComments(details.comments);
      setIsHost(details.isHost);
      setJoinType(details.joinType === "approval" ? "approval" : "direct");
      setViewerStatus(details.viewerStatus);
      setJoined(details.viewerStatus === "going");
      setData((current) => ({
        ...current,
        likedIds: details.liked
          ? [...new Set([...current.likedIds, reactionId])]
          : current.likedIds.filter((id) => id !== reactionId),
        savedIds: details.saved
          ? [...new Set([...current.savedIds, reactionId])]
          : current.savedIds.filter((id) => id !== reactionId),
        activities: current.activities.map((item) =>
          item.id === activity.id ? refreshed : item,
        ),
      }));
    } catch (caught) {
      Alert.alert(
        "Activity details could not load",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setLoadingDetails(false);
    }
  };
  useEffect(() => {
    void refreshDetails();
  }, [activity.id]);
  useEffect(() => {
    if (!isSupabaseConfigured || !isBackendId(activity.id)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = activityService.subscribe(activity.id, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshDetails(), 180);
    });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [activity.id]);
  const completePayment = async () => {
    setPaymentState("pending");
    try {
      const order = await createActivityPayment(activity.id);
      const paymentSessionId = runtimeString(order, [
        "paymentSessionId",
        "payment_session_id",
      ]);
      const orderId = runtimeString(order, ["orderId", "order_id"]);
      if (!paymentSessionId || !orderId) {
        throw new Error("Payment order did not return the required identifiers.");
      }
      const returnUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.href
          : "wenitro://payment-return";
      await launchCashfreeCheckout(paymentSessionId, returnUrl);
      const verification = await verifyActivityPayment(orderId);
      const status = runtimeString(verification, ["status", "paymentStatus", "payment_status"]);
      if (!status || !["paid", "success", "completed"].includes(status.toLowerCase())) {
        throw new Error("Cashfree has not verified this payment yet.");
      }
      setPaymentState("paid");
      setViewerStatus("paid");
      setJoined(true);
      await refreshDetails();
      return "paid";
    } catch (error) {
      setPaymentState("failed");
      throw error;
    }
  };
  const join = async () => {
    if (joining) return;
    if (registrationClosed) {
      Alert.alert(activityEnded ? "Activity ended" : "Registration closed", activityEnded ? "This activity has already ended." : "The host is no longer accepting registrations for this activity.");
      return;
    }
    setJoining(true);
    try {
      const leaving = joined || requestPending;
      let nextStatus: string | null = null;
      if (!isSupabaseConfigured)
        throw new Error("Supabase is not configured for this build.");
      if (!isBackendId(activity.id))
        throw new Error("This activity is not connected to WeNitro yet.");
      if (leaving) await activityService.leave(activity.id);
      else if (isPaidActivity && (joinType === "direct" || paymentRequired)) {
        nextStatus = await completePayment();
      } else {
        const participation = await activityService.join(activity.id);
        nextStatus = String(participation.status);
      }
      const nextJoined =
        ["going", "paid"].includes(String(nextStatus)) ||
        (!isPaidActivity && nextStatus === "approved");
      setViewerStatus(nextStatus);
      setJoined(nextJoined);
      setData((current) => ({
        ...current,
        activities: current.activities.map((item) =>
          item.id === activity.id
            ? {
                ...item,
                joined: Math.min(
                    item.joined +
                      (joined && !nextJoined ? -1 : !joined && nextJoined ? 1 : 0),
                    item.seats,
                  ),
                viewerStatus: nextStatus as Activity["viewerStatus"],
              }
            : item,
        ),
      }));
      if (isSupabaseConfigured) void refreshDetails();
    } catch (caught) {
      Alert.alert(
        joined || requestPending
          ? "Could not leave activity"
          : "Could not join activity",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setJoining(false);
    }
  };
  const toggleLike = async () => {
    try {
      if (isSupabaseConfigured) {
        if (!isBackendId(activity.id))
          throw new Error("This activity is not connected to WeNitro yet.");
        await activityService.setLiked(activity.id, !liked);
      }
      setData((current) => ({
        ...current,
        likedIds: liked
          ? current.likedIds.filter((id) => id !== reactionId)
          : [...current.likedIds, reactionId],
      }));
    } catch (caught) {
      Alert.alert(
        "Like not saved",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const toggleSave = async () => {
    try {
      if (isSupabaseConfigured)
        await activityService.setSaved(activity.id, !saved);
      setData((current) => ({
        ...current,
        savedIds: saved
          ? current.savedIds.filter((id) => id !== reactionId)
          : [...current.savedIds, reactionId],
      }));
    } catch (caught) {
      Alert.alert(
        "Save not synced",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const submitComment = async () => {
    const body = comment.trim();
    if (!body) return;
    try {
      if (isSupabaseConfigured) {
        const created = await activityService.addComment(activity.id, body);
        setComments((current) => [
          ...current,
          {
            id: created.id,
            author:
              created.author?.fullName ??
              created.author?.username ??
              data.name,
            body: created.body,
            createdAt: created.createdAt,
          },
        ]);
      } else {
        setComments((current) => [
          ...current,
          {
            id: `comment-${Date.now()}`,
            author: data.name,
            body,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setComment("");
    } catch (caught) {
      Alert.alert(
        "Comment not posted",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const respondToParticipant = async (
    participant: ActivityParticipantView,
    status: "approved" | "rejected",
  ) => {
    try {
      await activityService.respondJoin(
        activity.id,
        participant.userId,
        status,
      );
      await refreshDetails();
    } catch (caught) {
      Alert.alert(
        "Participant not updated",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const cancelActivity = async () => {
    try {
      await activityService.cancel(activity.id);
      setData((current) => ({
        ...current,
        activities: current.activities.map((item) =>
          item.id === activity.id ? { ...item, status: "cancelled" } : item,
        ),
      }));
      Alert.alert(
        "Activity cancelled",
        "Participants will no longer be able to join.",
      );
    } catch (caught) {
      Alert.alert(
        "Activity not cancelled",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.detailScreen}>
        <View style={styles.detailHero}>
          <Image
            source={{ uri: activity.image }}
            style={styles.detailHeroImage}
          />
          <LinearGradient
            colors={["rgba(0,0,0,.35)", "transparent", "rgba(0,0,0,.46)"]}
            style={styles.detailHeroShade}
          />
          <Pressable style={styles.detailBack} onPress={back}>
            <Icon name="arrow-back" color="#fff" />
          </Pressable>
          <View style={styles.detailTopActions}>
            <Pressable style={styles.detailRound} onPress={() => requestInternalShare({ kind: "activity", id: activity.id, title: activity.title, preview: `${activity.when} · ${activity.where}` })}>
              <Icon name="share-outline" />
            </Pressable>
            <Pressable style={styles.detailRound}>
              <Icon name="chatbubble-ellipses-outline" />
            </Pressable>
          </View>
          <View style={styles.detailCategory}>
            <Icon name="sparkles" size={13} />
            <Text style={styles.discoveryTagText}>{activity.category}</Text>
          </View>
          <View style={styles.detailPeople}>
            <AvatarStack count={activity.joined} />
          </View>
        </View>
        <View style={styles.detailContent}>
          <View style={styles.rowBetween}>
            <View style={styles.detailTitleWrap}>
              <Text style={styles.detailTitle}>{activity.title}</Text>
              <View style={styles.detailTags}>
                <Text style={styles.detailTagText}>{activity.category}</Text>
                <Text style={styles.detailTagText}>
                  • {activity.activityType || "meetup"}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.detailBookmark}
              onPress={toggleSave}
            >
              <Icon
                name={saved ? "bookmark" : "bookmark-outline"}
              />
            </Pressable>
          </View>
          <View style={styles.scheduleCard}>
            {[
              ["calendar-outline", "Start", activity.when, colors.purple600],
              [
                "calendar-outline",
                "End",
                activity.end ?? "Today, 8:30 PM",
                colors.purple600,
              ],
              [
                "calendar-outline",
                "Registration closes",
                activity.closes ?? "Today, 5:30 PM",
                "#F04463",
              ],
            ].map(([icon, label, value, color]) => (
              <View key={label} style={styles.scheduleItem}>
                <Icon name={icon as IconName} color={color} />
                <View>
                  <Text style={styles.scheduleLabel}>{label}</Text>
                  <Text style={[styles.scheduleValue, { color }]}>{value}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.locationBar}>
            <View style={styles.row}>
              <Icon name="location-outline" />
              <Text style={styles.metaStrong}>{activity.where}</Text>
            </View>
            <Text style={styles.link}>View on map</Text>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>About this activity</Text>
            <Text style={styles.detailBody}>{activity.description}</Text>
            <View style={styles.detailChipRow}>
              {[
                activity.category,
                activity.activityType,
                activity.visibility,
              ].filter(Boolean).map((label) => (
                <Pill key={label}>{label}</Pill>
              ))}
            </View>
          </View>
          <View style={styles.hostSection}>
            <Pressable
              disabled={!activity.ownerId}
              onPress={() => activity.ownerId && openProfile(activity.ownerId)}
            >
              <Image source={{ uri: activity.hostAvatar ?? neutralAvatar }} style={styles.hostLargeAvatar} />
            </Pressable>
            <Pressable
              disabled={!activity.ownerId}
              onPress={() => activity.ownerId && openProfile(activity.ownerId)}
              style={styles.messageBody}
            >
              <Text style={styles.scheduleLabel}>Hosted by</Text>
              <View style={styles.row}>
                <Text style={styles.hostName}>{activity.host}</Text>
                <Icon name="checkmark-circle" size={15} />
              </View>
              <Text style={styles.meta}>
                WeNitro activity host
              </Text>
            </Pressable>
            <Pressable
              disabled={!activity.ownerId}
              onPress={() => activity.ownerId && openProfile(activity.ownerId)}
              style={styles.hostProfileButton}
            >
              <Text style={styles.link}>View Host Profile</Text>
            </Pressable>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>
              Participants ({participants.length})
            </Text>
            <View style={styles.rowBetween}>
              <AvatarStack
                count={Math.min(Math.max(participants.length, 1), 5)}
                extra={Math.max(participants.length - 5, 0)}
              />
              <View style={styles.row}>
                <Icon name="people-outline" />
                <Text style={styles.link}>
                  {activity.joined} participants joined
                </Text>
              </View>
            </View>
            {loadingDetails ? (
              <ActivityIndicator color={colors.purple600} />
            ) : null}
            {participants.map((participant) => (
              <View key={participant.id} style={styles.rowBetween}>
                <View style={styles.row}>
                  <Image
                    source={mediaSource(participant.avatarUrl || (runtimeString(participant, ["avatar", "profileImage", "profile_image"]) ?? neutralAvatar))}
                    style={styles.commentAvatar}
                  />
                  <View>
                    <Text style={styles.metaStrong}>{participant.name}</Text>
                    <Text style={styles.meta}>
                      @{participant.username} · {participant.status}
                    </Text>
                  </View>
                </View>
                {isHost && participant.status === "pending" ? (
                  <View style={styles.row}>
                    <Pressable
                      style={styles.smallPrimary}
                      onPress={() =>
                        respondToParticipant(participant, "approved")
                      }
                    >
                      <Text style={styles.smallPrimaryText}>Approve</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        respondToParticipant(participant, "rejected")
                      }
                    >
                      <Text style={styles.error}>Reject</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {isHost && activity.status !== "cancelled" ? (
              <Pressable onPress={cancelActivity}>
                <Text style={styles.error}>Cancel activity</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.termsCard}>
            <Icon name="shield-checkmark-outline" />
            <View style={styles.messageBody}>
              <Text style={styles.detailSectionTitle}>
                Terms & Conditions by Host
              </Text>
              <Text style={styles.meta}>
                Be respectful, no distractions, be on time and cancel in advance
                if you can’t make it. <Text style={styles.link}>Read more</Text>
              </Text>
            </View>
            <Icon name="chevron-down" />
          </View>
          <View style={styles.detailSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.detailSectionTitle}>
                Comments ({comments.length})
              </Text>
            </View>
            <View style={styles.commentBar}>
              <Image source={{ uri: activity.hostAvatar ?? neutralAvatar }} style={styles.commentAvatar} />
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment..."
                style={styles.commentInput}
              />
              <Pressable onPress={submitComment}>
                <Icon name="send" />
              </Pressable>
            </View>
            {comments.map((item) => (
              <View key={item.id} style={styles.vibeComment}>
                <View style={styles.messageBody}>
                  <Text style={styles.metaStrong}>{item.author}</Text>
                  <Text style={styles.meta}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.vibeAddCard}>
            <View style={styles.vibeAddIcon}>
              <Icon name="people" color="#fff" />
            </View>
            <View style={styles.messageBody}>
              <Text style={styles.cardTitle}>Add Activity Vibes</Text>
              <Text style={styles.meta}>
                Share moments, photos or videos from this activity
              </Text>
            </View>
            <Pressable style={styles.smallPrimary} onPress={() => go("postVibe")}>
              <Text style={styles.smallPrimaryText}>Add Vibe</Text>
            </Pressable>
          </View>
          <SectionTitle title="More Activities" action="See all" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendedRow}
          >
            {data.activities
              .filter((item) => item.id !== activity.id)
              .map((item) => (
                <Pressable key={item.id} style={styles.recommendedCard} onPress={() => openActivity(item.id)}>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.recommendedImage}
                  />
                  <Text style={styles.recommendedTitle}>{item.title}</Text>
                  <Text style={styles.meta}>{item.when}</Text>
                </Pressable>
              ))}
          </ScrollView>
          <View style={styles.detailBottomActions}>
            <Pressable
              style={[styles.likeButton, liked && styles.likeButtonActive]}
              onPress={toggleLike}
            >
              <Icon name={liked ? "heart" : "heart-outline"} />
              <Text style={styles.likeButtonText}>Like</Text>
            </Pressable>
            {isHost ? (
              <View style={styles.joinButtonLarge}>
                <Text style={styles.joinButtonText}>You're hosting</Text>
                <Icon name="shield-checkmark" color="#fff" />
              </View>
            ) : (
              <Pressable
                style={styles.joinButtonLarge}
                onPress={join}
                disabled={joining || registrationClosed}
              >
              <Text style={styles.joinButtonText}>
                {registrationClosed
                  ? activityEnded ? "Activity Ended" : "Registration Closed"
                  : joining || paymentState === "pending"
                  ? isPaidActivity ? "Opening Cashfree..." : "Saving..."
                  : requestPending
                    ? "Withdraw Request"
                    : joined
                      ? "Leave Activity"
                      : paymentRequired || (isPaidActivity && joinType === "direct")
                        ? paymentState === "failed" ? "Retry Payment" : "Pay & Join"
                      : joinType === "approval"
                        ? "Request to Join"
                        : "Join Activity"}
              </Text>
              <Icon
                name={
                  requestPending
                    ? "time-outline"
                    : joined
                      ? "checkmark-circle"
                      : "arrow-forward-circle-outline"
                }
                color="#fff"
              />
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatScreen({
  data,
  setData,
  initialConversationId,
  onConversationChange,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  initialConversationId?: string | null;
  onConversationChange?: (id: string | null) => void;
}) {
  const [activeSegment, setActiveSegment] = useState<
    "All" | "People" | "Groups"
  >("All");
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialConversationId ?? null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [chatStatus, setChatStatus] = useState("offline");
  const [typing, setTyping] = useState(false);
  const [messageCursors, setMessageCursors] = useState<
    Record<string, { createdAt: string; id: number } | null | undefined>
  >({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const chatSubscription = useRef<Awaited<
    ReturnType<typeof realtimeChatService.subscribeToConversation>
  > | null>(null);
  const storyGroups = Array.from(
    data.stories
      .slice()
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .reduce((groups, story) => {
        const authorKey = story.authorId || (story.mine ? `mine:${data.userId}` : `name:${story.name}`);
        const existing = groups.get(authorKey) || [];
        existing.push(story);
        groups.set(authorKey, existing);
        return groups;
      }, new Map<string, ChatStory[]>()),
  )
    .map(([authorId, stories]) => ({ authorId, stories }))
    .sort((a, b) =>
      String(b.stories.at(-1)?.createdAt || "").localeCompare(
        String(a.stories.at(-1)?.createdAt || ""),
      ),
    );
  const activeStoryGroup = storyGroups.find((group) =>
    group.stories.some((story) => story.id === activeStoryId),
  );
  const activeStoryIndex = activeStoryGroup?.stories.findIndex(
    (story) => story.id === activeStoryId,
  ) ?? -1;
  const activeStory = activeStoryGroup?.stories[activeStoryIndex];
  const selected = data.conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const peopleConversations = data.conversations.filter(
    (conversation) => conversation.type === "People",
  );
  const discoverablePeople = data.people.filter((person) =>
    `${person.name} ${person.username} ${person.bio} ${person.location}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleConversations = data.conversations
    .filter(
      (conversation) =>
        (activeSegment === "All" || conversation.type === activeSegment) &&
        conversation.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")),
    );
  const updateConversation = (
    id: string,
    transform: (conversation: ChatConversation) => ChatConversation,
  ) =>
    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === id ? transform(conversation) : conversation,
      ),
    }));
  const persistConversationRead = async (id: string) => {
    if (!isSupabaseConfigured || !isBackendId(id)) return;
    try {
      await realtimeChatService.markConversationRead(Number(id));
      updateConversation(id, (conversation) => ({
        ...conversation,
        unread: 0,
      }));
    } catch (caught) {
      setChatStatus(
        caught instanceof Error ? caught.message : "Unable to mark chat read",
      );
      throw caught;
    }
  };
  useEffect(() => {
    setSelectedConversationId(initialConversationId ?? null);
  }, [initialConversationId]);
  useEffect(() => {
    if (
      !selectedConversationId ||
      !isSupabaseConfigured ||
      !isBackendId(selectedConversationId)
    )
      return;
    void persistConversationRead(selectedConversationId).catch(() => undefined);
    let cancelled = false;
    realtimeChatService
      .subscribeToConversation({
        conversationId: Number(selectedConversationId),
        onStatus: setChatStatus,
        onTyping: (event) => setTyping(event.isTyping),
        onPresence: (participants) =>
          updateConversation(selectedConversationId, (conversation) => ({
            ...conversation,
            online: participants.length > 1,
          })),
        onMessageChange: async ({ eventType, message: record, old }) => {
          if (eventType === "DELETE") {
            updateConversation(selectedConversationId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.filter(
                (item) => item.id !== String(old.id),
              ),
            }));
            return;
          }
          if (!record) return;
          const { data: auth } = await supabase.auth.getUser();
          let currentLegacyUserId: number | null = null;
          if (auth.user) {
            const { data: profile } = await supabase
              .from("tbl_users")
              .select("id")
              .eq("auth_user_id", auth.user.id)
              .maybeSingle();
            currentLegacyUserId = profile?.id ?? null;
          }
          const mine = Number(record.sender_id) === currentLegacyUserId;
          const message: ChatMessage = {
            id: String(record.id),
            sender: mine ? "You" : "Member",
            text: String(record.body || ""),
            time: new Date(String(record.created_at)).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            mine,
            image: record.media_signed_url || undefined,
            createdAt: String(record.created_at),
            messageType: record.message_type,
            share: record.share_payload,
          };
          updateConversation(selectedConversationId, (conversation) =>
            conversation.messages.some((item) => item.id === message.id)
              ? conversation
              : {
                  ...conversation,
                  messages: [...conversation.messages, message],
                  unread: 0,
                  lastMessageAt: message.createdAt,
                },
          );
          if (!mine) {
            await persistConversationRead(selectedConversationId).catch(
              () => undefined,
            );
          }
        },
      })
      .then(async (subscription) => {
        if (cancelled) {
          await subscription.cleanup();
          return;
        }
        chatSubscription.current = subscription;
      })
      .catch((caught) =>
        setChatStatus(caught instanceof Error ? caught.message : "reconnecting"),
      );
    return () => {
      cancelled = true;
      setTyping(false);
      const subscription = chatSubscription.current;
      chatSubscription.current = null;
      subscription?.cleanup().catch(() => undefined);
    };
  }, [selectedConversationId]);
  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured) return;
    let active = true;
    const refreshStories = () =>
      storyService
        .list()
        .then((stories) => {
          if (active) setData((current) => ({ ...current, stories }));
        })
        .catch((caught) =>
          active
            ? Alert.alert(
                "Stories unavailable",
                caught instanceof Error ? caught.message : "Please try again.",
              )
            : undefined,
        );
    void refreshStories();
    const channel = storyService.subscribe(refreshStories);
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [data.mode]);
  const loadMessagePage = async (
    id: string,
    cursor?: { createdAt: string; id: number } | null,
  ) => {
    if (!isSupabaseConfigured || !isBackendId(id)) return;
    setLoadingOlder(true);
    try {
      const page = await chatService.loadMessagesPage(id, cursor);
      updateConversation(id, (conversation) => ({
        ...conversation,
        messages: cursor
          ? [
              ...page.items.filter(
                (item) =>
                  !conversation.messages.some(
                    (current) => current.id === item.id,
                  ),
              ),
              ...conversation.messages,
            ]
          : page.items,
      }));
      setMessageCursors((current) => ({
        ...current,
        [id]: page.nextCursor,
      }));
    } catch (caught) {
      Alert.alert(
        "Messages unavailable",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setLoadingOlder(false);
    }
  };
  const openConversation = (id: string) => {
    setSelectedConversationId(id);
    onConversationChange?.(id);
    void persistConversationRead(id).catch(() => undefined);
    if (messageCursors[id] === undefined) void loadMessagePage(id);
  };
  const startDirectChat = async (person: DiscoverablePerson) => {
    const existing = peopleConversations.find(
      (conversation) => conversation.userId === person.id,
    );
    if (existing) return openConversation(existing.id);
    try {
      if (isSupabaseConfigured && !isBackendId(person.id)) {
        throw new Error("This member is not linked to the production chat service.");
      }
      if (!isSupabaseConfigured)
        throw new Error("Supabase is not configured for this build.");
      const id = String(
        await realtimeChatService.createDirectConversation(Number(person.id)),
      );
      const conversation: ChatConversation = {
        id,
        name: person.name,
        type: "People",
        avatar: person.avatar,
        memberCount: 2,
        online: person.online,
        unread: 0,
        userId: person.id,
        messages: [],
      };
      setData((current) => ({
        ...current,
        conversations: [conversation, ...current.conversations],
      }));
      setSelectedConversationId(id);
      onConversationChange?.(id);
    } catch (caught) {
      Alert.alert(
        "Could not start chat",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  const sendMessage = async (image?: string) => {
    if (!selected || (!draft.trim() && !image)) return;
    const body = draft.trim();
    const message: ChatMessage = {
      id: `m${Date.now()}`,
      sender: "You",
      text: body,
      time: "now",
      mine: true,
      image,
      createdAt: new Date().toISOString(),
    };
    updateConversation(selected.id, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, message],
      lastMessageAt: message.createdAt,
    }));
    setDraft("");
    playClickSound();
    if (isSupabaseConfigured && isBackendId(selected.id)) {
      try {
        const created = await chatService.sendMessage(selected.id, body, image);
        updateConversation(selected.id, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((item) =>
            item.id === message.id
              ? {
                  ...item,
                  id: created.id,
                  image: created.media_url || item.image,
                  createdAt: created.created_at,
                }
              : item,
          ),
        }));
      } catch (caught) {
        updateConversation(selected.id, (conversation) => ({
          ...conversation,
          messages: conversation.messages.filter(
            (item) => item.id !== message.id,
          ),
        }));
        setDraft(body);
        Alert.alert(
          "Message not sent",
          caught instanceof Error ? caught.message : "Please retry.",
        );
      }
    }
  };
  const pickMessageMedia = async (kind: "images" | "videos") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind],
      quality: 0.8,
    });
    setAttachmentsOpen(false);
    if (!result.canceled && result.assets[0]?.uri)
      sendMessage(result.assets[0].uri);
  };
  const addPoll = () => {
    setAttachmentsOpen(false);
    setDraft("Poll: Which plan works best?");
  };
  const addStory = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      try {
        const created: {
          id: string;
          media_url: string;
          caption?: string | null;
        } | null = isSupabaseConfigured && data.mode === "authenticated"
          ? await storyService.create(result.assets[0].uri)
          : null;
        setData((current) => ({
          ...current,
          stories: [
            {
              id: created?.id || `s${Date.now()}`,
              name: "Your Story",
              image: created?.media_url || result.assets[0].uri,
              text: created?.caption || "A new WeNitro moment",
              viewed: false,
              mine: true,
              authorId: String(current.userId || "me"),
              authorAvatar: current.avatarUri,
              createdAt: new Date().toISOString(),
            },
            ...current.stories,
          ],
        }));
      } catch (caught) {
        Alert.alert(
          "Story not uploaded",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    }
  };
  const openStory = (id: string) => {
    setActiveStoryId(id);
    setData((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === id ? { ...story, viewed: true } : story,
      ),
    }));
    if (
      data.mode === "authenticated" &&
      isSupabaseConfigured &&
      isBackendId(id)
    )
      storyService.markViewed(id).catch((caught) =>
        Alert.alert(
          "Story view not saved",
          caught instanceof Error ? caught.message : "Please try again.",
        ),
      );
  };
  const markAllStoriesSeen = async () => {
    const unseen = data.stories.filter(
      (story) => !story.viewed && isBackendId(story.id),
    );
    if (data.mode === "authenticated" && isSupabaseConfigured) {
      try {
        await Promise.all(
          unseen.map((story) => storyService.markViewed(story.id)),
        );
      } catch (caught) {
        Alert.alert(
          "Stories not updated",
          caught instanceof Error ? caught.message : "Please try again.",
        );
        return;
      }
    }
    setData((current) => ({
      ...current,
      stories: current.stories.map((story) => ({ ...story, viewed: true })),
    }));
  };
  const nextStory = () => {
    if (!activeStoryGroup || activeStoryIndex < 0) return setActiveStoryId(null);
    const next = activeStoryGroup.stories[activeStoryIndex + 1];
    if (next) openStory(next.id);
    else setActiveStoryId(null);
  };
  const previousStory = () => {
    if (!activeStoryGroup || activeStoryIndex <= 0) return;
    openStory(activeStoryGroup.stories[activeStoryIndex - 1].id);
  };
  const deleteStory = async () => {
    if (!activeStory?.mine) return;
    const remove = async () => {
      try {
        if (
          data.mode === "authenticated" &&
          isSupabaseConfigured &&
          isBackendId(activeStory.id)
        )
          await storyService.delete(activeStory.id);
        setData((current) => ({
          ...current,
          stories: current.stories.filter(
            (story) => story.id !== activeStory.id,
          ),
        }));
        const nextStoryInGroup = activeStoryGroup?.stories.find(
          (story) => story.id !== activeStory.id,
        );
        setActiveStoryId(nextStoryInGroup?.id ?? null);
      } catch (caught) {
        Alert.alert(
          "Story not deleted",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this Story and its uploaded media?")) await remove();
      return;
    }
    Alert.alert("Delete Story?", "This removes the Story and its uploaded media.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove() },
    ]);
  };
  const createGroup = async () => {
    if (groupName.trim().length < 3 || groupMembers.length < 2)
      return Alert.alert(
        "Add group details",
        "Enter a group name and select at least two people.",
      );
    let groupId = `group-${Date.now()}`;
    if (isSupabaseConfigured) {
      const memberIds = data.people
        .filter(
          (person) =>
            groupMembers.includes(person.id) && isBackendId(person.id),
        )
        .map((person) => person.id);
      if (memberIds.length < 2)
        return Alert.alert(
          "Real members required",
          "Select at least two discoverable WeNitro members.",
        );
      try {
        groupId = String(
          await realtimeChatService.createGroupConversation(
            groupName.trim(),
            memberIds.map(Number),
          ),
        );
      } catch (caught) {
        return Alert.alert(
          "Could not create group",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    }
    const group: ChatConversation = {
      id: groupId,
      name: groupName.trim(),
      type: "Groups",
      avatar: neutralMediaPlaceholder,
      memberCount: groupMembers.length + 1,
      online: true,
      unread: 0,
      messages: [
        {
          id: `m${Date.now()}`,
          sender: "WeNitro",
          text: `${data.name} created this group.`,
          time: "now",
          mine: false,
        },
      ],
    };
    setData((current) => ({
      ...current,
      conversations: [group, ...current.conversations],
    }));
    setCreatingGroup(false);
    setGroupName("");
    setGroupMembers([]);
    setActiveSegment("Groups");
    openConversation(group.id);
  };

  if (selected)
    return (
      <SafeAreaView style={styles.chatDarkSafe}>
        <View style={styles.chatThreadHeader}>
          <Pressable
            onPress={() => {
              setSelectedConversationId(null);
              onConversationChange?.(null);
            }}
            style={styles.chatHeaderButton}
          >
            <Icon name="arrow-back" color="#fff" />
          </Pressable>
          <Image
            source={{ uri: selected.avatar }}
            style={styles.chatThreadAvatar}
          />
          <View style={styles.messageBody}>
            <Text style={styles.chatThreadName} numberOfLines={1}>
              {selected.name}
            </Text>
            <Text style={styles.chatThreadStatus}>
              {typing
                ? "typing..."
                : chatStatus !== "SUBSCRIBED" && data.mode === "authenticated"
                  ? "connecting securely..."
                  : selected.type === "Groups"
                ? `${selected.memberCount} members · ${selected.online ? "active now" : "quiet"}`
                : selected.online
                  ? "online"
                  : "last active recently"}
            </Text>
          </View>
        </View>
        <ScrollView
          style={styles.chatThreadScroll}
          contentContainerStyle={styles.chatThreadContent}
        >
          <View style={styles.chatDayPill}>
            <Text style={styles.chatDayText}>Today</Text>
          </View>
          {messageCursors[selected.id] ? (
            <Pressable
              disabled={loadingOlder}
              onPress={() =>
                void loadMessagePage(selected.id, messageCursors[selected.id])
              }
              style={styles.chatDayPill}
            >
              {loadingOlder ? (
                <ActivityIndicator size="small" color="#B7A8FF" />
              ) : (
                <Text style={styles.chatDayText}>Load older messages</Text>
              )}
            </Pressable>
          ) : null}
          {selected.messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.dynamicMessage,
                message.mine && styles.dynamicMessageMine,
              ]}
            >
              {selected.type === "Groups" && !message.mine ? (
                <Text style={styles.dynamicSender}>{message.sender}</Text>
              ) : null}
              {message.image ? (
                <Image
                  source={{ uri: message.image }}
                  style={styles.dynamicMessageImage}
                />
              ) : null}
              {message.share ? (
                <Pressable onPress={() => openSharedContent(message.share!)} style={{ width: 250, overflow: "hidden", borderRadius: 16, backgroundColor: message.mine ? "rgba(255,255,255,.14)" : "#192A40" }}>
                  {message.share.thumbnailUrl ? <Image source={{ uri: message.share.thumbnailUrl }} style={{ width: "100%", height: 112 }} /> : null}
                  <View style={{ padding: 13, gap: 4 }}>
                    <Text style={{ fontFamily: "Manrope_800ExtraBold", fontSize: 11, textTransform: "uppercase", color: "#8FB7FF" }}>{message.share.kind.replaceAll("_", " ")}</Text>
                    <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 16, color: "#fff" }}>{message.share.title}</Text>
                    {message.share.preview ? <Text numberOfLines={2} style={{ fontFamily: "Manrope_400Regular", fontSize: 12, color: "#CFD8E4" }}>{message.share.preview}</Text> : null}
                    <Text style={{ marginTop: 5, fontFamily: "Manrope_700Bold", fontSize: 13, color: "#9CB8FF" }}>View in WeNitro</Text>
                  </View>
                </Pressable>
              ) : null}
              {message.text && !message.share ? (
                <Text
                  style={[
                    styles.dynamicMessageText,
                    message.mine && styles.dynamicMessageTextMine,
                  ]}
                >
                  {message.text}
                </Text>
              ) : null}
              <View style={styles.dynamicMessageMeta}>
                <Text
                  style={[
                    styles.dynamicMessageTime,
                    message.mine && styles.dynamicMessageTimeMine,
                  ]}
                >
                  {message.time}
                </Text>
                {message.mine ? (
                  <Icon name="checkmark-done" color="#B7A8FF" size={14} />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
        {attachmentsOpen ? (
          <View style={styles.attachmentMenu}>
            {(
              [
                ["image-outline", "Photo", "images"],
                ["videocam-outline", "Video", "videos"],
                ["stats-chart-outline", "Poll", "poll"],
              ] as const
            ).map(([icon, label, kind]) => (
              <Pressable
                key={label}
                style={styles.attachmentOption}
                onPress={() =>
                  kind === "poll" ? addPoll() : pickMessageMedia(kind)
                }
              >
                <View style={styles.attachmentIcon}>
                  <Icon name={icon} color="#fff" />
                </View>
                <Text style={styles.attachmentText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.dynamicComposer}>
          <Pressable
            onPress={() => setAttachmentsOpen((current) => !current)}
            style={[
              styles.composerIcon,
              attachmentsOpen && styles.composerIconActive,
            ]}
          >
            <Icon
              name={attachmentsOpen ? "close" : "add"}
              color="#B7C0CE"
              size={24}
            />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              chatSubscription.current?.sendTyping(Boolean(text.trim())).catch(() => undefined);
            }}
            placeholder="Message..."
            placeholderTextColor="#8592A5"
            style={styles.dynamicChatInput}
            multiline
            onKeyPress={(event) => {
              const keyEvent = event.nativeEvent as typeof event.nativeEvent & {
                shiftKey?: boolean;
              };
              if (
                Platform.OS === "web" &&
                keyEvent.key === "Enter" &&
                !keyEvent.shiftKey
              ) {
                (event as unknown as { preventDefault?: () => void }).preventDefault?.();
                void sendMessage();
              }
            }}
          />
          <Pressable
            onPress={() => sendMessage()}
            disabled={!draft.trim()}
            style={[
              styles.dynamicSend,
              !draft.trim() && styles.dynamicSendDisabled,
            ]}
          >
            <Icon name="send" color="#fff" size={19} />
          </Pressable>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.chatDarkSafe}>
      <ScrollView
        contentContainerStyle={styles.dynamicChatScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.dynamicChatHeader}>
          <View>
            <Text style={styles.dynamicChatTitle}>Messages</Text>
            <Text style={styles.dynamicChatSubtitle}>
              Plans become real in the chat.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Create group"
            onPress={() => setCreatingGroup(true)}
            style={styles.newGroupButton}
          >
            <Icon name="people" color="#fff" />
            <View style={styles.newGroupPlus}>
              <Icon name="add" color="#fff" size={11} />
            </View>
          </Pressable>
        </View>
        <View style={styles.dynamicChatSearch}>
          <Icon name="search" color="#8E9AAC" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people and groups"
            placeholderTextColor="#7F8B9D"
            style={styles.dynamicChatSearchInput}
          />
          <Icon name="options-outline" color="#4E46E5" />
        </View>
        <View style={styles.dynamicChatTabs}>
          {(["All", "People", "Groups"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveSegment(tab)}
              style={[
                styles.dynamicChatTab,
                activeSegment === tab && styles.dynamicChatTabActive,
              ]}
            >
              <Text
                style={[
                  styles.dynamicChatTabText,
                  activeSegment === tab && styles.dynamicChatTabTextActive,
                ]}
              >
                {tab}
              </Text>
              <Text style={styles.dynamicChatTabCount}>
                {tab === "All"
                  ? data.conversations.length
                  : tab === "People"
                    ? data.people.length
                    : data.conversations.filter((item) => item.type === tab)
                        .length}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dynamicSectionHeader}>
          <Text style={styles.dynamicSectionTitle}>Stories</Text>
          <Pressable
            onPress={markAllStoriesSeen}
          >
            <Text style={styles.dynamicSectionAction}>Mark all seen</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dynamicStoryRow}
        >
          <Pressable style={styles.dynamicStoryItem} onPress={() => void addStory()}>
            <View style={styles.yourStory}>
              <Image
                source={{ uri: data.avatarUri || neutralAvatar }}
                style={styles.dynamicStoryImage}
              />
              <View style={styles.storyAddBadge}>
                <Icon name="add" color="#fff" size={15} />
              </View>
            </View>
            <Text style={styles.dynamicStoryName}>Add Story</Text>
          </Pressable>
          {storyGroups.map((group) => {
            const story = group.stories.at(-1)!;
            const viewed = group.stories.every((item) => item.viewed);
            return (
              <Pressable
                key={group.authorId}
                style={styles.dynamicStoryItem}
                onPress={() => openStory(group.stories[0].id)}
              >
                <LinearGradient
                  colors={
                    viewed
                      ? ["#344157", "#344157"]
                      : ["#1910C2", "#4E46E5"]
                  }
                  style={styles.dynamicStoryRing}
                >
                  <Image
                    source={
                      story.mediaType === "video"
                        ? { uri: neutralMediaPlaceholder }
                        : { uri: story.image }
                    }
                    style={styles.dynamicStoryImage}
                  />
                </LinearGradient>
                <Text style={styles.dynamicStoryName} numberOfLines={1}>
                  {story.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {activeSegment === "People" ? (
          <>
            <View style={styles.dynamicSectionHeader}>
              <Text style={styles.dynamicSectionTitle}>Discover people</Text>
              <Text style={styles.dynamicSectionMeta}>
                {discoverablePeople.length} nearby
              </Text>
            </View>
            {discoverablePeople.map((person) => (
              <Pressable
                key={person.id}
                style={styles.dynamicConversation}
                onPress={() => startDirectChat(person)}
              >
                <View>
                  <Image
                    source={{ uri: person.avatar }}
                    style={styles.dynamicConversationAvatar}
                  />
                  {person.online ? <View style={styles.dynamicOnline} /> : null}
                </View>
                <View style={styles.messageBody}>
                  <Text style={styles.dynamicConversationName}>
                    {person.name}
                  </Text>
                  <Text
                    style={styles.dynamicConversationPreview}
                    numberOfLines={1}
                  >
                    {person.bio} · {person.location}
                  </Text>
                </View>
                <View style={styles.startChatBadge}>
                  <Icon name="chatbubble-ellipses" color="#fff" size={17} />
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
        <View style={styles.dynamicSectionHeader}>
          <Text style={styles.dynamicSectionTitle}>
            {activeSegment === "All"
              ? "Recent conversations"
              : activeSegment === "People"
                ? "Active chats"
                : "Groups"}
          </Text>
          <Text style={styles.dynamicSectionMeta}>
            {visibleConversations.length} active
          </Text>
        </View>
        {visibleConversations.map((conversation) => (
          <Pressable
            key={conversation.id}
            style={styles.dynamicConversation}
            onPress={() => openConversation(conversation.id)}
          >
            <View>
              <Image
                source={{ uri: conversation.avatar }}
                style={styles.dynamicConversationAvatar}
              />
              {conversation.online ? (
                <View style={styles.dynamicOnline} />
              ) : null}
              {conversation.type === "Groups" ? (
                <View style={styles.groupAvatarBadge}>
                  <Icon name="people" color="#fff" size={11} />
                </View>
              ) : null}
            </View>
            <View style={styles.messageBody}>
              <View style={styles.rowBetween}>
                <Text style={styles.dynamicConversationName} numberOfLines={1}>
                  {conversation.name}
                </Text>
                <Text style={styles.dynamicConversationTime}>
                  {conversation.messages.at(-1)?.time}
                </Text>
              </View>
              <Text style={styles.dynamicConversationPreview} numberOfLines={1}>
                {conversation.messages.length
                  ? conversation.messages.at(-1)?.mine
                    ? "You: "
                    : conversation.messages.at(-1)?.sender === "You"
                      ? ""
                      : `${conversation.messages.at(-1)?.sender}: `
                  : ""}
                {conversation.messages.at(-1)?.text || "Start the conversation"}
              </Text>
            </View>
            {conversation.unread ? (
              <View style={styles.dynamicUnread}>
                <Text style={styles.dynamicUnreadText}>
                  {conversation.unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        {!visibleConversations.length && activeSegment !== "People" ? (
          <View style={styles.dynamicChatEmpty}>
            <Icon name="chatbubbles-outline" color="#4E46E5" size={42} />
            <Text style={styles.dynamicChatEmptyTitle}>
              No conversations found
            </Text>
            <Text style={styles.dynamicChatEmptyText}>
              Start a group or change the current filter.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {activeStory ? (
        <View style={styles.dynamicStoryViewer}>
              <View style={{ flex: 1, width: "100%" }}>
                <View
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    right: 12,
                    zIndex: 5,
                    flexDirection: "row",
                    gap: 5,
                  }}
                >
                  {activeStoryGroup?.stories.map((story, index) => (
                    <View
                      key={story.id}
                      style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor:
                          index <= activeStoryIndex ? "#FFFFFF" : "rgba(255,255,255,0.35)",
                      }}
                    />
                  ))}
                </View>
                <StoryMedia story={activeStory} />
                <Pressable
                  accessibilityLabel="Previous Story"
                  onPress={previousStory}
                  style={{ position: "absolute", left: 0, top: 48, bottom: 0, width: "35%" }}
                />
                <Pressable
                  accessibilityLabel="Next Story"
                  onPress={nextStory}
                  style={{ position: "absolute", right: 0, top: 48, bottom: 0, width: "35%" }}
                />
              </View>
          <LinearGradient
            colors={["rgba(0,0,0,.25)", "transparent", "rgba(0,0,0,.85)"]}
            style={styles.dynamicStoryShade}
          />
          <View style={styles.storyProgressRow}>
            {data.stories.map((story) => (
              <View
                key={story.id}
                style={[
                  styles.storyProgress,
                  story.viewed && styles.storyProgressDone,
                ]}
              />
            ))}
          </View>
          <View style={styles.storyViewerHeader}>
            <Image
              source={
                activeStory.mediaType === "video"
                  ? { uri: neutralMediaPlaceholder }
                  : { uri: activeStory.image }
              }
              style={styles.storyViewerAvatar}
            />
            <View style={styles.messageBody}>
              <Text style={styles.storyViewerName}>{activeStory.name}</Text>
              <Text style={styles.storyViewerTime}>just now</Text>
            </View>
            {activeStory.mine ? (
              <Pressable
                accessibilityLabel="Delete this story"
                onPress={deleteStory}
                style={styles.storyViewerClose}
              >
                <Icon name="trash-outline" color="#fff" size={23} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setActiveStoryId(null)}
              style={styles.storyViewerClose}
            >
              <Icon name="close" color="#fff" size={25} />
            </Pressable>
          </View>
          <Pressable onPress={nextStory} style={styles.storyNextArea} />
          <View style={styles.storyViewerCopy}>
            <Text style={styles.storyViewerText}>{activeStory.text}</Text>
          </View>
        </View>
      ) : null}
      {creatingGroup ? (
        <View style={styles.groupModalOverlay}>
          <View style={styles.groupModal}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.groupModalTitle}>Create a group</Text>
                <Text style={styles.groupModalSubtitle}>
                  Choose at least two people
                </Text>
              </View>
              <Pressable onPress={() => setCreatingGroup(false)}>
                <Icon name="close" color="#fff" size={25} />
              </Pressable>
            </View>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor="#7F8B9D"
              style={styles.groupNameInput}
            />
            <ScrollView style={styles.groupContacts}>
              {data.people.map((person) => {
                const selectedMember = groupMembers.includes(person.id);
                return (
                  <Pressable
                    key={person.id}
                    style={styles.groupContact}
                    onPress={() =>
                      setGroupMembers((current) =>
                        selectedMember
                          ? current.filter((id) => id !== person.id)
                          : [...current, person.id],
                      )
                    }
                  >
                    <Image
                      source={{ uri: person.avatar }}
                      style={styles.groupContactAvatar}
                    />
                    <View style={styles.messageBody}>
                      <Text style={styles.groupContactName}>{person.name}</Text>
                      <Text style={styles.groupContactStatus}>
                        {person.online
                          ? "Online"
                          : `${person.username} · ${person.location}`}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.groupCheck,
                        selectedMember && styles.groupCheckActive,
                      ]}
                    >
                      {selectedMember ? (
                        <Icon name="checkmark" color="#fff" size={15} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={createGroup} style={styles.groupCreateButton}>
              <Text style={styles.groupCreateButtonText}>
                Create Group · {groupMembers.length} selected
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function PublicProfileScreen({
  person,
  data,
  back,
}: {
  person: DiscoverablePerson;
  data: AppData;
  back: () => void;
}) {
  const hosted = data.activities.filter((activity) => activity.ownerId === person.id);
  return (
    <SafeAreaView style={[styles.safe, data.theme === "dark" && styles.safeDark]}>
      <ScrollView contentContainerStyle={styles.profileReferenceScreen}>
        <LinearGradient
          colors={["#1910C2", "#1F16C6", "#4E46E5"]}
          style={styles.profileReferenceHero}
        >
          <Pressable style={styles.profileBack} onPress={back}>
            <Icon name="arrow-back" color="#fff" />
          </Pressable>
          <View style={styles.profileIdentityRow}>
            <View style={styles.profileAvatarRef}>
              <Image source={{ uri: person.avatar }} style={styles.profileAvatarImage} />
              {person.online ? <View style={styles.profileOnline} /> : null}
            </View>
            <View style={styles.profileIdentityCopy}>
              <Text style={styles.profileNameRef}>{person.name}</Text>
              <Text style={styles.profileHandle}>@{person.username.replace(/^@/, "")}</Text>
              {person.location ? (
                <View style={styles.brandLocation}>
                  <Icon name="location-outline" color="#fff" size={14} />
                  <Text style={styles.profileLocation}>{person.location}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>
        <View style={styles.profileInfoCard}>
          <Text style={styles.profileSectionTitle}>About me</Text>
          <Text style={styles.meta}>{person.bio || "This member has not added a bio yet."}</Text>
        </View>
        <SectionTitle title="Hosted activities" />
        {hosted.length ? hosted.map((activity) => (
          <View key={activity.id} style={styles.cardBody}>
            <Text style={styles.cardTitle}>{activity.title}</Text>
            <Text style={styles.meta}>{activity.when} · {activity.where}</Text>
          </View>
        )) : <Text style={styles.meta}>No hosted activities are visible.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileScreen({
  data,
  setData,
  go,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
}) {
  const dark = data.theme === "dark";
  const isVerified = data.badges.some((badge) =>
    badge.name.toLowerCase().includes("verified"),
  );
  const [profileTab, setProfileTab] = useState("Activities");
  const pickAvatar = async () => {
    playClickSound();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const previousUri = data.avatarUri;
      const localUri = result.assets[0].uri;
      setData((current) => ({ ...current, avatarUri: localUri }));
      if (isSupabaseConfigured)
        profileService
          .updateAvatar(localUri)
          .then((remoteUri) =>
            setData((current) => ({ ...current, avatarUri: remoteUri })),
          )
          .catch((caught) => {
            setData((current) => ({ ...current, avatarUri: previousUri }));
            Alert.alert(
              "Avatar not synced",
              caught instanceof Error ? caught.message : "Please try again.",
            );
          });
    }
  };
  const interestVisuals: Array<[IconName, string]> = [
    ["tennisball-outline", "#F0ECFF"],
    ["airplane-outline", "#EAF5FF"],
    ["book-outline", "#FFF0F7"],
    ["cafe-outline", "#FFF3E9"],
    ["musical-notes-outline", "#ECF9F1"],
  ];
  const interestIcons: [IconName, string, string][] = data.interests
    .slice(0, 5)
    .map((label, index) => [
      interestVisuals[index % interestVisuals.length][0],
      label,
      interestVisuals[index % interestVisuals.length][1],
    ]);
  const achievementColors = [
    "#FF9F1C",
    "#4E46E5",
    "#2E81EF",
    "#ED3E94",
    "#20B86A",
    "#1910C2",
  ];
  const achievements: [IconName, string, string, string][] = data.badges.map(
    (badge, index) => [
      "ribbon-outline",
      badge.name,
      badge.description,
      achievementColors[index % achievementColors.length],
    ],
  );
  const profileActivities = data.activities.filter(
    (item) => item.ownerId === data.userId || ["going", "approved", "pending", "waitlist"].includes(String(item.viewerStatus)),
  );
  const profileVibes = data.vibes.filter((vibe) => runtimeId(vibe, ["authorId", "userId", "user_id"]) === String(data.userId || ""));
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView
        contentContainerStyle={[
          styles.profileReferenceScreen,
          dark && styles.referenceScreenDark,
        ]}
      >
        <LinearGradient
          colors={["#1910C2", "#1F16C6", "#4E46E5"]}
          style={styles.profileReferenceHero}
        >
          <Pressable style={styles.profileBack} onPress={() => go("feed")}>
            <Icon name="arrow-back" color="#fff" />
          </Pressable>
          <Pressable
            accessibilityLabel="Settings"
            style={styles.profileSettingsRef}
            onPress={() => go("settings")}
          >
            <Icon name="settings-outline" color="#fff" />
          </Pressable>
          <View style={styles.profileThemeToggle}>
            <ThemeToggle
              onToggle={() =>
                setData((current) => ({
                  ...current,
                  theme: current.theme === "dark" ? "light" : "dark",
                }))
              }
            />
          </View>
          <View style={styles.profileIdentityRow}>
            <Pressable
              accessibilityLabel="Change profile picture"
              onPress={pickAvatar}
              style={styles.profileAvatarRef}
            >
              {data.avatarUri ? (
                <Image
                  source={{ uri: data.avatarUri }}
                  style={styles.profileAvatarImage}
                />
              ) : (
                <Image
                  source={{ uri: neutralAvatar }}
                  style={styles.profileAvatarImage}
                />
              )}
              <View style={styles.profileOnline} />
            </Pressable>
            <View style={styles.profileIdentityCopy}>
              <View style={styles.row}>
                <Text style={styles.profileNameRef}>{data.name}</Text>
                {isVerified ? <Icon name="checkmark-circle" color="#fff" size={18} /> : null}
              </View>
              <Text style={styles.profileHandle}>{data.username}</Text>
              <View style={styles.brandLocation}>
                <Icon name="location-outline" color="#fff" size={14} />
                <Text style={styles.profileLocation}>{data.location}</Text>
              </View>
            </View>
            <View style={styles.trustCard}>
              <Text style={styles.trustLabel}>Karma</Text>
              <Text style={styles.trustScore}>
                {data.trustScore}<Text style={styles.trustOutOf}>/5</Text>
              </Text>
              <View style={styles.row}>
                <Icon name="shield-checkmark" color="#38E78E" />
                <Text style={styles.trustedText}>{isVerified ? "Verified" : "Not verified"}</Text>
              </View>
            </View>
          </View>
          <View style={styles.profileSocialRow}>
            {(
              [
                ["logo-instagram", "#FF4F8B"],
                ["logo-facebook", "#4D87FF"],
                ["logo-linkedin", "#48A4F5"],
                ["logo-twitter", "#111827"],
              ] as [IconName, string][]
            ).map(([icon, color]) => (
              <Pressable
                key={icon}
                accessibilityLabel={icon.replace("logo-", "")}
                style={[styles.profileSocialButton, { backgroundColor: color }]}
                onPress={() => go("socialLinks")}
              >
                <Icon name={icon} color="#fff" size={15} />
              </Pressable>
            ))}
          </View>
          <View style={styles.profileChips}>
            {[
              ...data.interests.slice(0, 3),
              ...(data.interests.length > 3
                ? [`+${data.interests.length - 3}`]
                : []),
            ].map(
              (label, index) => (
                <View key={label} style={styles.profileChip}>
                  <Icon
                    name={
                      index === 0
                        ? "compass-outline"
                        : index === 1
                          ? "color-wand-outline"
                          : index === 2
                            ? "football-outline"
                            : "add"
                    }
                    color="#fff"
                    size={14}
                  />
                  <Text style={styles.profileChipText}>{label}</Text>
                </View>
              ),
            )}
          </View>
        </LinearGradient>
        <View style={styles.profileActionRow}>
          <Pressable
            style={[styles.profileActionButton, dark && styles.surfaceDark]}
            onPress={() => go("editProfile")}
          >
            <Icon name="create-outline" />
            <Text style={styles.profileActionText}>Edit profile</Text>
          </Pressable>
          <Pressable
            style={[styles.profileActionButton, dark && styles.surfaceDark]}
            onPress={() => go("verification")}
          >
            <Icon name="shield-checkmark-outline" />
            <Text style={styles.profileActionText}>
              {isVerified ? "Verified" : "Get verified"}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.profileStatsRef, dark && styles.surfaceDark]}>
          {[
            [
              "calendar-outline",
              String(profileActivities.length),
              "Activities",
              "#1910C2",
            ],
            ["people-outline", String(data.friendCount), "Squad", "#F13E9C"],
            ["star-outline", String(data.trustScore), "Karma", "#F7A51B"],
            [
              "flash-outline",
              data.nitro.toLocaleString(),
              "Nitro Points",
              "#29C66D",
            ],
          ].map(([icon, value, label, color]) => (
            <View key={label} style={styles.profileStatRef}>
              <Icon name={icon as IconName} color={color} />
              <Text style={[styles.profileStatValue, dark && styles.titleDark]}>
                {value}
              </Text>
              <Text
                style={[styles.profileStatLabel, dark && styles.subtitleDark]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={[styles.profileInfoCard, dark && styles.surfaceDark]}>
          <View style={styles.messageBody}>
            <Text
              style={[styles.profileSectionTitle, dark && styles.titleDark]}
            >
              About me
            </Text>
            <Text style={[styles.profileBio, dark && styles.subtitleDark]}>
              {data.bio || "Add a bio to help members understand your interests."}
            </Text>
            <Text style={styles.link}>... Read more</Text>
          </View>
          <View style={styles.aboutIllustration}>
            <Icon name="walk" color="#fff" size={42} />
            <View style={styles.aboutSun} />
          </View>
        </View>
        <View
          style={[styles.profileInfoCardColumn, dark && styles.surfaceDark]}
        >
          <View style={styles.rowBetween}>
            <Text
              style={[styles.profileSectionTitle, dark && styles.titleDark]}
            >
              Interests
            </Text>
            <Pressable onPress={() => go("editProfile")}>
              <Text style={styles.link}>Manage</Text>
            </Pressable>
          </View>
          <View style={styles.interestRow}>
            {interestIcons.map(([icon, label, tint]) => (
              <View key={label} style={styles.interestItem}>
                <View style={[styles.interestIcon, { backgroundColor: tint }]}>
                  <Icon name={icon} />
                </View>
                <Text
                  style={[styles.interestLabel, dark && styles.subtitleDark]}
                >
                  {label}
                </Text>
              </View>
            ))}
            {data.interests.length > 5 ? <View style={styles.interestItem}>
              <View
                style={[styles.interestIcon, { backgroundColor: "#F4F3F7" }]}
              >
                <Text style={styles.cardTitle}>+{data.interests.length - 5}</Text>
              </View>
              <Text style={[styles.interestLabel, dark && styles.subtitleDark]}>
                More
              </Text>
            </View> : null}
          </View>
        </View>
        <LinearGradient
          colors={["#1910C2", "#1F16C6", "#4E46E5"]}
          style={styles.achievementsCard}
        >
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Icon name="ribbon" color="#fff" />
              <Text style={styles.achievementsTitle}>Badges earned</Text>
            </View>
            <Text style={styles.achievementsLink}>View all ›</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.achievementRow}
          >
            {achievements.map(([icon, label, caption, color]) => (
              <View key={label} style={styles.achievementItem}>
                <View
                  style={[styles.achievementBadge, { backgroundColor: color }]}
                >
                  <Icon name={icon} color="#fff" size={25} />
                </View>
                <Text style={styles.achievementLabel}>{label}</Text>
                <Text style={styles.achievementCaption}>{caption}</Text>
              </View>
            ))}
            {!achievements.length ? (
              <Text style={styles.achievementCaption}>
                Complete verified actions to earn your first badge.
              </Text>
            ) : null}
          </ScrollView>
        </LinearGradient>
        <View style={styles.profileTabs}>
          {["Activities", "Vibes", "Reviews", "Communities"].map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setProfileTab(tab)}
              style={[
                styles.profileTab,
                profileTab === tab && styles.profileTabActive,
              ]}
            >
              <Text
                style={[
                  styles.profileTabText,
                  profileTab === tab && styles.profileTabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>
        {profileTab === "Activities" ? (
          <View style={styles.profileActivities}>
            {profileActivities.slice(0, 2).map((item) => (
              <Pressable
                key={item.id}
                style={[styles.profileActivityCard, dark && styles.surfaceDark]}
              >
                <Image
                  source={{ uri: item.image }}
                  style={styles.profileActivityImage}
                />
                <View style={styles.messageBody}>
                  <Text
                    style={[
                      styles.profileActivityTitle,
                      dark && styles.titleDark,
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.meta}>
                    {item.when} · {item.where}
                  </Text>
                  <AvatarStack count={Math.min(item.joined, 4)} extra={Math.max(item.joined - 4, 0)} />
                </View>
                <Icon name="ellipsis-vertical" />
              </Pressable>
            ))}
          </View>
        ) : profileTab === "Vibes" ? (
          profileVibes.length ? (
            <View style={styles.profileVibeGrid}>
              {profileVibes.map((item, index) => (
              <Pressable
                key={item.id}
                style={styles.profileVibeTile}
                onPress={() => go("vibes")}
              >
                <Image
                  source={{
                    uri:
                      item.mediaUrl ||
                      [
                        neutralMediaPlaceholder,
                        photoAssets.cycling,
                        photoAssets.study,
                      ][index % 3],
                  }}
                  style={styles.profileVibeImage}
                />
                <View style={styles.profilePlay}>
                  <Icon name="play" color="#fff" size={12} />
                </View>
                <View style={styles.profileVibeCounts}>
                  <Text style={styles.profileVibeCount}>♡ {item.likes}</Text>
                  <Text style={styles.profileVibeCount}>
                    ◯ {item.comments?.length || 0}
                  </Text>
                </View>
              </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Icon name="film-outline" size={38} />
              <Text style={styles.cardTitle}>No vibes yet</Text>
              <Text style={styles.meta}>Share a photo or reel from an activity to build your profile.</Text>
              <Button label="Share your first vibe" icon="add" onPress={() => go("postVibe")} />
            </View>
          )
        ) : profileTab === "Communities" ? (
          <View style={styles.profileActivities}>
            {data.communities
              .filter((item) => item.membership !== "none")
              .map((item) => (
                <View key={item.id} style={styles.profileActivityCard}>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.profileActivityImage}
                  />
                  <View style={styles.messageBody}>
                    <Text style={styles.profileActivityTitle}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {item.memberCount} members · {item.category}
                    </Text>
                  </View>
                </View>
              ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Icon name="star-outline" size={37} />
            <Text style={styles.cardTitle}>Reviews</Text>
            <Text style={styles.meta}>
              Member reviews will appear after completed plans.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchScreen({
  data,
  setData,
  back,
  go,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
  go: (screen: Screen) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("Activities");
  const results = data.activities.filter((a) =>
    `${a.title} ${a.category} ${a.where}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const people = data.people.filter((person) =>
    `${person.name} ${person.username} ${person.bio}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const messagePerson = async (person: DiscoverablePerson) => {
    const existing = data.conversations.find(
      (conversation) =>
        conversation.type === "People" && conversation.userId === person.id,
    );
    if (!existing) {
      try {
        const id =
          isSupabaseConfigured && isBackendId(person.id)
            ? await chatService.createDirect(person.id)
            : `dm-${Date.now()}`;
        setData((current) => ({
          ...current,
          conversations: [
            {
              id,
              name: person.name,
              type: "People",
              avatar: person.avatar,
              memberCount: 2,
              online: person.online,
              unread: 0,
              userId: person.id,
              messages: [],
            },
            ...current.conversations,
          ],
        }));
      } catch (caught) {
        return Alert.alert(
          "Could not start chat",
          caught instanceof Error ? caught.message : "Please try again.",
        );
      }
    }
    go("chat");
  };
  return (
    <ScreenFrame
      title="Search"
      subtitle="Activities, people and communities - clearly separated."
      onBack={back}
    >
      <View style={styles.searchInputBar}>
        <Icon name="search" color={colors.soft} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Study buddy, badminton, cricket..."
          placeholderTextColor={colors.soft}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")}>
            <Icon name="close-circle" color={colors.soft} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.searchScopes}>
        {["Activities", "People", "Communities"].map((x) => (
          <Pressable
            key={x}
            onPress={() => setScope(x)}
            style={[
              styles.searchScope,
              scope === x && styles.searchScopeActive,
            ]}
          >
            <Icon
              name={
                x === "Activities"
                  ? "calendar-outline"
                  : x === "People"
                    ? "person-outline"
                    : "people-outline"
              }
              color={scope === x ? "#fff" : colors.muted}
            />
            <Text
              style={[
                styles.searchScopeText,
                scope === x && styles.searchScopeTextActive,
              ]}
            >
              {x}
            </Text>
          </Pressable>
        ))}
      </View>
      <SectionTitle title={query ? `${scope} results` : "Trending intents"} />
      {scope === "Activities" &&
        (query ? results : data.activities).map((item) => (
          <ActivityCard key={item.id} item={item} compact />
        ))}
      {scope === "People" &&
        people.map((person) => (
          <Pressable
            key={person.id}
            style={styles.communityRow}
            onPress={() => messagePerson(person)}
          >
            <Image
              source={{ uri: person.avatar }}
              style={styles.searchPersonAvatar}
            />
            <View style={styles.messageBody}>
              <Text style={styles.cardTitle}>{person.name}</Text>
              <Text style={styles.meta}>
                {person.bio} · {person.location}
              </Text>
            </View>
            <Icon name="chatbubble-ellipses" />
          </Pressable>
        ))}
      {scope === "Communities" &&
        data.communities
          .filter((item) =>
            `${item.name} ${item.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => (
            <View key={item.id} style={styles.communityRow}>
              <Image
                source={{ uri: item.image }}
                style={styles.searchPersonAvatar}
              />
              <View style={styles.messageBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.meta}>{item.tagline}</Text>
              </View>
              <Icon name="people" />
            </View>
          ))}
      {scope === "Vibes" &&
        data.vibes
          .filter((item) =>
            `${item.author} ${item.text}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => (
            <Pressable
              key={item.id}
              style={styles.communityRow}
              onPress={() => go("vibes")}
            >
              <Image
                source={{ uri: item.mediaUrl || neutralMediaPlaceholder }}
                style={styles.searchPersonAvatar}
              />
              <View style={styles.messageBody}>
                <Text style={styles.cardTitle}>{item.author}</Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {item.text}
                </Text>
              </View>
              <Icon name="play" />
            </Pressable>
          ))}
    </ScreenFrame>
  );
}

function NotificationsScreen({
  back,
  go,
  mode,
  onUnreadCountChange,
}: {
  back: () => void;
  go: (screen: Screen) => void;
  mode: AppData["mode"];
  onUnreadCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<ProductionNotification[]>([]);
  const [loading, setLoading] = useState(mode === "authenticated");
  const [error, setError] = useState("");

  useEffect(() => {
    onUnreadCountChange?.(items.filter((item) => !item.read_at).length);
  }, [items, onUnreadCountChange]);

  useEffect(() => {
    if (mode !== "authenticated" || !isSupabaseConfigured) return;
    let mounted = true;
    let channel:
      | Awaited<ReturnType<typeof notificationService.subscribe>>
      | undefined;
    notificationService
      .list()
      .then(async (records) => {
        if (!mounted) return;
        setItems(records);
        if (mounted)
          channel = await notificationService.subscribe(
            undefined,
            (record) => setItems((current) => [record, ...current]),
            (subscriptionError) => setError(subscriptionError.message),
          );
      })
      .catch((caught) =>
        mounted
          ? setError(caught instanceof Error ? caught.message : "Could not load notifications.")
          : undefined,
      )
      .finally(() => (mounted ? setLoading(false) : undefined));
    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [mode]);

  const openNotification = async (item: ProductionNotification) => {
    if (!item.read_at) {
      try {
        await notificationService.markRead(item.id);
        setItems((current) => current.map((record) => record.id === item.id ? { ...record, read_at: new Date().toISOString() } : record));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not mark notification as read.");
        return;
      }
    }
    if (item.notification_type === "message") go("chat");
    else if (item.notification_type === "vibe_comment") go("vibes");
    else if (item.notification_type === "community_join") go("communities");
    else if (item.notification_type === "activity_join") go("activityHistory");
    else if (item.notification_type === "verification") go("verification");
  };

  return (
    <ScreenFrame
      title="Notifications"
      subtitle="Requests, reminders, and trust updates."
      onBack={back}
      right={
        items.some((item) => !item.read_at) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            onPress={async () => {
              try {
                await notificationService.markAllRead();
                setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not mark notifications as read.");
              }
            }}
          >
            <Icon name="checkmark-done" size={24} />
          </Pressable>
        ) : undefined
      }
    >
      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.purple600} />
          <Text style={styles.meta}>Loading your notifications...</Text>
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Icon name="cloud-offline-outline" size={34} />
          <Text style={styles.cardTitle}>Notifications are unavailable</Text>
          <Text style={styles.meta}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="checkmark-circle-outline" size={38} color={colors.good} />
          <Text style={styles.cardTitle}>You are all caught up</Text>
          <Text style={styles.meta}>New social and account updates will appear here in real time.</Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable key={item.id} onPress={() => openNotification(item)}>
            <Notice
              icon={item.read_at ? "notifications-outline" : "notifications"}
              title={item.title}
              text={`${item.body}${item.body ? " · " : ""}${new Date(item.created_at).toLocaleString()}`}
            />
          </Pressable>
        ))
      )}
    </ScreenFrame>
  );
}

function CommunitiesScreen({
  data,
  setData,
  go,
  openCommunity,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  go: (s: Screen) => void;
  openCommunity: (id: string) => void;
}) {
  const { notifications } = React.useContext(UnreadContext);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const normalized = query.trim().toLowerCase();
  const visible = data.communities.filter(
    (item) =>
      (filter === "All" ||
        (filter === "Joined" && item.membership === "joined") ||
        (filter === "Created" && item.membership === "created")) &&
      (!normalized ||
        `${item.name} ${item.category} ${item.tags.join(" ")}`
          .toLowerCase()
          .includes(normalized)),
  );
  const toggleJoin = (id: string) => {
    const currentCommunity = data.communities.find((item) => item.id === id);
    if (!currentCommunity) return;
    const joining = currentCommunity.membership !== "joined";
    setData((current) => ({
      ...current,
      communities: current.communities.map((item) =>
        item.id === id
          ? {
              ...item,
              membership: joining ? "joined" : "none",
              memberCount: item.memberCount + (joining ? 1 : -1),
            }
          : item,
      ),
    }));
    if (isSupabaseConfigured && isBackendId(id))
      communityService
        .setMembership(id, joining)
        .catch((error) => Alert.alert("Membership not synced", error.message));
  };
  return (
    <SafeAreaView style={styles.communitySafe}>
      <ScrollView
        contentContainerStyle={styles.communityListScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.communityBrandRow}>
          <View style={{ width: 35 }} />
          <View style={styles.communityBrand}>
            <Text style={styles.communityBrandMark}>W</Text>
            <Text style={styles.communityBrandName}>WeNitro</Text>
          </View>
          <Pressable onPress={() => go("notifications")}>
            <Icon name="notifications-outline" color="#fff" size={27} />
            {notifications > 0 ? <View style={styles.notificationBadge} /> : null}
          </Pressable>
        </View>
        <View style={styles.communitySearch}>
          <Icon name="search" color="#A6AFBF" size={24} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Community"
            placeholderTextColor="#919BAD"
            style={styles.communitySearchInput}
          />
          <Icon name="options-outline" color="#A6AFBF" size={23} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.communityStoryRow}
        >
          <Pressable
            style={styles.communityStory}
            onPress={() => go("createCommunity")}
          >
            <LinearGradient
              colors={["#1910C2", "#4E46E5"]}
              style={styles.createCommunityStory}
            >
              <Icon name="add" color="#fff" size={35} />
            </LinearGradient>
            <Text style={styles.communityStoryText}>Create{`\n`}Community</Text>
          </Pressable>
          {data.communities.slice(0, 5).map((item) => (
            <Pressable
              key={item.id}
              style={styles.communityStory}
              onPress={() => openCommunity(item.id)}
            >
              <LinearGradient
                colors={["#1910C2", "#4E46E5"]}
                style={styles.communityStoryRing}
              >
                <Image
                  source={{ uri: item.image }}
                  style={styles.communityStoryImage}
                />
              </LinearGradient>
              <Text style={styles.communityStoryText} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.communityFilters}>
          {["All", "Joined", "Created"].map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.communityFilter,
                filter === item && styles.communityFilterActive,
              ]}
            >
              <Text
                style={[
                  styles.communityFilterText,
                  filter === item && styles.communityFilterTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        {visible.map((item) => (
          <View key={item.id} style={styles.communityListCard}>
            <Pressable onPress={() => openCommunity(item.id)}>
              <Image
                source={{ uri: item.image }}
                style={styles.communityCardImage}
              />
              <View style={styles.communityMiniBadge}>
                <Icon name="people" color="#fff" size={14} />
              </View>
            </Pressable>
            <Pressable
              style={styles.communityCardBody}
              onPress={() => openCommunity(item.id)}
            >
              <View style={styles.row}>
                <Text style={styles.communityCardName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.verified ? (
                  <Icon name="checkmark-circle" color="#2D8DFF" size={17} />
                ) : null}
              </View>
              <Text style={styles.communityCardTagline} numberOfLines={1}>
                {item.tagline}
              </Text>
              <Text style={styles.communityCardMeta}>
                <Icon name="calendar-outline" color="#AAB3C1" size={13} />{" "}
                {item.memberCount >= 1000
                  ? `${(item.memberCount / 1000).toFixed(1)}K`
                  : item.memberCount}{" "}
                Members • <Text style={styles.publicText}>●</Text>{" "}
                {item.visibility}
              </Text>
              <View style={styles.communityTags}>
                {item.tags.map((tag, index) => (
                  <View
                    key={tag}
                    style={[
                      styles.communityTag,
                      index === 1 && styles.communityTagGreen,
                      index === 2 && styles.communityTagPurple,
                    ]}
                  >
                    <Text
                      style={[
                        styles.communityTagText,
                        index === 1 && styles.communityTagTextGreen,
                      ]}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
            <View style={styles.communityCardActions}>
              <Icon name="ellipsis-vertical" color="#AAB3C1" />
              <Pressable
                onPress={() => toggleJoin(item.id)}
                style={[
                  styles.communityJoin,
                  item.membership === "joined" && styles.communityJoined,
                  item.membership === "created" && styles.communityCreated,
                ]}
              >
                <Text
                  style={[
                    styles.communityJoinText,
                    item.membership === "joined" && styles.communityJoinedText,
                  ]}
                >
                  {item.membership === "joined"
                    ? "Joined"
                    : item.membership === "created"
                      ? "Created"
                      : "Join Now"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!visible.length ? (
          <View style={styles.communityEmpty}>
            <Icon name="search-outline" color="#805CFF" size={38} />
            <Text style={styles.communityEmptyTitle}>No communities found</Text>
            <Text style={styles.communityEmptyText}>
              Try another search or create a community for this interest.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CommunityDetailScreen({
  community,
  authorName,
  setData,
  back,
}: {
  community: Community;
  authorName: string;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
}) {
  const [filter, setFilter] = useState("All");
  const [draft, setDraft] = useState("");
  const [postImageUri, setPostImageUri] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const visible = community.posts.filter(
    (post) => filter === "All" || post.category === filter,
  );
  const update = (transform: (item: Community) => Community) =>
    setData((current) => ({
      ...current,
      communities: current.communities.map((item) =>
        item.id === community.id ? transform(item) : item,
      ),
    }));
  useEffect(() => {
    if (!isSupabaseConfigured || !isBackendId(community.id)) return;
    let active = true;
    communitiesProductionService
      .getFeed(community.id, { page: 1, pageSize: 20 })
      .then((feed) => {
        if (!active) return;
        update((item) => ({
          ...item,
          posts: feed.items.map((post) => ({
            id: post.id,
            author:
              post.author?.fullName || post.author?.username || "WeNitro member",
            title: post.title,
            body: post.body,
            category: post.category || "General",
            reactions: post.reactionCount,
            comments: post.commentCount,
            liked: Boolean(post.myReaction),
            image: post.mediaUrl || undefined,
          })),
        }));
      })
      .catch((error) =>
        active
          ? Alert.alert(
              "Community posts unavailable",
              error instanceof Error ? error.message : "Please try again.",
            )
          : undefined,
      );
    return () => {
      active = false;
    };
  }, [community.id]);
  useEffect(() => {
    if (!isSupabaseConfigured || !isBackendId(community.id)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = communitiesProductionService.subscribeToPosts(community.id, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        communitiesProductionService.getFeed(community.id, { page: 1, pageSize: 20 }).then((feed) => {
          if (!active) return;
          update((item) => ({
            ...item,
            posts: feed.items.map((post) => ({ id: post.id, author: post.author?.fullName || post.author?.username || "WeNitro member", title: post.title, body: post.body, category: post.category || "General", reactions: post.reactionCount, comments: post.commentCount, liked: Boolean(post.myReaction), image: post.mediaUrl || undefined })),
          }));
        }).catch(() => undefined);
      }, 180);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [community.id]);
  const join = async () => {
    if (community.membership === "created") return;
    const joining = community.membership === "none";
    try {
      const result = isSupabaseConfigured && isBackendId(community.id)
        ? await communityService.setMembership(community.id, joining)
        : null;
      const pending = joining && result && "status" in result && result.status === "pending";
      update((item) => ({
        ...item,
        membership: joining ? (pending ? "pending" : "joined") : "none",
        memberCount: item.memberCount + (joining && !pending ? 1 : !joining ? -1 : 0),
      }));
    } catch (error) {
      Alert.alert("Membership not synced", error instanceof Error ? error.message : "Please try again.");
    }
  };
  const toggleLike = async (postId: string) => {
    const post = community.posts.find((item) => item.id === postId);
    if (!post) return;
    try {
      if (isSupabaseConfigured && isBackendId(postId)) await communityService.setPostReaction(postId, !post.liked);
      update((item) => ({
        ...item,
        posts: item.posts.map((current) => current.id === postId ? {
          ...current,
          liked: !current.liked,
          reactions: current.reactions + (current.liked ? -1 : 1),
        } : current),
      }));
    } catch (error) {
      Alert.alert("Reaction not synced", error instanceof Error ? error.message : "Please try again.");
    }
  };
  const publish = async () => {
    const title = draft.trim();
    if (!title) return;
    if (publishing) return;
    setPublishing(true);
    try {
      const created =
        isSupabaseConfigured && isBackendId(community.id)
          ? await createCommunityPost({
              communityId: community.id,
              title,
              body: "Shared with the WeNitro community.",
              category: "General",
              image: postImageUri || undefined,
            })
          : null;
      update((item) => ({
        ...item,
        posts: [
          {
            id: created?.id || `cp${Date.now()}`,
            author: authorName,
            title,
            body: "Shared with the WeNitro community.",
            category: "General",
            reactions: 0,
            comments: 0,
            liked: false,
            image: created?.mediaUrl || postImageUri || undefined,
          },
          ...item.posts,
        ],
      }));
      setDraft("");
      setPostImageUri(null);
    } catch (caught) {
      Alert.alert(
        "Could not publish",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setPublishing(false);
    }
  };
  const pickPostImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) setPostImageUri(result.assets[0].uri);
  };
  const openComments = async (postId: string) => {
    if (commentPostId === postId) {
      setCommentPostId(null);
      setCommentDraft("");
      return;
    }
    setCommentPostId(postId);
    if (!isSupabaseConfigured || !isBackendId(postId)) return;
    setCommentsLoading(true);
    try {
      const page = await communityService.listPostComments(postId);
      update((item) => ({
        ...item,
        posts: item.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentItems: page.items.map((entry) => ({
                  id: entry.id,
                  author: entry.author?.fullName || entry.author?.username || "Member",
                  body: entry.body,
                })),
                comments: page.total ?? page.items.length,
              }
            : post,
        ),
      }));
    } catch (caught) {
      Alert.alert(
        "Comments unavailable",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    } finally {
      setCommentsLoading(false);
    }
  };
  const submitComment = async (postId: string) => {
    const body = commentDraft.trim();
    if (!body) return;
    try {
      const created =
        isSupabaseConfigured && isBackendId(postId)
          ? await communityService.commentPost(postId, body)
          : null;
      update((item) => ({
        ...item,
        posts: item.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: post.comments + 1,
                commentItems: [
                  ...(post.commentItems || []),
                  {
                    id: created?.id || `cc${Date.now()}`,
                    author: "You",
                    body,
                  },
                ],
              }
            : post,
        ),
      }));
      setCommentDraft("");
    } catch (caught) {
      Alert.alert(
        "Comment not saved",
        caught instanceof Error ? caught.message : "Please try again.",
      );
    }
  };
  return (
    <SafeAreaView style={styles.communitySafe}>
      <ScrollView
        contentContainerStyle={styles.communityDetailScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.communityCover}>
          <Image
            source={{ uri: community.cover }}
            style={styles.communityCoverImage}
          />
          <View style={styles.communityCoverShade} />
          <Pressable style={styles.communityDetailBack} onPress={back}>
            <Icon name="arrow-back" color="#fff" size={26} />
          </Pressable>
          <View style={styles.communityTopActions}>
            <Pressable style={styles.communityRoundAction} onPress={() => requestInternalShare({ kind: "community", id: community.id, title: community.name, preview: community.tagline })}>
              <Icon name="share-outline" color="#fff" />
            </Pressable>
            <Pressable style={styles.communityRoundAction}>
              <Icon name="ellipsis-vertical" color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={styles.communityIdentity}>
          <Image
            source={{ uri: community.image }}
            style={styles.communityIdentityImage}
          />
          <View style={styles.messageBody}>
            <View style={styles.row}>
              <Text style={styles.communityDetailName}>{community.name}</Text>
              {community.verified ? (
                <Icon name="checkmark-circle" color="#3B8BFF" />
              ) : null}
            </View>
            <Text style={styles.communityDetailStats}>
              {community.memberCount >= 1000
                ? `${(community.memberCount / 1000).toFixed(1)}K`
                : community.memberCount}{" "}
              Humans • {community.onlineCount} </Text>
          </View>
          <Pressable
            onPress={join}
            disabled={community.membership === "created"}
            accessibilityRole="button"
            accessibilityLabel={
              community.membership === "created"
                ? "Community created"
                : community.membership === "joined"
                  ? "Leave community"
                  : "Join community"
            }
            style={[
              styles.detailJoin,
              community.membership === "joined" && styles.detailJoined,
              community.membership === "created" && styles.communityCreated,
            ]}
          >
            <Text style={styles.detailJoinText}>
              {community.membership === "created"
                ? "Created"
                : community.membership === "joined"
                  ? "Joined"
                  : "Join"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.communityDetailTagline}>{community.tagline}</Text>
        <View style={styles.communityLinks}>
          <Text>Wiki</Text>
          <Text></Text>
          <Text>Top Members</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.communityDetailFilters}
        >
          <Icon name="options-outline" color="#C4CBD5" size={24} />
          {["All", "Travel", "Lifestyle", "Discussion", "General"].map(
            (item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.detailFilter,
                  filter === item && styles.detailFilterActive,
                ]}
              >
                <Text
                  style={[
                    styles.detailFilterText,
                    filter === item && styles.detailFilterTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>
        <View style={styles.communityComposer}>
          <View style={styles.communityComposerTop}>
            <Image source={{ uri: neutralAvatar }} style={styles.composerAvatar} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={publish}
              placeholder={`Write something to ${community.name}...`}
              placeholderTextColor="#8792A3"
              style={styles.communityComposerInput}
            />
            <Pressable onPress={() => void pickPostImage()} accessibilityLabel="Attach image">
              <Icon name="image-outline" color="#1910C2" />
            </Pressable>
            <Pressable onPress={publish} disabled={publishing}>
              {publishing ? (
                <ActivityIndicator size="small" color="#1910C2" />
              ) : (
                <Icon name="send" color="#1910C2" />
              )}
            </Pressable>
          </View>
          {postImageUri ? (
            <View style={{ position: "relative", marginTop: 10 }}>
              <Image source={{ uri: postImageUri }} style={styles.postImage} />
              <Pressable
                accessibilityLabel="Remove attached image"
                onPress={() => setPostImageUri(null)}
                style={{ position: "absolute", right: 8, top: 8, backgroundColor: "rgba(0,0,0,.65)", borderRadius: 18, padding: 6 }}
              >
                <Icon name="close" color="#fff" size={18} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {visible.map((post) => (
          <View key={post.id} style={styles.communityPost}>
            <View style={styles.postHeader}>
              <Image
                source={{ uri: runtimeString(post, ["authorAvatar", "author_avatar", "avatar"]) ?? neutralAvatar }}
                style={styles.postAvatar}
              />
              <View style={styles.messageBody}>
                <Text style={styles.postAuthor}>
                  {post.author}{" "}
                  <Text style={styles.postTime}>{formatRuntimeTime(post.createdAt) || "Recently"}</Text>
                </Text>
              </View>
              <Icon name="ellipsis-horizontal" color="#CDD2DA" />
            </View>
            <Text style={styles.postTitle}>{post.title}</Text>
            <View style={styles.postCategory}>
              <Text style={styles.postCategoryText}>{post.category}</Text>
            </View>
            <Text style={styles.postBody}>{post.body}</Text>
            {post.image ? (
              <Image source={{ uri: post.image }} style={styles.postImage} />
            ) : null}
            <View style={styles.postMetrics}>
              <Text style={styles.postReactions}>
                👍 ❤️ 😆{" "}
                {post.reactions >= 1000
                  ? `${(post.reactions / 1000).toFixed(1)}K`
                  : post.reactions}
              </Text>
              <Text style={styles.postComments}>{post.comments} comments</Text>
            </View>
            <View style={styles.postActions}>
              <Pressable
                onPress={() => toggleLike(post.id)}
                style={styles.postAction}
              >
                <Icon
                  name={post.liked ? "thumbs-up" : "thumbs-up-outline"}
                  color={post.liked ? "#4E46E5" : "#B7C0CD"}
                />
                <Text
                  style={[
                    styles.postActionText,
                    post.liked && { color: "#4E46E5" },
                  ]}
                >
                  Like
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void openComments(post.id)}
                style={styles.postAction}
              >
                <Icon name="chatbubble-outline" color="#B7C0CD" />
                <Text style={styles.postActionText}>Comment</Text>
              </Pressable>
              <Pressable style={styles.postAction} onPress={() => requestInternalShare({ kind: "community_post", id: post.id, title: post.title, preview: post.body })}>
                <Icon name="share-outline" color="#B7C0CD" />
                <Text style={styles.postActionText}>Share</Text>
              </Pressable>
            </View>
            {commentPostId === post.id ? (
              <View style={styles.communityCommentsPanel}>
                {commentsLoading ? (
                  <ActivityIndicator size="small" color="#B7A8FF" />
                ) : (post.commentItems || []).length ? (
                  (post.commentItems || []).map((item) => (
                    <View key={item.id} style={styles.communityCommentRow}>
                      <Text style={styles.communityCommentAuthor}>{item.author}</Text>
                      <Text style={styles.communityCommentBody}>{item.body}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.postComments}>No comments yet.</Text>
                )}
                <View style={styles.vibeCommentComposer}>
                  <TextInput
                    value={commentDraft}
                    onChangeText={setCommentDraft}
                    onSubmitEditing={() => void submitComment(post.id)}
                    placeholder="Write a comment..."
                    placeholderTextColor="#8994A6"
                    style={styles.vibeCommentInput}
                  />
                  <Pressable
                    onPress={() => void submitComment(post.id)}
                    style={styles.vibeCommentSend}
                  >
                    <Icon name="send" color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsLikeScreen({
  screen,
  data,
  setData,
  back,
  go,
}: {
  screen: Screen;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
  go: (s: Screen) => void;
}) {
  if (screen === "editProfile")
    return <EditProfile data={data} setData={setData} back={back} />;
  if (screen === "settings")
    return <Settings back={back} go={go} data={data} setData={setData} />;
  if (screen === "privacy")
    return (
      <ToggleScreen
        title="Privacy Settings"
        subtitle="Audience, discovery, contact, and safety controls."
        rows={[
          "Show profile in search",
          "Allow event message requests",
          "Show online status",
        ]}
        back={back}
        preferenceKeys={[
          "discoverable",
          "allow_message_requests",
          "show_online_status",
        ]}
      />
    );
  if (screen === "cookies")
    return (
      <ArticleScreen
        title="Cookies"
        subtitle="WeNitro currently uses only the storage required for authentication and app operation. Optional analytics, personalization, and marketing cookies are not enabled."
        back={back}
      />
    );
  if (screen === "terms")
    return (
      <ArticleScreen
        title="Terms"
        subtitle="Rules for account use, hosting, payments, and community conduct."
        back={back}
      />
    );
  if (screen === "privacyPolicy")
    return (
      <ArticleScreen
        title="Privacy Policy"
        subtitle="How profile, activity, contact, and safety data is used."
        back={back}
      />
    );
  if (screen === "help") return <HelpScreen back={back} />;
  if (screen === "feedback") return <FeedbackScreen back={back} />;
  if (screen === "phone")
    return (
      <SimpleForm
        title="Phone Management"
        subtitle="Add, verify, and change phone number."
        fields={["Phone number", "OTP code"]}
        back={back}
      />
    );
  if (screen === "emergency")
    return (
      <SimpleForm
        title="Emergency Contact"
        subtitle="Trusted contact for safety escalation."
        fields={["Contact name", "Relationship", "Phone number"]}
        back={back}
      />
    );
  if (screen === "socialLinks")
    return (
      <SimpleForm
        title="Social Links"
        subtitle="Public identity links shown on profile."
        fields={["Instagram", "LinkedIn", "Website"]}
        back={back}
      />
    );
  if (screen === "verification")
    return <VerificationScreen back={back} data={data} />;
  if (screen === "shop") return <ShopScreen back={back} />;
  if (screen === "activityHistory")
    return (
      <HistoryScreen
        title="Activity History"
        activities={data.activities}
        back={back}
      />
    );
  if (screen === "nitroHistory")
    return <NitroHistory nitro={data.nitro} back={back} />;
  if (screen === "saved")
    return (
      <CollectionScreen
        title="Saved"
        ids={data.savedIds}
        data={data}
        back={back}
      />
    );
  return (
    <CollectionScreen
      title="Liked"
      ids={data.likedIds}
      data={data}
      back={back}
    />
  );
}

function EditProfile({
  data,
  setData,
  back,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  back: () => void;
}) {
  const [name, setName] = useState(data.name);
  const [username, setUsername] = useState(data.username);
  const [bio, setBio] = useState(data.bio);
  const [avatarPreview, setAvatarPreview] = useState(
    data.avatarUri || neutralAvatar,
  );
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Array<{ id: number; name: string }>>(
    [],
  );
  const [selectedInterestIds, setSelectedInterestIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(
    data.mode === "authenticated" && isSupabaseConfigured,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chooseAvatar = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo-library permission is required to change your picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) {
      setAvatarPreview(uri);
      setPendingAvatarUri(uri);
    }
  };
  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured) {
      setCatalog(
        data.interests.map((interest, index) => ({ id: index + 1, name: interest })),
      );
      setSelectedInterestIds(data.interests.map((_, index) => index + 1));
      return;
    }
    let active = true;
    Promise.all([profileService.load(), profileService.listInterests()])
      .then(([details, available]) => {
        if (!active) return;
        setName(details.profile.full_name || "");
        setUsername(`@${details.profile.username}`);
        setBio(details.profile.bio || "");
        setCatalog(available);
        setSelectedInterestIds(details.interests.map((interest) => interest.id));
      })
      .catch((caught) =>
        active
          ? setError(
              caught instanceof Error ? caught.message : "Could not load profile.",
            )
          : undefined,
      )
      .finally(() => (active ? setLoading(false) : undefined));
    return () => {
      active = false;
    };
  }, [data.mode]);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (data.mode === "authenticated" && isSupabaseConfigured) {
        const previousName = data.name;
        await profileService.edit({
          full_name: name.trim(),
          username: username.trim().replace(/^@/, ""),
          bio: bio.trim(),
        });
        await profileService.setInterests(selectedInterestIds);
        if (pendingAvatarUri) await profileService.updateAvatar(pendingAvatarUri);
        const details = await profileService.load();
        setData((current) => ({
          ...current,
          name: details.profile.full_name || "New member",
          username: `@${details.profile.username}`,
          bio: details.profile.bio || "",
          location: details.profile.location || current.location,
          trustScore: details.profile.trust_score,
          avatarUri: details.profile.avatar_url || undefined,
          nitro: details.profile.nitro_points,
          interests: details.interests.map((interest) => interest.name),
          badges: details.badges.map((badge) => ({
            id: String(badge.id),
            name: badge.name,
            description: badge.description || "Awarded by WeNitro",
            icon: badge.icon,
          })),
          activities: current.activities.map((activity) =>
            activity.ownerId === current.userId
              ? {
                  ...activity,
                  host: details.profile.full_name || details.profile.username,
                  hostAvatar: details.profile.avatar_url || undefined,
                }
              : activity,
          ),
          vibes: current.vibes.map((vibe) =>
            vibe.mine
              ? {
                  ...vibe,
                  author: details.profile.full_name || details.profile.username,
                  authorAvatar: details.profile.avatar_url || undefined,
                }
              : vibe,
          ),
          stories: current.stories.map((story) =>
            story.mine
              ? {
                  ...story,
                  name: "Your Story",
                  authorAvatar: details.profile.avatar_url || undefined,
                }
              : story,
          ),
          communities: current.communities.map((community) => ({
            ...community,
            posts: community.posts.map((post) =>
              post.author === previousName
                ? {
                    ...post,
                    author: details.profile.full_name || details.profile.username,
                    authorAvatar: details.profile.avatar_url || undefined,
                  }
                : post,
            ),
          })),
        }));
      } else {
        setData((current) => ({
          ...current,
          name: name.trim(),
          username: username.startsWith("@") ? username : `@${username}`,
          bio: bio.trim(),
          interests: catalog
            .filter((interest) => selectedInterestIds.includes(interest.id))
            .map((interest) => interest.name),
        }));
      }
      back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScreenFrame
      title="Edit Profile"
      subtitle="Avatar, visible identity, bio, and interests."
      onBack={back}
    >
      <View style={styles.profileAvatarLarge}>
        <Text style={styles.profileAvatarText}>{name[0] || "W"}</Text>
      </View>
      <View style={{ alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Image
          source={{ uri: avatarPreview }}
          style={{ width: 104, height: 104, borderRadius: 52 }}
        />
        <Pressable
          accessibilityLabel="Choose a new profile picture"
          onPress={chooseAvatar}
          style={{
            backgroundColor: colors.purple50,
            borderColor: colors.purple500,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.purple600, fontWeight: "800" }}>
            Change Photo
          </Text>
        </Pressable>
        {pendingAvatarUri ? (
          <Text style={styles.meta}>The selected photo will upload when you save.</Text>
        ) : null}
      </View>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Username" value={username} onChangeText={setUsername} />
      <Field label="Bio" value={bio} onChangeText={setBio} multiline />
      <Text style={styles.label}>Interests</Text>
      {loading ? (
        <ActivityIndicator color={colors.purple600} />
      ) : (
        <View style={styles.wrap}>
          {catalog.map((interest) => {
            const selected = selectedInterestIds.includes(interest.id);
            return (
              <Pressable
                key={interest.id}
                onPress={() =>
                  setSelectedInterestIds((current) =>
                    selected
                      ? current.filter((id) => id !== interest.id)
                      : [...current, interest.id],
                  )
                }
              >
                <Pill selected={selected}>{interest.name}</Pill>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={saving ? "Saving..." : "Save Profile"}
        icon="save"
        onPress={save}
      />
    </ScreenFrame>
  );
}

function Settings({
  back,
  go,
  data,
  setData,
}: {
  back: () => void;
  go: (s: Screen) => void;
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}) {
  const dark = data.theme === "dark";
  const rows: [Screen, IconName, string][] = [
    ["privacy", "lock-closed", "Privacy"],
    ["cookies", "options", "Cookies"],
    ["terms", "document-text", "Terms"],
    ["privacyPolicy", "shield", "Privacy Policy"],
    ["phone", "call", "Phone"],
    ["emergency", "medical", "Emergency Contact"],
    ["help", "help-circle", "Help Chat"],
    ["feedback", "chatbox-ellipses", "Feedback"],
  ];
  const logout = () =>
    authService
      .signOut()
      .then(() => go("login"))
      .catch((error) => Alert.alert("Could not log out", error.message));
  return (
    <ScreenFrame
      title="Settings"
      subtitle="Account, privacy, support, legal, and danger-zone controls."
      onBack={back}
    >
      <Text style={[styles.groupLabel, dark && styles.groupLabelDark]}>
        APPEARANCE
      </Text>
      <View style={[styles.moduleGroup, dark && styles.moduleGroupDark]}>
        <View style={styles.moduleRow}>
          <View style={[styles.moduleIcon, dark && styles.moduleIconDark]}>
            <Icon name={dark ? "moon" : "sunny"} size={19} />
          </View>
          <View style={styles.messageBody}>
            <Text
              style={[styles.settingsLabel, dark && styles.settingsLabelDark]}
            >
              Dark theme
            </Text>
            <Text style={[styles.meta, dark && styles.metaDark]}>
              Use a darker system surface and status bar
            </Text>
          </View>
          <Switch
            value={dark}
            onValueChange={(enabled) =>
              setData((current) => ({
                ...current,
                theme: enabled ? "dark" : "light",
              }))
            }
            trackColor={{ true: colors.purple500, false: colors.border }}
          />
        </View>
      </View>
      <Text style={[styles.groupLabel, dark && styles.groupLabelDark]}>
        ACCOUNT & SAFETY
      </Text>
      <View style={[styles.moduleGroup, dark && styles.moduleGroupDark]}>
        {rows.slice(0, 6).map(([screen, icon, label], i) => (
          <Pressable
            key={screen}
            style={[
              styles.moduleRow,
              i < 5 && styles.moduleDivider,
              dark && i < 5 && styles.moduleDividerDark,
            ]}
            onPress={() => go(screen)}
          >
            <View style={[styles.moduleIcon, dark && styles.moduleIconDark]}>
              <Icon name={icon} size={19} />
            </View>
            <Text
              style={[styles.settingsLabel, dark && styles.settingsLabelDark]}
            >
              {label}
            </Text>
            <Icon
              name="chevron-forward"
              color={dark ? "#8290A7" : colors.soft}
              size={18}
            />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.groupLabel, dark && styles.groupLabelDark]}>
        SUPPORT
      </Text>
      <View style={[styles.moduleGroup, dark && styles.moduleGroupDark]}>
        {rows.slice(6).map(([screen, icon, label], i) => (
          <Pressable
            key={screen}
            style={[
              styles.moduleRow,
              i === 0 && styles.moduleDivider,
              dark && i === 0 && styles.moduleDividerDark,
            ]}
            onPress={() => go(screen)}
          >
            <View style={[styles.moduleIcon, dark && styles.moduleIconDark]}>
              <Icon name={icon} size={19} />
            </View>
            <Text
              style={[styles.settingsLabel, dark && styles.settingsLabelDark]}
            >
              {label}
            </Text>
            <Icon
              name="chevron-forward"
              color={dark ? "#8290A7" : colors.soft}
              size={18}
            />
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.logoutRow} onPress={logout}>
        <Icon name="log-out-outline" color={colors.danger} />
        <Text style={styles.dangerText}>Log out</Text>
      </Pressable>
      <Text style={styles.versionText}>
        WeNitro 1.0.0 · Made for real connection
      </Text>
    </ScreenFrame>
  );
}

function ToggleScreen({
  title,
  subtitle,
  rows,
  back,
  preferenceKeys,
  consent = false,
}: {
  title: string;
  subtitle: string;
  rows: string[];
  back: () => void;
  preferenceKeys?: Array<
    | "discoverable"
    | "allow_message_requests"
    | "show_online_status"
    | "show_distance"
    | "follower_approval"
    | "analytics"
    | "personalization"
    | "marketing"
    | null
  >;
  consent?: boolean;
}) {
  const [values, setValues] = useState(rows.map((_, i) => i < 2));
  const [loading, setLoading] = useState(
    isSupabaseConfigured && Boolean(preferenceKeys?.some(Boolean)),
  );
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured || !preferenceKeys?.some(Boolean)) return;
    let active = true;
    privacyService
      .loadPreferences()
      .then((preferences) => {
        if (!active) return;
        setValues(
          rows.map((_, index) => {
            const key = preferenceKeys[index];
            return key ? Boolean(preferences[key]) : index === 0 && consent;
          }),
        );
      })
      .catch((caught) =>
        active
          ? setError(
              caught instanceof Error
                ? caught.message
                : "Could not load privacy settings.",
            )
          : undefined,
      )
      .finally(() => (active ? setLoading(false) : undefined));
    return () => {
      active = false;
    };
  }, [title]);
  const change = async (index: number) => {
    if (index === 0 && consent) return;
    const next = !values[index];
    const key = preferenceKeys?.[index];
    if (isSupabaseConfigured && key) {
      setSavingIndex(index);
      setError("");
      try {
        const persisted = await privacyService.savePreference(key, next);
        setValues((current) =>
          current.map((value, currentIndex) => {
            const currentKey = preferenceKeys[currentIndex];
            return currentKey
              ? Boolean(persisted[currentKey])
              : currentIndex === 0 && consent;
          }),
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not save privacy setting.",
        );
      } finally {
        setSavingIndex(null);
      }
      return;
    }
    setValues((current) =>
      current.map((value, currentIndex) =>
        currentIndex === index ? next : value,
      ),
    );
  };
  return (
    <ScreenFrame title={title} subtitle={subtitle} onBack={back}>
      {loading ? <ActivityIndicator color={colors.purple600} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.moduleGroup}>
        {rows.map((row, i) => (
          <View
            key={row}
            style={[
              styles.moduleRow,
              i < rows.length - 1 && styles.moduleDivider,
            ]}
          >
            <View style={styles.messageBody}>
              <Text style={styles.settingsLabel}>{row}</Text>
              <Text style={styles.meta}>
                {i === 0 && consent
                  ? "Required for authentication, security, and core app operation"
                  : i < 2
                    ? "Recommended for a better WeNitro experience"
                    : "You can change this at any time"}
              </Text>
            </View>
            <Switch
              value={i === 0 && consent ? true : values[i]}
              disabled={loading || savingIndex === i || (i === 0 && consent)}
              onValueChange={() => change(i)}
              trackColor={{ true: colors.purple100, false: colors.border }}
              thumbColor={values[i] ? colors.purple600 : "#fff"}
            />
          </View>
        ))}
      </View>
    </ScreenFrame>
  );
}

function ArticleScreen({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle: string;
  back: () => void;
}) {
  return (
    <ScreenFrame title={title} subtitle={subtitle} onBack={back}>
      <View style={styles.card}>
        <Text style={styles.bodyText}>
          This demo screen presents the legal module with readable sections,
          effective dates, consent language, and action controls. In production
          this content is driven by CMS or legal markdown and versioned for
          audit history.
        </Text>
      </View>
      {[
        "Account responsibilities",
        "Hosting and community conduct",
        "Data use and retention",
        "Payments, refunds, and safety escalation",
      ].map((x) => (
        <Notice
          key={x}
          icon="document-text"
          title={x}
          text="Structured legal content block"
        />
      ))}
    </ScreenFrame>
  );
}

function HelpScreen({ back }: { back: () => void }) {
  return (
    <ScreenFrame
      title="Help Chat"
      subtitle="Support center, quick topics, and chat composer."
      onBack={back}
    >
      {[
        "I need help joining an activity",
        "Report a safety concern",
        "Hosting payment question",
      ].map((x) => (
        <Notice
          key={x}
          icon="chatbubbles"
          title={x}
          text="Tap to start guided help"
        />
      ))}
      <View style={styles.compose}>
        <Text style={styles.composeText}>Type your support question...</Text>
        <Icon name="send" />
      </View>
    </ScreenFrame>
  );
}

function FeedbackScreen({ back }: { back: () => void }) {
  const [text, setText] = useState("");
  return (
    <ScreenFrame
      title="Feedback"
      subtitle="Capture ratings, issues, and product suggestions."
      onBack={back}
    >
      <View style={styles.wrap}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pill key={n} selected={n === 5}>
            {n}★
          </Pill>
        ))}
      </View>
      <Field
        label="Feedback"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Tell the product team what should improve."
      />
      <Button
        label="Send Feedback"
        icon="send"
        onPress={() =>
          Alert.alert(
            "Feedback saved",
            "Demo feedback has been captured locally.",
          )
        }
      />
    </ScreenFrame>
  );
}

function SimpleForm({
  title,
  subtitle,
  fields,
  back,
}: {
  title: string;
  subtitle: string;
  fields: string[];
  back: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <ScreenFrame title={title} subtitle={subtitle} onBack={back}>
      {fields.map((field) => (
        <Field
          key={field}
          label={field}
          value={values[field] ?? ""}
          onChangeText={(text) => setValues((v) => ({ ...v, [field]: text }))}
        />
      ))}
      <Button
        label="Save"
        icon="save"
        onPress={() => Alert.alert("Saved", `${title} updated.`)}
      />
    </ScreenFrame>
  );
}

function VerificationScreen({ back, data }: { back: () => void; data: AppData }) {
  const [state, setState] = useState<{
    trustScore: number;
    emailVerified: boolean;
    phoneVerified: boolean;
    profileComplete: boolean;
  }>({
    trustScore: data.trustScore,
    emailVerified: false,
    phoneVerified: false,
    profileComplete: false,
  });
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(data.mode === "authenticated");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data.mode !== "authenticated") return;
    Promise.all([
      profileProductionService.getVerificationState(),
      verificationService.list(),
    ])
      .then(([verification, records]) => {
        setState(verification);
        setRequests(records);
      })
      .catch((caught) =>
        Alert.alert(
          "Verification unavailable",
          caught instanceof Error ? caught.message : "Please try again.",
        ),
      )
      .finally(() => setLoading(false));
  }, [data.mode]);

  const identityRequest = requests.find(
    (request) => request.verification_type === "identity",
  );
  const identityComplete = identityRequest?.status === "approved";
  const checks: [IconName, string, string, number, boolean][] = [
    ["mail", "Email verified", state.emailVerified ? "Complete" : "Confirmation required", 20, state.emailVerified],
    ["call", "Phone verified", state.phoneVerified ? "Complete" : "OTP verification", 20, state.phoneVerified],
    ["card", "Government ID", identityRequest ? `Review: ${identityRequest.status}` : "Submit securely for review", 20, identityComplete],
    ["person-circle", "Profile complete", state.profileComplete ? "Complete" : "Add photo, bio, and birth date", 20, state.profileComplete],
  ];
  const total = Math.max(
    state.trustScore,
    checks.filter((item) => item[4]).reduce((sum, item) => sum + item[3], 0),
  );
  const submitIdentity = async () => {
    if (data.mode !== "authenticated") {
      Alert.alert("Sign in required", "Identity verification is available for real accounts.");
      return;
    }
    if (identityRequest && ["submitted", "reviewing", "approved"].includes(identityRequest.status)) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setSubmitting(true);
    try {
      const request = await verificationService.submitIdentity(result.assets[0].uri);
      setRequests((current) => [request, ...current]);
      Alert.alert("Submitted securely", "Your identity review is now pending. We will notify you when it changes.");
    } catch (caught) {
      Alert.alert("Submission failed", caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ScreenFrame
      title="Verification"
      subtitle="Trust, identity, and host confidence."
      onBack={back}
    >
      <LinearGradient
        colors={["#1910C2", "#4E46E5"]}
        style={styles.verifyScoreHero}
      >
        <View style={styles.verifyScoreRing}>
          <Text style={styles.verifyScore}>{total}</Text>
          <Text style={styles.verifyScoreOutOf}>/100</Text>
        </View>
        <View style={styles.verifyScoreCopy}>
          <View style={styles.row}>
            <Icon name="shield-checkmark" color="#4E46E5" />
            <Text style={styles.verifyScoreTitle}>Trust Score</Text>
          </View>
          <Text style={styles.verifyScoreSubtitle}>{identityComplete ? "Verified profile" : "Not yet verified"}</Text>
          <View style={styles.verifyProgressDark}>
            <View style={[styles.verifyProgressFill, { width: `${total}%` }]} />
          </View>
          <Text style={styles.verifyScoreMeta}>
            {checks.filter((item) => item[4]).length} of {checks.length} checks
            complete
          </Text>
        </View>
      </LinearGradient>
      <Text style={styles.verificationSectionTitle}>
        Build your Badge of Trust
      </Text>
      {checks.map(([icon, title, text, score, complete]) => (
        <View key={title} style={styles.verificationCheck}>
          <View
            style={[
              styles.verificationCheckIcon,
              complete && styles.verificationCheckIconDone,
            ]}
          >
            <Icon
              name={complete ? "checkmark" : icon}
              color={complete ? "#fff" : colors.purple600}
            />
          </View>
          <View style={styles.messageBody}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.meta}>{text}</Text>
          </View>
          <View style={[styles.scorePill, complete && styles.scorePillDone]}>
            <Text
              style={[
                styles.scorePillText,
                complete && styles.scorePillTextDone,
              ]}
            >
              +{score}
            </Text>
          </View>
        </View>
      ))}
      {loading ? (
        <ActivityIndicator color={colors.purple600} />
      ) : !state.emailVerified && data.mode === "authenticated" ? (
        <Button label="Resend email verification" icon="mail" onPress={() => requestEmailVerification().then(() => Alert.alert("Email sent", "Check your inbox for the secure verification link.")).catch((caught) => Alert.alert("Email not sent", caught.message))} />
      ) : (
        <Button
          label={identityComplete ? "Identity verified" : identityRequest ? `Identity ${identityRequest.status}` : submitting ? "Uploading securely..." : "Submit identity document"}
          icon="shield-checkmark"
          onPress={submitIdentity}
        />
      )}
    </ScreenFrame>
  );
}

function ShopScreen({ back }: { back: () => void }) {
  return (
    <ScreenFrame
      title="Shop"
      subtitle="WeNitro rewards, boosts, and premium passes."
      onBack={back}
    >
      <LinearGradient colors={["#1910C2", "#4E46E5"]} style={styles.shopHero}>
        <View>
          <Text style={styles.shopKicker}>NITRO BALANCE</Text>
          <Text style={styles.shopBalance}>1,240</Text>
          <Text style={styles.profileSub}>Use points for boosts and perks</Text>
        </View>
        <View style={styles.shopBolt}>
          <Icon name="flash" color="#fff" size={32} />
        </View>
      </LinearGradient>
      <SectionTitle title="Popular rewards" />
      <View style={styles.shopGrid}>
        {[
          "Nitro Boost 500",
          "Host Premium",
          "Featured Event",
          "Community Pro",
        ].map((name, i) => (
          <Pressable key={name} style={styles.productCard}>
            <View
              style={[
                styles.productVisual,
                i % 2 === 1 && styles.productVisualAlt,
              ]}
            >
              <Icon
                name={
                  i === 0
                    ? "flash"
                    : i === 1
                      ? "diamond"
                      : i === 2
                        ? "megaphone"
                        : "people"
                }
                size={31}
                color="#fff"
              />
            </View>
            <Text style={styles.cardTitle}>{name}</Text>
            <Text style={styles.meta}>
              {i === 0 ? "500 Nitro" : `${200 + i * 100} Nitro`}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScreenFrame>
  );
}

function HistoryScreen({
  title,
  activities,
  back,
}: {
  title: string;
  activities: Activity[];
  back: () => void;
}) {
  return (
    <ScreenFrame
      title={title}
      subtitle="Timeline of hosted, joined, cancelled, and completed activities."
      onBack={back}
    >
      {activities.map((a) => (
        <ActivityCard key={a.id} item={a} compact />
      ))}
    </ScreenFrame>
  );
}

function NitroHistory({ nitro, back }: { nitro: number; back: () => void }) {
  return (
    <ScreenFrame
      title="Nitro History"
      subtitle="Ledger of earned and spent Nitro points."
      onBack={back}
    >
      <View style={styles.balance}>
        <Text style={styles.balanceValue}>{nitro}</Text>
        <Text style={styles.meta}>Current Nitro balance</Text>
      </View>
      {[
        "+50 Created an activity",
        "+15 Posted a vibe",
        "-100 Featured activity boost",
        "+20 Community engagement",
      ].map((x) => (
        <Notice
          key={x}
          icon="flash"
          title={x}
          text="Logged in local demo database"
        />
      ))}
    </ScreenFrame>
  );
}

function CollectionScreen({
  title,
  ids,
  data,
  back,
}: {
  title: string;
  ids: string[];
  data: AppData;
  back: () => void;
}) {
  const activities = data.activities.filter((a) => ids.includes(activityReactionId(a.id)));
  const vibes = data.vibes.filter((v) => ids.includes(vibeReactionId(v.id)));
  return (
    <ScreenFrame
      title={title}
      subtitle={`${title} activities and vibes in one collection.`}
      onBack={back}
    >
      {activities.length || vibes.length ? null : (
        <View style={styles.empty}>
          <Icon name="folder-open" size={40} />
          <Text style={styles.cardTitle}>Nothing here yet</Text>
        </View>
      )}
      {activities.map((a) => (
        <ActivityCard key={a.id} item={a} compact />
      ))}
      {vibes.map((v) => (
        <Notice key={v.id} icon="radio" title={v.event} text={v.text} />
      ))}
    </ScreenFrame>
  );
}

function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const dark = React.useContext(ThemeContext) === "dark";
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, dark && styles.titleDark]}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MiniCard({
  icon,
  title,
  text,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.miniCard}>
      <Icon name={icon} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.meta}>{text}</Text>
    </Pressable>
  );
}

function ActionCard({
  icon,
  title,
  text,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        playClickSound();
        onPress();
      }}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
    >
      <View style={styles.actionIcon}>
        <DepthIcon name={icon} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.meta}>{text}</Text>
      </View>
      <Icon name="chevron-forward" color={colors.soft} />
    </Pressable>
  );
}

function Notice({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.notice}>
      <Icon name={icon} />
      <View style={styles.noticeText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.meta}>{text}</Text>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabBar({ active, go }: { active: Screen; go: (s: Screen) => void }) {
  const tabs: [Screen, IconName, string][] = [
    ["feed", "home", "Home"],
    ["vibes", "film", "Vibes"],
    ["host", "add", "Host"],
    ["chat", "chatbubble-ellipses", "Chat"],
    ["profile", "person", "Profile"],
  ];
  const theme = React.useContext(ThemeContext);
  const { chats } = React.useContext(UnreadContext);
  const dark = active === "vibes" || theme === "dark";
  return (
    <SafeAreaView style={[styles.tabSafe, dark && styles.tabSafeDark]}>
      <View style={[styles.tabBar, dark && styles.tabBarDark]}>
        {tabs.map(([screen, icon, label]) => {
          const selected = active === screen;
          if (screen === "host")
            return (
              <Pressable
                key={screen}
                onPress={() => {
                  playClickSound();
                  go(screen);
                }}
                style={styles.centerTab}
              >
                <LinearGradient
                  colors={["#1910C2", "#4E46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.centerTabButton}
                >
                  <Icon name="add" color="#fff" size={31} />
                </LinearGradient>
                <Text
                  style={[
                    styles.tabText,
                    selected && styles.tabTextActive,
                    dark && styles.tabTextDark,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          return (
            <Pressable
              key={screen}
              onPress={() => {
                playClickSound();
                go(screen);
              }}
              style={styles.tab}
            >
              <View>
              <Icon
                name={selected ? icon : (`${icon}-outline` as IconName)}
                color={
                  selected
                    ? dark
                      ? colors.purple500
                      : colors.purple600
                    : dark
                      ? "#fff"
                      : colors.soft
                }
                size={24}
              />
              {screen === "chat" && chats > 0 ? (
                <View style={styles.notificationDot} />
              ) : null}
              </View>
              <Text
                style={[
                  styles.tabText,
                  selected && styles.tabTextActive,
                  dark && styles.tabTextDark,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [data, setData] = useState<AppData>(initialData);
  const initialWebRoute = useRef(readWebRoute()).current;
  const qaInitialScreen = process.env.EXPO_PUBLIC_QA_SCREEN as
    Screen | undefined;
  const [screen, setScreen] = useState<Screen>(
    qaInitialScreen ?? initialWebRoute?.screen ?? "login",
  );
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    initialWebRoute?.screen === "activityDetail" ? initialWebRoute.entityId ?? null : null,
  );
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    initialWebRoute?.screen === "communityDetail" ? initialWebRoute.entityId ?? null : null,
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialWebRoute?.screen === "profile" ? initialWebRoute.entityId ?? null : null,
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialWebRoute?.screen === "chat" ? initialWebRoute.entityId ?? null : null,
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [history, setHistory] = useState<Screen[]>([]);
  const [loaded] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [shareEntity, setShareEntity] = useState<InternalShareEntity | null>(null);
  const [selectedVibeId, setSelectedVibeId] = useState<string | null>(initialWebRoute?.screen === "vibes" ? initialWebRoute.entityId ?? null : null);

  useEffect(() => subscribeToInternalShareRequests(setShareEntity), []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const restoreRoute = () => {
      const route = readWebRoute();
      if (!route) return;
      setScreen(route.screen);
      setSelectedActivityId(route.screen === "activityDetail" ? route.entityId ?? null : null);
      setSelectedCommunityId(route.screen === "communityDetail" ? route.entityId ?? null : null);
      setSelectedProfileId(route.screen === "profile" ? route.entityId ?? null : null);
      setSelectedConversationId(route.screen === "chat" ? route.entityId ?? null : null);
      setSelectedVibeId(route.screen === "vibes" ? route.entityId ?? null : null);
    };
    window.addEventListener("popstate", restoreRoute);
    window.addEventListener("hashchange", restoreRoute);
    return () => {
      window.removeEventListener("popstate", restoreRoute);
      window.removeEventListener("hashchange", restoreRoute);
    };
  }, []);

  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured) {
      setNotificationUnreadCount(0);
      return;
    }
    let active = true;
    let cleanup: (() => Promise<void>) | undefined;
    notificationService
      .subscribeUnreadCount(
        undefined,
        (count) => active && setNotificationUnreadCount(count),
        (error) => console.warn("Notification count subscription failed", error),
      )
      .then((remove) => {
        if (active) cleanup = remove;
        else void remove();
      })
      .catch((error) => console.warn("Notification count unavailable", error));
    return () => {
      active = false;
      void cleanup?.();
    };
  }, [data.mode, data.userId]);

  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let subscription:
      | Awaited<ReturnType<typeof realtimeChatService.subscribeToInbox>>
      | undefined;
    const refreshInbox = (change: import("./src/services/realtime-chat").InboxMessageChange) => {
      if (!active || change.eventType !== "INSERT" || !change.message) return;
      const incoming = chatMessageFromRemote(change.message, data.userId);
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id !== String(change.conversationId) || conversation.messages.some((message) => message.id === incoming.id)
            ? conversation
            : { ...conversation, messages: [...conversation.messages, incoming], lastMessageAt: incoming.createdAt, unread: incoming.mine || selectedConversationId === conversation.id ? conversation.unread : conversation.unread + 1 },
        ),
      }));
    };
    const subscribe = () => {
      realtimeChatService
        .subscribeToInbox({
          onConversationChange: refreshInbox,
          onError: (error) =>
            console.warn("Chat inbox subscription failed", error),
        })
        .then((created) => {
          retryAttempt = 0;
          if (active) subscription = created;
          else void created.cleanup();
        })
        .catch((error) => {
          console.warn("Chat inbox unavailable", error);
          if (!active) return;
          retryAttempt += 1;
          retryTimer = setTimeout(
            subscribe,
            Math.min(1_000 * 2 ** (retryAttempt - 1), 15_000),
          );
        });
    };
    subscribe();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      void subscription?.cleanup();
    };
  }, [data.mode, data.userId, selectedConversationId]);

  useEffect(() => {
    if (data.mode !== "authenticated" || !isSupabaseConfigured) return;
    let active = true;
    let refreshing = false;
    const unsubscribe = subscribeToAppForeground(async () => {
      if (!active || refreshing) return;
      refreshing = true;
      try {
        const remote = await loadRemoteWorkspace();
        if (!active || !remote) return;
        setData((current) => {
          const next = hydrateRemoteData(remote, current);
          if (screen === "activities" || screen === "activityDetail") return { ...current, activities: next.activities, likedIds: next.likedIds, savedIds: next.savedIds };
          if (screen === "communities" || screen === "communityDetail") return { ...current, communities: next.communities };
          if (screen === "vibes") return { ...current, vibes: next.vibes, likedIds: next.likedIds };
          if (screen === "chat") return { ...current, conversations: next.conversations, stories: next.stories, people: next.people };
          if (screen === "feed") return { ...current, activities: next.activities, vibes: next.vibes, stories: next.stories };
          return next;
        });
      } catch (error) {
        console.warn("Foreground refresh failed", error);
      } finally {
        refreshing = false;
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [data.mode, data.userId, screen]);

  useEffect(() => {
    if (!loaded || !isSupabaseConfigured) return;
    let active = true;
    const refresh = async () => {
      try {
        const remote = await loadRemoteWorkspace();
        if (active && remote) {
          setData((current) => {
            const next = hydrateRemoteData(remote, current);
            setScreen((currentScreen) =>
              currentScreen === "login" || currentScreen === "signup"
                ? next.onboarded
                  ? "feed"
                  : "onboarding"
                : currentScreen,
            );
            return next;
          });
        }
      } catch (error) {
        console.warn("Supabase workspace refresh failed", error);
        if (active) {
          setData((current) => ({
            ...current,
            mode: "authenticated",
            activities: [],
            vibes: [],
            communities: [],
            conversations: [],
            stories: [],
            people: [],
            savedIds: [],
            likedIds: [],
          }));
          Alert.alert(
            "WeNitro could not load",
            error instanceof Error ? error.message : "Please try again.",
          );
        }
      }
    };
    bootstrapSession()
      .then(async (result) => {
        if (!active) return;
        if (result.status === "authenticated") await refresh();
        else if (initialWebRoute && !["login", "signup"].includes(initialWebRoute.screen)) {
          setScreen("login");
          if (Platform.OS === "web" && typeof window !== "undefined")
            window.history.replaceState({ wenitro: true }, "", webHashFor("login"));
        }
      })
      .catch((error) => console.warn("Session bootstrap failed", error))
      .finally(() => {
        if (active) setSessionChecked(true);
      });
    const unsubscribeRedirects = subscribeToAuthRedirects(
      () => refresh(),
      (error) => console.warn("OAuth redirect failed", error),
    );
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          setData(initialData);
          setHistory([]);
          setScreen("login");
        }
      },
    );
    return () => {
      active = false;
      unsubscribeRedirects();
      listener.subscription.unsubscribe();
    };
  }, [loaded]);

  const pushWebRoute = (next: Screen, entityId?: string, replace = false) => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({ wenitro: true }, "", webHashFor(next, entityId));
  };

  const go = (next: Screen) => {
    setHistory((items) => [...items, screen]);
    if (next !== "activityDetail") setSelectedActivityId(null);
    if (next !== "communityDetail") setSelectedCommunityId(null);
    if (next !== "profile") setSelectedProfileId(null);
    if (next !== "chat") setSelectedConversationId(null);
    if (next !== "vibes") setSelectedVibeId(null);
    if (next === "profile") setSelectedProfileId(null);
    setScreen(next);
    pushWebRoute(next);
  };
  const back = () => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.history.state?.wenitro
    ) {
      window.history.back();
      return;
    }
    setHistory((items) => {
      const copy = [...items];
      const prev = copy.pop() ?? "feed";
      setScreen(prev);
      pushWebRoute(prev, undefined, true);
      return copy;
    });
  };
  const openActivity = (id: string) => {
    setHistory((items) => [...items, screen]);
    setSelectedActivityId(id);
    setScreen("activityDetail");
    pushWebRoute("activityDetail", id);
  };
  const openCommunity = (id: string) => {
    setHistory((items) => [...items, screen]);
    setSelectedCommunityId(id);
    setScreen("communityDetail");
    pushWebRoute("communityDetail", id);
  };
  const openProfile = (id: string) => {
    setHistory((items) => [...items, screen]);
    setSelectedProfileId(id === data.userId ? null : id);
    setScreen("profile");
    pushWebRoute("profile", id === data.userId ? undefined : id);
  };
  const openConversation = (id: string | null) => {
    setSelectedConversationId(id);
    if (id) pushWebRoute("chat", id);
    else pushWebRoute("chat", undefined, true);
  };

  useEffect(() => subscribeToSharedContentNavigation((payload) => {
    if (payload.kind === "activity") openActivity(payload.entityId);
    else if (payload.kind === "community") openCommunity(payload.entityId);
    else if (payload.kind === "community_post" && payload.parentId) openCommunity(payload.parentId);
    else {
      setHistory((items) => [...items, screen]);
      setSelectedVibeId(payload.entityId);
      setScreen("vibes");
      pushWebRoute("vibes", payload.entityId);
    }
  }), [screen]);

  const content = useMemo(() => {
    const props = { data, setData, go, back };
    if (screen === "login") return <LoginScreen go={go} setData={setData} />;
    if (screen === "signup") return <SignupScreen go={go} setData={setData} />;
    if (screen === "onboarding")
      return <OnboardingScreen go={go} data={data} setData={setData} />;
    if (screen === "feed")
      return (
        <FeedScreen
          data={data}
          setData={setData}
          go={go}
          openActivity={openActivity}
        />
      );
    if (screen === "activities")
      return (
        <ActivitiesScreen
          data={data}
          setData={setData}
          go={go}
          openActivity={openActivity}
        />
      );
    if (screen === "vibes")
      return <VibesScreen data={data} go={go} setData={setData} initialVibeId={selectedVibeId} />;
    if (screen === "host")
      return <HostScreen go={go} data={data} setData={setData} />;
    if (screen === "chat")
      return (
        <ChatScreen
          data={data}
          setData={setData}
          initialConversationId={selectedConversationId}
          onConversationChange={openConversation}
        />
      );
    if (screen === "profile") {
      const person = selectedProfileId
        ? data.people.find((item) => item.id === selectedProfileId)
        : undefined;
      return person ? (
        <PublicProfileScreen person={person} data={data} back={back} />
      ) : (
        <ProfileScreen data={data} setData={setData} go={go} />
      );
    }
    if (screen === "search")
      return <SearchScreen data={data} setData={setData} back={back} go={go} />;
    if (screen === "notifications")
      return (
        <NotificationsScreen
          back={back}
          go={go}
          mode={data.mode}
          onUnreadCountChange={setNotificationUnreadCount}
        />
      );
    if (screen === "communities")
      return (
        <CommunitiesScreen
          data={data}
          setData={setData}
          go={go}
          openCommunity={openCommunity}
        />
      );
    if (screen === "createActivity") return <CreateActivityScreen {...props} />;
    if (screen === "activityDetail" && selectedActivityId) {
      const selectedActivity = data.activities.find(
        (item) => item.id === selectedActivityId,
      );
      if (selectedActivity)
        return (
          <ActivityDetailScreen
            activity={selectedActivity}
            data={data}
            setData={setData}
            back={back}
            go={go}
            openActivity={openActivity}
            openProfile={openProfile}
          />
        );
    }
    if (screen === "postVibe") return <PostVibeScreen {...props} />;
    if (screen === "createCommunity")
      return (
        <CreateCommunityScreen
          data={data}
          setData={setData}
          back={back}
          openCommunity={openCommunity}
        />
      );
    if (screen === "communityDetail" && selectedCommunityId) {
      const selectedCommunity = data.communities.find(
        (item) => item.id === selectedCommunityId,
      );
      if (selectedCommunity)
        return (
          <CommunityDetailScreen
            community={selectedCommunity}
            authorName={data.name || data.username}
            setData={setData}
            back={back}
          />
        );
    }
    return (
      <SettingsLikeScreen
        screen={screen}
        data={data}
        setData={setData}
        back={back}
        go={go}
      />
    );
  }, [screen, data, selectedActivityId, selectedCommunityId, selectedProfileId, selectedConversationId, selectedVibeId]);

  if (!fontsLoaded || !loaded || !sessionChecked) {
    return (
      <View style={styles.fontLoading}>
        <ActivityIndicator size="small" color={colors.purple600} />
        <Text style={styles.fontLoadingText}>
          {fontsLoaded && loaded
            ? "Restoring your WeNitro session"
            : "Preparing WeNitro"}
        </Text>
      </View>
    );
  }

  const showTabs = ![
    "login",
    "signup",
    "onboarding",
    "activityDetail",
    "createCommunity",
    "communityDetail",
  ].includes(screen);
  return (
    <ThemeContext.Provider value={data.theme}>
      <UnreadContext.Provider
        value={{
          notifications: notificationUnreadCount,
          chats: data.conversations.reduce((total, item) => total + item.unread, 0),
        }}
      >
      <View style={[styles.app, data.theme === "dark" && styles.appDark]}>
        <StatusBar style={data.theme === "dark" ? "light" : "dark"} />
        {content}
        <ShareToChatModal
          entity={shareEntity}
          conversations={data.conversations}
          people={data.people}
          onClose={() => setShareEntity(null)}
          onSent={(roomIds, messages) => {
            const mapped = messages.map((message) => chatMessageFromRemote(message, data.userId));
            setData((current) => ({
              ...current,
              conversations: current.conversations.map((conversation) => {
                const messageIndex = roomIds.indexOf(conversation.id);
                const message = messageIndex >= 0 ? mapped[messageIndex] : undefined;
                return message && !conversation.messages.some((item) => item.id === message.id)
                  ? { ...conversation, messages: [...conversation.messages, message], lastMessageAt: message.createdAt }
                  : conversation;
              }),
            }));
            if (shareEntity?.kind === "vibe" && isBackendId(shareEntity.id)) vibeService.recordShare(shareEntity.id, "direct").catch(() => undefined);
          }}
        />
        {showTabs ? (
          <TabBar
            active={
              screen === "activities"
                ? "feed"
                : ["feed", "vibes", "host", "chat", "profile"].includes(screen)
                  ? screen
                  : "profile"
            }
            go={go}
          />
        ) : null}
      </View>
      </UnreadContext.Provider>
    </ThemeContext.Provider>
  );
}

const maxWidth = 540;
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#EEEAF2" },
  appDark: { backgroundColor: "#080F1D" },
  fontLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.bg,
  },
  fontLoadingText: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    fontSize: 13,
  },
  safe: { flex: 1, backgroundColor: colors.bg },
  safeDark: { backgroundColor: "#080F1D" },
  screen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 112,
    gap: 16,
    backgroundColor: colors.bg,
  },
  screenDark: { backgroundColor: "#080F1D" },
  titleDark: { color: "#FFFFFF" },
  subtitleDark: { color: "#ABB5C5" },
  authWrap: {
    width: "100%",
    maxWidth,
    minHeight: "100%",
    alignSelf: "center",
    backgroundColor: colors.bg,
  },
  authBrandPanel: {
    minHeight: 330,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  authIllustration: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0.72,
  },
  authIllustrationShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(59, 22, 112, 0.32)",
  },
  authBrandCopy: { gap: 6, zIndex: 1, alignItems: "center" },
  authLogo: { width: 82, height: 82, marginBottom: 2 },
  loginHeading: { alignItems: "center", gap: 9, marginBottom: 5 },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 34,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0,
  },
  authSub: {
    fontFamily: "Manrope_500Medium",
    fontSize: 16,
    color: "#EDE3FF",
    lineHeight: 23,
  },
  authFaces: { flexDirection: "row", alignItems: "center", zIndex: 1 },
  authFace: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#6C2DE1",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  authFaceImage: { width: "100%", height: "100%" },
  authSocialProof: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 10,
  },
  authCard: {
    backgroundColor: colors.card,
    marginTop: -18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 34,
    gap: 15,
  },
  authEyebrow: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontSize: 11,
    fontWeight: "900",
  },
  formTitle: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 27,
    fontWeight: "900",
    color: colors.text,
  },
  formIntro: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  field: { gap: 8 },
  label: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
    fontWeight: "900",
    color: colors.muted,
    textTransform: "uppercase",
  },
  inputShell: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  textareaShell: { minHeight: 112, alignItems: "flex-start" },
  input: {
    flex: 1,
    minHeight: 50,
    color: colors.text,
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
    outlineStyle: "none",
  } as any,
  textarea: { minHeight: 104, paddingTop: 14, textAlignVertical: "top" },
  button: {
    minHeight: 51,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 17,
    borderWidth: 1,
    elevation: 2,
  },
  button_primary: {
    backgroundColor: colors.purple600,
    borderColor: colors.purple600,
    borderBottomWidth: 3,
    borderBottomColor: colors.purple800,
  },
  button_outline: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderBottomWidth: 3,
    borderBottomColor: "#D7D0E1",
  },
  button_ghost: {
    backgroundColor: colors.purple50,
    borderColor: colors.purple100,
    borderBottomWidth: 3,
    borderBottomColor: colors.purple100,
  },
  buttonText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  buttonTextAlt: { fontFamily: "Manrope_700Bold", color: colors.purple600 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  line: { height: 1, backgroundColor: colors.border, flex: 1 },
  dividerText: {
    fontFamily: "Manrope_700Bold",
    color: colors.soft,
    fontWeight: "700",
  },
  centerLink: {
    fontFamily: "Manrope_700Bold",
    textAlign: "center",
    color: colors.purple600,
    fontWeight: "800",
  },
  legal: {
    fontFamily: "Manrope_400Regular",
    color: colors.soft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  success: { color: colors.good, fontSize: 13, fontWeight: "800" },
  requirements: { gap: 4 },
  req: { color: colors.soft, fontSize: 13 },
  reqOk: { color: colors.good, fontWeight: "800" },
  headerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: { flex: 1 },
  title: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    lineHeight: 20,
    marginTop: 2,
    fontSize: 13,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    borderRadius: 8,
    padding: 22,
    gap: 12,
    overflow: "hidden",
    minHeight: 220,
    justifyContent: "flex-end",
  },
  heroTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: 0,
    maxWidth: 340,
  },
  heroSub: {
    fontFamily: "Manrope_500Medium",
    color: "#EEE6FF",
    lineHeight: 22,
    fontSize: 15,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minHeight: 37,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pillDark: { backgroundColor: "#131C2B", borderColor: "#314057" },
  pillSelected: {
    backgroundColor: colors.purple600,
    borderColor: colors.purple600,
  },
  pillText: {
    fontFamily: "Manrope_600SemiBold",
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  pillTextDark: { color: "#D5DCEA" },
  pillTextSelected: { color: "#fff" },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 14,
  },
  sectionText: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  link: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontWeight: "900",
  },
  card: { backgroundColor: colors.card, borderRadius: 8, overflow: "hidden" },
  depthIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.purple100,
    borderBottomWidth: 2,
    borderBottomColor: "#D7C5F7",
    elevation: 2,
  },
  compactCard: { flexDirection: "column" },
  imageWrap: {
    height: 240,
    position: "relative",
    backgroundColor: colors.purple100,
  },
  activityImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.purple100,
  },
  cardBody: { padding: 14, gap: 8 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
  },
  meta: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  price: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontWeight: "900",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  miniCard: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    gap: 9,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.purple50,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButton: { flex: 1 },
  segmentActive: {
    fontFamily: "Manrope_700Bold",
    flex: 1,
    textAlign: "center",
    backgroundColor: colors.card,
    borderRadius: 6,
    paddingVertical: 10,
    color: colors.purple600,
    fontWeight: "900",
  },
  segmentText: {
    fontFamily: "Manrope_600SemiBold",
    flex: 1,
    textAlign: "center",
    paddingVertical: 10,
    color: colors.muted,
    fontWeight: "800",
  },
  compose: {
    minHeight: 58,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  composeText: {
    fontFamily: "Manrope_500Medium",
    flex: 1,
    color: colors.muted,
    fontWeight: "700",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple100,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.purple600, fontWeight: "900" },
  bodyText: {
    fontFamily: "Manrope_400Regular",
    color: colors.text,
    lineHeight: 23,
    fontSize: 15,
    padding: 14,
  },
  actionRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    flexDirection: "row",
    gap: 18,
  },
  inlineAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { flex: 1, gap: 4 },
  listItem: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    lineHeight: 23,
  },
  photoDrop: {
    minHeight: 160,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.purple500,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  activityPickerRow: { flexDirection: "row", gap: 8, paddingVertical: 8 },
  activityPickerChip: {
    width: 138,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activityPickerChipActive: {
    borderColor: colors.purple600,
    backgroundColor: colors.purple50,
  },
  activityPickerImage: { width: 42, height: 54, borderRadius: 6 },
  activityPickerText: {
    flex: 1,
    color: colors.text,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    lineHeight: 15,
  },
  activityPickerTextActive: { color: colors.purple600 },
  detailImageWrap: {
    height: 245,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.purple100,
  },
  detailImage: { width: "100%", height: "100%" },
  detailBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  detailTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
    marginTop: 2,
  },
  intentPanel: {
    backgroundColor: colors.purple50,
    borderRadius: 8,
    padding: 15,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  intentIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  detailStats: { flexDirection: "row", gap: 9 },
  empty: {
    minHeight: 230,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 10,
  },
  messageRow: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  messageBody: { flex: 1 },
  time: { color: colors.soft, fontSize: 12, fontWeight: "700" },
  threadIdentity: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  threadMessages: { gap: 10, paddingVertical: 8, minHeight: 420 },
  messageBubble: {
    alignSelf: "flex-start",
    maxWidth: "82%",
    backgroundColor: colors.card,
    borderRadius: 15,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  messageBubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.purple600,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 4,
  },
  messageBubbleText: {
    fontFamily: "Manrope_400Regular",
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  messageBubbleTextMine: { color: "#fff" },
  messageTime: { color: colors.soft, fontSize: 10, fontWeight: "700" },
  messageTimeMine: { color: "#E9DCFF", textAlign: "right" },
  chatComposer: {
    minHeight: 54,
    backgroundColor: colors.card,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 46,
    color: colors.text,
    fontSize: 15,
    fontFamily: "Manrope_400Regular",
    outlineStyle: "none",
  } as any,
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHero: {
    borderRadius: 8,
    padding: 24,
    alignItems: "center",
    gap: 8,
    position: "relative",
  },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    elevation: 5,
    borderWidth: 3,
    borderColor: "#fff",
  },
  profileAvatarImage: { width: "100%", height: "100%", borderRadius: 19 },
  avatarEditBadge: {
    position: "absolute",
    right: -7,
    bottom: -5,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.purple600,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  profileAvatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    overflow: "hidden",
  },
  profileAvatarText: {
    color: colors.purple600,
    fontWeight: "900",
    fontSize: 30,
  },
  profileName: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 25,
    fontWeight: "900",
  },
  profileSub: {
    fontFamily: "Manrope_500Medium",
    color: "#EEE6FF",
    fontWeight: "700",
    textAlign: "center",
  },
  statRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  stat: {
    minWidth: 86,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontWeight: "900", fontSize: 19 },
  statLabel: { color: "#EEE6FF", fontSize: 12, fontWeight: "800" },
  settingsRow: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsLabel: {
    fontFamily: "Manrope_600SemiBold",
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  dangerBox: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FFE4E6",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  dangerText: { color: colors.danger, fontWeight: "800" },
  notice: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  noticeText: { flex: 1, gap: 4 },
  balance: {
    backgroundColor: colors.purple600,
    borderRadius: 8,
    padding: 22,
    alignItems: "center",
    gap: 4,
  },
  balanceValue: { color: "#fff", fontSize: 42, fontWeight: "900" },
  tabSafe: { backgroundColor: "#fff" },
  tabBar: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: 72,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    outlineStyle: "none",
  } as any,
  tabText: {
    fontFamily: "Manrope_600SemiBold",
    color: colors.soft,
    fontSize: 11,
    fontWeight: "800",
  },
  tabTextActive: { color: colors.purple600 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "100%",
    backgroundColor: colors.purple600,
  },
  onboardingIntro: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    position: "relative",
  },
  photoButton: {
    position: "absolute",
    top: 75,
    right: "37%",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.bg,
  },
  imageScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(17,10,25,0.22)",
  },
  floatingPill: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 15,
  },
  floatingPillText: {
    color: colors.purple800,
    fontSize: 11,
    fontWeight: "900",
  },
  saveButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20,13,28,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardImageCopy: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 15,
    gap: 4,
  },
  cardImageTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },
  cardImageMeta: {
    fontFamily: "Manrope_600SemiBold",
    color: "#F4EEFF",
    fontSize: 13,
    fontWeight: "800",
  },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  tinyAvatar: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.purple100,
    alignItems: "center",
    justifyContent: "center",
  },
  tinyAvatarText: { color: colors.purple600, fontSize: 10, fontWeight: "900" },
  metaStrong: {
    fontFamily: "Manrope_600SemiBold",
    color: colors.text,
    fontWeight: "800",
  },
  seatText: { color: colors.mint, fontSize: 12, fontWeight: "900" },
  searchBar: {
    minHeight: 52,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 14,
    paddingRight: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPlaceholder: {
    flex: 1,
    color: colors.soft,
    fontSize: 14,
    fontWeight: "600",
  },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalPills: { gap: 8, paddingRight: 20 },
  searchInputBar: {
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    fontFamily: "Manrope_500Medium",
    color: colors.text,
    fontSize: 14,
    outlineStyle: "none",
  } as any,
  searchScopes: {
    flexDirection: "row",
    borderRadius: 10,
    backgroundColor: "#ECE8F3",
    padding: 4,
    gap: 4,
  },
  searchScope: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  searchScopeActive: { backgroundColor: colors.purple600 },
  searchScopeText: {
    fontFamily: "Manrope_700Bold",
    color: colors.muted,
    fontSize: 11,
  },
  searchScopeTextActive: { color: "#fff" },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroBadgeText: { color: colors.purple800, fontSize: 10, fontWeight: "900" },
  heroAction: {
    marginTop: 3,
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  heroActionText: { color: colors.purple800, fontSize: 13, fontWeight: "900" },
  communityStrip: { flexDirection: "row", gap: 10 },
  communityTile: { flex: 1, minWidth: 0, gap: 6 },
  communityCoverAlt: { backgroundColor: "#157A6E" },
  communityCoverWarm: { backgroundColor: "#E85D75" },
  vibeCard: { backgroundColor: "#fff", borderRadius: 8, overflow: "hidden" },
  vibeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  vibeImage: {
    width: "100%",
    aspectRatio: 1.2,
    backgroundColor: colors.purple100,
  },
  reelsFrame: {
    height: 570,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#160D20",
  },
  reelSlide: {
    height: 570,
    position: "relative",
    backgroundColor: "#160D20",
    overflow: "hidden",
  },
  reelImage: { width: "100%", height: "100%" },
  reelShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  reelTop: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reelAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  reelAuthor: { color: "#fff", fontSize: 15, fontWeight: "900" },
  reelEvent: { color: "#F4EEFF", fontSize: 12, marginTop: 2 },
  reelCaption: {
    position: "absolute",
    left: 16,
    right: 78,
    bottom: 22,
    gap: 10,
  },
  reelText: { color: "#fff", fontSize: 16, lineHeight: 23, fontWeight: "700" },
  reelActions: {
    position: "absolute",
    right: 14,
    bottom: 22,
    alignItems: "center",
    gap: 17,
  },
  reelAction: { alignItems: "center", gap: 3 },
  reelActionText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  composeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  hostHero: {
    minHeight: 210,
    borderRadius: 8,
    padding: 22,
    justifyContent: "flex-end",
    gap: 8,
  },
  hostHeroIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  hostHeroTitle: {
    color: "#fff",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  hostHeroSub: { color: "#DCD0EA", lineHeight: 21 },
  tipPanel: {
    backgroundColor: "#FFF8E8",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    gap: 12,
  },
  tipIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#FFEDBC",
    alignItems: "center",
    justifyContent: "center",
  },
  storyRow: { flexDirection: "row", gap: 18, paddingVertical: 5 },
  storyItem: { alignItems: "center", gap: 5 },
  storyRing: {
    width: 59,
    height: 59,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  storyAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
  },
  storyImage: { width: "100%", height: "100%", borderRadius: 26 },
  storyName: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  storyPreview: {
    height: 260,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#160D20",
    position: "relative",
  },
  storyPreviewImage: { width: "100%", height: "100%" },
  storyPreviewShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  storyClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  storyPreviewCopy: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.purple600,
  },
  profileSettings: {
    position: "absolute",
    top: 15,
    right: 15,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileActions: { flexDirection: "row", gap: 10 },
  moduleGroup: { backgroundColor: "#fff", borderRadius: 8, overflow: "hidden" },
  moduleGroupDark: {
    backgroundColor: "#121D2E",
    borderWidth: 1,
    borderColor: "#223047",
  },
  moduleRow: {
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  moduleDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  moduleDividerDark: { borderBottomColor: "#253249" },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleIconDark: { backgroundColor: "#241C43" },
  groupLabel: {
    color: colors.soft,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 6,
  },
  groupLabelDark: { color: "#8290A7" },
  settingsLabelDark: { color: "#F7F8FC" },
  metaDark: { color: "#AAB4C5" },
  logoutRow: {
    minHeight: 54,
    backgroundColor: "#FFF1F2",
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  versionText: {
    color: colors.soft,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 8,
  },
  communityRow: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communityAvatar: {
    width: 54,
    height: 54,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  joinButton: {
    minHeight: 35,
    paddingHorizontal: 15,
    borderRadius: 18,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
  },
  joinedButton: { backgroundColor: colors.purple600 },
  joinText: { color: colors.purple600, fontSize: 12, fontWeight: "900" },
  verifyHero: { borderRadius: 8, padding: 22, alignItems: "center", gap: 10 },
  verifyTitle: {
    color: colors.text,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  verifyShield: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyProgress: {
    width: "100%",
    height: 7,
    backgroundColor: "#fff",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 5,
  },
  verifyProgressFill: {
    width: "75%",
    height: "100%",
    backgroundColor: colors.purple600,
  },
  verifyScoreHero: {
    minHeight: 152,
    borderRadius: 10,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  verifyScoreRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 8,
    borderColor: "#30B6E9",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  verifyScore: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 31,
  },
  verifyScoreOutOf: {
    fontFamily: "Manrope_600SemiBold",
    color: "#B5C0D3",
    fontSize: 11,
    marginTop: 13,
  },
  verifyScoreCopy: { flex: 1, gap: 5 },
  verifyScoreTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 18,
  },
  verifyScoreSubtitle: {
    fontFamily: "Manrope_600SemiBold",
    color: "#37D99A",
    fontSize: 12,
  },
  verifyProgressDark: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3C3658",
    overflow: "hidden",
    marginTop: 3,
  },
  verifyScoreMeta: {
    fontFamily: "Manrope_500Medium",
    color: "#AEB9CA",
    fontSize: 9,
  },
  verificationSectionTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 18,
    marginTop: 3,
  },
  verificationCheck: {
    minHeight: 68,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  verificationCheckIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
  },
  verificationCheckIconDone: { backgroundColor: colors.purple600 },
  scorePill: {
    minWidth: 42,
    borderRadius: 13,
    backgroundColor: colors.purple50,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
  },
  scorePillDone: { backgroundColor: "#E8F9F1" },
  scorePillText: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.purple600,
    fontSize: 10,
  },
  scorePillTextDone: { color: "#139B66" },
  shopHero: {
    minHeight: 160,
    borderRadius: 8,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shopKicker: { color: "#DCCAFF", fontSize: 11, fontWeight: "900" },
  shopBalance: {
    color: "#fff",
    fontSize: 38,
    fontWeight: "900",
    marginVertical: 3,
  },
  shopBolt: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  shopGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
    paddingBottom: 13,
    gap: 6,
  },
  productVisual: {
    height: 112,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  productVisualAlt: { backgroundColor: "#E85D75" },
  referenceScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    backgroundColor: "#fff",
    paddingBottom: 30,
    gap: 12,
  },
  referenceScreenDark: { backgroundColor: "#080F1D" },
  surfaceDark: {
    backgroundColor: "#131C2B",
    borderColor: "#29364A",
  },
  brandHeader: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 4,
  },
  brandHeaderIntegrated: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  brandLogo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogoImage: { width: 34, height: 34 },
  brandIdentity: { flex: 1, marginLeft: 10 },
  brandName: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 18,
  },
  brandLocation: { flexDirection: "row", alignItems: "center", gap: 3 },
  brandLocationText: {
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 10,
  },
  brandActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  themeToggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF5D6",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.72)",
    shadowColor: "#160B52",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 6,
  },
  themeToggleDark: {
    backgroundColor: "#161A38",
    borderColor: "rgba(198,188,255,.5)",
  },
  themeTogglePressed: { transform: [{ scale: 0.94 }] },
  themeToggleThumb: {
    position: "absolute",
    left: 2,
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FFE59B",
    shadowColor: "#8B5B00",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 3,
    elevation: 5,
  },
  themeToggleThumbDark: {
    backgroundColor: "#5A42D6",
    borderColor: "#8E7BFF",
    shadowColor: "#000",
  },
  notificationDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF4E68",
  },
  avatarStack: { flexDirection: "row", alignItems: "center" },
  stackAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
  },
  stackExtra: {
    backgroundColor: "#ECE8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  stackExtraText: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontSize: 8,
  },
  homeHeroShell: {
    paddingBottom: 24,
    borderBottomLeftRadius: 72,
    borderBottomRightRadius: 72,
    overflow: "hidden",
    shadowColor: "#1910C2",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 7,
  },
  promoRow: { paddingHorizontal: 14, gap: 10, paddingTop: 4 },
  promoDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
  },
  promoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,.42)",
  },
  promoDotActive: { width: 19, backgroundColor: "#FFFFFF" },
  promoMain: {
    width: 355,
    minHeight: 190,
    borderRadius: 22,
    overflow: "hidden",
    padding: 20,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.22)",
  },
  promoSide: {
    width: 180,
    minHeight: 150,
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
    justifyContent: "space-between",
  },
  promoCopy: { width: "55%", zIndex: 2, gap: 9, justifyContent: "center" },
  promoTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 18,
    lineHeight: 23,
  },
  promoText: {
    fontFamily: "Manrope_400Regular",
    color: "#ECE8FF",
    fontSize: 11,
    lineHeight: 16,
  },
  promoImage: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "53%",
    height: "100%",
  },
  whiteCta: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  whiteCtaText: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontSize: 9,
  },
  purpleCta: {
    alignSelf: "flex-start",
    backgroundColor: "#1910C2",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  purpleCtaText: { fontFamily: "Manrope_700Bold", color: "#fff", fontSize: 9 },
  homeFilters: { paddingHorizontal: 14, gap: 8 },
  homeActivityRow: { paddingHorizontal: 14, flexDirection: "row", gap: 9 },
  homeActivitySlider: { paddingHorizontal: 14, gap: 10 },
  homeActivityTile: {
    width: 238,
    height: 176,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#17131E",
  },
  viewAllActivityTile: {
    width: 190,
    height: 176,
    borderRadius: 8,
    backgroundColor: "#211242",
    padding: 18,
    justifyContent: "center",
    gap: 8,
  },
  viewAllActivityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  viewAllActivityTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 15,
  },
  viewAllActivityText: {
    fontFamily: "Manrope_400Regular",
    color: "#CFC5E8",
    fontSize: 11,
  },
  homeTileImage: { width: "100%", height: "100%" },
  homeTileShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  homeTileTag: {
    position: "absolute",
    top: 9,
    left: 9,
    backgroundColor: colors.purple600,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  homeTileTagText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 8,
  },
  homeTileHeart: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  homeTileCopy: { position: "absolute", left: 9, right: 9, bottom: 8, gap: 4 },
  homeTileTitle: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 12,
    lineHeight: 15,
  },
  homeTileMeta: { fontFamily: "Manrope_500Medium", color: "#fff", fontSize: 8 },
  pricePill: {
    backgroundColor: colors.purple600,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pricePillText: { fontFamily: "Manrope_700Bold", color: "#fff", fontSize: 9 },
  rewardBanner: {
    marginHorizontal: 14,
    minHeight: 58,
    borderRadius: 8,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  giftEmoji: { fontSize: 29 },
  smallPrimary: {
    backgroundColor: "#1910C2",
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  smallPrimaryText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 9,
  },
  peopleRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 14,
  },
  personTile: { width: 92, alignItems: "center" },
  personAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#4E46E5",
  },
  personOnline: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#29B77B",
    borderWidth: 2,
    borderColor: "#fff",
  },
  personName: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
  },
  personRole: {
    fontFamily: "Manrope_400Regular",
    color: colors.soft,
    fontSize: 8,
  },
  communityCards: { paddingHorizontal: 14, gap: 8 },
  communityImageCard: {
    width: 112,
    height: 98,
    borderRadius: 8,
    overflow: "hidden",
  },
  communityImage: { width: "100%", height: "100%" },
  communityShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(5,6,12,.35)",
  },
  communityCardCopy: { position: "absolute", left: 8, right: 8, bottom: 8 },
  communityCardTitle: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 10,
  },
  tribeRow: { paddingHorizontal: 14, gap: 7 },
  tribeChip: {
    width: 130,
    minHeight: 50,
    borderRadius: 7,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tribeText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#fff",
    fontSize: 10,
    flex: 1,
  },
  inviteBanner: {
    marginHorizontal: 14,
    minHeight: 58,
    backgroundColor: "#F7F4FF",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inviteButton: {
    backgroundColor: "#1910C2",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  inviteText: { fontFamily: "Manrope_700Bold", color: "#fff", fontSize: 9 },
  inviteReward: { fontFamily: "Manrope_700Bold", color: colors.purple600 },
  vibePreviewRow: { paddingHorizontal: 14, flexDirection: "row", gap: 8 },
  vibePreview: {
    width: 190,
    height: 112,
    borderRadius: 7,
    overflow: "hidden",
  },
  vibePreviewImage: { width: "100%", height: "100%" },
  vibePreviewText: {
    position: "absolute",
    left: 7,
    bottom: 7,
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 10,
    right: 32,
  },
  vibePreviewPlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,.46)",
    alignItems: "center",
    justifyContent: "center",
  },
  nitroRow: { paddingHorizontal: 14, flexDirection: "row", gap: 8 },
  nitroCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: "#F8F6FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 9,
  },
  nitroTitle: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 10,
  },
  nitroValue: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    fontSize: 9,
  },
  activitySearch: {
    marginHorizontal: 18,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activityFilterRow: {
    paddingHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterDropdown: {
    minHeight: 37,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  filterDropdownActive: {
    backgroundColor: colors.purple50,
    borderColor: colors.purple600,
  },
  filterPanel: {
    marginHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#F7F4FF",
    borderWidth: 1,
    borderColor: "#E1D8FA",
    padding: 14,
    gap: 13,
  },
  filterPanelTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 15,
  },
  filterPanelText: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  filterToggles: { gap: 8 },
  filterToggle: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  filterToggleText: {
    flex: 1,
    fontFamily: "Manrope_600SemiBold",
    color: colors.text,
    fontSize: 12,
  },
  activitiesHeading: {
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  activityHeadingText: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 16,
    flex: 1,
  },
  sortText: {
    fontFamily: "Manrope_500Medium",
    color: colors.soft,
    fontSize: 8,
  },
  discoveryCard: {
    marginHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  discoveryImageWrap: { height: 185, position: "relative" },
  discoveryImage: { width: "100%", height: "100%" },
  discoveryTag: {
    position: "absolute",
    left: 12,
    top: 12,
    backgroundColor: "#fff",
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  discoveryTagText: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 10,
  },
  matchPill: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "#fff",
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#18C789",
  },
  matchText: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 10,
  },
  discoveryBody: { padding: 14, gap: 7 },
  discoveryMeta: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontSize: 10,
  },
  discoveryTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  discoveryDescription: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  hostIdentity: { flexDirection: "row", alignItems: "center", gap: 8 },
  hostAvatar: { width: 34, height: 34, borderRadius: 17 },
  hostName: { fontFamily: "Manrope_700Bold", color: colors.text, fontSize: 12 },
  vibesSafe: {
    flex: 1,
    width: "100%",
    maxWidth,
    alignSelf: "center",
    backgroundColor: "#06070A",
  },
  fullReel: {
    flex: 1,
    position: "relative",
    backgroundColor: "#06070A",
    overflow: "hidden",
  },
  reelProgress: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 8,
    flexDirection: "row",
    gap: 4,
  },
  reelProgressTrack: {
    height: 3,
    flex: 1,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.3)",
  },
  reelProgressActive: { backgroundColor: "#FFFFFF" },
  reelsTabs: {
    position: "absolute",
    top: 82,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 22,
  },
  reelsTabMuted: {
    color: "rgba(255,255,255,.68)",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,.55)",
    textShadowRadius: 5,
  },
  reelsTabActiveWrap: { alignItems: "center", gap: 4 },
  reelsTabActive: {
    color: "#fff",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,.55)",
    textShadowRadius: 5,
  },
  reelsTabUnderline: {
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#fff",
  },
  reelNavigator: {
    position: "absolute",
    right: 14,
    top: 104,
    zIndex: 9,
    alignItems: "center",
    gap: 5,
  },
  reelNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,8,18,.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.2)",
  },
  reelCounter: { color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 11 },
  fullReelImage: { width: "100%", height: "100%" },
  fullReelShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  reelHeader: { position: "absolute", top: 0, left: 0, right: 0 },
  fullReelActions: {
    position: "absolute",
    right: 15,
    bottom: 90,
    alignItems: "center",
    gap: 14,
  },
  fullReelAction: { alignItems: "center", gap: 1 },
  fullReelActionText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 11,
  },
  moreVibe: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullReelCopy: {
    position: "absolute",
    left: 14,
    right: 72,
    bottom: 42,
    gap: 6,
  },
  vibeIdentity: { flexDirection: "row", alignItems: "center", gap: 10 },
  vibeAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#fff",
  },
  vibeUser: { fontFamily: "Manrope_800ExtraBold", color: "#fff", fontSize: 16 },
  ratingPill: {
    backgroundColor: "rgba(0,0,0,.55)",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: { fontFamily: "Manrope_700Bold", color: "#FFD33D", fontSize: 11 },
  vibeMood: { fontFamily: "Manrope_500Medium", color: "#fff", fontSize: 13 },
  vibeCaption: { fontFamily: "Manrope_500Medium", color: "#fff", fontSize: 14 },
  vibeHashtags: {
    fontFamily: "Manrope_600SemiBold",
    color: "#4E46E5",
    fontSize: 13,
  },
  createIntro: { paddingHorizontal: 20, paddingTop: 16, gap: 5 },
  createTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#0B1024",
    fontSize: 27,
    letterSpacing: 0,
  },
  createSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 390,
  },
  createCards: { paddingHorizontal: 16, gap: 12, marginTop: 6 },
  createActionCard: {
    minHeight: 126,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EEEAF1",
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    elevation: 2,
  },
  createActionIcon: {
    width: 62,
    height: 62,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  createActionTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#0B1024",
    fontSize: 16,
  },
  createActionText: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  createChevron: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  detailScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    backgroundColor: "#fff",
    paddingBottom: 24,
  },
  detailHero: {
    height: 250,
    position: "relative",
    overflow: "hidden",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  detailHeroImage: { width: "100%", height: "100%" },
  detailHeroShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  detailBack: {
    position: "absolute",
    top: 15,
    left: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTopActions: {
    position: "absolute",
    top: 15,
    right: 15,
    flexDirection: "row",
    gap: 9,
  },
  detailRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCategory: {
    position: "absolute",
    left: 15,
    top: 82,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  detailPeople: {
    position: "absolute",
    left: 15,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailMatch: {
    fontFamily: "Manrope_700Bold",
    color: "#41D19B",
    fontSize: 11,
  },
  detailContent: { paddingHorizontal: 18, paddingTop: 15, gap: 14 },
  detailTitleWrap: { flex: 1, gap: 5 },
  detailTags: { flexDirection: "row", gap: 6 },
  detailTagText: {
    fontFamily: "Manrope_600SemiBold",
    color: colors.purple600,
    fontSize: 11,
  },
  detailBookmark: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.purple50,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleCard: {
    backgroundColor: "#FAF9FC",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  scheduleItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  scheduleLabel: {
    fontFamily: "Manrope_500Medium",
    color: colors.soft,
    fontSize: 9,
  },
  scheduleValue: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 9,
    marginTop: 2,
  },
  locationBar: {
    backgroundColor: "#FAF9FC",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailSection: { paddingVertical: 5, gap: 8 },
  detailSectionTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 14,
  },
  detailBody: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  detailChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hostSection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hostLargeAvatar: { width: 48, height: 48, borderRadius: 24 },
  hostProfileButton: {
    borderWidth: 1,
    borderColor: colors.purple600,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  termsCard: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentBar: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minHeight: 45,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentAvatar: { width: 30, height: 30, borderRadius: 15 },
  commentInput: {
    flex: 1,
    minHeight: 42,
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    outlineStyle: "none",
  } as any,
  vibeAddCard: {
    backgroundColor: "#F7F4FF",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  feedbackCard: {
    backgroundColor: "#F7F4FF",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  vibeAddIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.purple600,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendedRow: { gap: 10, paddingBottom: 4 },
  recommendedCard: { width: 145, gap: 5 },
  recommendedImage: { width: "100%", height: 72, borderRadius: 7 },
  recommendedTitle: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 10,
    lineHeight: 14,
  },
  detailBottomActions: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  likeButton: {
    minHeight: 50,
    width: 110,
    borderWidth: 1,
    borderColor: colors.purple600,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  likeButtonActive: { backgroundColor: colors.purple50 },
  likeButtonText: { fontFamily: "Manrope_700Bold", color: colors.purple600 },
  joinButtonLarge: {
    flex: 1,
    minHeight: 50,
    backgroundColor: colors.purple600,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  joinButtonText: { fontFamily: "Manrope_700Bold", color: "#fff" },
  profileReferenceScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    backgroundColor: "#fff",
    paddingBottom: 26,
    gap: 12,
  },
  profileReferenceHero: {
    minHeight: 332,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    padding: 18,
    paddingTop: 55,
    gap: 14,
    overflow: "hidden",
  },
  profileBack: {
    position: "absolute",
    top: 14,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileSettingsRef: {
    position: "absolute",
    top: 14,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileThemeToggle: {
    position: "absolute",
    top: 18,
    right: 62,
    zIndex: 3,
  },
  profileIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  profileAvatarRef: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#fff",
    padding: 4,
  },
  profileOnline: {
    position: "absolute",
    right: 2,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#35D07F",
    borderWidth: 3,
    borderColor: "#fff",
  },
  profileIdentityCopy: { flex: 1, gap: 3 },
  profileNameRef: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 20,
  },
  profileHandle: {
    fontFamily: "Manrope_500Medium",
    color: "#DED8FF",
    fontSize: 13,
  },
  profileLocation: {
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 11,
  },
  trustCard: {
    width: "100%",
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: "rgba(10,12,55,.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.28)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trustLabel: {
    fontFamily: "Manrope_600SemiBold",
    color: "#fff",
    fontSize: 10,
  },
  trustScore: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#36E68E",
    fontSize: 27,
  },
  trustOutOf: { fontFamily: "Manrope_600SemiBold", fontSize: 13 },
  trustedText: {
    fontFamily: "Manrope_700Bold",
    color: "#36E68E",
    fontSize: 11,
  },
  profileSocialRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 9,
    marginTop: -2,
  },
  profileSocialButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.45)",
  },
  profileChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
  },
  profileChip: {
    backgroundColor: "rgba(255,255,255,.16)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  profileChipText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#fff",
    fontSize: 9,
  },
  profileActionRow: { marginHorizontal: 18, flexDirection: "row", gap: 12 },
  profileActionButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#DDD6F5",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  profileActionText: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
    fontSize: 13,
  },
  profileStatsRef: {
    marginHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    paddingVertical: 13,
    elevation: 2,
  },
  profileStatRef: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  profileStatValue: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 16,
  },
  profileStatLabel: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    fontSize: 9,
  },
  profileInfoCard: {
    marginHorizontal: 18,
    minHeight: 118,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileInfoCardColumn: {
    marginHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  profileSectionTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: colors.text,
    fontSize: 14,
  },
  profileBio: {
    fontFamily: "Manrope_400Regular",
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginVertical: 6,
  },
  aboutIllustration: {
    width: 140,
    height: 76,
    borderRadius: 8,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  aboutSun: {
    position: "absolute",
    top: 7,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFBF34",
  },
  interestRow: { flexDirection: "row", justifyContent: "space-between" },
  interestItem: { width: 52, alignItems: "center", gap: 5 },
  interestIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  interestLabel: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    fontSize: 8,
  },
  achievementsCard: {
    marginHorizontal: 18,
    minHeight: 155,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  achievementsTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 15,
  },
  achievementsLink: {
    fontFamily: "Manrope_600SemiBold",
    color: "#fff",
    fontSize: 9,
  },
  achievementRow: { gap: 14 },
  achievementItem: { width: 72, alignItems: "center", gap: 4 },
  achievementBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  achievementLabel: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 8,
    textAlign: "center",
  },
  achievementCaption: {
    fontFamily: "Manrope_400Regular",
    color: "#EEE9FF",
    fontSize: 7,
    textAlign: "center",
    lineHeight: 9,
  },
  profileTabs: {
    marginHorizontal: 18,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileTab: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    outlineStyle: "none",
  } as any,
  profileTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.purple600,
  },
  profileTabText: {
    fontFamily: "Manrope_500Medium",
    color: colors.muted,
    fontSize: 10,
  },
  profileTabTextActive: {
    fontFamily: "Manrope_700Bold",
    color: colors.purple600,
  },
  profileActivities: { marginHorizontal: 18, gap: 8 },
  profileActivityCard: {
    minHeight: 90,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileActivityImage: { width: 126, height: 76, borderRadius: 7 },
  profileActivityTitle: {
    fontFamily: "Manrope_700Bold",
    color: colors.text,
    fontSize: 11,
    lineHeight: 15,
  },
  profileVibeGrid: {
    marginHorizontal: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  profileVibeTile: {
    width: "32%",
    aspectRatio: 1.25,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "#ddd",
  },
  profileVibeImage: { width: "100%", height: "100%" },
  profilePlay: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileVibeCounts: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  profileVibeCount: {
    fontFamily: "Manrope_600SemiBold",
    color: "#fff",
    fontSize: 8,
  },
  chatDarkSafe: { flex: 1, backgroundColor: "#07111F" },
  dynamicChatScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: "100%",
    padding: 18,
    paddingTop: 24,
    paddingBottom: 110,
    gap: 15,
    backgroundColor: "#07111F",
  },
  dynamicChatHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dynamicChatTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 27,
  },
  dynamicChatSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: "#8D9AAF",
    fontSize: 12,
    marginTop: 3,
  },
  newGroupButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  newGroupPlus: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#EC3E92",
    borderWidth: 2,
    borderColor: "#07111F",
    alignItems: "center",
    justifyContent: "center",
  },
  dynamicChatSearch: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#142238",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dynamicChatSearchInput: {
    flex: 1,
    minHeight: 50,
    color: "#fff",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    outlineStyle: "none",
  } as any,
  dynamicChatTabs: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0D1A2C",
    borderWidth: 1,
    borderColor: "#1E2E45",
    padding: 4,
    flexDirection: "row",
  },
  dynamicChatTab: {
    flex: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dynamicChatTabActive: { backgroundColor: "#1910C2" },
  dynamicChatTabText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#91A0B4",
    fontSize: 12,
  },
  dynamicChatTabTextActive: { color: "#fff" },
  dynamicChatTabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,.12)",
    fontFamily: "Manrope_700Bold",
    color: "#C7D0DD",
    fontSize: 9,
    textAlign: "center",
    lineHeight: 18,
  },
  dynamicSectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dynamicSectionTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#F5F7FA",
    fontSize: 16,
  },
  dynamicSectionAction: {
    fontFamily: "Manrope_600SemiBold",
    color: "#4E46E5",
    fontSize: 11,
  },
  dynamicSectionMeta: {
    fontFamily: "Manrope_500Medium",
    color: "#7F8C9F",
    fontSize: 10,
  },
  dynamicStoryRow: { gap: 14, paddingVertical: 3 },
  dynamicStoryItem: { width: 68, alignItems: "center", gap: 6 },
  yourStory: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: "#33445B",
    padding: 2,
  },
  dynamicStoryRing: { width: 62, height: 62, borderRadius: 31, padding: 3 },
  dynamicStoryImage: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#07111F",
  },
  storyAddBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1910C2",
    borderWidth: 2,
    borderColor: "#07111F",
    alignItems: "center",
    justifyContent: "center",
  },
  dynamicStoryName: {
    width: 68,
    fontFamily: "Manrope_600SemiBold",
    color: "#D6DCE5",
    fontSize: 9,
    textAlign: "center",
  },
  dynamicConversation: {
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: "#101E30",
    borderWidth: 1,
    borderColor: "#1F3047",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  dynamicConversationAvatar: { width: 54, height: 54, borderRadius: 18 },
  dynamicOnline: {
    position: "absolute",
    right: -2,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#25D58A",
    borderWidth: 2,
    borderColor: "#101E30",
  },
  groupAvatarBadge: {
    position: "absolute",
    left: -3,
    bottom: -3,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  startChatBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  searchPersonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.purple100,
  },
  dynamicConversationName: {
    maxWidth: 205,
    fontFamily: "Manrope_700Bold",
    color: "#F6F8FB",
    fontSize: 14,
  },
  dynamicConversationTime: {
    fontFamily: "Manrope_500Medium",
    color: "#8390A3",
    fontSize: 9,
  },
  dynamicConversationPreview: {
    fontFamily: "Manrope_400Regular",
    color: "#97A3B4",
    fontSize: 11,
    marginTop: 5,
  },
  dynamicUnread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  dynamicUnreadText: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 9,
  },
  dynamicChatEmpty: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dynamicChatEmptyTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 17,
  },
  dynamicChatEmptyText: {
    fontFamily: "Manrope_400Regular",
    color: "#8996A8",
    fontSize: 11,
  },
  chatThreadHeader: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: 70,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1D2D43",
    backgroundColor: "#0B1829",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  chatHeaderButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chatThreadAvatar: { width: 43, height: 43, borderRadius: 15 },
  chatThreadName: {
    maxWidth: 155,
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 14,
  },
  chatThreadStatus: {
    fontFamily: "Manrope_400Regular",
    color: "#25CF88",
    fontSize: 9,
    marginTop: 2,
  },
  chatThreadScroll: {
    flex: 1,
    width: "100%",
    maxWidth,
    alignSelf: "center",
    backgroundColor: "#07111F",
  },
  chatThreadContent: {
    minHeight: "100%",
    padding: 16,
    paddingBottom: 28,
    gap: 10,
  },
  chatDayPill: {
    alignSelf: "center",
    borderRadius: 12,
    backgroundColor: "#142338",
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 8,
  },
  chatDayText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#93A0B2",
    fontSize: 9,
  },
  dynamicMessage: {
    alignSelf: "flex-start",
    maxWidth: "82%",
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    backgroundColor: "#14243A",
    padding: 11,
    gap: 5,
  },
  dynamicMessageMine: {
    alignSelf: "flex-end",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 5,
    backgroundColor: "#1910C2",
  },
  dynamicSender: {
    fontFamily: "Manrope_700Bold",
    color: "#4E46E5",
    fontSize: 9,
  },
  dynamicMessageText: {
    fontFamily: "Manrope_400Regular",
    color: "#F1F4F8",
    fontSize: 13,
    lineHeight: 19,
  },
  dynamicMessageTextMine: { color: "#fff" },
  dynamicMessageMeta: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dynamicMessageTime: {
    fontFamily: "Manrope_500Medium",
    color: "#8290A4",
    fontSize: 8,
  },
  dynamicMessageTimeMine: { color: "#DEDCFF" },
  dynamicMessageImage: { width: 220, height: 160, borderRadius: 10 },
  attachmentMenu: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: 88,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#1D2D43",
    backgroundColor: "#0B1829",
    flexDirection: "row",
    justifyContent: "space-around",
  },
  attachmentOption: { width: 74, alignItems: "center", gap: 7 },
  attachmentIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#D7DDEA",
    fontSize: 10,
  },
  dynamicComposer: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: "#1D2D43",
    backgroundColor: "#0B1829",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  composerIcon: {
    width: 37,
    height: 37,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  composerIconActive: { backgroundColor: "#253550" },
  dynamicChatInput: {
    flex: 1,
    maxHeight: 94,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: "#14243A",
    paddingHorizontal: 15,
    paddingVertical: 11,
    color: "#fff",
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    outlineStyle: "none",
  } as any,
  dynamicSend: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  dynamicSendDisabled: { opacity: 0.35 },
  dynamicStoryViewer: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    backgroundColor: "#05080E",
  } as any,
  dynamicStoryHero: { width: "100%", height: "100%" },
  dynamicStoryShade: { position: "absolute", inset: 0 } as any,
  storyProgressRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  storyProgress: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.28)",
  },
  storyProgressDone: { backgroundColor: "#fff" },
  storyViewerHeader: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  storyViewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: "#fff",
  },
  storyViewerName: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 13,
  },
  storyViewerTime: {
    fontFamily: "Manrope_400Regular",
    color: "#D6DAE1",
    fontSize: 9,
  },
  storyViewerClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  storyNextArea: {
    position: "absolute",
    top: 80,
    right: 0,
    bottom: 110,
    width: "45%",
  },
  storyViewerCopy: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    gap: 14,
  },
  storyViewerText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 17,
    lineHeight: 24,
    textShadowColor: "#000",
    textShadowRadius: 5,
  },
  storyReply: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.62)",
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storyReplyText: {
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 12,
  },
  groupModalOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 30,
    backgroundColor: "rgba(0,0,0,.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  } as any,
  groupModal: {
    width: "100%",
    maxWidth: 430,
    maxHeight: "78%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#314159",
    backgroundColor: "#101F32",
    padding: 20,
    gap: 14,
  },
  groupModalTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 21,
  },
  groupModalSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: "#8996A8",
    fontSize: 10,
    marginTop: 3,
  },
  groupNameInput: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#304058",
    backgroundColor: "#0B1829",
    paddingHorizontal: 14,
    color: "#fff",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    outlineStyle: "none",
  } as any,
  groupContacts: { maxHeight: 280 },
  groupContact: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#233249",
  },
  groupContactAvatar: { width: 43, height: 43, borderRadius: 14 },
  groupContactName: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 13,
  },
  groupContactStatus: {
    fontFamily: "Manrope_400Regular",
    color: "#8A97A9",
    fontSize: 9,
  },
  groupCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5A6980",
    alignItems: "center",
    justifyContent: "center",
  },
  groupCheckActive: { backgroundColor: "#1910C2", borderColor: "#1910C2" },
  groupCreateButton: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  groupCreateButtonText: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 13,
  },
  communitySafe: { flex: 1, backgroundColor: "#06111F" },
  communityListScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: "100%",
    backgroundColor: "#06111F",
    padding: 18,
    paddingTop: 24,
    paddingBottom: 104,
    gap: 16,
  },
  communityBrandRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  communityBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  communityBrandMark: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#4E46E5",
    fontSize: 34,
  },
  communityBrandName: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 25,
  },
  notificationBadge: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#FF416C",
  },
  communitySearch: {
    minHeight: 58,
    borderRadius: 28,
    backgroundColor: "#142238",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communitySearchInput: {
    flex: 1,
    minHeight: 54,
    color: "#fff",
    fontFamily: "Manrope_500Medium",
    fontSize: 16,
    outlineStyle: "none",
  } as any,
  communityStoryRow: { gap: 14, paddingVertical: 4 },
  communityStory: { width: 82, alignItems: "center", gap: 7 },
  createCommunityStory: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  communityStoryRing: { width: 68, height: 68, borderRadius: 34, padding: 3 },
  communityStoryImage: {
    width: "100%",
    height: "100%",
    borderRadius: 31,
    borderWidth: 2,
    borderColor: "#06111F",
  },
  communityStoryText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#F7F8FB",
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
  },
  communityFilters: { flexDirection: "row", gap: 10 },
  communityFilter: {
    minWidth: 92,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2A3950",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  communityFilterActive: { borderColor: "#1910C2", backgroundColor: "#1910C2" },
  communityFilterText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#B7C0CF",
    fontSize: 14,
  },
  communityFilterTextActive: { color: "#fff" },
  communityListCard: {
    minHeight: 144,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#223149",
    backgroundColor: "#101E30",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communityCardImage: { width: 106, height: 112, borderRadius: 12 },
  communityMiniBadge: {
    position: "absolute",
    left: 8,
    bottom: 7,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  communityCardBody: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 5,
  },
  communityCardName: {
    maxWidth: 205,
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 14,
  },
  communityCardTagline: {
    fontFamily: "Manrope_400Regular",
    color: "#B5BFCC",
    fontSize: 11,
  },
  communityCardMeta: {
    fontFamily: "Manrope_500Medium",
    color: "#AAB3C1",
    fontSize: 10,
  },
  publicText: { color: "#19D784" },
  communityTags: {
    maxWidth: 142,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  communityTag: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#102D5B",
  },
  communityTagGreen: { backgroundColor: "#053D35" },
  communityTagPurple: { backgroundColor: "#2A1958" },
  communityTagText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#4B93FF",
    fontSize: 9,
  },
  communityTagTextGreen: { color: "#22D6A0" },
  communityCardActions: {
    position: "absolute",
    right: 12,
    top: 12,
    bottom: 12,
    width: 83,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  communityJoin: {
    width: 83,
    minHeight: 39,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  communityJoined: { backgroundColor: "#064E42", borderColor: "#0E8F73" },
  communityCreated: { backgroundColor: "#123A73", borderColor: "#2878D8" },
  communityJoinText: {
    fontFamily: "Manrope_700Bold",
    color: "#4E46E5",
    fontSize: 11,
  },
  communityJoinedText: { color: "#39E6AC" },
  communityEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  communityEmptyTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 18,
  },
  communityEmptyText: {
    fontFamily: "Manrope_400Regular",
    color: "#A6AFBD",
    textAlign: "center",
    fontSize: 12,
  },
  communityCreateScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: "100%",
    backgroundColor: "#06111F",
    padding: 22,
    paddingBottom: 42,
    gap: 10,
  },
  communityCreateHeader: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  communityBack: { width: 40, height: 40, justifyContent: "center" },
  communityCreateTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 22,
    textAlign: "center",
  },
  communityCreateSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: "#A8B1BF",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  communityLabel: {
    fontFamily: "Manrope_700Bold",
    color: "#F7F8FB",
    fontSize: 13,
    marginTop: 8,
  },
  required: { color: "#FF455B" },
  communityInputRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#2A384C",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  communityInput: {
    flex: 1,
    minHeight: 50,
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 13,
    outlineStyle: "none",
  } as any,
  counter: {
    alignSelf: "flex-end",
    fontFamily: "Manrope_500Medium",
    color: "#8C97A8",
    fontSize: 10,
    padding: 10,
  },
  communityHelp: {
    fontFamily: "Manrope_400Regular",
    color: "#8C97A8",
    fontSize: 10,
    marginBottom: 5,
  },
  communityHelpCenter: {
    fontFamily: "Manrope_400Regular",
    color: "#8C97A8",
    fontSize: 10,
    textAlign: "center",
  },
  communitySelect: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#2A384C",
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  communitySelectText: {
    flex: 1,
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 13,
  },
  communityPlaceholder: { color: "#7D8798" },
  categoryMenu: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A384C",
    backgroundColor: "#101E30",
    overflow: "hidden",
  },
  categoryOption: {
    minHeight: 42,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#203047",
  },
  categoryOptionText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#E8ECF2",
    fontSize: 12,
  },
  communityTextAreaWrap: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: "#2A384C",
    borderRadius: 12,
    padding: 12,
  },
  communityTextArea: {
    minHeight: 76,
    fontFamily: "Manrope_500Medium",
    color: "#fff",
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
    outlineStyle: "none",
  } as any,
  roundUploader: {
    alignSelf: "center",
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#6E7A8E",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadPreview: { width: "100%", height: "100%" },
  uploadEdit: {
    position: "absolute",
    right: 3,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTitle: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  coverUploader: {
    height: 142,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#536076",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverUploadImage: { position: "absolute", width: "100%", height: "100%" },
  coverUploadShade: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(5,14,26,.78)",
  },
  rulesWrap: {
    minHeight: 196,
    borderWidth: 1,
    borderColor: "#2A384C",
    borderRadius: 12,
    padding: 14,
  },
  rulesTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  rulesTitleText: {
    fontFamily: "Manrope_700Bold",
    color: "#4E46E5",
    fontSize: 13,
  },
  rulesInput: {
    minHeight: 128,
    fontFamily: "Manrope_400Regular",
    color: "#C7CED8",
    fontSize: 12,
    lineHeight: 26,
    textAlignVertical: "top",
    outlineStyle: "none",
  } as any,
  communityPrimary: {
    minHeight: 55,
    borderRadius: 12,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  communityPrimaryDisabled: { opacity: 0.45 },
  communityPrimaryText: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 15,
  },
  successOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,.76)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  } as any,
  successModal: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#33445A",
    backgroundColor: "#142438",
    padding: 28,
    gap: 14,
  },
  successClose: {
    position: "absolute",
    right: 16,
    top: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2B3A4E",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  successMark: {
    alignSelf: "center",
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#2EC857",
    borderWidth: 14,
    borderColor: "rgba(46,200,87,.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 23,
    textAlign: "center",
  },
  successText: {
    fontFamily: "Manrope_400Regular",
    color: "#B6BFCC",
    fontSize: 13,
    textAlign: "center",
  },
  successCommunity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginVertical: 6,
  },
  successAvatar: { width: 64, height: 64, borderRadius: 32 },
  successCommunityName: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 16,
  },
  successCategory: {
    fontFamily: "Manrope_500Medium",
    color: "#4E46E5",
    fontSize: 12,
  },
  successTextSmall: {
    fontFamily: "Manrope_400Regular",
    color: "#B6BFCC",
    fontSize: 11,
  },
  communityDetailScreen: {
    width: "100%",
    maxWidth,
    alignSelf: "center",
    minHeight: "100%",
    backgroundColor: "#06111F",
    paddingBottom: 28,
  },
  communityCover: { height: 168, overflow: "hidden" },
  communityCoverImage: { width: "100%", height: "100%" },
  communityCoverShade: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,.25)",
  } as any,
  communityDetailBack: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  communityTopActions: {
    position: "absolute",
    top: 18,
    right: 18,
    flexDirection: "row",
    gap: 10,
  },
  communityRoundAction: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  communityIdentity: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communityIdentityImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "#F6B53D",
  },
  communityDetailName: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 20,
  },
  communityDetailStats: {
    fontFamily: "Manrope_500Medium",
    color: "#B3BDCB",
    fontSize: 12,
  },
  detailJoin: {
    minWidth: 90,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  detailJoined: {
    borderWidth: 1,
    borderColor: "#177A59",
    backgroundColor: "#0A3A31",
  },
  detailJoinText: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 13,
  },
  communityDetailTagline: {
    marginHorizontal: 20,
    marginTop: 10,
    fontFamily: "Manrope_500Medium",
    color: "#D3D8E0",
    fontSize: 13,
  },
  communityLinks: {
    marginHorizontal: 20,
    marginVertical: 14,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: "#E5ECFA",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  communityDetailFilters: {
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  detailFilter: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#122136",
    alignItems: "center",
    justifyContent: "center",
  },
  detailFilterActive: { backgroundColor: "#1910C2" },
  detailFilterText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#D3D8E0",
    fontSize: 12,
  },
  detailFilterTextActive: { color: "#fff" },
  communityComposer: {
    margin: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#23344A",
    backgroundColor: "#101E30",
    overflow: "hidden",
  },
  communityComposerTop: {
    minHeight: 62,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  composerAvatar: { width: 37, height: 37, borderRadius: 19 },
  communityComposerInput: {
    flex: 1,
    minHeight: 40,
    color: "#fff",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    outlineStyle: "none",
  } as any,
  composerActions: {
    minHeight: 45,
    borderTopWidth: 1,
    borderTopColor: "#223149",
    flexDirection: "row",
  },
  composerAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  composerActionText: {
    fontFamily: "Manrope_500Medium",
    color: "#CBD2DC",
    fontSize: 9,
  },
  communityPost: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#223149",
    backgroundColor: "#101E30",
    padding: 14,
    gap: 8,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  postAvatar: { width: 34, height: 34, borderRadius: 17 },
  postAuthor: { fontFamily: "Manrope_700Bold", color: "#EEF1F5", fontSize: 12 },
  postTime: {
    fontFamily: "Manrope_400Regular",
    color: "#AAB3C1",
    fontSize: 10,
  },
  postTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 17,
    lineHeight: 23,
  },
  postCategory: {
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#102957",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  postCategoryText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#3F8EF5",
    fontSize: 10,
  },
  postBody: {
    fontFamily: "Manrope_400Regular",
    color: "#C1C9D4",
    fontSize: 12,
    lineHeight: 18,
  },
  postImage: { width: "100%", height: 190, borderRadius: 10 },
  postMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postReactions: {
    fontFamily: "Manrope_500Medium",
    color: "#C7CED8",
    fontSize: 11,
  },
  postComments: {
    fontFamily: "Manrope_500Medium",
    color: "#B4BDCA",
    fontSize: 11,
  },
  postActions: {
    borderTopWidth: 1,
    borderTopColor: "#24334A",
    paddingTop: 10,
    flexDirection: "row",
  },
  postAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  postActionText: {
    fontFamily: "Manrope_600SemiBold",
    color: "#C0C7D2",
    fontSize: 11,
  },
  communityCommentsPanel: {
    borderTopWidth: 1,
    borderTopColor: "#24334A",
    paddingTop: 12,
    gap: 10,
  },
  communityCommentRow: {
    borderRadius: 12,
    backgroundColor: "#142137",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
  },
  communityCommentAuthor: {
    fontFamily: "Manrope_700Bold",
    color: "#FFFFFF",
    fontSize: 12,
  },
  communityCommentBody: {
    fontFamily: "Manrope_400Regular",
    color: "#C7CED8",
    fontSize: 13,
    lineHeight: 18,
  },
  vibeCommentsSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    minHeight: 320,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#10192A",
    padding: 18,
    paddingBottom: 92,
    gap: 12,
  },
  vibeCommentsTitle: {
    fontFamily: "Manrope_800ExtraBold",
    color: "#fff",
    fontSize: 18,
  },
  vibeCommentsList: { flexGrow: 0, minHeight: 180 },
  vibeComment: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  vibeCommentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  vibeCommentInitial: { fontFamily: "Manrope_800ExtraBold", color: "#fff" },
  vibeCommentAuthor: {
    fontFamily: "Manrope_700Bold",
    color: "#fff",
    fontSize: 12,
  },
  vibeCommentBody: {
    fontFamily: "Manrope_400Regular",
    color: "#D1D7E2",
    fontSize: 13,
    lineHeight: 18,
  },
  vibeNoComments: {
    paddingVertical: 45,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    color: "#8994A6",
  },
  vibeCommentComposer: {
    minHeight: 50,
    borderRadius: 25,
    paddingLeft: 16,
    paddingRight: 5,
    backgroundColor: "#1A2639",
    flexDirection: "row",
    alignItems: "center",
  },
  vibeCommentInput: {
    flex: 1,
    color: "#fff",
    fontFamily: "Manrope_500Medium",
    outlineStyle: "none",
  } as any,
  vibeCommentSend: {
    width: 41,
    height: 41,
    borderRadius: 21,
    backgroundColor: "#1910C2",
    alignItems: "center",
    justifyContent: "center",
  },
  tabSafeDark: { backgroundColor: "#0A0C10" },
  tabBarDark: { backgroundColor: "#0A0C10", borderTopColor: "#20242C" },
  tabTextDark: { color: "#fff" },
  centerTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    marginTop: -17,
    outlineStyle: "none",
  } as any,
  centerTabButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#1910C2",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
});
