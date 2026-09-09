import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activitiesProductionService } from "../services/activities-production";
import { subscribeToAppForeground } from "../services/app-freshness";
import { formatPartnerMoney, partnerProductionService, type PartnerDashboardData, type PartnerRegistration, type PartnerTransaction } from "../services/partner-production";
import { createTheme } from "../theme/production-theme";

type Tab = "Overview" | "My Activities" | "Registrations" | "Earnings";
export type PartnerDashboardProps = {
  userId: string;
  dark?: boolean;
  onBack: () => void;
  onOpenActivity: (activityId: string) => void;
  onEditRegistrationForm: (activityId: string) => void;
  onCreateActivity?: () => void;
  initialActivityId?: string;
};
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};
const statusLabel = (value: string) => value.replace(/_/g, " ");

export function PartnerDashboard({ userId, dark = false, onBack, onOpenActivity, onEditRegistrationForm, onCreateActivity, initialActivityId }: PartnerDashboardProps) {
  const theme = useMemo(() => createTheme(dark ? "dark" : "light"), [dark]);
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initialActivityId ? "Registrations" : "Overview");
  const [selectedId, setSelectedId] = useState<number | undefined>(initialActivityId ? Number(initialActivityId) : undefined);
  const [dashboard, setDashboard] = useState<PartnerDashboardData | null>(null);
  const [registrations, setRegistrations] = useState<PartnerRegistration[]>([]);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let running = false;
    let queued = false;
    const refresh = async () => {
      if (running) { queued = true; return; }
      running = true;
      do {
        queued = false;
        try {
          const [next, rows, payments] = await Promise.all([partnerProductionService.dashboard(), partnerProductionService.registrations(selectedId), partnerProductionService.transactions(selectedId)]);
          if (active) { setDashboard(next); setRegistrations(rows); setTransactions(payments); setError(""); }
        } catch (caught) {
          if (active) {
            setDashboard(null);
            setRegistrations([]); setTransactions([]);
            setError(caught instanceof Error ? caught.message : "Could not load partner data. Try again.");
          }
        } finally {
          if (active) setLoading(false);
        }
      } while (queued && active);
      running = false;
    };
    setLoading(true);
    setRegistrations([]); setTransactions([]);
    void refresh();
    const unsubscribe = partnerProductionService.subscribe(userId, () => void refresh());
    const foreground = subscribeToAppForeground(refresh);
    return () => { active = false; unsubscribe(); foreground(); };
  }, [userId, selectedId, revision]);

  useEffect(() => { setDashboard(null); setRegistrations([]); setTransactions([]); }, [userId]);

  const selected = dashboard?.activities.find((activity) => activity.event_id === selectedId);
  const reload = () => setRevision((value) => value + 1);
  const button = (label: string, action: () => void, secondary = false, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8, backgroundColor: secondary ? c.surfaceSubtle : c.primary, opacity: disabled ? 0.5 : pressed ? 0.75 : 1, alignItems: "center", justifyContent: "center" })}>
      <Text style={[theme.typography.label, { color: secondary ? c.textPrimary : "#FFFFFF" }]}>{label}</Text>
    </Pressable>
  );
  const cardStyle = { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 } as const;
  const labelStyle = [theme.typography.body, { color: c.textSecondary }];
  const metric = (label: string, value: string | number) => (
    <View key={label} style={{ ...cardStyle, flexGrow: 1, flexBasis: "45%", minWidth: 130 }}>
      <Text style={labelStyle}>{label}</Text>
      <Text selectable style={[theme.typography.heading3, { color: c.textPrimary, fontVariant: ["tabular-nums"] }]}>{value}</Text>
    </View>
  );
  const respond = async (row: PartnerRegistration, status: "approved" | "rejected") => {
    setBusy(row.participant_id);
    setError("");
    try {
      await activitiesProductionService.respondJoin(String(row.event_id), String(row.user_id), status);
      reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update registration."); }
    finally { setBusy(null); }
  };
  const summary = dashboard?.summary;
  const earnings = selected ?? summary;
  const shownActivities = selected ? [selected] : dashboard?.activities ?? [];
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) + 80, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={c.primary} />}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {button("Back", onBack, true)}
        <Text accessibilityRole="header" style={[theme.typography.heading3, { color: c.textPrimary, flex: 1 }]}>Partner Dashboard</Text>
      </View>
      {selectedId !== undefined ? <View style={cardStyle}>
        <Text accessibilityRole="header" style={[theme.typography.title, { color: c.textPrimary }]}>{selected?.title ?? "Activity management"}</Text>
        {button("All activities", () => setSelectedId(undefined), true)}
        {selected ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {button("Activity details", () => onOpenActivity(String(selectedId)), true)}
          {button("Registration Form", () => onEditRegistrationForm(String(selectedId)))}
        </View> : null}
      </View> : null}
      <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["Overview", "My Activities", "Registrations", "Earnings"] as Tab[]).map((name) => (
          <Pressable key={name} accessibilityRole="tab" aria-selected={tab === name} accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)}
            style={{ minHeight: 44, padding: 12, borderRadius: 8, backgroundColor: tab === name ? c.primary : c.surfaceSubtle }}>
            <Text style={[theme.typography.label, { color: tab === name ? "#FFFFFF" : c.textPrimary }]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <View accessibilityRole="alert" style={cardStyle}><Text selectable style={{ color: c.danger }}>{error}</Text>{button("Retry", reload, true)}</View> : null}
      {loading && !dashboard ? <ActivityIndicator accessibilityLabel="Loading partner dashboard" color={c.primary} /> : null}
      {tab === "Overview" && summary ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {selected ? metric("Capacity", selected.capacity ?? "No limit") : null}
          {selected ? metric("Remaining slots", selected.remaining_slots ?? "No limit") : null}
          {selected ? metric("Registrations", selected.registration_count) : metric("Hosted Activities", summary.hosted_activities)}
          {!selected ? metric("Total Registrations", summary.total_registrations) : null}
          {metric("Paid Registrations", selected?.paid_registration_count ?? summary.paid_registrations)}
          {metric("Pending", selected?.pending_count ?? summary.pending_registrations)}
          {metric("Approved", selected?.approved_count ?? summary.approved_registrations)}
          {metric("Rejected", selected?.rejected_count ?? summary.rejected_registrations)}
          {metric("Gross Collection", formatPartnerMoney(earnings?.gross_paisa ?? 0))}
          {metric("Platform Fee", formatPartnerMoney(earnings?.platform_fee_paisa ?? 0))}
          {metric("Net Earnings", formatPartnerMoney(earnings?.net_paisa ?? 0))}
        </View>
        {!selected && onCreateActivity ? button("Host an Activity", onCreateActivity) : null}
      </> : null}
      {tab === "My Activities" && dashboard ? <>
        {!shownActivities.length ? <Text style={labelStyle}>No hosted activities yet. Your activities and registrations will appear here.</Text> : null}
        {shownActivities.map((activity) => <View key={activity.event_id} style={cardStyle}>
          <Text selectable style={[theme.typography.title, { color: c.textPrimary }]}>{activity.title}</Text>
          <Text style={labelStyle}>{dateLabel(activity.starts_at)}</Text>
          <Text style={labelStyle}>{activity.price_inr ? formatPartnerMoney(activity.price_inr * 100) : "Free"} · {statusLabel(activity.visibility)} · {statusLabel(activity.status)}</Text>
          <Text selectable style={labelStyle}>Capacity: {activity.capacity ?? "No limit"} · Remaining slots: {activity.remaining_slots ?? "No limit"}</Text>
          <Text style={labelStyle}>{activity.registration_count} registrations · {activity.paid_registration_count} paid</Text>
          <Text selectable style={labelStyle}>Gross {formatPartnerMoney(activity.gross_paisa)} · Net {formatPartnerMoney(activity.net_paisa)}</Text>
          {button("Manage " + activity.title, () => { setSelectedId(activity.event_id); setTab("Overview"); })}
        </View>)}
        {onCreateActivity ? button("Host an Activity", onCreateActivity) : null}
      </> : null}
      {tab === "Registrations" && dashboard ? <>
        {!registrations.length && !loading ? <Text style={labelStyle}>No registrations yet.</Text> : null}
        {registrations.map((row) => <View key={row.participant_id} style={cardStyle}>
          <Text selectable style={[theme.typography.title, { color: c.textPrimary }]}>{row.display_name || "Participant"}</Text>
          <Text style={labelStyle}>{row.activity_title}</Text>
          <Text selectable style={labelStyle}>{statusLabel(row.status)} · Payment: {statusLabel(row.payment_status)}</Text>
          <Text selectable style={labelStyle}>Amount paid: {formatPartnerMoney(row.amount_paid_paisa)}</Text>
          <Text style={labelStyle}>Registered {dateLabel(row.registered_at)}</Text>
          {row.answers.length ? row.answers.map((answer) => <View key={answer.question_id} style={{ gap: 4 }}>
            <Text style={[theme.typography.label, { color: c.textSecondary }]}>{answer.label}</Text>
            <Text selectable style={[theme.typography.body, { color: c.textPrimary }]}>{typeof answer.value === "boolean" ? answer.value ? "Agreed" : "Not selected" : Array.isArray(answer.value) ? answer.value.join(", ") || "No response" : answer.value || "No response"}</Text>
          </View>) : <Text style={labelStyle}>No submitted registration responses.</Text>}
          {row.status === "pending" ? <View style={{ flexDirection: "row", gap: 8 }}>
            {button(busy === row.participant_id ? "Updating…" : "Approve", () => void respond(row, "approved"), false, busy !== null)}
            {button("Reject", () => void respond(row, "rejected"), true, busy !== null)}
          </View> : null}
        </View>)}
      </> : null}
      {tab === "Earnings" && earnings && summary ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {metric("Gross Collection", formatPartnerMoney(earnings.gross_paisa))}
          {metric(`Platform Fee (${summary.platform_fee_bps / 100}%)`, formatPartnerMoney(earnings.platform_fee_paisa))}
          {metric("Net Earnings", formatPartnerMoney(earnings.net_paisa))}
        </View>
        <Text style={labelStyle}>Net after WeNitro platform fee. Earnings shown here have not been paid out.</Text>
        <Text accessibilityRole="header" style={[theme.typography.title, { color: c.textPrimary }]}>By activity</Text>
        {!shownActivities.length ? <Text style={labelStyle}>No activity earnings yet.</Text> : null}
        {shownActivities.map((activity) => <View key={activity.event_id} style={cardStyle}>
          <Text selectable style={[theme.typography.title, { color: c.textPrimary }]}>{activity.title}</Text>
          <Text selectable style={labelStyle}>Gross {formatPartnerMoney(activity.gross_paisa)}</Text>
          <Text selectable style={labelStyle}>Platform fee {formatPartnerMoney(activity.platform_fee_paisa)}</Text>
          <Text selectable style={[theme.typography.bodyMedium, { color: c.textPrimary }]}>Net {formatPartnerMoney(activity.net_paisa)}</Text>
          <Text style={labelStyle}>{activity.paid_registration_count} paid registrations</Text>
        </View>)}
        <Text accessibilityRole="header" style={[theme.typography.title, { color: c.textPrimary }]}>Successful transactions</Text>
        {!transactions.length && !loading ? <Text style={labelStyle}>No successful transactions yet.</Text> : null}
        {transactions.map((payment) => <View key={payment.payment_id} style={cardStyle}>
          <Text selectable style={[theme.typography.title, { color: c.textPrimary }]}>{payment.activity_title}</Text>
          <Text selectable style={labelStyle}>{payment.display_name || "Participant"} · {dateLabel(payment.paid_at)}</Text>
          <Text selectable style={labelStyle}>Payment reference: {payment.payment_id}</Text>
          <Text selectable style={labelStyle}>Amount collected {formatPartnerMoney(payment.amount_paisa)}</Text>
          <Text selectable style={labelStyle}>Platform fee ({payment.platform_fee_bps / 100}%) {formatPartnerMoney(payment.platform_fee_paisa)}</Text>
          <Text selectable style={[theme.typography.bodyMedium, { color: c.textPrimary }]}>Net earnings {formatPartnerMoney(payment.partner_net_paisa)}</Text>
        </View>)}
      </> : null}
    </ScrollView>
  );
}
