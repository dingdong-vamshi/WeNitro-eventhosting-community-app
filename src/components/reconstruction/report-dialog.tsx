import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  COMMUNITY_REPORT_REASONS,
  USER_REPORT_REASONS,
  submitSafetyReport,
  type SafetyReportTarget,
} from '../../services/safety-reports';
import { Button, ErrorLine, Icon, Sheet, usePalette } from './ui';

export function SafetyReportDialog({
  targetType,
  targetId,
  targetName,
  close,
}: {
  targetType: SafetyReportTarget;
  targetId: string;
  targetName: string;
  close: () => void;
}) {
  const c = usePalette();
  const reasons = targetType === 'user' ? USER_REPORT_REASONS : COMMUNITY_REPORT_REASONS;
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <Sheet title="Report submitted" centered close={close}>
    <View accessibilityLabel="Report submitted confirmation" style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <Icon name="checkmark-circle" size={44} color={c.success} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>Your report has been submitted.</Text>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>Our team will review it. {targetName} will not be told who submitted the report.</Text>
    </View>
    <Button label="Done" onPress={close} />
  </Sheet>;

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setError('');
    try {
      await submitSafetyReport({ targetType, targetId, reason, description });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be submitted.');
    } finally { setBusy(false); }
  };

  return <Sheet title={targetType === 'user' ? 'Report User' : 'Report Community'} close={() => { if (!busy) close(); }}>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>Why are you reporting {targetName}?</Text>
    {reasons.map(item => <Pressable
      key={item.value}
      accessibilityRole="radio"
      accessibilityState={{ checked: reason === item.value }}
      accessibilityLabel={item.label}
      disabled={busy}
      onPress={() => setReason(item.value)}
      style={{ minHeight: 48, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: reason === item.value ? c.accent : c.border, backgroundColor: reason === item.value ? c.inset : c.card, flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: reason === item.value ? c.accent : c.iconMuted, alignItems: 'center', justifyContent: 'center' }}>{reason === item.value ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}</View>
      <Text style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}>{item.label}</Text>
    </Pressable>)}
    <View style={{ gap: 7 }}>
      <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>Details (optional)</Text>
      <TextInput accessibilityLabel="Report description" value={description} onChangeText={setDescription} editable={!busy} maxLength={1000} multiline placeholder="Add context for the moderation team" placeholderTextColor={c.muted} style={{ minHeight: 100, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.input, color: c.text, padding: 12, textAlignVertical: 'top' }} />
      <Text style={{ color: c.muted, fontSize: 10, textAlign: 'right' }}>{description.length}/1000</Text>
    </View>
    <ErrorLine text={error} />
    <Button label="Submit Report" busy={busy} disabled={!reason} onPress={() => void submit()} />
    <Button label="Cancel" variant="outline" disabled={busy} onPress={close} />
  </Sheet>;
}

