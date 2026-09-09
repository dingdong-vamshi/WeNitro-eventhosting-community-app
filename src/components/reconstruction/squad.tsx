import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { referenceDeltaService } from '../../services/reference-delta';
import { Button, ErrorLine, Header, Icon, Page, Sheet, Skeleton, ui, usePalette } from './ui';

type SquadMember = {
  id: number;
  username: string;
  fullname: string | null;
  profile_image: string | null;
  isverified: number | null;
};

export function ReferenceSquad({ ownerId, back, openProfile }: { ownerId: string; back: () => void; openProfile: (id: string) => void }) {
  const c = usePalette();
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState(false);
  const [removing, setRemoving] = useState<SquadMember | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const id = Number(ownerId);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('This Squad is unavailable.');
        const identity = await supabase.rpc('get_current_legacy_user_id');
        if (identity.error) throw identity.error;
        const isOwn = Number(identity.data) === id;
        if (active) setOwn(isOwn);
        if (!isOwn) { if (active) setMembers([]); return; }
        const profiles = await referenceDeltaService.listSquad();
        if (active) setMembers(profiles as SquadMember[]);
      } catch (caught: any) {
        if (active) setError(caught.message || 'Could not load this Squad.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ownerId]);

  return <Page>
    <Header title={own ? "Your Squad" : "Squad"} back={back} />
    <ErrorLine text={error} />
    {loading ? <Skeleton count={4} /> : <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
      {members.map(member => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${member.fullname || member.username}'s profile`} key={member.id} onPress={() => openProfile(String(member.id))} style={[ui.row, { paddingHorizontal: 0, minHeight: 82, borderBottomWidth: 1, borderColor: c.border }]}>
        {member.profile_image ? <Image source={{ uri: member.profile_image }} style={[ui.avatar, { width: 52, height: 52, borderRadius: 26 }]} /> : <Icon name="person-circle-outline" color={c.muted} size={52} />}
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{member.fullname || member.username}</Text>{member.isverified === 1 && <Icon name="checkmark-circle" color="#7868EA" size={17} />}</View>
          <Text style={{ color: c.muted, fontSize: 12 }}>@{member.username}</Text>
        </View>
        {own ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.fullname || member.username} from Your Squad`} onPress={event => { event.stopPropagation(); setRemoving(member); }} style={{ borderWidth: 1, borderColor: '#D55464', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ color: '#D55464', fontSize: 10, fontWeight: '700' }}>Remove</Text></Pressable> : <Icon name="chevron-forward" color={c.muted} size={18} />}
      </Pressable>)}
      {!members.length && !error ? <View style={{ alignItems: 'center', paddingTop: 90, gap: 12 }}><Icon name="people-outline" color={c.muted} size={48} /><Text style={{ color: c.text, fontWeight: '700' }}>{own ? 'No Squad members yet' : 'Squad is private'}</Text><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{own ? 'Your connections will appear here.' : 'Only this member can view their full Squad.'}</Text></View> : null}
    </ScrollView>}
    {removing && <Sheet title="Remove from Your Squad?" centered close={() => { if (!busy) setRemoving(null); }}><Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>Remove {removing.fullname || removing.username} from your Squad?</Text><Button label="Cancel" disabled={busy} onPress={() => setRemoving(null)} /><Button label="Remove" danger busy={busy} onPress={() => { setBusy(true); setError(''); void referenceDeltaService.removeSquadMember(removing.id).then(() => { setMembers(current => current.filter(member => member.id !== removing.id)); setRemoving(null); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }} /></Sheet>}
  </Page>;
}
