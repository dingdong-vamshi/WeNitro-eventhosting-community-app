import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { partnerAccountService, validatePartnerAccount, type PartnerAccountInput, type PartnerAccountResult } from "../services/partner-account";
import { createTheme } from "../theme/production-theme";

const ACTIVITY_TYPES = ["Fitness", "Sports", "Social", "Learning", "Outdoors", "Wellness", "Entertainment", "Networking"];
const emptyApplication: PartnerAccountInput = {
  business_name: "", description: "", city: "", activity_types: [], activity_location: "", age_category: "",
  bank_name: "", account_holder_name: "", account_number: "", ifsc: "", upi_id: "",
};

const humanStatus = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());

export function PartnerAccountScreen({ dark = false, onBack, onSaved }: {
  dark?: boolean;
  onBack: () => void;
  onSaved: (result: PartnerAccountResult) => void | Promise<void>;
}) {
  const theme = createTheme(dark ? "dark" : "light");
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const [result, setResult] = useState<PartnerAccountResult | null>(null);
  const [input, setInput] = useState<PartnerAccountInput>(emptyApplication);
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "upi">("bank");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setResult(null);
    void partnerAccountService.get().then(value => {
      if (!active) return;
      setResult(value);
      setPayoutMethod(value.payout_account?.upi_id_masked ? "upi" : "bank");
      setInput(current => ({
        ...current,
        business_name: value.profile?.business_name ?? "",
        description: value.profile?.description ?? "",
        city: value.profile?.city ?? "",
        activity_types: value.profile?.activity_types ?? [],
        activity_location: value.profile?.activity_location ?? "",
        age_category: value.profile?.age_category ?? "",
        bank_name: value.payout_account?.bank_name ?? "",
        account_holder_name: value.payout_account?.account_holder_name ?? "",
      }));
    }).catch(caught => { if (active) setError(message(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const status = result?.profile?.status;
  const restricted = status === "SUSPENDED";
  const canEdit = Boolean(result?.eligible) && !restricted;
  const update = <K extends keyof PartnerAccountInput>(key: K, value: PartnerAccountInput[K]) => {
    setInput(current => ({ ...current, [key]: value })); setSaved(false); setError("");
  };
  const submit = async () => {
    if (savingRef.current || !canEdit) return;
    const payload = payoutMethod === "bank" ? { ...input, upi_id: "" } : { ...input, bank_name: "", account_holder_name: "", account_number: "", ifsc: "" };
    const validation = validatePartnerAccount(payload);
    if (validation) { setError(validation); return; }
    savingRef.current = true; setSaving(true); setError(""); setSaved(false);
    try {
      const next = await partnerAccountService.submit(payload);
      if (!mounted.current) return;
      setResult(next); setSaved(true);
      setInput(current => ({ ...current, account_number: "", ifsc: "", upi_id: "" }));
      await onSaved(next);
    } catch (caught) { if (mounted.current) setError(message(caught)); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const action = (label: string, onPress: () => void, disabled = false, primary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, padding: 12, borderRadius: 8, backgroundColor: primary ? c.primary : c.surfaceSubtle, opacity: disabled ? 0.5 : 1, alignItems: "center", justifyContent: "center" }}>
    <Text style={[theme.typography.button, { color: primary ? "#FFFFFF" : c.textPrimary }]}>{label}</Text>
  </Pressable>;
  const field = (label: string, key: Exclude<keyof PartnerAccountInput, "activity_types">, maxLength: number, multiline = false, options?: { autoCapitalize?: "none" | "characters" | "words" }) => <View style={{ gap: 8 }}>
    <Text style={[theme.typography.label, { color: c.textPrimary }]}>{label}</Text>
    <TextInput accessibilityLabel={label} value={String(input[key])} onChangeText={text => update(key, text)} editable={canEdit && !saving} maxLength={maxLength} multiline={multiline} autoCapitalize={options?.autoCapitalize} style={{ minHeight: multiline ? 110 : 48, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8, textAlignVertical: "top", color: c.textPrimary, backgroundColor: c.surface }} />
  </View>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) + 80, gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>{action("Back", onBack, saving)}<Text accessibilityRole="header" style={[theme.typography.heading3, { color: c.textPrimary, flex: 1 }]}>Partner Application</Text></View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading partner account" color={c.primary} /> : null}
    {error ? <Text selectable accessibilityRole="alert" style={[theme.typography.body, { color: c.danger }]}>{error}</Text> : null}
    {!loading && !result ? action("Retry", () => setRetry(value => value + 1)) : null}
    {result ? <>
      <Text style={[theme.typography.body, { color: c.textSecondary }]}>Apply to host paid activities. WeNitro reviews every application and payout destination before enabling Partner access.</Text>
      {status ? <View style={{ padding: 14, gap: 5, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface }}>
        <Text selectable style={[theme.typography.label, { color: c.textPrimary }]}>Application: {humanStatus(status)}</Text>
        {result.can_host_paid ? <Text style={[theme.typography.body, { color: c.success }]}>Approved to host paid activities.</Text> : null}
        {result.profile?.decision_reason ? <Text selectable style={[theme.typography.body, { color: c.textSecondary }]}>{result.profile.decision_reason}</Text> : null}
      </View> : null}
      {!result.eligible ? <Text style={[theme.typography.body, { color: c.textSecondary }]}>Verify your email or phone before submitting a Partner application.</Text> : null}
      {restricted ? <Text style={[theme.typography.body, { color: c.textSecondary }]}>This Partner account is suspended. Contact WeNitro support for review.</Text> : null}
      {field("Business name *", "business_name", 120)}
      {field("Business description (optional)", "description", 1000, true)}
      {field("City *", "city", 120, false, { autoCapitalize: "words" })}
      {field("Usual activity location *", "activity_location", 240)}
      {field("Age category *", "age_category", 80)}
      <View style={{ gap: 8 }}><Text style={[theme.typography.label, { color: c.textPrimary }]}>Activity types *</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{ACTIVITY_TYPES.map(item => {
        const selected = input.activity_types.includes(item);
        return <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !canEdit || saving }} disabled={!canEdit || saving} onPress={() => update("activity_types", selected ? input.activity_types.filter(value => value !== item) : [...input.activity_types, item])} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 22, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : c.surface }}><Text style={[theme.typography.label, { color: selected ? "#FFFFFF" : c.textPrimary }]}>{item}</Text></Pressable>;
      })}</View></View>
      <View style={{ padding: 16, gap: 12, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface }}>
        <Text style={[theme.typography.title, { color: c.textPrimary }]}>Settlement destination</Text>
        <Text style={[theme.typography.caption, { color: c.textTertiary }]}>Details are sent securely for review. The app can only read masked values afterward. Re-enter the full destination whenever you resubmit.</Text>
        {result.payout_account ? <Text selectable style={[theme.typography.body, { color: c.textSecondary }]}>Saved: {result.payout_account.upi_id_masked || result.payout_account.account_number_masked} · {humanStatus(result.payout_account.review_status)}</Text> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>{(["bank", "upi"] as const).map(method => <Pressable key={method} accessibilityRole="radio" accessibilityState={{ checked: payoutMethod === method }} disabled={!canEdit || saving} onPress={() => setPayoutMethod(method)} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: payoutMethod === method ? c.primary : c.surfaceSubtle }}><Text style={[theme.typography.label, { color: payoutMethod === method ? "#FFFFFF" : c.textPrimary }]}>{method === "bank" ? "Bank account" : "UPI"}</Text></Pressable>)}</View>
        {payoutMethod === "bank" ? <>{field("Bank name *", "bank_name", 120)}{field("Account holder name *", "account_holder_name", 160)}{field("Account number *", "account_number", 34, false, { autoCapitalize: "none" })}{field("IFSC code *", "ifsc", 11, false, { autoCapitalize: "characters" })}</> : field("UPI ID *", "upi_id", 160, false, { autoCapitalize: "none" })}
      </View>
      {saved ? <Text accessibilityRole="alert" style={[theme.typography.body, { color: c.success }]}>Application submitted for review.</Text> : null}
      {canEdit ? action(saving ? "Submitting…" : status === "APPROVED" ? "Submit updated details" : status === "REJECTED" ? "Resubmit application" : "Submit application", () => void submit(), saving, true) : null}
    </> : null}
  </ScrollView>;
}

function message(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Partner application could not be saved or loaded. Please try again.";
}
