import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { referenceDeltaService, type ParticipantRating } from '../services/reference-delta';
import { UserAvatar } from './user-avatar';
import { Button, ErrorLine, Field, Header, Icon, Page, Sheet, Skeleton, usePalette } from './reconstruction/ui';

type Member = { userId: string; name: string; avatarUrl?: string | null; status: string };
export function ActivityRatings({ eventId, viewerId, host, participants, back }: {
  eventId: string; viewerId: string; host: { userId: string; name: string; avatarUrl?: string };
  participants: Member[]; back: () => void;
}) {
  const c = usePalette();
  const [ratings, setRatings] = useState<ParticipantRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [scores, setScores] = useState([0, 0, 0]);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    referenceDeltaService.listParticipantRatings(Number(eventId)).then(rows => {
      if (active) setRatings(rows);
    }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId]);
  const members = [...new Map([host, ...participants.filter(p => ['approved', 'going', 'paid', 'no_show'].includes(p.status))]
    .map(p => [p.userId, p])).values()].filter(p => p.userId !== viewerId);
  const save = async (noShow: boolean) => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      const result = noShow
        ? await referenceDeltaService.markParticipantNoShow(Number(eventId), Number(selected))
        : await referenceDeltaService.rateParticipant({ eventId: Number(eventId), userId: Number(selected),
            behaviour: scores[0], friendly: scores[1], communication: scores[2], comment, isAnonymous: anonymous });
      setRatings(rows => [...rows.filter(r => r.rated_user_id !== Number(selected)), result]);
      setReceipt(result.points_awarded === 2 ? '+2 Nitro Points added to your history.' : 'Rating updated. The reward for this participant was already awarded.');
      setSelected(null);
    } catch (e: any) { setError(e.message || 'Rating could not be saved.'); }
    finally { setBusy(false); }
  };
  return <Page><Header title="Rate Participants" back={back} />{loading ? <Skeleton /> : <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
    <Text style={{ color: c.muted, lineHeight: 20 }}>Rate the people you joined. Each first submission earns +2 Nitro Points. Editing does not award points again.</Text>
    <ErrorLine text={error} />
    {members.map(member => {
      const prior = ratings.find(r => r.rated_user_id === Number(member.userId));
      return <View key={member.userId} style={{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><UserAvatar uri={member.avatarUrl} name={member.name} size={44} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700' }}>{member.name}</Text>{member.userId === host.userId && <Text style={{ color: c.accent, fontSize: 11 }}>HOST · ORIGINAL CREATOR</Text>}</View></View>
        {prior && <Text style={{ color: c.muted }}>{prior.is_no_show ? 'Marked as No Show' : `Your rating: ${prior.overall_rating}/5`}</Text>}
        <Button label={prior ? `Edit rating for ${member.name}` : `Rate ${member.name}`} onPress={() => {
          setSelected(member.userId); setScores(prior && !prior.is_no_show ? [prior.behaviour_rating, prior.friendly_rating, prior.communication_rating] : [0, 0, 0]); setComment(prior?.comment || ''); setAnonymous(Boolean(prior?.is_anonymous)); setError('');
        }} />
      </View>;
    })}
    {!members.length && <Text style={{ color: c.muted }}>No other participants to rate.</Text>}
  </ScrollView>}
  {selected && <Sheet title="Your rating" close={() => { if (!busy) setSelected(null); }}>
    {['Behaviour', 'Friendliness', 'Communication'].map((label, index) => <View key={label} style={{ gap: 8 }}><Text style={{ color: c.text, fontWeight: '700' }}>{label}</Text><View style={{ flexDirection: 'row', gap: 8 }}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${label} ${value} stars`} accessibilityState={{ checked: scores[index] === value }} disabled={busy} onPress={() => setScores(values => values.map((v, i) => i === index ? value : v))} style={{ padding: 8 }}><Icon name={scores[index] >= value ? 'star' : 'star-outline'} color={c.accent} size={26} /></Pressable>)}</View></View>)}
    <Field accessibilityLabel="Rating feedback" value={comment} onChangeText={setComment} placeholder="Feedback (optional)" maxLength={1000} multiline />
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Rate as Anonymous" accessibilityState={{ checked: anonymous }} disabled={busy} onPress={() => setAnonymous(value => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: anonymous ? c.accent : c.border, backgroundColor: anonymous ? c.accent : c.card, alignItems: 'center', justifyContent: 'center' }}>{anonymous && <Icon name="checkmark" color="#FFFFFF" size={16} />}</View>
      <View style={{ flex: 1, gap: 3 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>Rate as Anonymous</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>Your rating and comment stay visible. Your identity stays private.</Text></View>
    </Pressable>
    <ErrorLine text={error} />
    <Button label="Submit Rating" busy={busy} disabled={scores.some(s => s < 1)} onPress={() => void save(false)} />
    {selected !== host.userId && <Button label="Mark as No Show" variant="outline" busy={busy} onPress={() => void save(true)} />}
  </Sheet>}
  {receipt && <Sheet title="Rating saved" centered close={() => setReceipt(null)}><Text style={{ color: c.text, fontSize: 17, lineHeight: 25 }}>{receipt}</Text><Button label="Continue" onPress={() => setReceipt(null)} /></Sheet>}
  </Page>;
}
