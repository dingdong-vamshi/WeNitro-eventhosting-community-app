import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { hubbleSdkUrl, requestHubbleSession, type HubbleSession } from '../services/hubble';
import { Button, ErrorLine, Icon, Skeleton, usePalette } from './reconstruction/ui';

const HUBBLE_ORIGIN = 'https://sdk.dev.myhubble.money';

export function HubbleStore() {
  const c = usePalette();
  const [session, setSession] = useState<HubbleSession | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(async (launch = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const current = await requestHubbleSession();
      if (!mounted.current) return;
      setSession(current);
      if (launch && current.eligible) {
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

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== HUBBLE_ORIGIN || !event.data || typeof event.data !== 'object') return;
      const data = event.data as Record<string, unknown>;
      const name = String(data.type ?? data.event ?? '');
      if (name === 'app_ready') setReady(true);
      if (name === 'close') {
        setOpen(false);
        setReady(false);
        void load();
      }
      if (name === 'error') setError('Hubble reported a staging SDK error. Please retry.');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [load]);

  const sdk = useMemo(() => session && open ? hubbleSdkUrl(session) : null, [session, open]);
  if (loading && !session) return <Skeleton />;

  if (sdk) return <View style={{ flex: 1, minHeight: 620, backgroundColor: c.bg }}>
    <View style={{ minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Hubble rewards" onPress={() => { setOpen(false); setReady(false); void load(); }} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={25} color={c.text} />
      </Pressable>
      <Text style={{ color: c.text, fontWeight: '800', flex: 1 }}>Hubble Rewards · Staging</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: ready ? '#51B979' : c.muted, fontSize: 12 }}>{ready ? 'Ready' : 'Loading…'}</Text>
    </View>
    {React.createElement('iframe', {
      title: 'Hubble Rewards',
      src: sdk,
      allow: 'payment; clipboard-write',
      referrerPolicy: 'strict-origin-when-cross-origin',
      onLoad: () => setReady(true),
      style: { width: '100%', flex: 1, minHeight: 570, border: 0, background: '#fff' },
    })}
  </View>;

  const minimum = session?.eligibilityPoints ?? 200;
  const balance = session?.balance ?? 0;
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
        <Text style={{ color: c.muted, fontSize: 12 }}>1 Nitro Point = ₹{session?.nitroToInr ?? 1}</Text>
      </View>
      {session && !session.eligible ? <View style={{ flexDirection: 'row', gap: 10, padding: 13, borderRadius: 12, backgroundColor: '#F5B84B18' }}>
        <Icon name="lock-closed-outline" size={20} color="#E9A62C" />
        <Text style={{ color: c.text, fontSize: 13, lineHeight: 19, flex: 1 }}>You need {minimum} Nitro Points to open rewards. Earn {remaining} more.</Text>
      </View> : <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>Choose a reward in Hubble. WeNitro deducts Nitro Points only after Hubble confirms the staging redemption.</Text>}
      <ErrorLine text={error} />
      <Button label={session?.eligible ? 'Open Hubble Rewards' : 'Check Balance'} busy={loading} onPress={() => void load(Boolean(session?.eligible))} />
    </View>
    <Text style={{ color: c.muted, textAlign: 'center', fontSize: 11, lineHeight: 17 }}>Staging only · no production or real-money redemption is enabled.</Text>
  </ScrollView>;
}
