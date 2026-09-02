import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type ProductionNotification = {
  id: string;
  notification_type:
    | "message"
    | "vibe_comment"
    | "activity_join"
    | "community_join"
    | "verification"
    | "system";
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

export const notificationService = {
  async list(limit = 50): Promise<ProductionNotification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,notification_type,title,body,data,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ProductionNotification[];
  },

  async markRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async markAllRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw error;
  },

  subscribe(userId: string, onInsert: (item: ProductionNotification) => void) {
    return supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => onInsert(payload.new as ProductionNotification),
      )
      .subscribe() as RealtimeChannel;
  },
};
