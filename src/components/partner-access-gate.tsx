import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { partnerAccountService, type PartnerAccountResult } from '../services/partner-account';
import { withRequestDeadline } from '../services/request-deadline';
import { createTheme } from '../theme/production-theme';

/** A direct Partner URL must check the server, not depend on visiting Profile first. */
export function PartnerAccessGate({ userId, dark = false, onBack, onResolved, children }: {
  userId: string; dark?: boolean; onBack: () => void;
  onResolved: (result: PartnerAccountResult) => void; children: React.ReactNode;
}) {
  const c = createTheme(dark ? 'dark' : 'light').colors;
  const [state, setState] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const resolved = useRef(onResolved); resolved.current = onResolved;
  useEffect(() => {
    let active = true; const controller = new AbortController();
    setState('loading'); setError('');
    void withRequestDeadline(() => partnerAccountService.get(), 30_000, 'Partner access took too long to load. Please retry.', controller.signal).then(result => {
      if (!active) return;
      if (result.profile && String(result.profile.user_id) !== userId) throw new Error('Your account changed. Reopen the Partner Dashboard.');
      resolved.current(result);
      setState(result.can_host_paid ? 'allowed' : 'denied');
    }).catch(caught => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : 'Partner access could not be checked.'); setState('error');
    });
    return () => { active = false; controller.abort(); };
  }, [userId, retry]);
  if (state === 'allowed') return <>{children}</>;
  return <View style={{ flex: 1, backgroundColor: c.background, padding: 24, gap: 16, justifyContent: 'center' }}>
    {state === 'loading' ? <><ActivityIndicator color={c.primary} /><Text style={{ color: c.textPrimary }}>Checking Partner access…</Text></> : <Text accessibilityRole={state === 'error' ? 'alert' : undefined} style={{ color: c.textPrimary }}>{state === 'error' ? error : 'An approved Partner account is required.'}</Text>}
    {state === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Partner access" onPress={() => setRetry(value => value + 1)}><Text style={{ color: c.primary, padding: 12 }}>Retry</Text></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Back from Partner access" onPress={onBack}><Text style={{ color: c.primary, padding: 12 }}>Back</Text></Pressable>
  </View>;
}
