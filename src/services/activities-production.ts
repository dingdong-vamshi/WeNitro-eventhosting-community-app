import type { RealtimeChannel } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type ActivityStatus =
  | "draft"
  | "published"
  | "cancelled"
  | "completed";
export type ActivityVisibility = "public" | "community" | "private";
export type ActivityType =
  | "meetup"
  | "sport"
  | "study"
  | "cowork"
  | "tournament";
export type ParticipationStatus =
  | "going"
  | "interested"
  | "pending"
  | "declined"
  | "waitlist";
export type JoinActivityStatus = Exclude<ParticipationStatus, "pending">;
export type ParticipationRole = "participant" | "host" | "cohost";

export type ActivityProfile = {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type ActivityCommunity = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

export type Activity = {
  id: string;
  ownerId: string;
  communityId: string | null;
  title: string;
  description: string | null;
  category: string;
  coverUrl: string | null;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  priceInr: number;
  capacity: number;
  matchScore: number | null;
  activityType: ActivityType;
  joinType: "direct" | "approval";
  visibility: ActivityVisibility;
  status: ActivityStatus;
  startsAt: string;
  endsAt: string | null;
  registrationClosesAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: ActivityProfile | null;
  community: ActivityCommunity | null;
};

export type ActivityParticipation = {
  activityId: string;
  userId: string;
  role: ParticipationRole;
  status: ParticipationStatus;
  createdAt: string;
  updatedAt: string;
};

export type ActivityViewerState = {
  liked: boolean;
  saved: boolean;
  participation: ActivityParticipation | null;
};

export type ActivityListItem = Activity & {
  viewerState: ActivityViewerState;
};

export type ActivityComment = {
  id: string;
  activityId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: ActivityProfile | null;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type ActivityDetails = {
  activity: Activity;
  viewerState: ActivityViewerState;
  comments: Page<ActivityComment>;
};

export type DiscoverActivitiesInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  categories?: string[];
  activityTypes?: ActivityType[];
  communityId?: string;
  ownerId?: string;
  location?: string;
  minPriceInr?: number;
  maxPriceInr?: number;
  freeOnly?: boolean;
  startsAfter?: string;
  startsBefore?: string;
  upcomingOnly?: boolean;
  sort?: "soonest" | "latest" | "newest" | "price_asc" | "price_desc";
  signal?: AbortSignal;
};

export type HostedActivitiesInput = {
  page?: number;
  pageSize?: number;
  statuses?: ActivityStatus[];
  signal?: AbortSignal;
};

export type CreateActivityInput = {
  title: string;
  category: string;
  startsAt: string;
  locationName: string;
  description?: string | null;
  communityId?: string | null;
  coverUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priceInr?: number;
  capacity?: number;
  matchScore?: number | null;
  activityType?: ActivityType;
  visibility?: ActivityVisibility;
  joinType?: "direct" | "approval";
  endsAt?: string | null;
  registrationClosesAt?: string | null;
};

export type UpdateActivityInput = Partial<CreateActivityInput> & {
  status?: ActivityStatus;
};

export type ActivityRealtimeTable =
  | "activities"
  | "participants"
  | "comments"
  | "likes"
  | "saves";
export type ActivityRealtimeEventType = "INSERT" | "UPDATE" | "DELETE";
export type ActivityRealtimeRefresh = {
  activityId: string | null;
  table: ActivityRealtimeTable;
  eventType: ActivityRealtimeEventType;
  newRecord: Record<string, unknown>;
  oldRecord: Record<string, unknown>;
};
export type ActivityRealtimeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";
export type ActivityRealtimeHandlers = {
  onRefresh: (event: ActivityRealtimeRefresh) => void;
  onStatus?: (status: ActivityRealtimeStatus, error?: Error) => void;
};

type DbRecord = Record<string, unknown>;

const EVENT_SELECT =
  "id,created_by,updated_by,title,description,event_start_time,event_end_time,registration_close_time,max_participants,visibility_type,join_type,location,is_cancelled,is_deleted,created_at,updated_at,media,is_paid,price,currency,intent,status,latitude,longitude,display_location";
const FEEDBACK_SELECT = "id,event_id,created_by,reaction,comment,created_at";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const INTEGER_ID = /^[1-9]\d*$/;

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const parseId = (value: string | number, label: string) => {
  const text = String(value);
  if (!INTEGER_ID.test(text)) throw new Error(`${label} must be a positive integer.`);
  const id = Number(text);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`${label} is outside the supported integer range.`);
  }
  return id;
};

const firstRecord = (value: unknown): DbRecord | null => {
  if (Array.isArray(value)) return (value[0] as DbRecord | undefined) ?? null;
  return value && typeof value === "object" ? (value as DbRecord) : null;
};

const callRpc = async <T>(name: string, parameters: DbRecord): Promise<T> => {
  requireBackend();
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data as T;
};

const appUserIdFromRpc = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") {
    return parseId(value, "App user ID");
  }
  const row = firstRecord(value);
  const candidate = row?.id ?? row?.user_id ?? row?.get_current_app_user_id;
  return candidate == null ? null : parseId(String(candidate), "App user ID");
};

const currentUserId = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Authentication required.");
  const id = appUserIdFromRpc(
    await callRpc<unknown>("get_current_app_user_id", {}),
  );
  if (id == null) {
    throw new Error("Authenticated account is not linked to a WeNitro user.");
  }
  return id;
};

const optionalCurrentUserId = async () => {
  requireBackend();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  try {
    return appUserIdFromRpc(
      await callRpc<unknown>("get_current_app_user_id", {}),
    );
  } catch {
    return null;
  }
};

const pagination = (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize) || DEFAULT_PAGE_SIZE),
  );
  const from = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to: from + safePageSize - 1,
  };
};

const requiredText = (value: string, label: string) => {
  const text = value.trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
};

const optionalText = (value: string | null | undefined) => {
  if (value == null) return value;
  return value.trim() || null;
};

const asIso = (value: string, label: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
};

const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
};

const quoteFilter = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const nullableString = (value: unknown) =>
  value == null || value === "" ? null : String(value);

const mediaMetadata = (value: unknown): DbRecord => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return mediaMetadata(JSON.parse(value));
    } catch {
      return { cover_url: value };
    }
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string"
      ? { cover_url: first }
      : firstRecord(first) ?? {};
  }
  const media = firstRecord(value) ?? {};
  const bridge = firstRecord(media.wenitro) ?? firstRecord(media._wenitro);
  return bridge ? { ...media, ...bridge } : media;
};

const profileFromDb = (row?: DbRecord): ActivityProfile | null =>
  row
    ? {
        id: String(row.id),
        username: String(row.username ?? ""),
        fullName: nullableString(row.fullname),
        avatarUrl: nullableString(row.profile_image),
      }
    : null;

const statusFromDb = (row: DbRecord, metadata: DbRecord): ActivityStatus => {
  const status = row.status ?? metadata.status;
  if (
    status === "draft" ||
    status === "published" ||
    status === "cancelled" ||
    status === "completed"
  ) {
    return status;
  }
  if (row.is_cancelled === true) return "cancelled";
  const end = nullableString(row.event_end_time);
  return end && new Date(end).getTime() < Date.now() ? "completed" : "published";
};

const visibilityFromDb = (value: unknown): ActivityVisibility => {
  if (value === "community") return "community";
  if (value === "private" || value === "friends") return "private";
  return "public";
};

const activityTypeFromDb = (
  value: unknown,
  metadata: DbRecord,
  category: string,
): ActivityType => {
  const type = value ?? metadata.activity_type;
  if (
    type === "meetup" ||
    type === "sport" ||
    type === "study" ||
    type === "cowork" ||
    type === "tournament"
  ) {
    return type;
  }
  const name = category.toLowerCase();
  if (name.includes("sport") || name.includes("fitness")) return "sport";
  if (name.includes("study") || name.includes("learn")) return "study";
  if (name.includes("work")) return "cowork";
  if (name.includes("tournament")) return "tournament";
  return "meetup";
};

const activityFromDb = (
  row: DbRecord,
  category: string,
  owner?: DbRecord,
  community?: ActivityCommunity | null,
): Activity => {
  const metadata = mediaMetadata(row.media);
  const price = Number(row.price ?? metadata.price_inr ?? 0);
  const capacity = Number(row.max_participants ?? 0);
  const matchScore =
    metadata.match_score == null ? null : Number(metadata.match_score);
  return {
    id: String(row.id),
    ownerId: String(row.created_by),
    communityId: community?.id ?? nullableString(metadata.community_id),
    title: String(row.title ?? ""),
    description: nullableString(row.description),
    category,
    coverUrl: nullableString(
      metadata.cover_url ?? metadata.url ?? metadata.path ?? metadata.media_url,
    ),
    locationName: String(row.display_location ?? row.location ?? ""),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    priceInr: Number.isFinite(price) ? price : 0,
    capacity: Number.isFinite(capacity) ? capacity : 0,
    matchScore:
      matchScore != null && Number.isFinite(matchScore) ? matchScore : null,
    activityType: activityTypeFromDb(row.intent, metadata, category),
    joinType: row.join_type === "approval" ? "approval" : "direct",
    visibility: visibilityFromDb(row.visibility_type),
    status: statusFromDb(row, metadata),
    startsAt: String(row.event_start_time ?? ""),
    endsAt: nullableString(row.event_end_time),
    registrationClosesAt: nullableString(row.registration_close_time),
    createdAt: String(row.created_at ?? row.event_start_time ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    owner: profileFromDb(owner),
    community: community ?? null,
  };
};

const participationStatusFromDb = (value: unknown): ParticipationStatus => {
  if (value === "approved" || value === "going") return "going";
  if (
    value === "rejected" ||
    value === "declined" ||
    value === "left" ||
    value === "no_show"
  ) {
    return "declined";
  }
  if (value === "pending") return "pending";
  if (value === "waitlist") return "waitlist";
  return "interested";
};

const participationFromDb = (row: DbRecord): ActivityParticipation => ({
  activityId: String(row.event_id),
  userId: String(row.user_id),
  role: (row.role as ParticipationRole | undefined) ?? "participant",
  status: participationStatusFromDb(row.status),
  createdAt: String(row.created_at ?? row.joined_at ?? ""),
  updatedAt: String(row.responded_at ?? row.joined_at ?? row.created_at ?? ""),
});

const commentFromDb = (
  row: DbRecord,
  author?: DbRecord,
): ActivityComment => {
  const embeddedAuthor = firstRecord(row.author);
  return {
    id: String(row.id),
    activityId: String(row.event_id),
    authorId: String(row.user_id ?? row.created_by),
    parentId: row.parent_id === null || row.parent_id === undefined
      ? null
      : String(row.parent_id),
    body: String(row.body ?? row.comment ?? row.reaction ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    author: profileFromDb(author ?? embeddedAuthor ?? undefined),
  };
};

const emptyViewerState = (): ActivityViewerState => ({
  liked: false,
  saved: false,
  participation: null,
});

const buildPayload = (
  input: CreateActivityInput | UpdateActivityInput,
): DbRecord => {
  const payload: DbRecord = {};
  if (input.title !== undefined) payload.title = requiredText(input.title, "Title");
  if (input.category !== undefined) {
    payload.category = requiredText(input.category, "Category");
  }
  if (input.locationName !== undefined) {
    const location = requiredText(input.locationName, "Location");
    payload.location = location;
    payload.display_location = location;
  }
  if (input.description !== undefined) {
    payload.description = optionalText(input.description);
  }
  if (input.communityId !== undefined) {
    payload.community_id =
      input.communityId === null
        ? null
        : parseId(input.communityId, "Community ID");
  }
  if (input.coverUrl !== undefined) {
    payload.cover_url = optionalText(input.coverUrl);
  }
  if (input.startsAt !== undefined) {
    payload.event_start_time = asIso(input.startsAt, "Start time");
  }
  if (input.endsAt !== undefined) {
    payload.event_end_time =
      input.endsAt === null ? null : asIso(input.endsAt, "End time");
  }
  if (input.registrationClosesAt !== undefined) {
    payload.registration_close_time =
      input.registrationClosesAt === null
        ? null
        : asIso(input.registrationClosesAt, "Registration close time");
  }
  if (input.latitude !== undefined) {
    payload.latitude =
      input.latitude === null ? null : finite(input.latitude, "Latitude");
  }
  if (input.longitude !== undefined) {
    payload.longitude =
      input.longitude === null ? null : finite(input.longitude, "Longitude");
  }
  if (input.priceInr !== undefined) {
    const price = finite(input.priceInr, "Price");
    if (price < 0) throw new Error("Price cannot be negative.");
    payload.price_inr = price;
    payload.is_paid = price > 0;
  }
  if (input.capacity !== undefined) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      throw new Error("Capacity must be a positive integer.");
    }
    payload.max_participants = input.capacity;
  }
  if (input.matchScore !== undefined) {
    if (
      input.matchScore !== null &&
      (!Number.isInteger(input.matchScore) ||
        input.matchScore < 0 ||
        input.matchScore > 100)
    ) {
      throw new Error("Match score must be an integer from 0 to 100.");
    }
    payload.match_score = input.matchScore;
  }
  if (input.activityType !== undefined) {
    payload.activity_type = input.activityType;
  }
  if (input.visibility !== undefined) {
    payload.visibility_type = input.visibility;
  }
  if (input.joinType !== undefined) payload.join_type = input.joinType;
  if ("status" in input && input.status !== undefined) {
    payload.status = input.status;
  }

  const start = payload.event_start_time as string | undefined;
  const end = payload.event_end_time as string | null | undefined;
  const closes = payload.registration_close_time as string | null | undefined;
  if (start && end && new Date(end) < new Date(start)) {
    throw new Error("End time cannot be before start time.");
  }
  if (start && closes && new Date(closes) > new Date(start)) {
    throw new Error("Registration must close by the start time.");
  }
  return payload;
};

const loadProfiles = async (ids: number[]) => {
  const profiles = new Map<number, DbRecord>();
  const unique = [...new Set(ids)];
  if (!unique.length) return profiles;
  const { data, error } = await supabase
    .from("tbl_users")
    .select("id,username,fullname,profile_image")
    .in("id", unique);
  if (error) throw error;
  for (const row of (data ?? []) as DbRecord[]) {
    profiles.set(Number(row.id), row);
  }
  return profiles;
};

const loadCategories = async (eventIds: number[]) => {
  const result = new Map<number, string>();
  if (!eventIds.length) return result;
  const { data: links, error: linkError } = await supabase
    .from("tbl_event_categories")
    .select("event_id,category_id")
    .in("event_id", eventIds);
  if (linkError) throw linkError;
  const categoryIds = [
    ...new Set(((links ?? []) as DbRecord[]).map((row) => Number(row.category_id))),
  ];
  if (!categoryIds.length) return result;
  const { data: categories, error } = await supabase
    .from("tbl_categories")
    .select("id,name")
    .in("id", categoryIds);
  if (error) throw error;
  const names = new Map<number, string>();
  for (const row of (categories ?? []) as DbRecord[]) {
    names.set(Number(row.id), String(row.name));
  }
  for (const link of (links ?? []) as DbRecord[]) {
    const eventId = Number(link.event_id);
    const name = names.get(Number(link.category_id));
    if (name && !result.has(eventId)) result.set(eventId, name);
  }
  return result;
};

const hydrateActivities = async (rows: DbRecord[]) => {
  const eventIds = rows.map((row) => Number(row.id));
  const [profiles, categories, communityResult] = await Promise.all([
    loadProfiles(rows.map((row) => Number(row.created_by))),
    loadCategories(eventIds),
    eventIds.length
      ? supabase.from("tbl_chat_rooms").select("id,event_id,title").eq("room_type", "community").in("event_id", eventIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (communityResult.error) throw communityResult.error;
  const communities = new Map<number, ActivityCommunity>();
  for (const room of (communityResult.data ?? []) as DbRecord[]) {
    if (room.event_id == null) continue;
    const id = String(room.id);
    const name = String(room.title ?? `Community ${id}`);
    communities.set(Number(room.event_id), { id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), imageUrl: null });
  }
  return rows.map((row) =>
    activityFromDb(
      row,
      categories.get(Number(row.id)) ?? "General",
      profiles.get(Number(row.created_by)),
      communities.get(Number(row.id)) ?? null,
    ),
  );
};

const eventIdsForCategories = async (names: string[]) => {
  if (!names.length) return null;
  const { data: categories, error } = await supabase
    .from("tbl_categories")
    .select("id")
    .in("name", names);
  if (error) throw error;
  const ids = ((categories ?? []) as DbRecord[]).map((row) => Number(row.id));
  if (!ids.length) return [];
  const { data: links, error: linksError } = await supabase
    .from("tbl_event_categories")
    .select("event_id")
    .in("category_id", ids);
  if (linksError) throw linksError;
  return [
    ...new Set(((links ?? []) as DbRecord[]).map((row) => Number(row.event_id))),
  ];
};

const chunksOf = <T>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

async function getViewerStates(
  activityIds: string[],
): Promise<Record<string, ActivityViewerState>> {
  const ids = [...new Set(activityIds.map((id) => parseId(id, "Activity ID")))];
  const states: Record<string, ActivityViewerState> = Object.fromEntries(
    ids.map((id) => [String(id), emptyViewerState()]),
  );
  if (!ids.length) return states;
  const userId = await optionalCurrentUserId();
  if (userId == null) return states;

  const batches = await Promise.all(
    chunksOf(ids, 100).map(async (batch) => {
      const [likes, saves, participants] = await Promise.all([
        supabase
          .from("tbl_event_likes")
          .select("event_id")
          .eq("user_id", userId)
          .in("event_id", batch),
        supabase
          .from("tbl_event_saves")
          .select("event_id")
          .eq("user_id", userId)
          .in("event_id", batch),
        supabase
          .from("tbl_event_participants")
          .select(
            "event_id,user_id,status,invited_by,responded_at,created_at,joined_at",
          )
          .eq("user_id", userId)
          .in("event_id", batch),
      ]);
      const error = likes.error ?? saves.error ?? participants.error;
      if (error) throw error;
      return {
        likes: (likes.data ?? []) as DbRecord[],
        saves: (saves.data ?? []) as DbRecord[],
        participants: (participants.data ?? []) as DbRecord[],
      };
    }),
  );

  for (const batch of batches) {
    for (const row of batch.likes) states[String(row.event_id)].liked = true;
    for (const row of batch.saves) states[String(row.event_id)].saved = true;
    for (const row of batch.participants) {
      states[String(row.event_id)].participation = participationFromDb(row);
    }
  }
  return states;
}

async function listComments(
  activityId: string,
  options: { page?: number; pageSize?: number; signal?: AbortSignal } = {},
): Promise<Page<ActivityComment>> {
  requireBackend();
  const eventId = parseId(activityId, "Activity ID");
  const window = pagination(options.page, options.pageSize);
  if (options.signal?.aborted) throw new Error("Activity comment request cancelled.");
  const result = firstRecord(
    await callRpc<unknown>("list_activity_comments", {
      p_event_id: eventId,
      p_page: window.page,
      p_page_size: window.pageSize,
    }),
  );
  if (!result) throw new Error("Activity comments could not be loaded.");
  const rows = Array.isArray(result.items)
    ? result.items.map(firstRecord).filter((row): row is DbRecord => Boolean(row))
    : [];
  const total = Number(result.total ?? rows.length);
  return {
    items: rows.map((row) => commentFromDb(row)),
    page: window.page,
    pageSize: window.pageSize,
    total,
    hasMore: window.from + rows.length < total,
  };
}

const eventIdFromRpc = (value: unknown, fallback?: number) => {
  if (typeof value === "number" || typeof value === "string") {
    return parseId(value, "Activity ID");
  }
  const row = firstRecord(value);
  const candidate = row?.id ?? row?.event_id;
  if (candidate != null) return parseId(String(candidate), "Activity ID");
  if (fallback != null) return fallback;
  throw new Error("Activity RPC did not return an activity ID.");
};

const getActivity = async (eventId: number, signal?: AbortSignal) => {
  let query = supabase
    .from("tbl_events")
    .select(EVENT_SELECT)
    .eq("id", eventId)
    .eq("is_deleted", false);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Activity not found or not accessible.");
  return (await hydrateActivities([data as DbRecord]))[0];
};

async function writeActivity(
  input: CreateActivityInput,
  status: "draft" | "published",
) {
  await currentUserId();
  const payload = buildPayload(input);
  const data = await callRpc<unknown>("create_activity", {
    p_payload: payload,
    p_status: status,
  });
  return getActivity(eventIdFromRpc(data));
}

async function setActivityState(
  table: "tbl_event_likes" | "tbl_event_saves",
  activityId: string,
  enabled: boolean,
) {
  const eventId = parseId(activityId, "Activity ID");
  const userId = await currentUserId();
  if (enabled) {
    const { error } = await supabase
      .from(table)
      .insert({ event_id: eventId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    return;
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw error;
}

const realtimeRefresh = (
  table: ActivityRealtimeTable,
  payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  },
): ActivityRealtimeRefresh => {
  const record = Object.keys(payload.new).length ? payload.new : payload.old;
  const activityId = table === "activities" ? record.id : record.event_id;
  return {
    table,
    eventType: payload.eventType as ActivityRealtimeEventType,
    activityId: activityId == null ? null : String(activityId),
    newRecord: payload.new,
    oldRecord: payload.old,
  };
};

const subscribeStatus = (
  handlers: ActivityRealtimeHandlers,
  status: string,
  error?: Error,
) => handlers.onStatus?.(status as ActivityRealtimeStatus, error);

const emptyPage = <T>(page: number, pageSize: number): Page<T> => ({
  items: [],
  page,
  pageSize,
  total: 0,
  hasMore: false,
});

export const activitiesProductionService = {
  async discover(
    input: DiscoverActivitiesInput = {},
  ): Promise<Page<ActivityListItem>> {
    requireBackend();
    const window = pagination(input.page, input.pageSize);
    const categoryNames = [
      ...new Set(
        [...(input.categories ?? []), ...(input.activityTypes ?? [])]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const categoryEventIds = await eventIdsForCategories(categoryNames);
    if (categoryEventIds?.length === 0) {
      return emptyPage(window.page, window.pageSize);
    }

    let query = supabase
      .from("tbl_events")
      .select(EVENT_SELECT, { count: "exact" })
      .eq("status", "published")
      .eq("is_cancelled", false)
      .eq("is_deleted", false);
    const search = input.search?.trim();
    if (search) {
      const pattern = quoteFilter(`%${search}%`);
      query = query.or(
        `title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern},display_location.ilike.${pattern}`,
      );
    }
    if (categoryEventIds) query = query.in("id", categoryEventIds);
    if (input.communityId) {
      const communityId = parseId(input.communityId, "Community ID");
      query = query.contains("media", { wenitro: { community_id: communityId } });
    }
    if (input.ownerId) {
      query = query.eq("created_by", parseId(input.ownerId, "Owner ID"));
    }
    if (input.location?.trim()) {
      const pattern = quoteFilter(`%${input.location.trim()}%`);
      query = query.or(
        `location.ilike.${pattern},display_location.ilike.${pattern}`,
      );
    }
    if (input.freeOnly || input.maxPriceInr === 0) {
      query = query.eq("is_paid", false);
    } else if ((input.minPriceInr ?? 0) > 0) {
      query = query.eq("is_paid", true);
    }
    if (input.startsAfter) {
      query = query.gte(
        "event_start_time",
        asIso(input.startsAfter, "Start date"),
      );
    } else if (input.upcomingOnly !== false) {
      query = query.gte("event_start_time", new Date().toISOString());
    }
    if (input.startsBefore) {
      query = query.lte(
        "event_start_time",
        asIso(input.startsBefore, "End date"),
      );
    }

    switch (input.sort) {
      case "latest":
        query = query.order("event_start_time", { ascending: false });
        break;
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "price_desc":
        query = query
          .order("is_paid", { ascending: false })
          .order("event_start_time", { ascending: true });
        break;
      case "price_asc":
        query = query
          .order("is_paid", { ascending: true })
          .order("event_start_time", { ascending: true });
        break;
      default:
        query = query.order("event_start_time", { ascending: true });
    }
    query = query
      .order("id", { ascending: true })
      .range(window.from, window.to);
    if (input.signal) query = query.abortSignal(input.signal);

    const { data, error, count } = await query;
    if (error) throw error;
    const activities = await hydrateActivities((data ?? []) as DbRecord[]);
    const states = await getViewerStates(activities.map((item) => item.id));
    const total = count ?? 0;
    return {
      items: activities.map((activity) => ({
        ...activity,
        viewerState: states[activity.id] ?? emptyViewerState(),
      })),
      page: window.page,
      pageSize: window.pageSize,
      total,
      hasMore: window.from + activities.length < total,
    };
  },

  async listHosted(
    input: HostedActivitiesInput = {},
  ): Promise<Page<ActivityListItem>> {
    const userId = await currentUserId();
    const window = pagination(input.page, input.pageSize);
    let query = supabase
      .from("tbl_events")
      .select(EVENT_SELECT, { count: "exact" })
      .eq("created_by", userId)
      .eq("is_deleted", false)
      .order("event_start_time", { ascending: false })
      .order("id", { ascending: true })
      .range(window.from, window.to);
    if (input.signal) query = query.abortSignal(input.signal);
    const { data, error, count } = await query;
    if (error) throw error;
    let activities = await hydrateActivities((data ?? []) as DbRecord[]);
    if (input.statuses?.length) {
      activities = activities.filter((activity) =>
        input.statuses?.includes(activity.status),
      );
    }
    const states = await getViewerStates(activities.map((item) => item.id));
    const total = input.statuses?.length ? activities.length : (count ?? 0);
    return {
      items: activities.map((activity) => ({
        ...activity,
        viewerState: states[activity.id] ?? emptyViewerState(),
      })),
      page: window.page,
      pageSize: window.pageSize,
      total,
      hasMore: input.statuses?.length
        ? false
        : window.from + activities.length < total,
    };
  },

  async getDetails(
    activityId: string,
    options: {
      commentPage?: number;
      commentPageSize?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<ActivityDetails> {
    requireBackend();
    const eventId = parseId(activityId, "Activity ID");
    const [activity, comments, states] = await Promise.all([
      getActivity(eventId, options.signal),
      listComments(activityId, {
        page: options.commentPage,
        pageSize: options.commentPageSize,
        signal: options.signal,
      }),
      getViewerStates([activityId]),
    ]);
    return {
      activity,
      viewerState: states[activityId] ?? emptyViewerState(),
      comments,
    };
  },

  listComments,

  create(input: CreateActivityInput) {
    return writeActivity(input, "published");
  },

  createDraft(input: CreateActivityInput) {
    return writeActivity(input, "draft");
  },

  async update(activityId: string, input: UpdateActivityInput) {
    const eventId = parseId(activityId, "Activity ID");
    await currentUserId();
    if (input.status === "cancelled") {
      await callRpc<unknown>("cancel_activity", { p_event_id: eventId });
      return getActivity(eventId);
    }
    const patch = buildPayload(input);
    if (!Object.keys(patch).length) {
      throw new Error("No activity changes supplied.");
    }
    const data = await callRpc<unknown>("update_activity", {
      p_event_id: eventId,
      p_patch: patch,
    });
    return getActivity(eventIdFromRpc(data, eventId));
  },

  publish(activityId: string, input: UpdateActivityInput = {}) {
    return activitiesProductionService.update(activityId, {
      ...input,
      status: "published",
    });
  },

  async delete(activityId: string) {
    const eventId = parseId(activityId, "Activity ID");
    await currentUserId();
    await callRpc<unknown>("cancel_activity", { p_event_id: eventId });
  },

  async join(activityId: string, status: JoinActivityStatus = "going") {
    const eventId = parseId(activityId, "Activity ID");
    await currentUserId();
    const row = firstRecord(
      await callRpc<unknown>("request_join_activity", {
        p_event_id: eventId,
        p_status: status,
      }),
    );
    if (!row) throw new Error("Participation could not be saved.");
    return participationFromDb(row);
  },

  async leave(activityId: string) {
    const eventId = parseId(activityId, "Activity ID");
    await currentUserId();
    await callRpc<unknown>("request_join_activity", {
      p_event_id: eventId,
      p_status: "left",
    });
  },

  async respondJoin(
    activityId: string,
    userId: string,
    status: "approved" | "rejected" | "waitlist",
  ) {
    const eventId = parseId(activityId, "Activity ID");
    const participantUserId = parseId(userId, "Participant user ID");
    await currentUserId();
    const row = firstRecord(
      await callRpc<unknown>("respond_activity_join", {
        p_event_id: eventId,
        p_user_id: participantUserId,
        p_status: status,
      }),
    );
    if (!row) throw new Error("Participation response could not be saved.");
    return participationFromDb(row);
  },

  async addComment(activityId: string, body: string, parentId?: string) {
    const eventId = parseId(activityId, "Activity ID");
    const row = firstRecord(
      await callRpc<unknown>("create_activity_comment", {
        p_event_id: eventId,
        p_body: requiredText(body, "Comment"),
        p_parent_id: parentId ? parseId(parentId, "Parent comment ID") : null,
      }),
    );
    if (!row) throw new Error("Activity comment could not be created.");
    return commentFromDb(row);
  },

  async updateComment(commentId: string, body: string) {
    const row = firstRecord(
      await callRpc<unknown>("update_activity_comment", {
        p_comment_id: parseId(commentId, "Comment ID"),
        p_body: requiredText(body, "Comment"),
      }),
    );
    if (!row) throw new Error("Activity comment could not be updated.");
    return commentFromDb(row);
  },

  async deleteComment(commentId: string) {
    await callRpc<unknown>("delete_activity_comment", {
      p_comment_id: parseId(commentId, "Comment ID"),
    });
  },

  setLiked(activityId: string, liked: boolean) {
    return setActivityState("tbl_event_likes", activityId, liked);
  },

  setSaved(activityId: string, saved: boolean) {
    return setActivityState("tbl_event_saves", activityId, saved);
  },

  async getViewerState(activityId: string) {
    parseId(activityId, "Activity ID");
    const states = await getViewerStates([activityId]);
    return states[activityId] ?? emptyViewerState();
  },

  subscribeToActivity(
    activityId: string,
    handlers: ActivityRealtimeHandlers,
  ): RealtimeChannel {
    requireBackend();
    const eventId = parseId(activityId, "Activity ID");
    const notify =
      (table: ActivityRealtimeTable) =>
      (payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) =>
        handlers.onRefresh(realtimeRefresh(table, payload));
    return supabase
      .channel(`activity:${eventId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_events",
          filter: `id=eq.${eventId}`,
        },
        notify("activities"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_event_participants",
          filter: `event_id=eq.${eventId}`,
        },
        notify("participants"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_event_comments",
          filter: `event_id=eq.${eventId}`,
        },
        notify("comments"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_event_likes",
          filter: `event_id=eq.${eventId}`,
        },
        notify("likes"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_event_saves",
          filter: `event_id=eq.${eventId}`,
        },
        notify("saves"),
      )
      .subscribe((status, error) => subscribeStatus(handlers, status, error));
  },

  subscribeToDiscovery(handlers: ActivityRealtimeHandlers): RealtimeChannel {
    requireBackend();
    return supabase
      .channel(`activity-discovery:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tbl_events" },
        (payload) =>
          handlers.onRefresh(
            realtimeRefresh("activities", {
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            }),
          ),
      )
      .subscribe((status, error) => subscribeStatus(handlers, status, error));
  },

  unsubscribe(channel: RealtimeChannel) {
    return supabase.removeChannel(channel);
  },
};

export default activitiesProductionService;
