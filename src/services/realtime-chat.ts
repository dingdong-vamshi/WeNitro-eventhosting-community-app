import type { RealtimeChannel } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type ChatMediaType = "image" | "video" | "audio" | "document";
export type ChatProfile = {
  id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};
export type ChatMember = {
  conversation_id: number;
  user_id: number;
  role: "member" | "admin";
  last_read_at: string | null;
  muted: boolean;
  joined_at: string;
  profiles: ChatProfile | null;
};
export type ChatMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  media_url: string | null;
  media_type: ChatMediaType | null;
  reply_to_id: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  client_id: string;
  profiles?: ChatProfile | null;
  media_signed_url?: string | null;
};
export type SendMessageInput = {
  conversationId: number;
  /** Persist with optimistic UI state and reuse for retries. */
  clientId?: string;
  body?: string;
  media?: { path: string; type: ChatMediaType };
};
export type MessageCursor = { createdAt: string; id: number };
export type LoadMessagesOptions = {
  limit?: number;
  before?: string;
  beforeId?: number;
  cursor?: MessageCursor | null;
  includeDeleted?: boolean;
  signedUrlExpiresIn?: number;
};
export type MessagePage = {
  items: ChatMessage[];
  nextCursor: MessageCursor | null;
};
export type PresenceParticipant = {
  userId: number;
  onlineAt: string;
  deviceId: string;
};
export type TypingEvent = {
  userId: number;
  isTyping: boolean;
  sentAt: string;
};
export type ReadReceipt = {
  conversationId: number;
  userId: number;
  readAt: string;
};
export type MessageChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  message: ChatMessage | null;
  old: Partial<ChatMessage>;
};
export type RealtimeChatHandlers = {
  onMessageChange?: (change: MessageChange) => void;
  onTyping?: (event: TypingEvent) => void;
  onPresence?: (participants: PresenceParticipant[]) => void;
  onReadReceipt?: (receipt: ReadReceipt) => void;
  onStatus?: (status: string) => void;
  onError?: (error: RealtimeChatError) => void;
};
export type SubscribeToConversationOptions = RealtimeChatHandlers & {
  conversationId: number;
  deviceId?: string;
  privateChannel?: boolean;
};
export type RealtimeChatSubscription = {
  channel: RealtimeChannel;
  sendTyping: (isTyping: boolean) => Promise<void>;
  markRead: (readAt?: Date) => Promise<ReadReceipt>;
  presenceState: () => PresenceParticipant[];
  cleanup: () => Promise<void>;
};

export class RealtimeChatError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly cause?: unknown;
  constructor(
    message: string,
    options: { code: string; operation: string; cause?: unknown },
  ) {
    super(message);
    this.name = "RealtimeChatError";
    this.code = options.code;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

/** Names required from the legacy bridge migration. */
export const realtimeChatBridgeRpc = {
  currentUserId: "get_current_app_user_id",
  checkMembership: "assert_chat_membership",
  createDirectRoom: "create_direct_chat_room",
  createGroupRoom: "create_group_chat_room",
  listMembers: "list_chat_participants",
  listMessages: "list_chat_messages",
  sendMessage: "send_chat_message",
  markRead: "mark_chat_read",
} as const;

const MAX_PAGE_SIZE = 100;
const MAX_MESSAGE_LENGTH = 10_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

const record = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const first = (value: unknown): Row =>
  record(Array.isArray(value) ? value[0] : value);
const nullableString = (value: unknown) =>
  typeof value === "string" && value ? value : null;
function id(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Bridge returned an invalid ${field}.`);
  }
  return parsed;
}
function assertId(value: number, field: string, operation: string) {
  try {
    id(value, field);
  } catch (cause) {
    throw new RealtimeChatError(`${field} must be a positive integer.`, {
      code: "INVALID_ARGUMENT",
      operation,
      cause,
    });
  }
}
function chatError(error: unknown, operation: string) {
  if (error instanceof RealtimeChatError) return error;
  const source = error as { code?: string; message?: string } | null;
  return new RealtimeChatError(
    source?.message ?? `Realtime chat failed while attempting to ${operation}.`,
    {
      code:
        source?.code === "42501"
          ? "FORBIDDEN"
          : source?.code === "PGRST116"
            ? "NOT_FOUND"
            : (source?.code ?? "UNKNOWN"),
      operation,
      cause: error,
    },
  );
}
function mapProfile(value: unknown): ChatProfile | null {
  const row = first(value);
  if (row.id == null) return null;
  return {
    id: id(row.id, "profile id"),
    username: String(row.username ?? ""),
    full_name: nullableString(row.fullname ?? row.full_name),
    avatar_url: nullableString(row.profile_image ?? row.avatar_url),
  };
}
function mapMessage(value: unknown): ChatMessage {
  const row = record(value);
  const mediaUrl = nullableString(row.media_url);
  const rawType = row.message_type ?? row.media_type;
  return {
    id: id(row.id, "message id"),
    conversation_id: id(row.room_id ?? row.conversation_id, "room id"),
    sender_id: id(row.sender_id, "sender id"),
    body: String(row.content ?? row.body ?? ""),
    media_url: mediaUrl,
    media_type:
      !mediaUrl || rawType === "text"
        ? null
        : rawType === "image" || rawType === "video" || rawType === "audio"
          ? rawType
          : "document",
    reply_to_id:
      row.reply_to_id == null ? null : id(row.reply_to_id, "reply id"),
    edited_at: nullableString(row.edited_at),
    deleted_at: nullableString(row.deleted_at),
    created_at: String(row.created_at),
    client_id: String(row.client_id ?? ""),
    profiles: mapProfile(row.sender ?? row.profile ?? row.profiles),
  };
}
function mapMember(value: unknown): ChatMember {
  const row = record(value);
  return {
    conversation_id: id(row.room_id ?? row.conversation_id, "room id"),
    user_id: id(row.user_id, "user id"),
    role: row.role === "admin" ? "admin" : "member",
    last_read_at: nullableString(row.last_read_at),
    muted: Boolean(row.muted),
    joined_at: String(row.joined_at),
    profiles: mapProfile(row.user ?? row.profile ?? row.profiles),
  };
}
function partialMessage(value: unknown): Partial<ChatMessage> {
  const row = record(value);
  return {
    ...(row.id == null ? {} : { id: id(row.id, "message id") }),
    ...(row.room_id == null
      ? {}
      : { conversation_id: id(row.room_id, "room id") }),
    ...(row.deleted_at === undefined
      ? {}
      : { deleted_at: nullableString(row.deleted_at) }),
  };
}
function callback<T>(handler: ((value: T) => void) | undefined, value: T) {
  if (!handler) return;
  try {
    handler(value);
  } catch (error) {
    console.error("Realtime chat callback failed.", error);
  }
}

async function currentUserId(operation: string): Promise<number> {
  if (!isSupabaseConfigured) {
    throw new RealtimeChatError("Supabase is not configured.", {
      code: "NOT_CONFIGURED",
      operation,
    });
  }
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) {
    throw new RealtimeChatError("Authentication is required.", {
      code: "UNAUTHENTICATED",
      operation,
    });
  }
  const { data, error } = await supabase.rpc(realtimeChatBridgeRpc.currentUserId);
  if (error) throw error;
  const row = first(data);
  return id(row.user_id ?? row.id ?? data, "current user id");
}
async function requireMembership(roomId: number, operation: string) {
  assertId(roomId, "conversationId", operation);
  const { data, error } = await supabase.rpc(
    realtimeChatBridgeRpc.checkMembership,
    { p_room_id: roomId },
  );
  if (error) throw error;
  const row = first(data);
  if (data === false || row.is_member === false || row.allowed === false) {
    throw new RealtimeChatError("You are not a member of this conversation.", {
      code: "FORBIDDEN",
      operation,
    });
  }
}
async function signMedia(messages: ChatMessage[], expiresIn: number) {
  const paths = [
    ...new Set(
      messages
        .map((message) => message.media_url)
        .filter(
          (path): path is string =>
            Boolean(path) && !/^https?:\/\//i.test(path as string),
        ),
    ),
  ];
  if (!paths.length) {
    return messages.map((message) => ({
      ...message,
      media_signed_url: message.media_url,
    }));
  }
  const { data, error } = await supabase.storage
    .from("messages")
    .createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const urls = new Map(
    (data ?? []).map((item) => [item.path, item.signedUrl ?? null]),
  );
  return messages.map((message) => ({
    ...message,
    media_signed_url: message.media_url
      ? (urls.get(message.media_url) ?? message.media_url)
      : null,
  }));
}

export const createMessageClientId = () => crypto.randomUUID();

export async function createDirectConversation(otherUserId: number) {
  const operation = "create a direct conversation";
  try {
    const ownId = await currentUserId(operation);
    assertId(otherUserId, "otherUserId", operation);
    if (ownId === otherUserId) throw new Error("Select another user.");
    const { data, error } = await supabase.rpc(
      realtimeChatBridgeRpc.createDirectRoom,
      { p_other_user_id: otherUserId },
    );
    if (error) throw error;
    const row = first(data);
    return id(row.room_id ?? row.id ?? data, "room id");
  } catch (error) {
    throw chatError(error, operation);
  }
}
export async function createGroupConversation(name: string, memberIds: number[]) {
  const operation = "create a group conversation";
  try {
    const ownId = await currentUserId(operation);
    const title = name.trim();
    if (title.length < 3 || title.length > 80) {
      throw new Error("Group names must contain 3 to 80 characters.");
    }
    const members = [...new Set(memberIds)].filter((member) => member !== ownId);
    if (!members.length) throw new Error("A group needs another member.");
    members.forEach((member) => assertId(member, "memberId", operation));
    const { data, error } = await supabase.rpc(
      realtimeChatBridgeRpc.createGroupRoom,
      { p_title: title, p_member_ids: members },
    );
    if (error) throw error;
    const row = first(data);
    return id(row.room_id ?? row.id ?? data, "room id");
  } catch (error) {
    throw chatError(error, operation);
  }
}
export async function loadConversationMembers(conversationId: number) {
  const operation = "load conversation members";
  try {
    await currentUserId(operation);
    await requireMembership(conversationId, operation);
    const { data, error } = await supabase.rpc(
      realtimeChatBridgeRpc.listMembers,
      { p_room_id: conversationId },
    );
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapMember);
  } catch (error) {
    throw chatError(error, operation);
  }
}
export async function loadMessagesPage(
  conversationId: number,
  options: LoadMessagesOptions = {},
): Promise<MessagePage> {
  const operation = "load messages";
  try {
    await currentUserId(operation);
    await requireMembership(conversationId, operation);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE_SIZE);
    const cursorAt = options.cursor?.createdAt ?? options.before ?? null;
    const cursorId = options.cursor?.id ?? options.beforeId ?? null;
    if (cursorAt && Number.isNaN(new Date(cursorAt).getTime())) {
      throw new Error("The message cursor is invalid.");
    }
    if (cursorId != null) assertId(cursorId, "cursor.id", operation);
    const { data, error } = await supabase.rpc(
      realtimeChatBridgeRpc.listMessages,
      {
        p_room_id: conversationId,
        p_before_created_at: cursorAt
          ? new Date(cursorAt).toISOString()
          : null,
        p_before_id: cursorId,
        p_limit: limit + 1,
        p_include_deleted: options.includeDeleted ?? false,
      },
    );
    if (error) throw error;
    const descending = (Array.isArray(data) ? data : []).map(mapMessage);
    const pageRows = descending.slice(0, limit);
    const oldest = pageRows.at(-1);
    return {
      items: await signMedia(
        [...pageRows].reverse(),
        options.signedUrlExpiresIn ?? 3_600,
      ),
      nextCursor:
        descending.length > limit && oldest
          ? { createdAt: oldest.created_at, id: oldest.id }
          : null,
    };
  } catch (error) {
    throw chatError(error, operation);
  }
}
export async function loadMessages(
  conversationId: number,
  options: LoadMessagesOptions = {},
) {
  return (await loadMessagesPage(conversationId, options)).items;
}
export async function sendMessage(input: SendMessageInput) {
  const operation = "send a message";
  try {
    await currentUserId(operation);
    await requireMembership(input.conversationId, operation);
    const body = input.body?.trim() ?? "";
    if (!body && !input.media) throw new Error("A message needs text or media.");
    if (body.length > MAX_MESSAGE_LENGTH) throw new Error("Message is too long.");
    if (
      input.media &&
      (!input.media.path || /^https?:\/\//i.test(input.media.path))
    ) {
      throw new Error("Media must be a private messages-bucket object path.");
    }
    const clientId = input.clientId ?? createMessageClientId();
    if (!UUID.test(clientId)) throw new Error("clientId must be a UUID.");
    const { data, error } = await supabase.rpc(
      realtimeChatBridgeRpc.sendMessage,
      {
        p_room_id: input.conversationId,
        p_client_id: clientId,
        p_content: body,
        p_message_type: input.media?.type ?? "text",
        p_media_url: input.media?.path ?? null,
      },
    );
    if (error) throw error;
    return (await signMedia([mapMessage(first(data))], 3_600))[0];
  } catch (error) {
    throw chatError(error, operation);
  }
}
async function persistRead(
  conversationId: number,
  userId: number,
  readAt: Date,
): Promise<ReadReceipt> {
  if (Number.isNaN(readAt.getTime())) throw new Error("Invalid read timestamp.");
  const { data, error } = await supabase.rpc(realtimeChatBridgeRpc.markRead, {
    p_room_id: conversationId,
    p_read_at: readAt.toISOString(),
  });
  if (error) throw error;
  const row = first(data);
  return {
    conversationId,
    userId,
    readAt: String(
      row.last_read_at ?? row.read_at ?? data ?? readAt.toISOString(),
    ),
  };
}
export async function markConversationRead(
  conversationId: number,
  readAt = new Date(),
) {
  const operation = "mark a conversation as read";
  try {
    const userId = await currentUserId(operation);
    await requireMembership(conversationId, operation);
    return await persistRead(conversationId, userId, readAt);
  } catch (error) {
    throw chatError(error, operation);
  }
}
function presence(channel: RealtimeChannel): PresenceParticipant[] {
  const result = new Map<string, PresenceParticipant>();
  for (const entries of Object.values(
    channel.presenceState<PresenceParticipant>(),
  )) {
    for (const entry of entries) {
      if (
        Number.isSafeInteger(entry.userId) &&
        typeof entry.onlineAt === "string" &&
        typeof entry.deviceId === "string"
      ) {
        result.set(`${entry.userId}:${entry.deviceId}`, entry);
      }
    }
  }
  return [...result.values()];
}
export async function subscribeToConversation(
  options: SubscribeToConversationOptions,
): Promise<RealtimeChatSubscription> {
  const operation = "subscribe to a conversation";
  let channel: RealtimeChannel | null = null;
  try {
    const userId = await currentUserId(operation);
    await requireMembership(options.conversationId, operation);
    const isPrivate = options.privateChannel ?? true;
    if (isPrivate) await supabase.realtime.setAuth();
    let closed = false;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    const deviceId = options.deviceId?.trim() || crypto.randomUUID();
    channel = supabase.channel(`room:${options.conversationId}`, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: String(userId), enabled: true },
        private: isPrivate,
      },
    });
    const report = (error: unknown, failedOperation: string) =>
      callback(options.onError, chatError(error, failedOperation));
    const broadcast = async (event: string, payload: object) => {
      if (closed || !channel) throw new Error("Subscription is closed.");
      const result = await channel.send({ type: "broadcast", event, payload });
      if (result !== "ok") throw new Error(`Realtime broadcast ${result}.`);
    };
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tbl_messages",
          filter: `room_id=eq.${options.conversationId}`,
        },
        (payload) => {
          void (async () => {
            try {
              callback(options.onMessageChange, {
                eventType: payload.eventType,
                message:
                  payload.eventType === "DELETE"
                    ? null
                    : (await signMedia([mapMessage(payload.new)], 3_600))[0],
                old: partialMessage(payload.old),
              });
            } catch (error) {
              report(error, "process a realtime message");
            }
          })();
        },
      )
      .on<TypingEvent>("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== userId) callback(options.onTyping, payload);
      })
      .on<ReadReceipt>(
        "broadcast",
        { event: "read-receipt" },
        ({ payload }) => {
          if (payload.userId !== userId)
            callback(options.onReadReceipt, payload);
        },
      )
      .on("presence", { event: "sync" }, () => {
        if (channel) callback(options.onPresence, presence(channel));
      });
    await new Promise<void>((resolve, reject) => {
      channel!.subscribe((status, error) => {
        callback(options.onStatus, status);
        if (status === "SUBSCRIBED") {
          void channel!
            .track({
              userId,
              onlineAt: new Date().toISOString(),
              deviceId,
            })
            .catch((cause) => report(cause, "track presence"));
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(error ?? new Error(`Realtime subscription ${status}.`));
        }
      });
    });
    const sendTyping = async (isTyping: boolean) => {
      if (typingTimer) clearTimeout(typingTimer);
      await broadcast("typing", {
        userId,
        isTyping,
        sentAt: new Date().toISOString(),
      } satisfies TypingEvent);
      if (isTyping) {
        typingTimer = setTimeout(() => {
          void broadcast("typing", {
            userId,
            isTyping: false,
            sentAt: new Date().toISOString(),
          } satisfies TypingEvent).catch((cause) =>
            report(cause, "clear typing state"),
          );
        }, 4_000);
      }
    };
    const markRead = async (readAt = new Date()) => {
      const receipt = await persistRead(options.conversationId, userId, readAt);
      await broadcast("read-receipt", receipt);
      return receipt;
    };
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      if (typingTimer) clearTimeout(typingTimer);
      try {
        await channel!.untrack();
      } finally {
        await supabase.removeChannel(channel!);
      }
    };
    return {
      channel,
      sendTyping,
      markRead,
      presenceState: () => presence(channel!),
      cleanup,
    };
  } catch (error) {
    if (channel) await supabase.removeChannel(channel);
    throw chatError(error, operation);
  }
}

export const realtimeChatService = {
  createDirectConversation,
  createGroupConversation,
  loadConversationMembers,
  loadMessagesPage,
  loadMessages,
  sendMessage,
  markConversationRead,
  subscribeToConversation,
};
