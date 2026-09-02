import type { RealtimeChannel } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type ChatMediaType = "image" | "video" | "audio" | "document";

export type ChatProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type ChatMember = {
  conversation_id: string;
  user_id: string;
  role: "member" | "admin";
  last_read_at: string;
  muted: boolean;
  joined_at: string;
  profiles: ChatProfile | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  media_type: ChatMediaType | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  profiles?: ChatProfile | null;
  media_signed_url?: string | null;
};

export type SendMessageInput = {
  conversationId: string;
  body?: string;
  media?: {
    /** A path in the private `messages` bucket, not a temporary signed URL. */
    path: string;
    type: ChatMediaType;
  };
  replyToId?: string | null;
};

export type LoadMessagesOptions = {
  limit?: number;
  before?: string;
  includeDeleted?: boolean;
  signedUrlExpiresIn?: number;
};

export type PresenceParticipant = {
  userId: string;
  onlineAt: string;
  deviceId: string;
};

export type TypingEvent = {
  userId: string;
  isTyping: boolean;
  sentAt: string;
};

export type ReadReceipt = {
  conversationId: string;
  userId: string;
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
  conversationId: string;
  deviceId?: string;
  /** Enable only when matching Realtime Authorization policies are deployed. */
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_PAGE_SIZE = 100;
const TYPING_IDLE_MS = 4_000;

function assertConfigured(operation: string) {
  if (!isSupabaseConfigured) {
    throw new RealtimeChatError("Supabase is not configured for this build.", {
      code: "NOT_CONFIGURED",
      operation,
    });
  }
}

function assertUuid(value: string, field: string, operation: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new RealtimeChatError(`${field} must be a valid UUID.`, {
      code: "INVALID_ARGUMENT",
      operation,
    });
  }
}

function toChatError(error: unknown, operation: string): RealtimeChatError {
  if (error instanceof RealtimeChatError) return error;

  const candidate = error as { code?: string; message?: string } | null;
  const sourceCode = candidate?.code ?? "UNKNOWN";
  const code =
    sourceCode === "42501"
      ? "FORBIDDEN"
      : sourceCode === "PGRST116"
        ? "NOT_FOUND"
        : sourceCode;

  return new RealtimeChatError(
    candidate?.message || `Realtime chat failed while attempting to ${operation}.`,
    { code, operation, cause: error },
  );
}

async function currentUserId(operation: string): Promise<string> {
  assertConfigured(operation);
  const { data, error } = await supabase.auth.getUser();
  if (error) throw toChatError(error, operation);
  if (!data.user) {
    throw new RealtimeChatError("Authentication is required.", {
      code: "UNAUTHENTICATED",
      operation,
    });
  }
  return data.user.id;
}

async function requireMembership(
  conversationId: string,
  userId: string,
  operation: string,
) {
  const { data, error } = await supabase
    .from("chat_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw toChatError(error, operation);
  if (!data) {
    throw new RealtimeChatError("You are not a member of this conversation.", {
      code: "FORBIDDEN",
      operation,
    });
  }
}

function safeCallback<T>(
  callback: ((value: T) => void) | undefined,
  value: T,
) {
  if (!callback) return;
  try {
    callback(value);
  } catch (error) {
    console.error("Realtime chat callback failed.", error);
  }
}

function presenceParticipants(channel: RealtimeChannel): PresenceParticipant[] {
  const participants = new Map<string, PresenceParticipant>();
  const state = channel.presenceState<PresenceParticipant>();

  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (
        typeof entry.userId === "string" &&
        typeof entry.onlineAt === "string" &&
        typeof entry.deviceId === "string"
      ) {
        participants.set(`${entry.userId}:${entry.deviceId}`, entry);
      }
    }
  }

  return [...participants.values()];
}

async function signedMediaUrls(
  messages: ChatMessage[],
  expiresIn: number,
): Promise<ChatMessage[]> {
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

  if (paths.length === 0) {
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
      ? /^https?:\/\//i.test(message.media_url)
        ? message.media_url
        : (urls.get(message.media_url) ?? null)
      : null,
  }));
}

export async function createDirectConversation(
  otherUserId: string,
): Promise<string> {
  const operation = "create a direct conversation";
  try {
    const userId = await currentUserId(operation);
    assertUuid(otherUserId, "otherUserId", operation);
    if (otherUserId === userId) {
      throw new RealtimeChatError("A direct conversation requires another user.", {
        code: "INVALID_ARGUMENT",
        operation,
      });
    }

    const { data, error } = await supabase.rpc("create_direct_conversation", {
      other_user_id: otherUserId,
    });
    if (error) throw error;
    if (typeof data !== "string") throw new Error("The RPC returned no conversation ID.");
    return data;
  } catch (error) {
    throw toChatError(error, operation);
  }
}

export async function createGroupConversation(
  name: string,
  memberIds: string[],
): Promise<string> {
  const operation = "create a group conversation";
  try {
    const userId = await currentUserId(operation);
    const groupName = name.trim();
    if (groupName.length < 3 || groupName.length > 80) {
      throw new RealtimeChatError("Group names must contain 3 to 80 characters.", {
        code: "INVALID_ARGUMENT",
        operation,
      });
    }

    const uniqueMemberIds = [...new Set(memberIds)].filter((id) => id !== userId);
    if (uniqueMemberIds.length === 0) {
      throw new RealtimeChatError("A group requires at least one other member.", {
        code: "INVALID_ARGUMENT",
        operation,
      });
    }
    uniqueMemberIds.forEach((id) => assertUuid(id, "memberId", operation));

    const { data, error } = await supabase.rpc("create_chat_group", {
      group_name: groupName,
      member_ids: uniqueMemberIds,
    });
    if (error) throw error;
    if (typeof data !== "string") throw new Error("The RPC returned no conversation ID.");
    return data;
  } catch (error) {
    throw toChatError(error, operation);
  }
}

export async function loadConversationMembers(
  conversationId: string,
): Promise<ChatMember[]> {
  const operation = "load conversation members";
  try {
    const userId = await currentUserId(operation);
    assertUuid(conversationId, "conversationId", operation);
    await requireMembership(conversationId, userId, operation);

    const { data, error } = await supabase
      .from("chat_members")
      .select(
        "conversation_id,user_id,role,last_read_at,muted,joined_at,profiles(id,username,full_name,avatar_url)",
      )
      .eq("conversation_id", conversationId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ChatMember[];
  } catch (error) {
    throw toChatError(error, operation);
  }
}

export async function loadMessages(
  conversationId: string,
  options: LoadMessagesOptions = {},
): Promise<ChatMessage[]> {
  const operation = "load messages";
  try {
    const userId = await currentUserId(operation);
    assertUuid(conversationId, "conversationId", operation);
    await requireMembership(conversationId, userId, operation);

    const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_PAGE_SIZE);
    let query = supabase
      .from("chat_messages")
      .select(
        "id,conversation_id,sender_id,body,media_url,media_type,reply_to_id,edited_at,deleted_at,created_at,profiles!chat_messages_sender_id_fkey(id,username,full_name,avatar_url)",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!options.includeDeleted) query = query.is("deleted_at", null);
    if (options.before) {
      const before = new Date(options.before);
      if (Number.isNaN(before.getTime())) {
        throw new RealtimeChatError("before must be a valid date.", {
          code: "INVALID_ARGUMENT",
          operation,
        });
      }
      query = query.lt("created_at", before.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    const messages = [...((data ?? []) as unknown as ChatMessage[])].reverse();
    return await signedMediaUrls(messages, options.signedUrlExpiresIn ?? 3_600);
  } catch (error) {
    throw toChatError(error, operation);
  }
}

export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const operation = "send a message";
  try {
    const userId = await currentUserId(operation);
    assertUuid(input.conversationId, "conversationId", operation);
    await requireMembership(input.conversationId, userId, operation);

    const body = input.body?.trim() ?? "";
    if (!body && !input.media) {
      throw new RealtimeChatError("A message requires text or media.", {
        code: "INVALID_ARGUMENT",
        operation,
      });
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new RealtimeChatError(
        `Messages cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        { code: "INVALID_ARGUMENT", operation },
      );
    }
    if (
      input.media &&
      (!input.media.path ||
        /^https?:\/\//i.test(input.media.path) ||
        !input.media.path.startsWith(`${userId}/`))
    ) {
      throw new RealtimeChatError(
        "Media must use your own storage path from the private messages bucket.",
        { code: "INVALID_ARGUMENT", operation },
      );
    }
    if (input.replyToId) assertUuid(input.replyToId, "replyToId", operation);

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: input.conversationId,
        sender_id: userId,
        body,
        media_url: input.media?.path ?? null,
        media_type: input.media?.type ?? null,
        reply_to_id: input.replyToId ?? null,
      })
      .select(
        "id,conversation_id,sender_id,body,media_url,media_type,reply_to_id,edited_at,deleted_at,created_at",
      )
      .single();
    if (error) throw error;

    const [message] = await signedMediaUrls(
      [data as unknown as ChatMessage],
      3_600,
    );
    return message;
  } catch (error) {
    throw toChatError(error, operation);
  }
}

async function persistReadReceipt(
  conversationId: string,
  userId: string,
  readAt: Date,
): Promise<ReadReceipt> {
  const operation = "mark a conversation as read";
  if (Number.isNaN(readAt.getTime())) {
    throw new RealtimeChatError("readAt must be a valid date.", {
      code: "INVALID_ARGUMENT",
      operation,
    });
  }

  const timestamp = readAt.toISOString();
  const { data, error } = await supabase
    .from("chat_members")
    .update({ last_read_at: timestamp })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .select("last_read_at")
    .single();
  if (error) throw error;

  return {
    conversationId,
    userId,
    readAt: data.last_read_at as string,
  };
}

export async function markConversationRead(
  conversationId: string,
  readAt = new Date(),
): Promise<ReadReceipt> {
  const operation = "mark a conversation as read";
  try {
    const userId = await currentUserId(operation);
    assertUuid(conversationId, "conversationId", operation);
    await requireMembership(conversationId, userId, operation);
    return await persistReadReceipt(conversationId, userId, readAt);
  } catch (error) {
    throw toChatError(error, operation);
  }
}

export async function subscribeToConversation(
  options: SubscribeToConversationOptions,
): Promise<RealtimeChatSubscription> {
  const operation = "subscribe to a conversation";
  let channel: RealtimeChannel | null = null;

  try {
    const userId = await currentUserId(operation);
    assertUuid(options.conversationId, "conversationId", operation);
    await requireMembership(options.conversationId, userId, operation);

    const deviceId = options.deviceId?.trim() || crypto.randomUUID();
    let cleanedUp = false;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;

    channel = supabase.channel(`conversation:${options.conversationId}`, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: userId, enabled: true },
        private: options.privateChannel ?? false,
      },
    });

    const reportError = (error: unknown, failedOperation: string) => {
      safeCallback(options.onError, toChatError(error, failedOperation));
    };

    const sendBroadcast = async (event: string, payload: object) => {
      if (cleanedUp || !channel) {
        throw new RealtimeChatError("The realtime subscription is closed.", {
          code: "SUBSCRIPTION_CLOSED",
          operation: `broadcast ${event}`,
        });
      }
      const result = await channel.send({ type: "broadcast", event, payload });
      if (result !== "ok") {
        throw new RealtimeChatError(`Realtime broadcast ${result}.`, {
          code: "BROADCAST_FAILED",
          operation: `broadcast ${event}`,
        });
      }
    };

    channel
      .on<ChatMessage>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${options.conversationId}`,
        },
        (payload) => {
          void (async () => {
            try {
              const rawMessage =
                payload.eventType === "DELETE"
                  ? null
                  : (payload.new as ChatMessage);
              const message = rawMessage
                ? (await signedMediaUrls([rawMessage], 3_600))[0]
                : null;
              safeCallback(options.onMessageChange, {
                eventType: payload.eventType,
                message,
                old: payload.old as Partial<ChatMessage>,
              });
            } catch (error) {
              reportError(error, "process a realtime message");
            }
          })();
        },
      )
      .on<TypingEvent>("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== userId) safeCallback(options.onTyping, payload);
      })
      .on<ReadReceipt>(
        "broadcast",
        { event: "read-receipt" },
        ({ payload }) => {
          if (payload.userId !== userId) {
            safeCallback(options.onReadReceipt, payload);
          }
        },
      )
      .on("presence", { event: "sync" }, () => {
        if (channel) {
          safeCallback(options.onPresence, presenceParticipants(channel));
        }
      });

    let hasSubscribed = false;
    const subscribed = new Promise<void>((resolve, reject) => {
      channel!.subscribe((status, error) => {
        safeCallback(options.onStatus, status);
        if (status === "SUBSCRIBED") {
          hasSubscribed = true;
          void channel!
            .track({
              userId,
              onlineAt: new Date().toISOString(),
              deviceId,
            })
            .then((result) => {
              if (result !== "ok") {
                reportError(
                  new Error(`Presence tracking ${result}.`),
                  "track presence",
                );
              }
            })
            .catch((trackError) => reportError(trackError, "track presence"));
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const channelError = new RealtimeChatError(
            error?.message || `Realtime subscription ${status.toLowerCase()}.`,
            { code: status, operation, cause: error },
          );
          if (hasSubscribed) reportError(channelError, operation);
          else reject(channelError);
        } else if (status === "CLOSED") {
          const channelError = new RealtimeChatError(
            hasSubscribed
              ? "Realtime subscription closed."
              : "Realtime subscription closed before joining.",
            { code: status, operation },
          );
          if (hasSubscribed && !cleanedUp) reportError(channelError, operation);
          else if (!hasSubscribed) reject(channelError);
        }
      });
    });

    await subscribed;

    const sendTyping = async (isTyping: boolean) => {
      try {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = null;
        await sendBroadcast("typing", {
          userId,
          isTyping,
          sentAt: new Date().toISOString(),
        } satisfies TypingEvent);

        if (isTyping) {
          typingTimer = setTimeout(() => {
            void sendBroadcast("typing", {
              userId,
              isTyping: false,
              sentAt: new Date().toISOString(),
            } satisfies TypingEvent).catch((error) =>
              reportError(error, "clear typing state"),
            );
          }, TYPING_IDLE_MS);
        }
      } catch (error) {
        throw toChatError(error, "broadcast typing state");
      }
    };

    const markRead = async (readAt = new Date()) => {
      try {
        const receipt = await persistReadReceipt(
          options.conversationId,
          userId,
          readAt,
        );
        await sendBroadcast("read-receipt", receipt);
        return receipt;
      } catch (error) {
        throw toChatError(error, "mark a conversation as read");
      }
    };

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = null;

      try {
        await channel!.untrack();
      } catch (error) {
        reportError(error, "untrack presence");
      } finally {
        const result = await supabase.removeChannel(channel!);
        if (result !== "ok") {
          reportError(
            new Error(`Channel cleanup ${result}.`),
            "remove realtime channel",
          );
        }
      }
    };

    return {
      channel,
      sendTyping,
      markRead,
      presenceState: () => presenceParticipants(channel!),
      cleanup,
    };
  } catch (error) {
    if (channel) await supabase.removeChannel(channel);
    throw toChatError(error, operation);
  }
}

export const realtimeChatService = {
  createDirectConversation,
  createGroupConversation,
  loadConversationMembers,
  loadMessages,
  sendMessage,
  markConversationRead,
  subscribeToConversation,
};
