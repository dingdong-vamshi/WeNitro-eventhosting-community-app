import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { activityService } from '../services/wenitro';
import { UserAvatar } from './user-avatar';
import { Button, ErrorLine, Sheet, usePalette } from './reconstruction/ui';

type Liker = Awaited<ReturnType<typeof activityService.listLikers>>[number];
export function ActivityLikersSheet({ activityId, onClose, onOpenProfile }: { activityId: string; onClose: () => void; onOpenProfile: (id: string) => void }) {
 const c = usePalette();
 const [likers, setLikers] = useState<Liker[]>([]);
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [hasMore, setHasMore] = useState(false);
 const request = useRef(0), offset = useRef(0);
 const load = async (reset = false) => {
  const version = ++request.current;
  if (reset) { offset.current = 0; setLikers([]); setHasMore(false); }
  setLoading(true); setError('');
  try {
   const rows = await activityService.listLikers(activityId, offset.current);
   if (version !== request.current) return;
   offset.current += 50;
   setLikers(current => [...new Map([...current, ...rows].map(row => [row.userId, row])).values()]);
   setHasMore(rows.length === 50);
  } catch (caught) {
   if (version === request.current) setError(caught instanceof Error ? caught.message : 'Likes could not load. Please try again.');
  } finally { if (version === request.current) setLoading(false); }
 };
 useEffect(() => { void load(true); return () => { request.current++; }; }, [activityId]);
 return <Sheet title="Activity likes" close={onClose}>
  <ErrorLine text={error} />
  {loading ? <ActivityIndicator accessibilityLabel="Loading Activity likes" color={c.accent} /> : null}
  {!loading && !error && !likers.length ? <Text style={{ color: c.muted }}>No likes yet. Be the first to like this Activity.</Text> : null}
  <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
   {likers.map(liker => <Pressable key={liker.userId} accessibilityRole="button" accessibilityLabel={`Open ${liker.name}'s profile`} onPress={() => onOpenProfile(liker.userId)} style={{ minHeight: 64, flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: c.card }}>
    <UserAvatar uri={liker.avatarUrl} name={liker.name} identity={liker.userId} size={44} />
    <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700' }}>{liker.name}</Text><Text style={{ color: c.muted, fontSize: 12 }}>View profile</Text></View>
   </Pressable>)}
  </ScrollView>
  {error ? <Button label="Retry likes" disabled={loading} onPress={() => void load()} /> : hasMore ? <Button label="Load more likes" disabled={loading} onPress={() => void load()} /> : null}
 </Sheet>;
}
