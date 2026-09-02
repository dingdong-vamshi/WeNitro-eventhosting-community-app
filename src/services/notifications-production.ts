import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type ProductionNotification = {
  id: number;
  user_id: number;
  sender_id: number | null;
  type: string;
  reference_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  /** Existing UI compatibility aliases. */
  notification_type: string;
  read_at: string | null;
};
export type NotificationPage = {
  items: ProductionNotification[];
  nextCursor: number | null;
};
export const notificationBridgeRpc = {
  currentUserId: "get_current_app_user_id",
  list: "list_user_notifications",
  markRead: "mark_notification_read",
  markAllRead: "mark_all_notifications_read",
} as const;

type Row = Record<string, unknown>;
const record = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const first = (value: unknown) =>
  record(Array.isArray(value) ? value[0] : value);
function id(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Invalid ${field}.`);
  return parsed;
}
function json(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return json(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}
function mapNotification(value: unknown): ProductionNotification {
  const row = record(value);
  const type = String(row.type ?? row.notification_type ?? "system");
  const createdAt = String(row.created_at);
  const isRead = Boolean(row.is_read ?? row.read_at);
  return {
    id: id(row.id, "notification id"),
    user_id: id(row.user_id, "notification user id"),
    sender_id: row.sender_id == null ? null : id(row.sender_id, "sender id"),
    type,
    reference_id: String(row.reference_id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    data: json(row.data),
    is_read: isRead,
    created_at: createdAt,
    notification_type: type,
    read_at: isRead ? String(row.read_at ?? createdAt) : null,
  };
}
async function currentUserId() {
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) throw new Error("Authentication is required.");
  const { data, error } = await supabase.rpc(
    notificationBridgeRpc.currentUserId,
  );
  if (error) throw error;
  const row = first(data);
  return id(row.user_id ?? row.id ?? data, "current user id");
}

export const notificationService = {
  async listPage(
    limit = 50,
    beforeId?: number | null,
  ): Promise<NotificationPage> {
    await currentUserId();
    const pageSize = Math.min(Math.max(Math.trunc(limit), 1), 100);
    if (beforeId != null) id(beforeId, "notification cursor");
    const { data, error } = await supabase.rpc(notificationBridgeRpc.list, {
      p_limit: pageSize + 1,
      p_before_id: beforeId ?? null,
    });
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []).map(mapNotification);
    const items = rows.slice(0, pageSize);
    return {
      items,
      nextCursor: rows.length > pageSize ? items.at(-1)?.id ?? null : null,
    };
  },

  async list(limit = 50): Promise<ProductionNotification[]> {
    return (await this.listPage(limit)).items;
  },

  async markRead(notificationId: number): Promise<void> {
    id(notificationId, "notification id");
    await currentUserId();
    const { error } = await supabase.rpc(notificationBridgeRpc.markRead, {
      p_notification_id: notificationId,
    });
    if (error) throw error;
  },

  async markAllRead(): Promise<void> {
    await currentUserId();
    const { error } = await supabase.rpc(notificationBridgeRpc.markAllRead);
    if (error) throw error;
  },

  async subscribe(
    requestedUserId: number | undefined,
    onInsert: (item: ProductionNotification) => void,
    onError?: (error: Error) => void,
  ): Promise<RealtimeChannel> {
    const userId = await currentUserId();
    if (requestedUserId != null && requestedUserId !== userId)
      throw new Error("Cannot subscribe to another user's notifications.");
    return supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tbl_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          try {
            onInsert(mapNotification(payload.new));
          } catch (error) {
            onError?.(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        },
      )
      .subscribe((status, error) => {
        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          error
        )
          onError?.(error);
      });
  },
};
