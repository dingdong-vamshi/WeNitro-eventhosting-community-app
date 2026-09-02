import type { User } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type Profile = {
  id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  date_of_birth: string | null;
  gender: string | null;
  trust_score: number;
  karma: number;
  nitro_points: number;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  deleted_at: string | null;
  nationality: string | null;
  occupation: string | null;
  is_verified: boolean;
  onboarding_completed: boolean;
};

export type Interest = {
  id: number;
  slug: string;
  name: string;
  icon: string | null;
};

export type VerificationBadge = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  awardedAt: string;
};

export type ProfileDetails = {
  profile: Profile;
  interests: Interest[];
  badges: VerificationBadge[];
};

export type ProfileEditInput = Partial<
  Pick<
    Profile,
    | "username"
    | "full_name"
    | "bio"
    | "website"
    | "location"
    | "date_of_birth"
    | "gender"
    | "is_private"
    | "nationality"
    | "occupation"
  >
>;

export type PrivacyPreferences = {
  user_id: number;
  profile_visibility: "public" | "friends" | "private";
  email_visibility: "public" | "friends" | "private";
  phone_visibility: "public" | "friends" | "private";
  message_visibility: "everyone" | "friends" | "none";
  show_online_status: boolean;
  discoverable: boolean;
  allow_message_requests: boolean;
  show_distance: boolean;
  follower_approval: boolean;
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  updated_at: string;
};

export type PrivacyPreferenceInput = Partial<
  Omit<PrivacyPreferences, "user_id" | "updated_at">
>;

export type ConsentPurpose =
  | "terms"
  | "privacy"
  | "analytics"
  | "personalization"
  | "marketing"
  | "location"
  | "notifications";

export type ConsentRecord = {
  id: number;
  user_id: number;
  purpose: ConsentPurpose;
  granted: boolean;
  policy_version: string;
  source: "app" | "web" | "support";
  created_at: string;
};

export type DataSubjectRequestType =
  | "access"
  | "correction"
  | "erasure"
  | "grievance";

export type DataSubjectRequest = {
  id: number;
  user_id: number;
  request_type: DataSubjectRequestType;
  details: string;
  status: "submitted" | "in_review" | "completed" | "rejected";
  due_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "nudity"
  | "violence"
  | "impersonation"
  | "privacy"
  | "other";

export type ReportTarget =
  | { type: "user"; id: number }
  | { type: "vibe"; id: number }
  | { type: "community_post"; id: number }
  | { type: "message"; id: number };

export type ContentReport = {
  id: number;
  reporter_id: number;
  subject_user_id: number | null;
  vibe_id: number | null;
  community_post_id: number | null;
  message_id: number | null;
  reason: ReportReason;
  details: string;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  created_at: string;
};

export type ContentListItem = {
  id: number;
  type: "activity" | "vibe";
  createdAt: string;
  content: Record<string, unknown>;
};

export type HistoryItem = {
  id: string;
  type: "activity" | "story" | "share";
  occurredAt: string;
  action: string;
  content: Record<string, unknown>;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type VerificationState = {
  trustScore: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  badges: VerificationBadge[];
  status:
    | "unsubmitted"
    | "draft"
    | "submitted"
    | "reviewing"
    | "approved"
    | "rejected";
  latestRequestId: number | null;
  reviewNotes: string;
};

type CursorOptions = { limit?: number; before?: string };
type LegacyContentTable = "tbl_event_saves" | "tbl_event_likes";
type Row = Record<string, unknown>;

export const privacyBridgeRpc = {
  get: "get_user_privacy_settings",
  update: "update_user_privacy_settings",
} as const;

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const currentUser = async (): Promise<User> => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user;
};

const positiveInteger = (value: unknown, field: string): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field}.`);
  }
  return parsed;
};

const currentLegacyUserId = async (): Promise<number> => {
  await currentUser();
  const { data, error } = await supabase.rpc("get_current_legacy_user_id");
  if (error) throw error;
  return positiveInteger(data, "legacy user id");
};

const pageSize = (requested?: number) => {
  if (requested === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error("Page size must be a positive integer.");
  }
  return Math.min(requested, MAX_PAGE_SIZE);
};

const validatedCursor = (before?: string) => {
  if (!before) return undefined;
  const date = new Date(before);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid page cursor.");
  return date.toISOString();
};

const asRecord = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

const relationRecord = (value: unknown): Row =>
  Array.isArray(value) ? asRecord(value[0]) : asRecord(value);

const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const cleanText = (
  value: string | null | undefined,
  field: string,
  maxLength: number,
) => {
  if (value === null || value === undefined) return value;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned || null;
};

const validateAdultDate = (dateOfBirth: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error("Date of birth must use YYYY-MM-DD.");
  }
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.toISOString().slice(0, 10) !== dateOfBirth
  ) {
    throw new Error("Date of birth is invalid.");
  }
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = today.getUTCMonth() - birthDate.getUTCMonth();
  if (
    month < 0 ||
    (month === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  if (age < 18) throw new Error("WeNitro profiles require a minimum age of 18.");
};

const mapPrivacy = (value: unknown): PrivacyPreferences => {
  const row = relationRecord(value);
  const profile = String(
    row.profile_visibility ?? "public",
  ) as PrivacyPreferences["profile_visibility"];
  const email = String(
    row.email_visibility ?? "friends",
  ) as PrivacyPreferences["email_visibility"];
  const phone = String(
    row.phone_visibility ?? "friends",
  ) as PrivacyPreferences["phone_visibility"];
  const message = String(
    row.message_visibility ?? "everyone",
  ) as PrivacyPreferences["message_visibility"];
  if (!["public", "friends", "private"].includes(profile)) {
    throw new Error("Privacy settings returned an invalid profile visibility.");
  }
  if (!["public", "friends", "private"].includes(email)) {
    throw new Error("Privacy settings returned an invalid email visibility.");
  }
  if (!["public", "friends", "private"].includes(phone)) {
    throw new Error("Privacy settings returned an invalid phone visibility.");
  }
  if (!["everyone", "friends", "none"].includes(message)) {
    throw new Error("Privacy settings returned an invalid message visibility.");
  }
  return {
    user_id: positiveInteger(row.user_id, "privacy user id"),
    profile_visibility: profile,
    email_visibility: email,
    phone_visibility: phone,
    message_visibility: message,
    show_online_status: row.show_online_status !== false,
    discoverable: profile === "public",
    allow_message_requests: message !== "none",
    show_distance: false,
    follower_approval: profile !== "public",
    analytics: false,
    personalization: false,
    marketing: false,
    updated_at: String(row.updated_at ?? ""),
  };
};

const readPrivacy = async (): Promise<PrivacyPreferences> => {
  const { data, error } = await supabase.rpc(privacyBridgeRpc.get);
  if (error) throw error;
  return mapPrivacy(data);
};

const writePrivacy = async (
  input: PrivacyPreferenceInput,
): Promise<PrivacyPreferences> => {
  if (!Object.keys(input).length) throw new Error("No privacy changes supplied.");
  const profileVisibility =
    input.profile_visibility ??
    (input.discoverable === undefined
      ? null
      : input.discoverable
        ? "public"
        : "private");
  const messageVisibility =
    input.message_visibility ??
    (input.allow_message_requests === undefined
      ? null
      : input.allow_message_requests
        ? "everyone"
        : "none");
  const { data, error } = await supabase.rpc(privacyBridgeRpc.update, {
    p_profile_visibility: profileVisibility,
    p_email_visibility: input.email_visibility ?? null,
    p_phone_visibility: input.phone_visibility ?? null,
    p_message_visibility: messageVisibility,
    p_show_online_status: input.show_online_status ?? null,
  });
  if (error) throw error;
  return mapPrivacy(data);
};

const mapProfile = (value: unknown, privacy?: PrivacyPreferences): Profile => {
  const row = asRecord(value);
  const createdAt = String(row.create_at ?? "");
  const rating = Number(row.rating ?? 0);
  return {
    id: positiveInteger(row.id, "profile id"),
    username: String(row.username ?? ""),
    full_name: nullableText(row.fullname),
    avatar_url: nullableText(row.profile_image),
    bio: nullableText(row.bio) ?? nullableText(row.about),
    website: null,
    location: nullableText(row.nationality),
    date_of_birth: nullableText(row.dob),
    gender: nullableText(row.gender),
    trust_score: Number.isFinite(rating) ? rating : 0,
    karma: 0,
    nitro_points: Number(row.points ?? 0),
    is_private: privacy?.profile_visibility === "private",
    created_at: createdAt,
    updated_at: createdAt,
    last_active_at: createdAt,
    deleted_at: Number(row.is_delete ?? 0) === 1 ? createdAt : null,
    nationality: nullableText(row.nationality),
    occupation: nullableText(row.occupation),
    is_verified: Number(row.isverified ?? 0) === 1,
    onboarding_completed: Boolean(row.onboarding_completed),
  };
};

const mapInterest = (value: unknown): Interest => {
  const row = relationRecord(value);
  const name = String(row.name ?? "");
  return {
    id: positiveInteger(row.id, "interest id"),
    slug: slugify(name),
    name,
    icon: null,
  };
};

const mapBadges = (rows: unknown[]): VerificationBadge[] =>
  rows.flatMap((value) => {
    const row = asRecord(value);
    const badge = relationRecord(row.badge ?? row.tbl_badges);
    if (badge.id === undefined || badge.id === null) return [];
    return [
      {
        id: positiveInteger(badge.id, "badge id"),
        slug: String(badge.slug ?? ""),
        name: String(badge.name ?? ""),
        description: nullableText(badge.description),
        icon: nullableText(badge.icon),
        awardedAt: String(row.awarded_at ?? ""),
      },
    ];
  });

const detectImage = (bytes: Uint8Array) => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: "jpg" } as const;
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
    return { contentType: "image/png", extension: "png" } as const;
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" } as const;
  }
  throw new Error("Avatar must be a JPEG, PNG, or WebP image.");
};

const randomUuid = () => {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) throw new Error("Secure random UUID generation is unavailable.");
  return randomUUID.call(globalThis.crypto);
};

const ownedAvatarPath = (publicUrl: string | null, authUserId: string) => {
  if (!publicUrl) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const index = publicUrl.indexOf(marker);
  if (index < 0) return null;
  const path = decodeURIComponent(publicUrl.slice(index + marker.length));
  return path.startsWith(`${authUserId}/`) ? path : null;
};

const listContent = async (
  table: LegacyContentTable,
  options: CursorOptions = {},
): Promise<CursorPage<ContentListItem>> => {
  const userId = await currentLegacyUserId();
  const limit = pageSize(options.limit);
  const before = validatedCursor(options.before);
  let query = supabase
    .from(table)
    .select(
      "id,event_id,created_at,event:tbl_events(id,title,description,event_start_time,event_end_time,display_location,location,status,media)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const items = rows.slice(0, limit).flatMap((value) => {
    const row = asRecord(value);
    const event = relationRecord(row.event);
    if (event.id === undefined || event.id === null) return [];
    return [
      {
        id: positiveInteger(row.id, "saved content id"),
        type: "activity" as const,
        createdAt: String(row.created_at ?? ""),
        content: event,
      },
    ];
  });
  return {
    items,
    nextCursor: rows.length > limit ? items.at(-1)?.createdAt ?? null : null,
  };
};

const unsupported = (feature: string): never => {
  throw new Error(`${feature} is not available in the legacy WeNitro backend.`);
};

export const profileProductionService = {
  async loadProfile(): Promise<ProfileDetails> {
    const userId = await currentLegacyUserId();
    const [profile, privacy, interests, badges] = await Promise.all([
      supabase
        .from("tbl_users")
        .select(
          "id,username,fullname,profile_image,bio,about,dob,gender,rating,points,nationality,occupation,isverified,is_delete,onboarding_completed,create_at",
        )
        .eq("id", userId)
        .single(),
      readPrivacy(),
      supabase
        .from("tbl_user_interests")
        .select(
          "created_at,category:tbl_categories!tbl_user_interests_category_id_fkey(id,name)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("tbl_user_badges")
        .select(
          "awarded_at,badge:tbl_badges!tbl_user_badges_badge_id_fkey(id,slug,name,description,icon)",
        )
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false }),
    ]);
    const error = profile.error ?? interests.error ?? badges.error;
    if (error) throw error;
    return {
      profile: mapProfile(profile.data, privacy),
      interests: (interests.data ?? []).map((row) =>
        mapInterest(asRecord(row).category),
      ),
      badges: mapBadges(badges.data ?? []),
    };
  },

  async editProfile(input: ProfileEditInput): Promise<Profile> {
    const userId = await currentLegacyUserId();
    const update: Row = {};
    if (input.username !== undefined) {
      const username = input.username.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
        throw new Error(
          "Username must be 3-30 letters, numbers, or underscores.",
        );
      }
      update.username = username;
    }
    if (input.full_name !== undefined) {
      const fullName = cleanText(input.full_name, "Full name", 255);
      if (!fullName) throw new Error("Full name is required.");
      update.fullname = fullName;
    }
    if (input.bio !== undefined) {
      update.bio = cleanText(input.bio, "Bio", 1000) ?? null;
    }
    if (input.date_of_birth !== undefined) {
      if (input.date_of_birth) validateAdultDate(input.date_of_birth);
      update.dob = input.date_of_birth || null;
    }
    if (input.gender !== undefined) {
      update.gender = cleanText(input.gender, "Gender", 20) ?? null;
    }
    if (input.full_name && input.username && input.date_of_birth) {
      update.onboarding_completed = true;
    }
    const nationality = input.nationality ?? input.location;
    if (nationality !== undefined) {
      update.nationality =
        cleanText(nationality, "Nationality or location", 100) ?? null;
    }
    if (input.occupation !== undefined) {
      update.occupation =
        cleanText(input.occupation, "Occupation", 100) ?? null;
    }
    if (
      input.website !== undefined &&
      input.website !== null &&
      input.website.trim()
    ) {
      throw new Error("Website is not supported by the legacy profile schema.");
    }
    if (!Object.keys(update).length && input.is_private === undefined) {
      throw new Error("No profile changes supplied.");
    }
    if (Object.keys(update).length) {
      const { error } = await supabase
        .from("tbl_users")
        .update(update)
        .eq("id", userId);
      if (error) throw error;
    }
    const privacy =
      input.is_private === undefined
        ? await readPrivacy()
        : await writePrivacy({
            profile_visibility: input.is_private ? "private" : "public",
          });
    const { data, error } = await supabase
      .from("tbl_users")
      .select(
        "id,username,fullname,profile_image,bio,about,dob,gender,rating,points,nationality,occupation,isverified,is_delete,onboarding_completed,create_at",
      )
      .eq("id", userId)
      .single();
    if (error) throw error;
    return mapProfile(data, privacy);
  },

  async uploadAvatar(uri: string): Promise<string> {
    if (!uri.trim()) throw new Error("Avatar URI is required.");
    const authUser = await currentUser();
    const userId = await currentLegacyUserId();
    const existing = await supabase
      .from("tbl_users")
      .select("profile_image")
      .eq("id", userId)
      .single();
    if (existing.error) throw existing.error;

    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not read the selected avatar.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_AVATAR_BYTES) {
      throw new Error("Avatar must be a non-empty image no larger than 5 MB.");
    }
    const image = detectImage(new Uint8Array(buffer));
    const path = `${authUser.id}/${randomUuid()}.${image.extension}`;
    const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const publicUrl = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path).data.publicUrl;
    const updated = await supabase
      .from("tbl_users")
      .update({ profile_image: publicUrl })
      .eq("id", userId);
    if (updated.error) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      throw updated.error;
    }

    const oldPath = ownedAvatarPath(
      nullableText(existing.data?.profile_image),
      authUser.id,
    );
    if (oldPath && oldPath !== path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    }
    return publicUrl;
  },

  async listAvailableInterests(): Promise<Interest[]> {
    requireBackend();
    const { data, error } = await supabase
      .from("tbl_categories")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapInterest);
  },

  async setInterests(interestIds: Array<number | string>): Promise<Interest[]> {
    const userId = await currentLegacyUserId();
    const selected = [
      ...new Set(interestIds.map((id) => positiveInteger(id, "interest id"))),
    ];
    if (selected.length > 50) throw new Error("Select no more than 50 interests.");

    const { data: catalog, error: catalogError } = selected.length
      ? await supabase.from("tbl_categories").select("id,name").in("id", selected)
      : { data: [], error: null };
    if (catalogError) throw catalogError;
    if ((catalog ?? []).length !== selected.length) {
      throw new Error("One or more interests are unavailable.");
    }
    const { data: currentRows, error: currentError } = await supabase
      .from("tbl_user_interests")
      .select("category_id")
      .eq("user_id", userId);
    if (currentError) throw currentError;
    const current = new Set(
      (currentRows ?? []).map((row) => Number(row.category_id)),
    );
    const additions = selected.filter((id) => !current.has(id));
    const removals = [...current].filter((id) => !selected.includes(id));

    if (removals.length) {
      const { error } = await supabase
        .from("tbl_user_interests")
        .delete()
        .eq("user_id", userId)
        .in("category_id", removals);
      if (error) throw error;
    }
    if (additions.length) {
      const { error } = await supabase.from("tbl_user_interests").insert(
        additions.map((categoryId) => ({
          user_id: userId,
          category_id: categoryId,
        })),
      );
      if (error) throw error;
    }
    return (catalog ?? [])
      .map(mapInterest)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  listSaved(options?: CursorOptions) {
    return listContent("tbl_event_saves", options);
  },

  listLiked(options?: CursorOptions) {
    return listContent("tbl_event_likes", options);
  },

  async listHistory(
    options: CursorOptions = {},
  ): Promise<CursorPage<HistoryItem>> {
    const userId = await currentLegacyUserId();
    const limit = pageSize(options.limit);
    const before = validatedCursor(options.before);
    const queryLimit = limit + 1;

    let hostedQuery = supabase
      .from("tbl_events")
      .select(
        "id,title,description,event_start_time,event_end_time,display_location,location,status,created_at,updated_at",
      )
      .eq("created_by", userId)
      .order("updated_at", { ascending: false })
      .limit(queryLimit);
    let joinedQuery = supabase
      .from("tbl_event_participants")
      .select(
        "id,event_id,status,created_at,joined_at,event:tbl_events(id,title,description,event_start_time,event_end_time,display_location,location,status)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(queryLimit);
    let storiesQuery = supabase
      .from("tbl_story_views")
      .select(
        "story_id,viewed_at,story:tbl_stories(id,user_id,media_url,media_type,caption,created_at,expires_at)",
      )
      .eq("viewer_id", userId)
      .order("viewed_at", { ascending: false })
      .limit(queryLimit);
    if (before) {
      hostedQuery = hostedQuery.lt("updated_at", before);
      joinedQuery = joinedQuery.lt("created_at", before);
      storiesQuery = storiesQuery.lt("viewed_at", before);
    }

    const [hosted, joined, stories] = await Promise.all([
      hostedQuery,
      joinedQuery,
      storiesQuery,
    ]);
    const error = hosted.error ?? joined.error ?? stories.error;
    if (error) throw error;

    const history: HistoryItem[] = [];
    for (const value of hosted.data ?? []) {
      const row = asRecord(value);
      history.push({
        id: `hosted:${positiveInteger(row.id, "event id")}`,
        type: "activity",
        occurredAt: String(row.updated_at ?? row.created_at ?? ""),
        action: "hosted",
        content: row,
      });
    }
    for (const value of joined.data ?? []) {
      const row = asRecord(value);
      const event = relationRecord(row.event);
      if (event.id === undefined || event.id === null) continue;
      history.push({
        id: `joined:${positiveInteger(row.id, "participant id")}`,
        type: "activity",
        occurredAt: String(row.joined_at ?? row.created_at ?? ""),
        action: `joined:${String(row.status ?? "pending")}`,
        content: event,
      });
    }
    for (const value of stories.data ?? []) {
      const row = asRecord(value);
      const story = relationRecord(row.story);
      if (story.id === undefined || story.id === null) continue;
      history.push({
        id: `story:${positiveInteger(row.story_id, "story id")}`,
        type: "story",
        occurredAt: String(row.viewed_at ?? ""),
        action: "viewed",
        content: story,
      });
    }
    history.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const items = history.slice(0, limit);
    return {
      items,
      nextCursor: history.length > limit ? items.at(-1)?.occurredAt ?? null : null,
    };
  },

  async getPrivacyPreferences(): Promise<PrivacyPreferences> {
    await currentUser();
    return readPrivacy();
  },

  async updatePrivacyPreferences(
    input: PrivacyPreferenceInput,
  ): Promise<PrivacyPreferences> {
    await currentUser();
    return writePrivacy(input);
  },

  async getVerificationState(): Promise<VerificationState> {
    const authUser = await currentUser();
    const userId = await currentLegacyUserId();
    const [profile, badges, verifications] = await Promise.all([
      supabase
        .from("tbl_users")
        .select("fullname,profile_image,bio,about,dob,rating,isverified")
        .eq("id", userId)
        .single(),
      supabase
        .from("tbl_user_badges")
        .select(
          "awarded_at,badge:tbl_badges!tbl_user_badges_badge_id_fkey(id,slug,name,description,icon)",
        )
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false }),
      supabase.rpc("list_user_verifications"),
    ]);
    const error = profile.error ?? badges.error ?? verifications.error;
    if (error) throw error;

    const profileRow = asRecord(profile.data);
    const requests = Array.isArray(verifications.data)
      ? verifications.data.map(asRecord)
      : [];
    const latest = requests[0];
    const status = latest
      ? (String(latest.status ?? "draft") as VerificationState["status"])
      : Number(profileRow.isverified ?? 0) === 1
        ? "approved"
        : "unsubmitted";

    return {
      trustScore: Number(profileRow.rating ?? 0),
      emailVerified: Boolean(authUser.email_confirmed_at),
      phoneVerified:
        Boolean(authUser.phone_confirmed_at) ||
        requests.some((row) => row.phone_verified === true),
      profileComplete: Boolean(
        profileRow.fullname &&
          profileRow.profile_image &&
          (profileRow.bio || profileRow.about) &&
          profileRow.dob,
      ),
      badges: mapBadges(badges.data ?? []),
      status,
      latestRequestId: latest
        ? positiveInteger(latest.id, "verification request id")
        : null,
      reviewNotes: latest ? String(latest.review_notes ?? "") : "",
    };
  },

  async listConsentHistory(
    _purpose?: ConsentPurpose,
    _options: CursorOptions = {},
  ): Promise<CursorPage<ConsentRecord>> {
    return unsupported("Consent history");
  },

  async getCurrentConsents(): Promise<
    Partial<Record<ConsentPurpose, ConsentRecord>>
  > {
    return unsupported("Consent records");
  },

  async recordConsent(
    _purpose: ConsentPurpose,
    _granted: boolean,
    _policyVersion: string,
  ): Promise<ConsentRecord> {
    return unsupported("Consent recording");
  },

  async listBlockedUsers(): Promise<
    Array<{ blockedAt: string; profile: Record<string, unknown> }>
  > {
    return unsupported("Blocked users");
  },

  async blockUser(_blockedUserId: number | string): Promise<void> {
    return unsupported("User blocking");
  },

  async unblockUser(_blockedUserId: number | string): Promise<void> {
    return unsupported("User unblocking");
  },

  async reportContent(_input: {
    target: ReportTarget;
    reason: ReportReason;
    details?: string;
  }): Promise<ContentReport> {
    return unsupported("Content reporting");
  },

  async listReports(
    _options: CursorOptions = {},
  ): Promise<CursorPage<ContentReport>> {
    return unsupported("Content report history");
  },

  async submitDataSubjectRequest(
    _requestType: DataSubjectRequestType,
    _details = "",
  ): Promise<DataSubjectRequest> {
    return unsupported("Data-subject requests");
  },

  async listDataSubjectRequests(
    _options: CursorOptions = {},
  ): Promise<CursorPage<DataSubjectRequest>> {
    return unsupported("Data-subject request history");
  },
};

export default profileProductionService;
