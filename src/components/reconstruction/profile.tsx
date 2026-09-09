import { derivedTrustScore } from '../../domain/profile-signals';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import type { AppData, Activity, Screen } from '../../../App';
import { supabase } from '../../lib/supabase';
import { activitiesProductionService } from '../../services/activities-production';
import { listReels, type VibeReel } from '../../services/vibes-production';
import { realtimeChatService } from '../../services/realtime-chat';
import { Action, Button, ErrorLine, Field, Header, Icon, Page, Pills, Sheet, Skeleton, ui, usePalette, purple } from './ui';
import { loadActivityParticipantCounts } from '../../services/wenitro';
import { productionActivity, prepareReferenceActivities } from './feed-search';
type Metrics = { verified: boolean; nitro: number; karma: number; trust_score: number | null; rating: number; activities: number; squad: number; phone_verified: boolean; aadhaar_verified: boolean; social_linked: boolean };
export function ReferenceProfile({ data, setData, go, openActivity, openDraft, openVibe, openSquad }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void; openDraft: () => void; openVibe: (id: string) => void; openSquad: () => void }) {
 const c = usePalette(); const request = useRef(0); const [gender, setGender] = useState<string | null>(null); const [metrics, setMetrics] = useState<Metrics | null>(null), [tab, setTab] = useState('My Vibes'), [error, setError] = useState(''), [loading, setLoading] = useState(true), [vibes, setVibes] = useState<VibeReel[]>([]), [activities, setActivities] = useState<Activity[]>([]), [cursor, setCursor] = useState<string | null>(null), [contact, setContact] = useState<{ email?: string; phone?: string } | null>(null), [social, setSocial] = useState(false);
 useEffect(() => { let active = true; void supabase.rpc('my_profile_metrics').then(({ data, error }) => { if (active) { if (error) setError(error.message); else setMetrics(data); } }); return () => { active = false; }; }, [data.userId, social]);
 useEffect(() => { let active = true; void supabase.from('tbl_users').select('gender').eq('id', Number(data.userId)).single().then(({ data, error }) => { if (active && !error) setGender(data?.gender || null); }); return () => { active = false; }; }, [data.userId]);
 const load = async (more = false) => { const token = ++request.current; setLoading(true); setError(''); try {
  if (tab === 'My Vibes') { const page = await listReels({ ownOnly: true, cursor: more ? cursor : null, pageSize: 20 }); if (token !== request.current) return; setVibes(current => more ? [...current, ...page.reels] : page.reels); setCursor(page.nextCursor); }
  else { const page = tab === 'Drafts' ? await activitiesProductionService.listHosted({ statuses: ['draft'], pageSize: 50, page: more ? Number(cursor || 1) : 1 }) : await activitiesProductionService.listVibeEligible(more ? cursor || undefined : undefined); const items = await prepareReferenceActivities(page.items); if (token !== request.current) return; setActivities(current => more ? [...current, ...items] : items); setData(current => current.userId !== data.userId ? current : ({ ...current, activities: [...current.activities.filter(a => !items.some(i => i.id === a.id)), ...items] })); setCursor('nextCursor' in page ? page.nextCursor : page.hasMore ? String(page.page + 1) : null); }
 } catch (e: any) { if (token === request.current) setError(e.message); } finally { if (token === request.current) setLoading(false); } };
 useEffect(() => { setActivities([]); setVibes([]); setCursor(null); void load(); return () => { request.current++; }; }, [tab, data.userId]);
 const rows = activities.filter(a => tab === 'Drafts' ? a.status === 'draft' : tab === 'Completed' ? a.status === 'completed' || Boolean(a.endsAt && new Date(a.endsAt).getTime() < Date.now()) : a.status !== 'completed' && (!a.endsAt || new Date(a.endsAt).getTime() >= Date.now()));
 const derivedTrust = metrics ? derivedTrustScore(metrics) : 0;
 const values = [['ACTIVITIES', metrics?.activities, 'calendar-outline', '#B785E7'], ['SQUAD', metrics?.squad, 'people-outline', '#7D76DA'], ['NITRO', metrics?.nitro, 'flash-outline', '#A76BDD'], ['KARMA', metrics?.karma.toFixed(1), 'star', '#E89256']] as const;
 return <Page><Header title={data.username.replace(/^@/, '')}><Action name="bag-handle-outline" label="Nitro Store" onPress={() => go('shop')} /><Action name="menu" label="Settings" onPress={() => go('settings')} /></Header><ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 22 }}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginVertical: 12 }}>{data.avatarUri ? <Image source={{ uri: data.avatarUri }} style={{ width: 60, height: 60, borderRadius: 30 }} /> : <View style={{ width: 60, height: 60, backgroundColor: '#DF604B', borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFF', fontSize: 20 }}>{data.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</Text></View>}<Text style={{ color: c.text, fontSize: 18, fontWeight: '700', paddingTop: 5, flexShrink: 1 }}>{data.name}</Text>{(gender === 'male' || gender === 'female') && <Icon name={gender === 'male' ? 'male' : 'female'} color={purple} size={18} />}{metrics?.verified && <Icon name="checkmark-circle" color="#6EA5FF" size={19} />}</View><Pressable accessibilityRole="button" onPress={() => setSocial(true)} style={{ alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#8D73EA', backgroundColor: '#6349CA66', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 }}><Text style={{ color: '#A996FF', fontSize: 10 }}>♧ Connect Socials</Text></Pressable><Pressable accessibilityRole="button" onPress={() => go('verification')} style={{ backgroundColor: c.isDark ? c.card : '#FFFCED', borderWidth: c.isDark ? 1 : 0, borderColor: c.border, borderRadius: 12, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }}><Icon name="shield-checkmark-outline" color={c.isDark ? '#78BCE7' : '#3786BC'} size={23} /><Text style={{ color: c.isDark ? c.text : '#222C36', fontSize: 14, fontWeight: '700', flex: 1 }}>{metrics?.verified ? 'Badge of Trust' : 'Get Badge of Trust'}</Text><Text style={{ color: c.isDark ? '#77C5D6' : '#21778E', fontSize: 12, fontWeight: '700' }}>{metrics?.verified ? 'View' : 'Get Verified'} ›</Text></Pressable><View style={{ flexDirection: 'row', gap: 6 }}>{values.map(([label, value, icon, border]) => <Pressable accessibilityRole={label === 'SQUAD' ? 'button' : undefined} disabled={label !== 'SQUAD'} onPress={label === 'SQUAD' ? openSquad : undefined} key={label} style={{ flex: 1, borderWidth: 1.5, borderColor: border, borderRadius: 18, backgroundColor: '#50307022', alignItems: 'center', paddingVertical: 12, gap: 7 }}><Icon name={icon} color={border} size={20} /><Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{value ?? '—'}</Text><Text style={{ color: border, fontSize: 8, letterSpacing: .3 }}>{label}</Text></Pressable>)}</View><View style={{ flexDirection: 'row', gap: 8, marginVertical: 14 }}>{['Edit profile', 'Contact'].map(label => <Pressable accessibilityRole="button" key={label} onPress={() => { if (label === 'Edit profile') go('editProfile'); else void supabase.rpc('profile_contact', { p_user_id: Number(data.userId) }).then(({ data, error }) => { if (error) setError(error.message); else setContact(data); }); }} style={{ flex: 1, backgroundColor: c.card, borderRadius: 8, alignItems: 'center', padding: 11 }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{label}</Text></Pressable>)}</View><Text style={{ color: c.text, fontWeight: '700', fontSize: 14, marginVertical: 6 }}>Achievements</Text><View style={{ height: 96, justifyContent: 'center' }}><View style={{ flexDirection: 'row', opacity: .23, justifyContent: 'space-around' }}>{['rocket-outline', 'flame-outline', 'cafe-outline', 'mic-outline', 'shield-checkmark-outline'].map(icon => <View key={icon} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12 }}><Icon name={icon as any} color="#A486C7" size={25} /></View>)}</View><View style={{ position: 'absolute', alignSelf: 'center', backgroundColor: c.card, padding: 12, borderRadius: 25 }}><Text style={{ color: '#9980FF', fontSize: 10, fontWeight: '700' }}>🔒 FEATURE UNLOCKS SOON</Text></View></View><View style={{ backgroundColor: c.inset, borderWidth: 1, borderColor: '#7255B52A', borderRadius: 22, padding: 17, gap: 17 }}><View style={{ flexDirection: 'row', gap: 9 }}><Icon name="shield-checkmark-outline" color="#9D7ADC" /><View><Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Trust Score</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 5 }}>{metrics?.verified ? 'Verified Profile' : 'Standard Profile'}</Text></View></View><View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}><View style={{ width: 84, height: 84, borderRadius: 44, borderWidth: 7, borderColor: c.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 28, fontWeight: '700' }}>{metrics?.trust_score ?? derivedTrust}</Text><Text style={{ color: c.muted, fontSize: 9 }}>/100</Text></View><View style={{ flex: 1, gap: 7 }}>{[['Phone Verified (+20)', metrics?.phone_verified], ['Aadhaar Verified (+20)', metrics?.aadhaar_verified], ['Social Linked (+10)', metrics?.social_linked], ['Activities Join/Host', (metrics?.activities || 0) > 0], ['4.0+ Avg Rating (+10)', (metrics?.rating || 0) >= 4]].map(([text, checked]) => <View key={String(text)} style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Icon name={checked ? 'checkbox-outline' : 'square-outline'} color={checked ? '#9C8AFF' : c.muted} size={15} /><Text style={{ color: c.muted, fontSize: 9 }}>{String(text)}</Text></View>)}</View></View>{metrics && metrics.trust_score === null && <Text style={{ color: c.muted, fontSize: 9 }}>Score reflects the verified signals above. Activity points are not configured yet.</Text>}</View><ErrorLine text={error} /><View style={{ marginTop: 13, marginHorizontal: -14 }}><Pills underline values={['My Vibes', 'Upcoming', 'Completed', 'Drafts']} selected={tab} onChange={setTab} /></View>{loading && !rows.length && !vibes.length ? <Skeleton count={2} /> : tab === 'My Vibes' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 12 }}>{vibes.map(v => <Pressable accessibilityRole="button" accessibilityLabel={`Open vibe ${v.caption || v.id}`} key={v.id} onPress={() => openVibe(v.id)} style={{ width: '31.9%', aspectRatio: .8, backgroundColor: c.card, borderRadius: 9, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>{v.mediaType === 'image' ? <Image source={{ uri: v.mediaUrl }} style={{ width: '100%', height: '100%' }} /> : <Icon name="play-circle-outline" size={29} color={purple} />}</Pressable>)}{!vibes.length && <View style={{ width: '100%', alignItems: 'center', paddingVertical: 40, gap: 14 }}><Icon name="flash-outline" color={c.muted} size={42} /><Text style={{ color: c.muted, fontSize: 13 }}>No vibes posted yet</Text></View>}</View> : rows.length ? rows.map(a => <Pressable accessibilityRole="button" key={a.id} onPress={() => tab === 'Drafts' ? openDraft() : openActivity(a.id)} style={[ui.row, { borderBottomWidth: 1, borderColor: c.border, paddingHorizontal: 0 }]}><Icon name="calendar-outline" color={purple} /><View><Text style={{ color: c.text, fontSize: 13 }}>{a.title}</Text><Text style={{ color: c.muted, fontSize: 10 }}>{a.when}</Text></View></Pressable>) : <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', padding: 24 }}>No {tab.toLowerCase()} activities.</Text>}{cursor && <Button label="Load more" busy={loading} onPress={() => void load(true)} />}</ScrollView>{social && <SocialLinks close={() => setSocial(false)} />}{contact && <ContactSheet contact={contact} close={() => setContact(null)} />}</Page>;
}
function ContactSheet({ contact, close }: { contact: { email?: string | null; phone?: string | null }; close: () => void }) { const c = usePalette(); return <Sheet title="Contact" centered close={close}>{contact.email ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('mailto:' + contact.email)}><Text style={{ color: '#9A8AFF' }}>{contact.email}</Text></Pressable> : <Text style={{ color: c.muted }}>Email is private or not added.</Text>}{contact.phone ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('tel:' + contact.phone)}><Text style={{ color: '#9A8AFF' }}>{contact.phone}</Text></Pressable> : <Text style={{ color: c.muted }}>Phone is private or not added.</Text>}</Sheet>; }
export function ReferenceMemberProfile({ id, back, onConversation, onOpenActivity, onOpenVibe, onOpenSquad }: { id: string; back: () => void; onConversation: (id: string, person: any) => void; onOpenActivity: (activity: Activity) => void; onOpenVibe: (id: string) => void; onOpenSquad: (id: string) => void }) {
 const c = usePalette();
 const [person, setPerson] = useState<any>(null);
 const [profileMeta, setProfileMeta] = useState<any>(null);
 const [interests, setInterests] = useState<string[]>([]);
 const [vibes, setVibes] = useState<any[]>([]);
 const [squadCount, setSquadCount] = useState<number | null>(null);
 const [tab, setTab] = useState('Upcoming');
 const [error, setError] = useState('');
 const [contact, setContact] = useState(false);
 const [busy, setBusy] = useState(false);
 const [hosted, setHosted] = useState<Activity[]>([]);
 const [loadingHosted, setLoadingHosted] = useState(true);

 useEffect(() => {
  let active = true;
  void (async () => {
   try {
    const userId = Number(id);
    const [contactResult, profileResult, interestsResult, hostedPage, vibesResult, squadResult] = await Promise.all([
     supabase.rpc('profile_contact', { p_user_id: userId }),
     supabase.from('tbl_users').select('id,gender,rating,points,nationality,occupation,isverified').eq('id', userId).maybeSingle(),
     supabase.from('tbl_user_interests').select('category:tbl_categories!tbl_user_interests_category_id_fkey(name)').eq('user_id', userId),
     activitiesProductionService.discover({ ownerId: id, pageSize: 50, upcomingOnly: false, sort: 'latest' }),
     listReels({ userId: id, pageSize: 50 }),
     supabase.from('tbl_friends').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},friend_id.eq.${userId}`),
    ]);
    if (contactResult.error) throw contactResult.error;
    const prepared = await prepareReferenceActivities(hostedPage.items);
    if (!active) return;
    setPerson(contactResult.data);
    if (!profileResult.error) setProfileMeta(profileResult.data);
    if (!interestsResult.error) setInterests((interestsResult.data ?? []).map((row: any) => row.category?.name).filter(Boolean));
    setVibes(vibesResult.reels);
    if (!squadResult.error) setSquadCount(squadResult.count ?? 0);
    setHosted(prepared);
   } catch (e: any) {
    if (active) setError(e.message);
   } finally {
    if (active) setLoadingHosted(false);
   }
  })();
  return () => { active = false; };
 }, [id]);

 const now = Date.now();
 const visibleActivities = hosted.filter(activity => tab === 'Completed'
  ? activity.status === 'completed' || Boolean(activity.endsAt && new Date(activity.endsAt).getTime() < now)
  : activity.status !== 'completed' && (!activity.endsAt || new Date(activity.endsAt).getTime() >= now));
 const metrics = [
  ['ACTIVITIES', hosted.length, 'calendar-outline', '#B785E7'],
  ['SQUAD', squadCount, 'people-outline', '#7D76DA'],
  ['NITRO', profileMeta?.points == null ? null : Number(profileMeta.points), 'flash-outline', '#A76BDD'],
  ['KARMA', profileMeta?.rating == null ? null : Number(profileMeta.rating).toFixed(1), 'star', '#E89256'],
 ] as const;
 const username = String(person?.username || '').replace(/^@/, '');
 const gender = String(profileMeta?.gender || '').toLowerCase();
 const message = () => {
  setBusy(true);
  void realtimeChatService.createDirectConversation(Number(id))
   .then(room => onConversation(String(room), person))
   .catch(e => setError(e.message))
   .finally(() => setBusy(false));
 };

 return <Page>
  <Header title={username || 'Profile'} back={back} />
  <ErrorLine text={error} />
  {!person && !error ? <Skeleton /> : person && <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 16 }}>
   <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
    {person.profile_image ? <Image source={{ uri: person.profile_image }} style={{ width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: '#7564E8' }} /> : <Icon name="person-circle-outline" size={92} color={c.muted} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
     <Text style={{ color: c.text, fontSize: 21, fontWeight: '700' }}>{person.fullname || username}</Text>
     {person.is_verified && <Icon name="checkmark-circle" color="#6B9DEB" size={19} />}
     {(gender === 'male' || gender === 'female') && <Icon name={gender === 'male' ? 'male' : 'female'} color="#A996FF" size={17} />}
    </View>
    <Text style={{ color: c.muted, fontSize: 12 }}>@{username}{profileMeta?.nationality ? ` · ${profileMeta.nationality}` : ''}</Text>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 320 }}>{person.bio || 'No bio added yet.'}</Text>
   </View>

   {interests.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 }}>{interests.map(item => <View key={item} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, backgroundColor: '#6654DA28', borderWidth: 1, borderColor: '#7564E855' }}><Text style={{ color: '#B1A4FF', fontSize: 10, fontWeight: '600' }}>{item}</Text></View>)}</View> : null}

   <View style={{ flexDirection: 'row', gap: 6 }}>{metrics.map(([label, value, icon, border]) => <Pressable accessibilityRole={label === 'SQUAD' ? 'button' : undefined} disabled={label !== 'SQUAD'} onPress={label === 'SQUAD' ? () => onOpenSquad(id) : undefined} key={label} style={{ flex: 1, borderWidth: 1.5, borderColor: border, borderRadius: 16, backgroundColor: '#50307022', alignItems: 'center', paddingVertical: 11, gap: 5 }}><Icon name={icon} color={border} size={18} /><Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{value ?? '—'}</Text><Text style={{ color: border, fontSize: 7.5, letterSpacing: .25 }}>{label}</Text></Pressable>)}</View>

   <View style={{ flexDirection: 'row', gap: 8 }}>
    {person.can_message && <View style={{ flex: 1 }}><Button label="Message" busy={busy} onPress={message} /></View>}
    <Pressable accessibilityRole="button" onPress={() => setContact(true)} style={{ flex: 1, minHeight: 46, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>Contact</Text></Pressable>
   </View>

   <View style={{ backgroundColor: c.inset, borderWidth: 1, borderColor: '#7255B52A', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
    <View style={{ width: 74, height: 74, borderRadius: 38, borderWidth: 6, borderColor: c.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 24, fontWeight: '700' }}>—</Text><Text style={{ color: c.muted, fontSize: 8 }}>/100</Text></View>
    <View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="shield-checkmark-outline" color="#9D7ADC" size={20} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Trust Score</Text></View><Text style={{ color: c.muted, fontSize: 10, lineHeight: 15 }}>This score is private. Verification status is shown on the profile.</Text></View>
   </View>

   <View style={{ marginHorizontal: -16 }}><Pills underline values={['Upcoming', 'Completed', 'Vibes']} selected={tab} onChange={setTab} /></View>
   {loadingHosted ? <Skeleton count={2} /> : tab === 'Vibes' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{vibes.map(vibe => <Pressable accessibilityRole="button" accessibilityLabel={`Open vibe ${vibe.caption || vibe.id}`} onPress={() => onOpenVibe(vibe.id)} key={vibe.id} style={{ width: '31.8%', aspectRatio: .8, borderRadius: 9, overflow: 'hidden', backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>{vibe.mediaType === 'image' ? <Image source={{ uri: vibe.mediaUrl }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="play-circle-outline" color="#FFF" size={32} /><Text style={{ color: c.muted, fontSize: 9, marginTop: 5 }}>Video</Text></>}</Pressable>)}{!vibes.length && <Text style={{ width: '100%', color: c.muted, fontSize: 12, textAlign: 'center', padding: 26 }}>No public Vibes yet.</Text>}</View> : visibleActivities.length ? visibleActivities.map(activity => <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${activity.title}`} key={activity.id} onPress={() => onOpenActivity(activity)} style={{ backgroundColor: c.card, padding: 15, borderRadius: 11, gap: 6 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{activity.title}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{activity.when} · {activity.where}</Text></Pressable>) : <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', padding: 26 }}>No {tab.toLowerCase()} activities.</Text>}
  </ScrollView>}
  {contact && <ContactSheet contact={person} close={() => setContact(false)} />}
 </Page>;
}
function SocialLinks({ close }: { close: () => void }) {
 const c = usePalette(); const [values, setValues] = useState<Record<string, string>>({}), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
 useEffect(() => { void supabase.rpc('my_social_links').then(({ data, error }) => { if (error) setError(error.message); else setValues(data || {}); setLoading(false); }); }, []);
 return <Sheet title="Connect Socials" close={() => { if (!busy) close(); }}>{loading ? <Skeleton /> : <>{['instagram', 'linkedin', 'facebook', 'twitter', 'youtube'].map(key => <View key={key} style={{ gap: 7 }}><Text style={{ color: c.text, fontSize: 12 }}>{key[0].toUpperCase() + key.slice(1)}</Text><Field accessibilityLabel={key} value={values[key] || ''} placeholder="https://" onChangeText={v => setValues(current => ({ ...current, [key]: v }))} autoCapitalize="none" /></View>)}<ErrorLine text={error} /><Button label="Save Changes" busy={busy} onPress={() => { setBusy(true); void Promise.resolve(supabase.rpc('my_social_links', { p_patch: values })).then(({ error }) => { if (error) throw error; close(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }} /></>}</Sheet>;
}
