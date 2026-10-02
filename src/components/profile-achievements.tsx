import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, ErrorLine, Icon, Sheet, usePalette } from './reconstruction/ui';

type Achievement = {
 id: number; slug: string; name: string; description: string; icon: string;
 category: string; threshold: number; progress: number | null; earned_at: string | null;
};

/** Eligibility and awards are server-owned. No client counter can grant an achievement. */
export function ProfileAchievements({ userId }: { userId: string }) {
 const c = usePalette();
 const [badges, setBadges] = useState<Achievement[]>([]);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(true);
 const [retry, setRetry] = useState(0);
 const [expanded, setExpanded] = useState(false);
 const [selected, setSelected] = useState<Achievement | null>(null);
 useEffect(() => {
  let active = true;
  setLoading(true); setError(''); setBadges([]); setSelected(null);
  void Promise.resolve(supabase.rpc('profile_achievements', { p_user_id: Number(userId) })).then(({ data, error: failure }) => {
   if (!active) return;
   if (failure || !Array.isArray(data)) { setError('Achievements could not be loaded. Please retry.'); return; }
   setBadges(data as Achievement[]);
  }).catch(() => { if (active) setError('Achievements could not be loaded. Please retry.'); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [userId, retry]);
 const earned = badges.filter(b => b.earned_at);
 const visible = expanded ? badges : [...earned, ...badges.filter(b => !b.earned_at)].slice(0, 4);
 return <View testID="profile-achievements" style={{ borderRadius: 20, padding: 16, gap: 14, backgroundColor: c.isDark ? '#211C3C' : '#F2EEFF', borderColor: c.border, borderWidth: 1 }}>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="ribbon-outline" color={c.accent} size={22} /><Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '800' }}>Achievements</Text><Text accessibilityLabel={loading ? 'Loading achievements' : `${earned.length} of ${badges.length} badges earned`} style={{ color: c.muted, fontSize: 12 }}>{loading ? 'Loading…' : error ? '' : `${earned.length}/${badges.length} earned`}</Text></View>
  <ErrorLine text={error} />
  {error ? <Button label="Retry achievements" onPress={() => setRetry(value => value + 1)} /> : null}
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{visible.map(badge => <Pressable key={badge.id} accessibilityRole="button" accessibilityLabel={`${badge.name}, ${badge.earned_at ? 'earned' : 'locked'}. View criteria`} onPress={() => setSelected(badge)} style={{ width: '47%', flexGrow: 1, borderWidth: 1, borderColor: badge.earned_at ? '#BA8731' : c.border, backgroundColor: c.card, borderRadius: 14, padding: 12, gap: 6, alignItems: 'center' }}>
   <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: badge.earned_at ? '#FFF0C9' : c.inset, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28, opacity: badge.earned_at ? 1 : .5 }}>{badge.icon}</Text>{!badge.earned_at && <View style={{ position: 'absolute', bottom: -1, right: -1, backgroundColor: c.card, borderRadius: 10, padding: 3 }}><Icon name="lock-closed" color={c.muted} size={12} /></View>}</View>
   <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{badge.name}</Text>
   <Text style={{ color: badge.earned_at ? c.accent : c.muted, fontSize: 12 }}>{badge.earned_at ? 'Earned' : badge.progress == null ? 'Locked' : `${badge.progress}/${badge.threshold}`}</Text>
  </Pressable>)}</View>
  {badges.length>4 && <Button label={expanded ? 'Show fewer badges' : 'View all 22 badges'} variant="outline" onPress={() => setExpanded(value => !value)} />}
  {selected && <Sheet title={selected.name} close={() => setSelected(null)}><ScrollView contentContainerStyle={{ gap: 14, alignItems: 'center' }}><Text style={{ fontSize: 56 }}>{selected.icon}</Text><Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{selected.category} · {selected.earned_at ? 'Earned' : 'Locked'}</Text><Text style={{ color: c.text, fontSize: 15, textAlign: 'center' }}>{selected.description}</Text>{selected.earned_at ? <Text style={{ color: c.muted }}>Earned {new Date(selected.earned_at).toLocaleDateString()}</Text> : selected.progress != null ? <Text style={{ color: c.muted }}>{selected.progress} of {selected.threshold} completed</Text> : null}<Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>Only qualifying activity counts. Cancelled, removed, duplicate or invalid activity does not unlock badges.</Text></ScrollView></Sheet>}
 </View>;
}
