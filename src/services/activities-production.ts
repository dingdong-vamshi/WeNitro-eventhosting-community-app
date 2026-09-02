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
  | "declined"
  | "waitlist";
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

const ACTIVITY_SELECT = `
  *,
  owner:profiles!activities_owner_id_fkey(id,username,full_name,avatar_url),
  community:communities(id,name,slug,image_url)
`;
const COMMENT_SELECT = `
  *,
  author:profiles!comments_author_id_fkey(id,username,full_name,avatar_url)
`;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const requireUuid = (value: string, label: string) => {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID.`);
  return value;
};

const currentUserId = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Authentication required.");
  return data.user.id;
};

const optionalCurrentUserId = async () => {
  requireBackend();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
};

const pagination = (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize) || DEFAULT_PAGE_SIZE),
  );
  const from = (safePage - 1) * safePageSize;
  return { page: safePage, pageSize: safePageSize, from, to: from + safePageSize - 1 };
};

const requiredText = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
};

const optionalText = (value: string | null | undefined) => {
  if (value == null) return value;
  const normalized = value.trim();
  return normalized || null;
};

const isoDate = (value: string, label: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
};

const nullableIsoDate = (value: string | null, label: string) =>
  value === null ? null : isoDate(value, label);

const finiteNumber = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
};

// PostgREST's or() accepts raw filter syntax, so quote reserved characters.
const quotedFilterValue = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const firstRelation = (value: unknown): DbRecord | null => {
  if (Array.isArray(value)) return (value[0] as DbRecord | undefined) ?? null;
  return value && typeof value === "object" ? (value as DbRecord) : null;
};

const profileFromDb = (value: unknown): ActivityProfile | null => {
  const row = firstRelation(value);
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    fullName: row.full_name == null ? null : String(row.full_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
  };
};

const activityFromDb = (row: DbRecord): Activity => ({
  id: String(row.id),
  ownerId: String(row.owner_id),
  communityId: row.community_id == null ? null : String(row.community_id),
  title: String(row.title),
  description: row.description == null ? null : String(row.description),
  category: String(row.category),
  coverUrl: row.cover_url == null ? null : String(row.cover_url),
  locationName: String(row.location_name),
  latitude: row.latitude == null ? null : Number(row.latitude),
  longitude: row.longitude == null ? null : Number(row.longitude),
  priceInr: Number(row.price_inr),
  capacity: Number(row.capacity),
  matchScore: row.match_score == null ? null : Number(row.match_score),
  activityType: row.activity_type as ActivityType,
  visibility: row.visibility as ActivityVisibility,
  status: row.status as ActivityStatus,
  startsAt: String(row.starts_at),
  endsAt: row.ends_at == null ? null : String(row.ends_at),
  registrationClosesAt:
    row.registration_closes_at == null
      ? null
      : String(row.registration_closes_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  owner: profileFromDb(row.owner),
  community: (() => {
    const community = firstRelation(row.community);
    return community
      ? {
          id: String(community.id),
          name: String(community.name),
          slug: String(community.slug),
          imageUrl:
            community.image_url == null ? null : String(community.image_url),
        }
      : null;
  })(),
});

const participationFromDb = (row: DbRecord): ActivityParticipation => ({
  activityId: String(row.activity_id),
  userId: String(row.user_id),
  role: row.role as ParticipationRole,
  status: row.status as ParticipationStatus,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const commentFromDb = (row: DbRecord): ActivityComment => ({
  id: String(row.id),
  activityId: String(row.activity_id),
  authorId: String(row.author_id),
  parentId: row.parent_id == null ? null : String(row.parent_id),
  body: String(row.body),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  author: profileFromDb(row.author),
});

const emptyViewerState = (): ActivityViewerState => ({
  liked: false,
  saved: false,
  participation: null,
});

const buildActivityWrite = (
  input: CreateActivityInput | UpdateActivityInput,
): DbRecord => {
  const values: DbRecord = {};
  if (input.title !== undefined)
    values.title = requiredText(input.title, "Title");
  if (input.category !== undefined)
    values.category = requiredText(input.category, "Category");
  if (input.locationName !== undefined)
    values.location_name = requiredText(input.locationName, "Location");
  if (input.description !== undefined)
    values.description = optionalText(input.description);
  if (input.communityId !== undefined)
    values.community_id =
      input.communityId === null
        ? null
        : requireUuid(input.communityId, "Community ID");
  if (input.coverUrl !== undefined) values.cover_url = optionalText(input.coverUrl);
  if (input.startsAt !== undefined)
    values.starts_at = isoDate(input.startsAt, "Start time");
  if (input.endsAt !== undefined)
    values.ends_at = nullableIsoDate(input.endsAt, "End time");
  if (input.registrationClosesAt !== undefined)
    values.registration_closes_at = nullableIsoDate(
      input.registrationClosesAt,
      "Registration close time",
    );
  if (input.latitude !== undefined)
    values.latitude =
      input.latitude === null ? null : finiteNumber(input.latitude, "Latitude");
  if (input.longitude !== undefined)
    values.longitude =
      input.longitude === null
        ? null
        : finiteNumber(input.longitude, "Longitude");
  if (input.priceInr !== undefined) {
    const price = finiteNumber(input.priceInr, "Price");
    if (price < 0) throw new Error("Price cannot be negative.");
    values.price_inr = price;
  }
  if (input.capacity !== undefined) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1)
      throw new Error("Capacity must be a positive integer.");
    values.capacity = input.capacity;
  }
  if (input.matchScore !== undefined) {
    if (
      input.matchScore !== null &&
      (!Number.isInteger(input.matchScore) ||
        input.matchScore < 0 ||
        input.matchScore > 100)
    )
      throw new Error("Match score must be an integer from 0 to 100.");
    values.match_score = input.matchScore;
  }
  if (input.activityType !== undefined)
    values.activity_type = input.activityType;
  if (input.visibility !== undefined) values.visibility = input.visibility;
  if ("status" in input && input.status !== undefined)
    values.status = input.status;

  const start = values.starts_at as string | undefined;
  const end = values.ends_at as string | null | undefined;
  const closes = values.registration_closes_at as string | null | undefined;
  if (start && end && new Date(end) < new Date(start))
    throw new Error("End time cannot be before start time.");
  if (start && closes && new Date(closes) > new Date(start))
    throw new Error("Registration must close by the start time.");
  return values;
};

const chunked = <T>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks;
};

async function getViewerStates(
  activityIds: string[],
): Promise<Record<string, ActivityViewerState>> {
  const ids = [...new Set(activityIds)];
  const result = Object.fromEntries(ids.map((id) => [id, emptyViewerState()]));
  if (!ids.length) return result;
  const userId = await optionalCurrentUserId();
  if (!userId) return result;

  const batches = await Promise.all(
    chunked(ids, 100).map(async (batch) => {
      const [likes, saves, participants] = await Promise.all([
        supabase
          .from("likes")
          .select("activity_id")
          .eq("user_id", userId)
          .in("activity_id", batch),
        supabase
          .from("saves")
          .select("activity_id")
          .eq("user_id", userId)
          .in("activity_id", batch),
        supabase
          .from("participants")
          .select("*")
          .eq("user_id", userId)
          .in("activity_id", batch),
      ]);
      const error = likes.error ?? saves.error ?? participants.error;
      if (error) throw error;
      return { likes: likes.data ?? [], saves: saves.data ?? [], participants: participants.data ?? [] };
    }),
  );

  for (const batch of batches) {
    for (const row of batch.likes as DbRecord[])
      result[String(row.activity_id)].liked = true;
    for (const row of batch.saves as DbRecord[])
      result[String(row.activity_id)].saved = true;
    for (const row of batch.participants as DbRecord[])
      result[String(row.activity_id)].participation = participationFromDb(row);
  }
  return result;
}

async function listComments(
  activityId: string,
  options: { page?: number; pageSize?: number; signal?: AbortSignal } = {},
): Promise<Page<ActivityComment>> {
  requireBackend();
  requireUuid(activityId, "Activity ID");
  const window = pagination(options.page, options.pageSize);
  let query = supabase
    .from("comments")
    .select(COMMENT_SELECT, { count: "exact" })
    .eq("activity_id", activityId)
    .order("created_at", { ascending: true })
    .range(window.from, window.to);
  if (options.signal) query = query.abortSignal(options.signal);
  const { data, error, count } = await query;
  if (error) throw error;
  const total = count ?? 0;
  return {
    items: ((data ?? []) as DbRecord[]).map(commentFromDb),
    page: window.page,
    pageSize: window.pageSize,
    total,
    hasMore: window.from + (data?.length ?? 0) < total,
  };
}

async function writeActivity(
  input: CreateActivityInput,
  status: "draft" | "published",
) {
  const userId = await currentUserId();
  const values = buildActivityWrite(input);
  const { data, error } = await supabase
    .from("activities")
    .insert({ ...values, owner_id: userId, status })
    .select(ACTIVITY_SELECT)
    .single();
  if (error) throw error;
  return activityFromDb(data as DbRecord);
}

async function setActivityState(
  table: "likes" | "saves",
  activityId: string,
  enabled: boolean,
) {
  requireUuid(activityId, "Activity ID");
  const userId = await currentUserId();
  if (enabled) {
    const { error } = await supabase
      .from(table)
      .insert({ activity_id: activityId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    return;
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("activity_id", activityId)
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
  const activityId =
    table === "activities" ? record.id : record.activity_id;
  return {
    table,
    eventType: payload.eventType as ActivityRealtimeEventType,
    activityId: typeof activityId === "string" ? activityId : null,
    newRecord: payload.new,
    oldRecord: payload.old,
  };
};

const subscribeStatus = (
  handlers: ActivityRealtimeHandlers,
  status: string,
  error?: Error,
) => handlers.onStatus?.(status as ActivityRealtimeStatus, error);

export const activitiesProductionService = {
  async discover(
    input: DiscoverActivitiesInput = {},
  ): Promise<Page<ActivityListItem>> {
    requireBackend();
    const window = pagination(input.page, input.pageSize);
    let query = supabase
      .from("activities")
      .select(ACTIVITY_SELECT, { count: "exact" })
      .eq("status", "published");

    const search = input.search?.trim();
    if (search) {
      const pattern = quotedFilterValue(`%${search}%`);
      query = query.or(
        `title.ilike.${pattern},description.ilike.${pattern},location_name.ilike.${pattern},category.ilike.${pattern}`,
      );
    }
    const categories = input.categories?.map((item) => item.trim()).filter(Boolean);
    if (categories?.length) query = query.in("category", categories);
    if (input.activityTypes?.length)
      query = query.in("activity_type", input.activityTypes);
    if (input.communityId)
      query = query.eq(
        "community_id",
        requireUuid(input.communityId, "Community ID"),
      );
    if (input.ownerId)
      query = query.eq("owner_id", requireUuid(input.ownerId, "Owner ID"));
    if (input.location?.trim())
      query = query.ilike("location_name", `%${input.location.trim()}%`);
    if (input.freeOnly) query = query.eq("price_inr", 0);
    else {
      if (input.minPriceInr !== undefined)
        query = query.gte(
          "price_inr",
          finiteNumber(input.minPriceInr, "Minimum price"),
        );
      if (input.maxPriceInr !== undefined)
        query = query.lte(
          "price_inr",
          finiteNumber(input.maxPriceInr, "Maximum price"),
        );
    }
    if (input.startsAfter)
      query = query.gte("starts_at", isoDate(input.startsAfter, "Start date"));
    else if (input.upcomingOnly !== false)
      query = query.gte("starts_at", new Date().toISOString());
    if (input.startsBefore)
      query = query.lte("starts_at", isoDate(input.startsBefore, "End date"));

    switch (input.sort) {
      case "latest":
        query = query.order("starts_at", { ascending: false });
        break;
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "price_asc":
        query = query
          .order("price_inr", { ascending: true })
          .order("starts_at", { ascending: true });
        break;
      case "price_desc":
        query = query
          .order("price_inr", { ascending: false })
          .order("starts_at", { ascending: true });
        break;
      default:
        query = query.order("starts_at", { ascending: true });
    }
    query = query.order("id", { ascending: true }).range(window.from, window.to);
    if (input.signal) query = query.abortSignal(input.signal);

    const { data, error, count } = await query;
    if (error) throw error;
    const activities = ((data ?? []) as DbRecord[]).map(activityFromDb);
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
      .from("activities")
      .select(ACTIVITY_SELECT, { count: "exact" })
      .eq("owner_id", userId);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    query = query
      .order("starts_at", { ascending: false })
      .order("id", { ascending: true })
      .range(window.from, window.to);
    if (input.signal) query = query.abortSignal(input.signal);
    const { data, error, count } = await query;
    if (error) throw error;
    const activities = ((data ?? []) as DbRecord[]).map(activityFromDb);
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

  async getDetails(
    activityId: string,
    options: { commentPage?: number; commentPageSize?: number; signal?: AbortSignal } = {},
  ): Promise<ActivityDetails> {
    requireBackend();
    requireUuid(activityId, "Activity ID");
    let query = supabase
      .from("activities")
      .select(ACTIVITY_SELECT)
      .eq("id", activityId);
    if (options.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Activity not found or not accessible.");
    const [comments, states] = await Promise.all([
      listComments(activityId, {
        page: options.commentPage,
        pageSize: options.commentPageSize,
        signal: options.signal,
      }),
      getViewerStates([activityId]),
    ]);
    return {
      activity: activityFromDb(data as DbRecord),
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
    requireUuid(activityId, "Activity ID");
    const userId = await currentUserId();
    const values = buildActivityWrite(input);
    if (!Object.keys(values).length) throw new Error("No activity changes supplied.");
    const { data, error } = await supabase
      .from("activities")
      .update(values)
      .eq("id", activityId)
      .eq("owner_id", userId)
      .select(ACTIVITY_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Activity not found or not editable.");
    return activityFromDb(data as DbRecord);
  },

  publish(activityId: string, input: UpdateActivityInput = {}) {
    return activitiesProductionService.update(activityId, {
      ...input,
      status: "published",
    });
  },

  async delete(activityId: string) {
    requireUuid(activityId, "Activity ID");
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("activities")
      .delete()
      .eq("id", activityId)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Activity not found or not deletable.");
  },

  async join(activityId: string, status: ParticipationStatus = "going") {
    requireUuid(activityId, "Activity ID");
    const userId = await currentUserId();
    let { data, error } = await supabase
      .from("participants")
      .insert({
        activity_id: activityId,
        user_id: userId,
        role: "participant",
        status,
      })
      .select()
      .maybeSingle();
    if (error?.code === "23505") {
      const updated = await supabase
        .from("participants")
        .update({ status })
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      data = updated.data;
      error = updated.error;
    }
    if (error) throw error;
    if (!data) throw new Error("Participation could not be saved.");
    return participationFromDb(data as DbRecord);
  },

  async leave(activityId: string) {
    requireUuid(activityId, "Activity ID");
    const userId = await currentUserId();
    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async addComment(activityId: string, body: string, parentId?: string) {
    requireUuid(activityId, "Activity ID");
    const userId = await currentUserId();
    const normalizedBody = requiredText(body, "Comment");
    const normalizedParentId = parentId
      ? requireUuid(parentId, "Parent comment ID")
      : null;
    if (normalizedParentId) {
      const { data: parent, error: parentError } = await supabase
        .from("comments")
        .select("activity_id")
        .eq("id", normalizedParentId)
        .maybeSingle();
      if (parentError) throw parentError;
      if (!parent || parent.activity_id !== activityId)
        throw new Error("Parent comment does not belong to this activity.");
    }
    const { data, error } = await supabase
      .from("comments")
      .insert({
        activity_id: activityId,
        author_id: userId,
        parent_id: normalizedParentId,
        body: normalizedBody,
      })
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;
    return commentFromDb(data as DbRecord);
  },

  async updateComment(commentId: string, body: string) {
    requireUuid(commentId, "Comment ID");
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("comments")
      .update({ body: requiredText(body, "Comment") })
      .eq("id", commentId)
      .eq("author_id", userId)
      .select(COMMENT_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Comment not found or not editable.");
    return commentFromDb(data as DbRecord);
  },

  async deleteComment(commentId: string) {
    requireUuid(commentId, "Comment ID");
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("author_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Comment not found or not deletable.");
  },

  setLiked(activityId: string, liked: boolean) {
    return setActivityState("likes", activityId, liked);
  },

  setSaved(activityId: string, saved: boolean) {
    return setActivityState("saves", activityId, saved);
  },

  async getViewerState(activityId: string) {
    requireUuid(activityId, "Activity ID");
    const states = await getViewerStates([activityId]);
    return states[activityId] ?? emptyViewerState();
  },

  subscribeToActivity(
    activityId: string,
    handlers: ActivityRealtimeHandlers,
  ): RealtimeChannel {
    requireBackend();
    requireUuid(activityId, "Activity ID");
    const notify =
      (table: ActivityRealtimeTable) =>
      (payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) =>
        handlers.onRefresh(realtimeRefresh(table, payload));
    const channel = supabase
      .channel(`activity:${activityId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities", filter: `id=eq.${activityId}` },
        notify("activities"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `activity_id=eq.${activityId}` },
        notify("participants"),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter: `activity_id=eq.${activityId}` },
        notify("comments"),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "comments", filter: `activity_id=eq.${activityId}` },
        notify("comments"),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes", filter: `activity_id=eq.${activityId}` },
        notify("likes"),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "saves", filter: `activity_id=eq.${activityId}` },
        notify("saves"),
      );
    return channel.subscribe((status, error) =>
      subscribeStatus(handlers, status, error),
    );
  },

  subscribeToDiscovery(handlers: ActivityRealtimeHandlers): RealtimeChannel {
    requireBackend();
    const channel = supabase
      .channel(`activity-discovery:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        (payload) =>
          handlers.onRefresh(
            realtimeRefresh("activities", {
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            }),
          ),
      );
    return channel.subscribe((status, error) =>
      subscribeStatus(handlers, status, error),
    );
  },

  unsubscribe(channel: RealtimeChannel) {
    return supabase.removeChannel(channel);
  },
};

export default activitiesProductionService;
