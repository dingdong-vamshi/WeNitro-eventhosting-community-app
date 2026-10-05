import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { aadhaarVerificationService, type AadhaarVerificationState } from '../services/aadhaar-verification';
import { captureShareScope } from '../services/internal-share';
import { Button, ErrorLine, Field, usePalette } from './reconstruction/ui';

export function AadhaarVerificationCard({ verified, onVerified }: { verified: boolean; onVerified: () => Promise<void> }) {
  const c = usePalette(), alive = useRef(true), locked = useRef(false);
  const [state, setState] = useState<AadhaarVerificationState | null>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState(''), [otp, setOtp] = useState('');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const available = state?.available === true, complete = verified || state?.verified === true;
  const otpSent = state?.status === 'otp_sent' || state?.status === 'verifying';

  const run = async (action: 'availability' | 'sendOtp' | 'verifyOtp') => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); const current = captureShareScope();
    try {
      const next = action === 'sendOtp'
        ? await aadhaarVerificationService.sendOtp(aadhaarNumber, consent)
        : action === 'verifyOtp'
          ? await aadhaarVerificationService.verifyOtp(otp)
          : await aadhaarVerificationService.availability();
      if (!alive.current || !current()) return;
      setState(next);
      if (action === 'sendOtp') setAadhaarNumber('');
      if (action === 'verifyOtp') setOtp('');
      if (next.verified) await onVerified();
    } catch (cause) {
      if (alive.current && current()) {
        setError(cause instanceof Error ? cause.message : 'Verification could not continue.');
        if (action === 'verifyOtp') setOtp('');
      }
    } finally {
      locked.current = false; if (alive.current && current()) setBusy(false);
    }
  };
  useEffect(() => { alive.current = true; void run('availability'); return () => { alive.current = false; }; }, []);

  return <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 17, borderWidth: 1, borderColor: c.border, gap: 11 }}>
    <View style={{ flexDirection: 'row' }}><Text style={{ color: c.text, fontWeight: '700', fontSize: 15, flex: 1 }}>Aadhaar Verification</Text><Text style={{ color: complete ? '#198457' : c.muted, fontSize: 12, fontWeight: '700' }}>+20 Trust</Text></View>
    <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{complete
      ? `Aadhaar verified${state?.maskedAadhaar ? ` · ${state.maskedAadhaar}` : ''}. Your Trust Score includes +20.`
      : state === null ? 'Checking Aadhaar verification availability…'
        : available ? 'Verify with a one-time password sent to the mobile number registered with your Aadhaar.'
          : 'Aadhaar verification is not enabled yet. Sandbox account configuration is required.'}</Text>
    {state?.testMode ? <Text style={{ color: c.muted, fontSize: 12 }}>Test mode does not verify identity or add Trust Score.</Text> : null}
    {available && !complete ? <>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>Reason: {state?.reason || 'WeNitro identity verification and Trust Score eligibility'}.</Text>
      {!otpSent ? <>
        <Field accessibilityLabel="12-digit Aadhaar number" value={aadhaarNumber} onChangeText={value => setAadhaarNumber(value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit Aadhaar number" keyboardType="number-pad" maxLength={12} editable={!busy} />
        <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>WeNitro never stores your full Aadhaar number, OTP, demographics, document, or photo.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Consent to Aadhaar OTP verification" accessibilityState={{ checked: consent }} onPress={() => setConsent(value => !value)} disabled={busy} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.text }}>{consent ? '☑' : '☐'} I explicitly consent to Sandbox using my Aadhaar for this verification reason.</Text></Pressable>
        <Button label="Send Aadhaar OTP" busy={busy} disabled={!consent || aadhaarNumber.length !== 12 || busy} onPress={() => void run('sendOtp')} />
      </> : <>
        <Text style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>OTP sent to your Aadhaar-linked mobile{state?.maskedAadhaar ? ` for ${state.maskedAadhaar}` : ''}. Your WeNitro login phone number does not control delivery.</Text>
        <Field accessibilityLabel="6-digit Aadhaar OTP" value={otp} onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit OTP" keyboardType="number-pad" maxLength={6} editable={!busy} />
        <Button label="Verify Aadhaar OTP" busy={busy} disabled={otp.length !== 6 || busy} onPress={() => void run('verifyOtp')} />
        <Button label="Request a new OTP" disabled={busy} onPress={() => { setState(current => current ? { ...current, status: 'not_started', message: undefined } : current); setConsent(false); setOtp(''); setError(''); }} />
      </>}
    </> : null}
    {state?.message ? <Text style={{ color: c.muted, fontSize: 12 }}>{state.message}</Text> : null}
    <ErrorLine text={error} />
    {error && !otpSent ? <Button label="Retry availability" busy={busy} onPress={() => void run('availability')} /> : null}
  </View>;
}
