import { isSupabaseConfigured, supabase } from "../lib/supabase";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type Profile = {
  id: string;
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
};

export type Interest = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
};

export type VerificationBadge = {
  id: string;
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
  >
>;

export type PrivacyPreferences = {
  user_id: string;
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
  user_id: string;
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
  id: string;
  user_id: string;
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
  | { type: "user"; id: string }
  | { type: "vibe"; id: string }
  | { type: "community_post"; id: string }
  | { type: "message"; id: string };

export type ContentReport = {
  id: string;
  reporter_id: string;
  subject_user_id: string | null;
  vibe_id: string | null;
  community_post_id: string | null;
  message_id: string | null;
  reason: ReportReason;
  details: string;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  created_at: string;
};

export type ContentListItem = {
  id: string;
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
};

type CursorOptions = { limit?: number; before?: string };
type ContentTable = "saves" | "likes";

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const currentUser = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user;
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const relationRecord = (value: unknown) => {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
};

const mapBadges = (rows: unknown[]): VerificationBadge[] =>
  rows.flatMap((row) => {
    const record = asRecord(row);
    const badge = relationRecord(record.badges);
    if (typeof badge.id !== "string") return [];
    return [
      {
        id: badge.id,
        slug: String(badge.slug ?? ""),
        name: String(badge.name ?? ""),
        description:
          typeof badge.description === "string" ? badge.description : null,
        icon: typeof badge.icon === "string" ? badge.icon : null,
        awardedAt: String(record.awarded_at ?? ""),
      },
    ];
  });

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

const prepareProfileEdit = (input: ProfileEditInput) => {
  const update: Record<string, string | boolean | null> = {};
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
    update.full_name = cleanText(input.full_name, "Full name", 100) ?? null;
  }
  if (input.bio !== undefined) {
    update.bio = cleanText(input.bio, "Bio", 500) ?? null;
  }
  if (input.website !== undefined) {
    const website = cleanText(input.website, "Website", 300);
    if (website) {
      let parsed: URL;
      try {
        parsed = new URL(website);
      } catch {
        throw new Error("Website must be a valid HTTPS URL.");
      }
      if (parsed.protocol !== "https:") {
        throw new Error("Website must be a valid HTTPS URL.");
      }
    }
    update.website = website ?? null;
  }
  if (input.location !== undefined) {
    update.location = cleanText(input.location, "Location", 120) ?? null;
  }
  if (input.gender !== undefined) {
    update.gender = cleanText(input.gender, "Gender", 80) ?? null;
  }
  if (input.date_of_birth !== undefined) {
    if (input.date_of_birth) validateAdultDate(input.date_of_birth);
    update.date_of_birth = input.date_of_birth || null;
  }
  if (input.is_private !== undefined) update.is_private = input.is_private;
  if (!Object.keys(update).length) throw new Error("No profile changes supplied.");
  update.last_active_at = new Date().toISOString();
  return update;
};

const detectImage = (bytes: Uint8Array) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
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
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  throw new Error("Avatar must be a JPEG, PNG, or WebP image.");
};

const randomUuid = () => {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) throw new Error("Secure random UUID generation is unavailable.");
  return randomUUID.call(globalThis.crypto);
};

const ownedAvatarPath = (publicUrl: string | null, userId: string) => {
  if (!publicUrl) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const markerIndex = publicUrl.indexOf(marker);
  if (markerIndex < 0) return null;
  const path = decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
  return path.startsWith(`${userId}/`) ? path : null;
};

const listContent = async (
  table: ContentTable,
  options: CursorOptions = {},
): Promise<CursorPage<ContentListItem>> => {
  const user = await currentUser();
  const limit = pageSize(options.limit);
  const before = validatedCursor(options.before);
  let query = supabase
    .from(table)
    .select(
      "id,activity_id,vibe_id,created_at,activity:activities(id,title,description,category,cover_url,location_name,starts_at,ends_at,status),vibe:vibes(id,caption,media_url,media_type,created_at,user_id,author:profiles!vibes_user_id_fkey(id,username,full_name,avatar_url))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const items = rows.slice(0, limit).flatMap((row) => {
    const record = asRecord(row);
    const isActivity = typeof record.activity_id === "string";
    const content = relationRecord(isActivity ? record.activity : record.vibe);
    if (typeof content.id !== "string") return [];
    return [
      {
        id: String(record.id),
        type: isActivity ? ("activity" as const) : ("vibe" as const),
        createdAt: String(record.created_at),
        content,
      },
    ];
  });
  return {
    items,
    nextCursor: rows.length > limit ? items.at(-1)?.createdAt ?? null : null,
  };
};

const preferenceConsentPurposes: Partial<
  Record<ConsentPurpose, keyof PrivacyPreferenceInput>
> = {
  analytics: "analytics",
  personalization: "personalization",
  marketing: "marketing",
};

const updatePreferencesForUser = async (
  userId: string,
  input: PrivacyPreferenceInput,
): Promise<PrivacyPreferences> => {
  if (!Object.keys(input).length) throw new Error("No privacy changes supplied.");
  const { data, error } = await supabase
    .from("privacy_preferences")
    .upsert({ user_id: userId, ...input }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as PrivacyPreferences;
};

export const profileProductionService = {
  async loadProfile(): Promise<ProfileDetails> {
    const user = await currentUser();
    const [profileResult, interestsResult, badgesResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("profile_interests")
        .select("interests(id,slug,name,icon)")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_badges")
        .select("awarded_at,badges(id,slug,name,description,icon)")
        .eq("user_id", user.id)
        .order("awarded_at", { ascending: false }),
    ]);
    const error =
      profileResult.error ?? interestsResult.error ?? badgesResult.error;
    if (error) throw error;
    const interests = (interestsResult.data ?? []).flatMap((row) => {
      const interest = relationRecord(asRecord(row).interests);
      if (typeof interest.id !== "string") return [];
      return [interest as Interest];
    });
    return {
      profile: profileResult.data as Profile,
      interests,
      badges: mapBadges(badgesResult.data ?? []),
    };
  },

  async editProfile(input: ProfileEditInput): Promise<Profile> {
    const user = await currentUser();
    const { data, error } = await supabase
      .from("profiles")
      .update(prepareProfileEdit(input))
      .eq("id", user.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Profile;
  },

  async uploadAvatar(uri: string): Promise<string> {
    if (!uri.trim()) throw new Error("Avatar URI is required.");
    const user = await currentUser();
    const profileResult = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();
    if (profileResult.error) throw profileResult.error;

    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not read the selected avatar.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      throw new Error("Avatar must be 5 MB or smaller.");
    }
    const image = detectImage(new Uint8Array(buffer));
    const path = `${user.id}/${randomUuid()}.${image.extension}`;
    const uploadResult = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, buffer, {
        contentType: image.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadResult.error) throw uploadResult.error;

    const { data: publicData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);
    const updateResult = await supabase
      .from("profiles")
      .update({
        avatar_url: publicData.publicUrl,
        last_active_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updateResult.error) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      throw updateResult.error;
    }

    const oldPath = ownedAvatarPath(profileResult.data.avatar_url, user.id);
    if (oldPath && oldPath !== path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    }
    return publicData.publicUrl;
  },

  async listAvailableInterests(): Promise<Interest[]> {
    requireBackend();
    const { data, error } = await supabase
      .from("interests")
      .select("id,slug,name,icon")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Interest[];
  },

  async setInterests(interestIds: string[]): Promise<Interest[]> {
    const user = await currentUser();
    const selected = [...new Set(interestIds)];
    if (selected.length > 50) throw new Error("Select no more than 50 interests.");

    const [catalogResult, currentResult] = await Promise.all([
      selected.length
        ? supabase
            .from("interests")
            .select("id,slug,name,icon")
            .in("id", selected)
        : Promise.resolve({ data: [] as Interest[], error: null }),
      supabase
        .from("profile_interests")
        .select("interest_id")
        .eq("profile_id", user.id),
    ]);
    const readError = catalogResult.error ?? currentResult.error;
    if (readError) throw readError;
    if ((catalogResult.data ?? []).length !== selected.length) {
      throw new Error("One or more interests are unavailable.");
    }

    const current = new Set(
      (currentResult.data ?? []).map((row) => row.interest_id as string),
    );
    const additions = selected.filter((id) => !current.has(id));
    const removals = [...current].filter((id) => !selected.includes(id));
    if (additions.length) {
      const { error } = await supabase.from("profile_interests").insert(
        additions.map((interestId) => ({
          profile_id: user.id,
          interest_id: interestId,
        })),
      );
      if (error) throw error;
    }
    if (removals.length) {
      const { error } = await supabase
        .from("profile_interests")
        .delete()
        .eq("profile_id", user.id)
        .in("interest_id", removals);
      if (error) {
        if (additions.length) {
          await supabase
            .from("profile_interests")
            .delete()
            .eq("profile_id", user.id)
            .in("interest_id", additions);
        }
        throw error;
      }
    }
    return (catalogResult.data ?? []) as Interest[];
  },

  listSaved(options?: CursorOptions) {
    return listContent("saves", options);
  },

  listLiked(options?: CursorOptions) {
    return listContent("likes", options);
  },

  async listHistory(
    options: CursorOptions = {},
  ): Promise<CursorPage<HistoryItem>> {
    const user = await currentUser();
    const limit = pageSize(options.limit);
    const before = validatedCursor(options.before);
    const queryLimit = limit + 1;

    let activitiesQuery = supabase
      .from("participants")
      .select(
        "activity_id,status,role,created_at,updated_at,activity:activities(id,title,description,category,cover_url,location_name,starts_at,ends_at,status)",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(queryLimit);
    let storiesQuery = supabase
      .from("story_views")
      .select(
        "story_id,viewed_at,story:stories(id,owner_id,media_url,media_type,caption,created_at,expires_at)",
      )
      .eq("viewer_id", user.id)
      .order("viewed_at", { ascending: false })
      .limit(queryLimit);
    let sharesQuery = supabase
      .from("content_shares")
      .select(
        "id,channel,created_at,vibe:vibes(id,caption,media_url,media_type),community_post:community_posts(id,title,body,media_url,media_type)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(queryLimit);
    if (before) {
      activitiesQuery = activitiesQuery.lt("updated_at", before);
      storiesQuery = storiesQuery.lt("viewed_at", before);
      sharesQuery = sharesQuery.lt("created_at", before);
    }
    const [activities, stories, shares] = await Promise.all([
      activitiesQuery,
      storiesQuery,
      sharesQuery,
    ]);
    const error = activities.error ?? stories.error ?? shares.error;
    if (error) throw error;

    const history: HistoryItem[] = [];
    for (const row of activities.data ?? []) {
      const record = asRecord(row);
      const content = relationRecord(record.activity);
      if (typeof content.id !== "string") continue;
      history.push({
        id: `activity:${String(record.activity_id)}`,
        type: "activity",
        occurredAt: String(record.updated_at),
        action: String(record.status ?? "participated"),
        content,
      });
    }
    for (const row of stories.data ?? []) {
      const record = asRecord(row);
      const content = relationRecord(record.story);
      if (typeof content.id !== "string") continue;
      history.push({
        id: `story:${String(record.story_id)}`,
        type: "story",
        occurredAt: String(record.viewed_at),
        action: "viewed",
        content,
      });
    }
    for (const row of shares.data ?? []) {
      const record = asRecord(row);
      const content = relationRecord(record.vibe ?? record.community_post);
      if (typeof content.id !== "string") continue;
      history.push({
        id: `share:${String(record.id)}`,
        type: "share",
        occurredAt: String(record.created_at),
        action: `shared:${String(record.channel)}`,
        content,
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
    const user = await currentUser();
    const existing = await supabase
      .from("privacy_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data as PrivacyPreferences;
    const created = await supabase
      .from("privacy_preferences")
      .insert({ user_id: user.id })
      .select("*")
      .single();
    if (created.error) throw created.error;
    return created.data as PrivacyPreferences;
  },

  async updatePrivacyPreferences(
    input: PrivacyPreferenceInput,
  ): Promise<PrivacyPreferences> {
    const user = await currentUser();
    return updatePreferencesForUser(user.id, input);
  },

  async listConsentHistory(
    purpose?: ConsentPurpose,
    options: CursorOptions = {},
  ): Promise<CursorPage<ConsentRecord>> {
    const user = await currentUser();
    const limit = pageSize(options.limit);
    const before = validatedCursor(options.before);
    let query = supabase
      .from("user_consents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (purpose) query = query.eq("purpose", purpose);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as ConsentRecord[];
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.created_at ?? null : null,
    };
  },

  async getCurrentConsents(): Promise<
    Partial<Record<ConsentPurpose, ConsentRecord>>
  > {
    const user = await currentUser();
    const { data, error } = await supabase
      .from("user_consents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const current: Partial<Record<ConsentPurpose, ConsentRecord>> = {};
    for (const consent of (data ?? []) as ConsentRecord[]) {
      if (!current[consent.purpose]) current[consent.purpose] = consent;
    }
    return current;
  },

  async recordConsent(
    purpose: ConsentPurpose,
    granted: boolean,
    policyVersion: string,
  ): Promise<ConsentRecord> {
    const user = await currentUser();
    const version = policyVersion.trim();
    if (!version || version.length > 100) {
      throw new Error("A valid policy version is required.");
    }
    const preference = preferenceConsentPurposes[purpose];

    // Withdrawals stop optional processing before the append-only audit write.
    if (!granted && preference) {
      await updatePreferencesForUser(user.id, { [preference]: false });
    }
    const { data, error } = await supabase
      .from("user_consents")
      .insert({
        user_id: user.id,
        purpose,
        granted,
        policy_version: version,
        source: "app",
      })
      .select("*")
      .single();
    if (error) throw error;

    // Grants only enable optional processing after the audit write succeeds.
    if (granted && preference) {
      await updatePreferencesForUser(user.id, { [preference]: true });
    }
    return data as ConsentRecord;
  },

  async listBlockedUsers(): Promise<
    Array<{ blockedAt: string; profile: Record<string, unknown> }>
  > {
    const user = await currentUser();
    const { data, error } = await supabase
      .from("user_blocks")
      .select(
        "created_at,profile:profiles!user_blocks_blocked_id_fkey(id,username,full_name,avatar_url)",
      )
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => {
      const record = asRecord(row);
      return {
        blockedAt: String(record.created_at),
        profile: relationRecord(record.profile),
      };
    });
  },

  async blockUser(blockedUserId: string): Promise<void> {
    const user = await currentUser();
    if (!blockedUserId || blockedUserId === user.id) {
      throw new Error("Select another user to block.");
    }
    const { error } = await supabase.from("user_blocks").upsert(
      { blocker_id: user.id, blocked_id: blockedUserId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  },

  async unblockUser(blockedUserId: string): Promise<void> {
    const user = await currentUser();
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);
    if (error) throw error;
  },

  async reportContent(input: {
    target: ReportTarget;
    reason: ReportReason;
    details?: string;
  }): Promise<ContentReport> {
    const user = await currentUser();
    if (!input.target.id) throw new Error("A report target is required.");
    if (input.target.type === "user" && input.target.id === user.id) {
      throw new Error("You cannot report your own profile.");
    }
    const details = cleanText(input.details, "Report details", 2000) ?? "";
    if (input.reason === "other" && !details) {
      throw new Error("Please add details for this report.");
    }
    const targetColumn = {
      user: "subject_user_id",
      vibe: "vibe_id",
      community_post: "community_post_id",
      message: "message_id",
    }[input.target.type];
    const { data, error } = await supabase
      .from("content_reports")
      .insert({
        reporter_id: user.id,
        [targetColumn]: input.target.id,
        reason: input.reason,
        details,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as ContentReport;
  },

  async listReports(options: CursorOptions = {}): Promise<CursorPage<ContentReport>> {
    const user = await currentUser();
    const limit = pageSize(options.limit);
    const before = validatedCursor(options.before);
    let query = supabase
      .from("content_reports")
      .select("*")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as ContentReport[];
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.created_at ?? null : null,
    };
  },

  async getVerificationState(): Promise<VerificationState> {
    const user = await currentUser();
    const [profileResult, badgesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,avatar_url,bio,date_of_birth,trust_score")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_badges")
        .select("awarded_at,badges(id,slug,name,description,icon)")
        .eq("user_id", user.id)
        .order("awarded_at", { ascending: false }),
    ]);
    const error = profileResult.error ?? badgesResult.error;
    if (error) throw error;
    const profile = profileResult.data;
    if (!profile) throw new Error("Profile not found.");
    return {
      trustScore: Number(profile.trust_score),
      emailVerified: Boolean(user.email_confirmed_at),
      phoneVerified: Boolean(user.phone_confirmed_at),
      profileComplete: Boolean(
        profile.full_name &&
          profile.avatar_url &&
          profile.bio &&
          profile.date_of_birth,
      ),
      badges: mapBadges(badgesResult.data ?? []),
    };
  },

  async submitDataSubjectRequest(
    requestType: DataSubjectRequestType,
    details = "",
  ): Promise<DataSubjectRequest> {
    const user = await currentUser();
    const cleanedDetails = cleanText(details, "Request details", 4000) ?? "";
    if (
      (requestType === "correction" || requestType === "grievance") &&
      !cleanedDetails
    ) {
      throw new Error("Please describe the correction or grievance.");
    }
    const active = await supabase
      .from("data_subject_requests")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("request_type", requestType)
      .in("status", ["submitted", "in_review"])
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) {
      throw new Error(`An active ${requestType} request already exists.`);
    }

    // Erasure is deliberately a reviewable request, never an immediate client delete.
    const { data, error } = await supabase
      .from("data_subject_requests")
      .insert({
        user_id: user.id,
        request_type: requestType,
        details: cleanedDetails,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as DataSubjectRequest;
  },

  async listDataSubjectRequests(
    options: CursorOptions = {},
  ): Promise<CursorPage<DataSubjectRequest>> {
    const user = await currentUser();
    const limit = pageSize(options.limit);
    const before = validatedCursor(options.before);
    let query = supabase
      .from("data_subject_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as DataSubjectRequest[];
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.created_at ?? null : null,
    };
  },
};

export default profileProductionService;
