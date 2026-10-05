import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  aadhaarVerificationService,
  type AadhaarVerificationState,
} from '../services/aadhaar-verification';
import {
  launchDigiLockerSession,
  type DigiLockerClientEvent,
} from '../services/digilocker-sdk';
import { captureShareScope } from '../services/internal-share';
import { Button, ErrorLine, usePalette } from './reconstruction/ui';

export function AadhaarVerificationCard({
  verified,
  onVerified,
}: {
  verified: boolean;
  onVerified: () => Promise<void>;
}) {
  const c = usePalette();
  const alive = useRef(true);
  const locked = useRef(false);
  const [state, setState] = useState<AadhaarVerificationState | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const available = state?.available === true;
  const complete = verified || state?.verified === true;

  const refresh = async () => {
    const next = await aadhaarVerificationService.refresh();
    if (!alive.current) return;
    setState(next);
    setNotice(next.message ?? 'DigiLocker verification status checked.');
    if (next.verified) await onVerified();
  };

  const handleSdkEvent = (event: DigiLockerClientEvent) => {
    if (!alive.current) return;
    if (event === 'completed') {
      setNotice('DigiLocker completed. Confirming the result securely with Sandbox…');
      void run('refresh');
    } else {
      setNotice('DigiLocker was closed. No verification was granted.');
    }
  };

  const launch = async (next: AadhaarVerificationState) => {
    if (!next.sessionId || !next.publicApiKey) {
      throw new Error('DigiLocker launch details are unavailable. Start a new session.');
    }
    await launchDigiLockerSession(next.sessionId, next.publicApiKey, handleSdkEvent);
    if (alive.current) setNotice('DigiLocker opened. Complete or close the secure flow there.');
  };

  const run = async (action: 'availability' | 'begin' | 'refresh') => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    if (action !== 'availability') setNotice('');
    const current = captureShareScope();
    try {
      if (action === 'refresh') {
        await refresh();
        return;
      }
      const next = action === 'begin'
        ? await aadhaarVerificationService.begin(consent)
        : await aadhaarVerificationService.availability();
      if (!alive.current || !current()) return;
      setState(next);
      if (action === 'begin') await launch(next);
      if (next.verified) await onVerified();
    } catch (cause) {
      if (alive.current && current()) {
        setError(cause instanceof Error ? cause.message : 'Verification could not continue.');
      }
    } finally {
      locked.current = false;
      if (alive.current && current()) setBusy(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    void run('availability');
    return () => { alive.current = false; };
  }, []);

  const activeSession = Boolean(state?.sessionId && state?.publicApiKey) &&
    !['failed', 'expired'].includes(state?.status ?? '');

  return <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 17, borderWidth: 1, borderColor: c.border, gap: 11 }}>
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, flex: 1 }}>Aadhaar Verification</Text>
      <Text style={{ color: complete ? '#198457' : c.muted, fontSize: 12, fontWeight: '700' }}>+20 Trust</Text>
    </View>
    <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{complete
      ? 'Aadhaar verified. Your Trust Score includes +20.'
      : state === null
        ? 'Checking DigiLocker verification availability…'
        : available
          ? 'Verify through Sandbox DigiLocker. Enter Aadhaar details and OTP only inside DigiLocker’s secure interface.'
          : state.message ?? 'DigiLocker verification is not enabled yet.'}</Text>
    {state?.testMode ? <Text style={{ color: c.muted, fontSize: 12 }}>Test mode cannot verify a real identity or add Trust Score.</Text> : null}
    {available && !complete ? <>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>WeNitro stores only the provider session and final verification result. It does not store your Aadhaar number, OTP, document, photo, or demographics.</Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Consent to Aadhaar verification through DigiLocker"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent(value => !value)}
        disabled={busy}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ color: c.text }}>{consent ? '☑' : '☐'} I consent to share my Aadhaar verification result with WeNitro through Sandbox DigiLocker.</Text>
      </Pressable>
      <Button label="Continue to DigiLocker" busy={busy} disabled={!consent || busy} onPress={() => void run('begin')} />
      {activeSession ? <Button label="Reopen DigiLocker" disabled={busy} onPress={() => void launch(state!).catch(cause => setError(cause instanceof Error ? cause.message : 'DigiLocker could not open.'))} /> : null}
      {state?.status && state.status !== 'not_started' ? <Button label="Check verification status" busy={busy} disabled={busy} onPress={() => void run('refresh')} /> : null}
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>A browser completion event only asks our backend to check Sandbox. Only a successful provider status with consented Aadhaar proof can grant +20 Trust.</Text>
    </> : null}
    {notice ? <Text accessibilityRole="alert" style={{ color: c.muted, fontSize: 12 }}>{notice}</Text> : null}
    {state?.message && state.available ? <Text style={{ color: c.muted, fontSize: 12 }}>{state.message}</Text> : null}
    <ErrorLine text={error} />
    {error ? <Button label="Retry verification availability" busy={busy} onPress={() => void run('availability')} /> : null}
  </View>;
}
