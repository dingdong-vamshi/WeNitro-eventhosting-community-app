import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { partnerAccountService, validatePartnerAccount, type PartnerAccountResult } from "../services/partner-account";
import { createTheme } from "../theme/production-theme";

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
  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
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
      setBusinessName(value.profile?.business_name ?? "");
      setDescription(value.profile?.description ?? "");
      setCity(value.profile?.city ?? "");
    }).catch(caught => { if (active) setError(message(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const restricted = result?.profile?.status === "suspended" || result?.profile?.status === "rejected";
  const canEdit = Boolean(result?.eligible) && !restricted;
  const save = async () => {
    if (savingRef.current || !canEdit) return;
    const input = { business_name: businessName, description, city };
    const validation = validatePartnerAccount(input);
    if (validation) { setError(validation); return; }
    savingRef.current = true; setSaving(true); setError(""); setSaved(false);
    try {
      const next = await partnerAccountService.save(input);
      if (!mounted.current) return;
      setResult(next); setSaved(true);
      await onSaved(next);
    } catch (caught) { if (mounted.current) setError(message(caught)); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const action = (label: string, onPress: () => void, disabled = false, primary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, padding: 12, borderRadius: 8, backgroundColor: primary ? c.primary : c.surfaceSubtle, opacity: disabled ? 0.5 : 1, alignItems: "center", justifyContent: "center" }}>
    <Text style={[theme.typography.button, { color: primary ? "#FFFFFF" : c.textPrimary }]}>{label}</Text>
  </Pressable>;
  const field = (label: string, value: string, setValue: (value: string) => void, maxLength: number, multiline = false) => <View style={{ gap: 8 }}>
    <Text style={[theme.typography.label, { color: c.textPrimary }]}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={text => { setValue(text); setSaved(false); setError(""); }} editable={canEdit && !saving} maxLength={maxLength} multiline={multiline} style={{ minHeight: multiline ? 110 : 48, padding: 12, borderWidth: 1, borderColor: c.border, borderRadius: 8, textAlignVertical: "top", color: c.textPrimary, backgroundColor: c.surface }} />
  </View>;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) + 80, gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>{action("Back", onBack, saving)}<Text accessibilityRole="header" style={[theme.typography.heading3, { color: c.textPrimary, flex: 1 }]}>Partner Account</Text></View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading partner account" color={c.primary} /> : null}
    {error ? <Text selectable accessibilityRole="alert" style={[theme.typography.body, { color: c.danger }]}>{error}</Text> : null}
    {!loading && !result ? action("Retry", () => setRetry(value => value + 1)) : null}
    {result ? <>
      <Text style={[theme.typography.body, { color: c.textSecondary }]}>{result.profile?.status === "active" ? "Keep your business details up to date." : "Add your business details to complete your Partner account."}</Text>
      {result.profile ? <Text selectable style={[theme.typography.label, { color: c.textPrimary }]}>Account status: {result.profile.status}</Text> : null}
      {!result.eligible ? <Text style={[theme.typography.body, { color: c.textSecondary }]}>Verify your email or phone to become a Partner and manage business details.</Text> : null}
      {restricted ? <Text style={[theme.typography.body, { color: c.textSecondary }]}>This account is {result.profile?.status}. Contact WeNitro support for help.</Text> : null}
      {field("Business name *", businessName, setBusinessName, 120)}
      {field("Business description (optional)", description, setDescription, 1000, true)}
      {field("City (optional)", city, setCity, 120)}
      {saved ? <Text accessibilityRole="alert" style={[theme.typography.body, { color: c.success }]}>Partner account saved.</Text> : null}
      {canEdit ? action(saving ? "Saving…" : result.profile?.status === "active" ? "Save business details" : "Complete Partner account", () => void save(), saving, true) : null}
      <View style={{ padding: 16, gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
        <Text style={[theme.typography.label, { color: c.textSecondary }]}>Bank / Settlement Details</Text>
        <Text style={[theme.typography.caption, { color: c.textTertiary }]}>Coming in a future phase.</Text>
      </View>
    </> : null}
  </ScrollView>;
}

function message(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Partner account could not be saved or loaded. Please try again.";
}
