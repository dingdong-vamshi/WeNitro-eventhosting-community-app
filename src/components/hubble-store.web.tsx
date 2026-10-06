import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { hubbleSdkUrl, requestHubbleReadiness, requestHubbleSession, type HubbleReadiness, type HubbleSession } from '../services/hubble';
import { isHubbleTerminalEvent, parseHubbleSdkEvent } from '../services/hubble-events';
import { Button, ErrorLine, Icon, Skeleton, usePalette } from './reconstruction/ui';

const HUBBLE_ORIGIN = 'https://sdk.dev.myhubble.money';

export function HubbleStore() {
  const c = usePalette();
  const [session, setSession] = useState<HubbleSession | null>(null);
  const [readiness, setReadiness] = useState<HubbleReadiness | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const terminalInFlight = useRef(false);
  const balanceBeforeOpen = useRef<number | null>(null);

  const load = useCallback(async (launch = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    if (launch) setNotice(null);
    try {
      const current = await requestHubbleReadiness();
      if (!mounted.current) return;
      setReadiness(current);
      if (launch && !current.phoneVerified) {
        setError('Verify your phone in Profile → Verification before opening Hubble rewards.');
        return;
      }
      if (launch && current.eligible) {
        const tokenSession = await requestHubbleSession();
        if (!mounted.current) return;
        setSession(tokenSession);
        balanceBeforeOpen.current = current.balance;
        setReady(false);
        setOpen(true);
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Hubble rewards are temporarily unavailable.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const reconcileTerminalEvent = useCallback(async (name: string) => {
    if (terminalInFlight.current) return;
    terminalInFlight.current = true;
    const startingBalance = balanceBeforeOpen.current;
    const attempts = name === 'payment_fail' ? 1 : 6;
    let latest: HubbleReadiness | null = null;
    try {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 1_000));
        latest = await requestHubbleReadiness();
        if (!mounted.current) return;
        setReadiness(latest);
        if (name === 'payment_success' && startingBalance != null && latest.balance < startingBalance) break;
        if (name === 'voucher_generation_fail' && startingBalance != null && latest.balance >= startingBalance) break;
      }
      if (!mounted.current || !latest) return;
      if (name === 'payment_success') {
        if (startingBalance != null && latest.balance < startingBalance) {
          setNotice({ tone: 'success', text: 'Reward redeemed successfully. Your Nitro balance has been updated.' });
          balanceBeforeOpen.current = latest.balance;
        } else {
          setNotice({ tone: 'info', text: 'Hubble reported payment completion, but the Nitro debit is still reconciling. Do not retry this redemption yet.' });
        }
      } else if (name === 'voucher_generation_fail') {
        if (startingBalance == null || latest.balance >= startingBalance) {
          setNotice({ tone: 'error', text: 'Gift-card generation failed. Your Nitro Points were not deducted or have been restored.' });
        } else {
          setNotice({ tone: 'error', text: 'Gift-card generation failed after a Nitro debit. Automatic reversal is still pending; do not retry.' });
        }
      } else {
        setNotice({ tone: 'error', text: 'Redemption could not be completed. Your Nitro Points were not deducted.' });
      }
    } catch {
      if (mounted.current) setNotice({ tone: 'info', text: 'Hubble finished the attempt, but the latest Nitro balance could not be loaded. Close rewards and check Nitro History before retrying.' });
    } finally {
      terminalInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== HUBBLE_ORIGIN || !event.data || typeof event.data !== 'object') return;
      const sdkEvent = parseHubbleSdkEvent(event.data);
      if (!sdkEvent) return;
      if (sdkEvent.kind === 'action' && sdkEvent.name === 'app_ready') setReady(true);
      if (sdkEvent.kind === 'action' && sdkEvent.name === 'close') {
        setOpen(false);
        setReady(false);
        void load();
      }
      if (sdkEvent.kind === 'action' && sdkEvent.name === 'error') {
        setOpen(false);
        setReady(false);
        setError('Hubble could not load this staging session. Please retry.');
      }
      if (isHubbleTerminalEvent(sdkEvent)) {
        setNotice({ tone: 'info', text: 'Checking the final Hubble result and Nitro balance…' });
        void reconcileTerminalEvent(sdkEvent.name);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [load, reconcileTerminalEvent]);

  const sdk = useMemo(() => session && open ? hubbleSdkUrl(session) : null, [session, open]);

  useEffect(() => {
    if (!sdk || ready) return;
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      setOpen(false);
      setError('Hubble did not become ready in time. Retry with a fresh session.');
    }, 20_000);
    return () => clearTimeout(timer);
  }, [sdk, ready]);
  if (loading && !readiness) return <Skeleton />;

  if (sdk) return <View style={{ flex: 1, minHeight: 620, backgroundColor: c.bg }}>
    <View style={{ minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Hubble rewards" onPress={() => { setOpen(false); setReady(false); void load(); }} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={25} color={c.text} />
      </Pressable>
      <Text style={{ color: c.text, fontWeight: '800', flex: 1 }}>Hubble Rewards · Staging</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: ready ? '#51B979' : c.muted, fontSize: 12 }}>{ready ? 'Ready' : 'Loading…'}</Text>
    </View>
    {notice ? <View accessibilityRole="alert" style={{ paddingHorizontal: 14, paddingVertical: 9, backgroundColor: notice.tone === 'success' ? '#17392B' : notice.tone === 'error' ? '#46242B' : '#253451' }}><Text style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 17 }}>{notice.text}</Text></View> : null}
    {!ready ? <View style={{ position: 'absolute', zIndex: 2, top: 50, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted }}>Loading Hubble rewards…</Text></View> : null}
    {React.createElement('iframe', {
      title: 'Hubble Rewards',
      src: sdk,
      allow: 'payment; clipboard-write',
      referrerPolicy: 'strict-origin-when-cross-origin',
      style: { width: '100%', flex: 1, minHeight: 570, border: 0, background: '#fff', opacity: ready ? 1 : 0, pointerEvents: ready ? 'auto' : 'none' },
    })}
  </View>;

  const minimum = readiness?.eligibilityPoints ?? 200;
  const balance = readiness?.balance ?? 0;
  const remaining = Math.max(minimum - balance, 0);
  return <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 22, justifyContent: 'center', gap: 16 }}>
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#6D5BED22', alignItems: 'center', justifyContent: 'center' }}><Icon name="gift-outline" size={25} color={c.accent} /></View>
        <View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>Redeem Nitro Points</Text><Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Powered by Hubble · Staging</Text></View>
      </View>
      <View style={{ backgroundColor: c.bg, borderRadius: 14, padding: 16, gap: 5 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>AVAILABLE BALANCE</Text>
        <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{balance} <Text style={{ color: c.accent, fontSize: 16 }}>Nitro</Text></Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>1 Nitro Point = ₹1</Text>
      </View>
      {readiness && !readiness.eligible ? <View style={{ flexDirection: 'row', gap: 10, padding: 13, borderRadius: 12, backgroundColor: '#F5B84B18' }}>
        <Icon name="lock-closed-outline" size={20} color="#E9A62C" />
        <Text style={{ color: c.text, fontSize: 13, lineHeight: 19, flex: 1 }}>You need {minimum} Nitro Points to open rewards. Earn {remaining} more.</Text>
      </View> : <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>Choose a reward in Hubble. WeNitro deducts Nitro Points only after Hubble confirms the staging redemption.</Text>}
      <ErrorLine text={error} />
      <Button
        label={!readiness?.eligible ? 'Check Balance' : readiness.phoneVerified ? 'Open Hubble Rewards' : 'Verify Phone to Continue'}
        busy={loading}
        onPress={() => void load(Boolean(readiness?.eligible))}
      />
    </View>
    <Text style={{ color: c.muted, textAlign: 'center', fontSize: 11, lineHeight: 17 }}>Staging only · no production or real-money redemption is enabled.</Text>
  </ScrollView>;
}
