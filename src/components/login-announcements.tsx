import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, ErrorLine, Sheet, usePalette } from './reconstruction/ui';

type Announcement = { id: number; title: string; body: string };

/** One bounded read per authenticated mount; never part of blocking app bootstrap. */
export function LoginAnnouncements({ userId }: { userId: string }) {
  const c = usePalette();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    const controller = new AbortController();
    setRows([]); setError(''); setBusy(false);
    void Promise.resolve(supabase.rpc('my_login_announcements').abortSignal(controller.signal)).then(({ data, error }) => {
      if (generation.current !== token || controller.signal.aborted) return;
      if (error) setError('Could not load WeNitro announcements.');
      else setRows(Array.isArray(data) ? data as Announcement[] : []);
    }).catch(() => { if (!controller.signal.aborted) setError('Could not load WeNitro announcements.'); });
    return () => { generation.current++; controller.abort(); };
  }, [userId, retry]);
  const current = rows[0];
  const acknowledge = async () => {
    if (!current || busy) return;
    const token = generation.current;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('acknowledge_login_announcement', { p_id: current.id });
      if (result.error) throw result.error;
      if (generation.current === token) setRows(previous => previous.filter(item => item.id !== current.id));
    } catch { if (generation.current === token) setError('Could not save your acknowledgement. Please retry.'); }
    finally { if (generation.current === token) setBusy(false); }
  };
  if (!current) return error ? <View style={{ padding: 12, backgroundColor: c.card }}><ErrorLine text={error} /><Button label="Retry announcements" onPress={() => setRetry(n => n + 1)} /></View> : null;
  return <Sheet title={current.title} centered close={() => { if (!busy) setRows(previous => previous.slice(1)); }}>
    <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{current.body}</Text>
    <ErrorLine text={error} /><Button label="Got it" busy={busy} onPress={() => void acknowledge()} />
  </Sheet>;
}
