import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { darkColors, lightColors, typography } from "../theme/production-theme";
import { questionTypes, registrationLimits, validateRegistrationAnswers, type RegistrationAnswer, type RegistrationAnswerValue, type RegistrationQuestion, type RegistrationQuestionDraft, type RegistrationQuestionType } from "../domain/registration-questions";

const typeLabels: Record<RegistrationQuestionType, string> = {
  short_text: "Short Text", long_text: "Long Text", single_choice: "Single Choice / Dropdown", multiple_choice: "Multiple Choice", checkbox: "Checkbox / Agreement",
};
type ActionProps = { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; dark?: boolean; role?: "button" | "checkbox" | "radio" };
function Action({ label, onPress, disabled, selected, dark, role = "button" }: ActionProps) {
  const colors = dark ? darkColors : lightColors;
  return <Pressable aria-checked={role === "checkbox" || role === "radio" ? !!selected : undefined} aria-selected={role === "button" ? !!selected : undefined} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, ...(role === "checkbox" || role === "radio" ? { checked: !!selected } : { selected: !!selected }) }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, opacity: disabled ? 0.5 : 1 }}>
    <Text style={[typography.label, { color: selected ? colors.primary : colors.textPrimary }]}>{label}</Text>
  </Pressable>;
}

export function RegistrationQuestionEditor({ value, onChange, locked = false, disabled = false, dark = false }: {
  value: RegistrationQuestionDraft[]; onChange: (questions: RegistrationQuestionDraft[]) => void; locked?: boolean; disabled?: boolean; dark?: boolean;
}) {
  const colors = dark ? darkColors : lightColors;
  const readOnly = locked || disabled;
  const update = (index: number, patch: Partial<RegistrationQuestionDraft>) => onChange(value.map((question, i) => i === index ? { ...question, ...patch } : question));
  const move = (index: number, direction: number) => {
    const next = [...value];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next.map((question, display_order) => ({ ...question, display_order })));
  };
  const inputStyle = { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 8, padding: 12 };
  return <View style={{ gap: 12 }}>
    <Text style={[typography.title, { color: colors.textPrimary }]}>Registration Questions</Text>
    <Text style={[typography.caption, { color: colors.textSecondary }]}>{locked ? "This activity has registrations. Questions are locked to preserve submitted information." : "Optional questions for participants. Responses are shared privately with you."}</Text>
    {value.map((question, index) => <View key={question.id ?? `new-${index}`} style={{ gap: 10, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
      <Text style={[typography.label, { color: colors.textPrimary }]}>Question {index + 1}</Text>
      <TextInput accessibilityLabel={`Question ${index + 1} label`} placeholder="What would you like to ask?" placeholderTextColor={colors.textTertiary} value={question.label} onChangeText={label => update(index, { label })} editable={!readOnly} maxLength={registrationLimits.label} style={inputStyle} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{questionTypes.map(type => <Action key={type} label={typeLabels[type]} selected={question.type === type} disabled={readOnly} dark={dark} onPress={() => update(index, { type, options: type === "single_choice" || type === "multiple_choice" ? question.options.length ? question.options : ["", ""] : [] })} />)}</View>
      {(question.type === "single_choice" || question.type === "multiple_choice") && <>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Options — one per line</Text>
        <TextInput accessibilityLabel={`Question ${index + 1} options`} multiline editable={!readOnly} value={question.options.join("\n")} onChangeText={text => update(index, { options: text.split("\n") })} style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]} />
      </>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Action label="Required" role="checkbox" selected={question.required} disabled={readOnly} dark={dark} onPress={() => update(index, { required: !question.required })} />
        <Action label={`Move question ${index + 1} up`} disabled={readOnly || index === 0} dark={dark} onPress={() => move(index, -1)} />
        <Action label={`Move question ${index + 1} down`} disabled={readOnly || index === value.length - 1} dark={dark} onPress={() => move(index, 1)} />
        <Action label={`Remove question ${index + 1}`} disabled={readOnly} dark={dark} onPress={() => onChange(value.filter((_, i) => i !== index).map((item, display_order) => ({ ...item, display_order })))} />
      </View>
    </View>)}
    {!locked && <Action label="Add Question" dark={dark} disabled={disabled || value.length >= registrationLimits.questions} onPress={() => onChange([...value, { label: "", type: "short_text", required: false, display_order: value.length, options: [] }])} />}
  </View>;
}

export function RegistrationAnswerForm({ questions, initialAnswers = [], onSubmit, submitLabel = "Submit registration", busy = false, onCancel, dark = false }: {
  questions: RegistrationQuestion[]; initialAnswers?: RegistrationAnswer[]; onSubmit: (answers: RegistrationAnswer[]) => Promise<unknown>; submitLabel?: string; busy?: boolean; onCancel?: () => void; dark?: boolean;
}) {
  const colors = dark ? darkColors : lightColors;
  const [answers, setAnswers] = useState<RegistrationAnswer[]>(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedChoice, setExpandedChoice] = useState<number | null>(null);
  const blocked = busy || submitting;
  const setValue = (question_id: number, value: RegistrationAnswerValue) => {
    setError(null);
    setAnswers(current => [...current.filter(answer => answer.question_id !== question_id), { question_id, value }]);
  };
  const submit = async () => {
    if (blocked) return;
    const validation = validateRegistrationAnswers(questions, answers);
    if (validation) { setError(validation); return; }
    setSubmitting(true); setError(null);
    try { await onSubmit(answers); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Registration could not be saved. Please try again."); }
    finally { setSubmitting(false); }
  };
  return <View style={{ gap: 16, paddingVertical: 12 }}>
    <Text style={[typography.title, { color: colors.textPrimary }]}>Registration Questions</Text>
    <Text style={[typography.caption, { color: colors.textSecondary }]}>Your responses are shared privately with the activity host.</Text>
    {[...questions].sort((a, b) => a.display_order - b.display_order).map(question => {
      const value = answers.find(answer => answer.question_id === question.id)?.value;
      return <View key={question.id} style={{ gap: 8 }}>
        <Text selectable style={[typography.label, { color: colors.textPrimary }]}>{question.label}{question.required ? " *" : " (optional)"}</Text>
        {(question.type === "short_text" || question.type === "long_text") && <TextInput accessibilityLabel={question.label} editable={!blocked} multiline={question.type === "long_text"} maxLength={question.type === "long_text" ? registrationLimits.longText : registrationLimits.shortText} value={typeof value === "string" ? value : ""} onChangeText={text => setValue(question.id, text)} style={{ minHeight: question.type === "long_text" ? 110 : 48, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, backgroundColor: colors.surface }} />}
        {question.type === "single_choice" && <Pressable accessibilityRole="button" accessibilityLabel={`${question.label}: ${typeof value === "string" && value ? value : "Choose an option"}`} aria-expanded={expandedChoice === question.id} accessibilityState={{ expanded: expandedChoice === question.id, disabled: blocked }} disabled={blocked} onPress={() => setExpandedChoice(current => current === question.id ? null : question.id)} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface }}>
          <Text style={[typography.body, { color: colors.textPrimary }]}>{typeof value === "string" && value ? value : "Choose an option"} {expandedChoice === question.id ? "▴" : "▾"}</Text>
        </Pressable>}
        {(question.type === "multiple_choice" || (question.type === "single_choice" && expandedChoice === question.id)) && question.options.map(option => {
          const selected = question.type === "single_choice" ? value === option : Array.isArray(value) && value.includes(option);
          return <Action key={option} label={option} role={question.type === "single_choice" ? "radio" : "checkbox"} selected={selected} dark={dark} disabled={blocked} onPress={() => {
            setValue(question.id, question.type === "single_choice" ? option : selected ? (Array.isArray(value) ? value : []).filter(item => item !== option) : [...(Array.isArray(value) ? value : []), option]);
            if (question.type === "single_choice") setExpandedChoice(null);
          }} />;
        })}
        {question.type === "checkbox" && <Action label="I agree" role="checkbox" selected={value === true} disabled={blocked} dark={dark} onPress={() => setValue(question.id, value !== true)} />}
      </View>;
    })}
    {error && <Text selectable accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {blocked && <ActivityIndicator color={colors.primary} />}
    <Action label={submitLabel} onPress={() => void submit()} disabled={blocked} selected dark={dark} />
    {onCancel && <Action label="Cancel" onPress={onCancel} disabled={blocked} dark={dark} />}
  </View>;
}
