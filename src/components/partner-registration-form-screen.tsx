import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registrationQuestionService, type RegistrationQuestionDraft } from "../services/registration-questions";
import { createTheme } from "../theme/production-theme";
import { RegistrationQuestionEditor } from "./registration-questions";

type Props = { activityId: string; dark?: boolean; onBack: () => void };

export function PartnerRegistrationFormScreen(props: Props) {
  // Remount the editor when changing activities so another activity's draft never flashes.
  return <ActivityRegistrationFormScreen key={props.activityId} {...props} />;
}

function ActivityRegistrationFormScreen({ activityId, dark = false, onBack }: Props) {
  const theme = createTheme(dark ? "dark" : "light");
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const [questions, setQuestions] = useState<RegistrationQuestionDraft[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError("");
    setQuestions([]);
    void registrationQuestionService.getForm(activityId).then(form => {
      if (!active) return;
      setQuestions(form.questions);
      setLocked(form.locked);
      setLoaded(true);
    }).catch(caught => {
      if (active) setError(message(caught, "The registration form could not load."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activityId, retry]);

  const save = async () => {
    if (savingRef.current || locked || !loaded) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const persisted = await registrationQuestionService.saveQuestions(activityId, questions);
      if (!mounted.current) return;
      setQuestions(persisted);
      setSaved(true);
    } catch (caught) {
      if (mounted.current) setError(message(caught, "The questions could not be saved. Please try again."));
      // A first registration can arrive while editing. Keep the user's draft,
      // but respect the server's new lock immediately after a rejected write.
      try {
        const latest = await registrationQuestionService.getForm(activityId);
        if (mounted.current && latest.locked) {
          setLocked(true);
          setQuestions(latest.questions);
        }
      } catch { /* Keep the original save error visible; retry remains available. */ }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const action = (label: string, onPress: () => void, disabled = false, primary = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: 44, padding: 12, borderRadius: 8, backgroundColor: primary ? c.primary : c.surfaceSubtle, opacity: disabled ? 0.5 : 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={[theme.typography.button, { color: primary ? "#FFFFFF" : c.textPrimary }]}>{label}</Text>
    </Pressable>
  );
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: c.background }}
    keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) + 80, gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {action("Back", onBack, saving)}
      <Text accessibilityRole="header" style={[theme.typography.heading3, { color: c.textPrimary, flex: 1 }]}>Registration Form</Text>
    </View>
    {loading ? <ActivityIndicator accessibilityLabel="Loading registration questions" color={c.primary} /> : null}
    {error ? <Text accessibilityRole="alert" selectable style={[theme.typography.body, { color: c.danger }]}>{error}</Text> : null}
    {!loading && !loaded ? action("Retry", () => setRetry(value => value + 1)) : null}
    {loaded ? <>
      {!questions.length ? <Text style={[theme.typography.body, { color: c.textSecondary }]}>No registration questions have been added to this activity.</Text> : null}
      <RegistrationQuestionEditor value={questions} onChange={next => { setQuestions(next); setSaved(false); setError(""); }} locked={locked} disabled={saving} dark={dark} />
      {saved ? <Text accessibilityRole="alert" style={[theme.typography.body, { color: c.success }]}>Registration questions saved.</Text> : null}
      {!locked ? action(saving ? "Saving…" : "Save questions", () => void save(), saving, true) : null}
    </> : null}
  </ScrollView>;
}

function message(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;
}
