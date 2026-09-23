import { supabase } from "../lib/supabase";

export type PartnerTotals = {
  hosted_activities: number;
  total_registrations: number;
  pending_registrations: number;
  approved_registrations: number;
  rejected_registrations: number;
  gross_paisa: number;
  platform_fee_paisa: number;
  gst_paisa: number;
  refund_paisa: number;
  expected_net_paisa: number;
  platform_fee_bps: number;
};
export type PartnerActivity = {
  id: number;
  title: string;
  event_start_time: string;
  event_end_time: string | null;
  price: number;
  status: string;
  visibility_type: string;
  capacity: number | null;
  registration_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  gross_paisa: number;
  platform_fee_paisa: number;
  gst_paisa: number;
  refund_paisa: number;
  expected_net_paisa: number;
  settlement_status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "ON_HOLD" | null;
  eligible_at: string | null;
  due_at: string | null;
  settlement_paid_at: string | null;
  payout_reference: string | null;
};
export type PartnerDashboardData = { summary: PartnerTotals; activities: PartnerActivity[] };
export type PartnerRegistration = {
  participant_id: number;
  user_id: number;
  event_id: number;
  activity_title: string;
  display_name: string;
  status: string;
  payment_status: string;
  amount_paid_paisa: number;
  registered_at: string;
  answers: Array<{ question_id: number; label: string; value: string | string[] | boolean }>;
};

export type PartnerTransaction = {
  payment_id: string;
  event_id: number;
  activity_title: string;
  display_name: string;
  paid_at: string;
  amount_paisa: number;
  platform_fee_bps: number;
  platform_fee_paisa: number;
  gst_bps: number;
  gst_paisa: number;
  gst_basis: string;
  partner_net_paisa: number;
  financial_status: string;
  settlement_status: string | null;
  settlement_due_at: string | null;
  payout_reference: string | null;
};

export const formatPartnerMoney = (paisa: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paisa / 100);

export const partnerProductionService = {
  async dashboard(): Promise<PartnerDashboardData> {
    const { data, error } = await supabase.rpc("get_partner_dashboard");
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object" || !data.summary || !Array.isArray(data.activities)) {
      throw new Error("Partner dashboard returned an invalid response.");
    }
    return data as PartnerDashboardData;
  },
  async registrations(eventId?: number): Promise<PartnerRegistration[]> {
    const { data, error } = await supabase.rpc("get_partner_registrations", { p_event_id: eventId ?? null });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("Registrations returned an invalid response.");
    return data as PartnerRegistration[];
  },
  async transactions(eventId?: number): Promise<PartnerTransaction[]> {
    const { data, error } = await supabase.rpc("get_partner_transactions", { p_event_id: eventId ?? null });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("Transactions returned an invalid response.");
    return data as PartnerTransaction[];
  },
  subscribe(userId: string, onRefresh: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onRefresh, 250);
    };
    const channel = supabase.channel(`partner-dashboard:${userId}:${Math.random().toString(36).slice(2)}`);
    // RLS controls delivered rows. Provider finalization also changes participation,
    // which refreshes host earnings without exposing private provider payment rows.
    for (const table of ["tbl_events", "tbl_event_participants", "tbl_activity_registration_answers", "tbl_activity_payments"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, changed);
    }
    channel.subscribe((status) => { if (status === "SUBSCRIBED") changed(); });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  },
};
