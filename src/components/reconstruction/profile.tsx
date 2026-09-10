import { VerifiedBadge } from '../verified-badge';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppData, Activity, Screen } from '../../../App';
import { supabase } from '../../lib/supabase';
import { activitiesProductionService } from '../../services/activities-production';
import { listReels, type VibeReel } from '../../services/vibes-production';
import { realtimeChatService } from '../../services/realtime-chat';
import { Action, Button, ErrorLine, Field, Header, Icon, Page, Pills, Sheet, Skeleton, ui, usePalette, purple } from './ui';
import { loadActivityParticipantCounts } from '../../services/wenitro';
import { productionActivity, prepareReferenceActivities } from './feed-search';
type Metrics = { verified: boolean; nitro: number; karma: number; trust_score: number | null; rating: number; activities: number; squad: number; phone_verified: boolean; aadhaar_verified: boolean; social_linked: boolean };
type ProfileContentTab = 'Activities' | 'Vibes' | 'Reviews' | 'Communities';
const socialPlatforms: Record<string, { icon: React.ComponentProps<typeof Icon>['name']; label: string; color: string }> = {
 instagram: { icon: 'logo-instagram', label: 'Instagram', color: '#E94286' },
 facebook: { icon: 'logo-facebook', label: 'Facebook', color: '#2784E8' },
 linkedin: { icon: 'logo-linkedin', label: 'LinkedIn', color: '#1688B8' },
 twitter: { icon: 'logo-twitter', label: 'X', color: '#11131A' },
 youtube: { icon: 'logo-youtube', label: 'YouTube', color: '#E54545' },
};
const visibleSocialPlatforms = ['instagram', 'facebook', 'linkedin', 'twitter'] as const;
const interestVisuals = [
 { icon: 'sparkles-outline', color: '#7458EF', bg: '#EEE9FF' },
 { icon: 'airplane-outline', color: '#3E9BE8', bg: '#E7F4FF' },
 { icon: 'book-outline', color: '#E950A5', bg: '#FFF0F7' },
 { icon: 'cafe-outline', color: '#E69732', bg: '#FFF5E4' },
 { icon: 'musical-notes-outline', color: '#21A875', bg: '#E7FBF2' },
] as const;
const interestVisual = (interest: string, index: number) => {
 const value = interest.toLowerCase();
 if (/sport|badminton|tennis|cricket|football|fitness/.test(value)) return { icon: 'tennisball-outline' as const, color: '#7458EF', bg: '#EEE9FF' };
 if (/travel|trip|explor|outdoor|hiking/.test(value)) return { icon: 'airplane-outline' as const, color: '#3E9BE8', bg: '#E7F4FF' };
 if (/read|book|study|learn/.test(value)) return { icon: 'book-outline' as const, color: '#E950A5', bg: '#FFF0F7' };
 if (/coffee|food|cook|drink/.test(value)) return { icon: 'cafe-outline' as const, color: '#E69732', bg: '#FFF5E4' };
 if (/music|dance|concert/.test(value)) return { icon: 'musical-notes-outline' as const, color: '#21A875', bg: '#E7FBF2' };
 return interestVisuals[index % interestVisuals.length];
};

export function ReferenceProfile({ data, setData, go, openActivity, openDraft, openVibe, openSquad }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void; openDraft: () => void; openVibe: (id: string) => void; openSquad: () => void }) {
 const c = usePalette();
 const request = useRef(0);
 const [gender, setGender] = useState<string | null>(null);
 const [metrics, setMetrics] = useState<Metrics | null>(null);
 const [contentTab, setContentTab] = useState<ProfileContentTab>('Vibes');
 const [tab, setTab] = useState('My Vibes');
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(true);
 const [vibes, setVibes] = useState<VibeReel[]>([]);
 const [activities, setActivities] = useState<Activity[]>([]);
 const [cursor, setCursor] = useState<string | null>(null);
 const [contact, setContact] = useState<{ email?: string; phone?: string } | null>(null);
 const [social, setSocial] = useState(false);
 const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
 const [socialNotice, setSocialNotice] = useState('');
 const [achievementNotice, setAchievementNotice] = useState('');
 useEffect(() => { let active = true; void supabase.rpc('my_profile_metrics').then(({ data, error }) => { if (active) { if (error) setError(error.message); else setMetrics(data); } }); return () => { active = false; }; }, [data.userId, social]);
 useEffect(() => { let active = true; void supabase.from('tbl_users').select('gender').eq('id', Number(data.userId)).single().then(({ data, error }) => { if (active && !error) setGender(data?.gender || null); }); return () => { active = false; }; }, [data.userId]);
 useEffect(() => { let active = true; void supabase.rpc('my_social_links').then(({ data }) => { if (active && data && typeof data === 'object' && !Array.isArray(data)) setSocialLinks(data as Record<string, string>); }); return () => { active = false; }; }, [data.userId, social]);
 const load = async (more = false) => { const token = ++request.current; setLoading(true); setError(''); try {
  if (tab === 'My Vibes') { const page = await listReels({ ownOnly: true, cursor: more ? cursor : null, pageSize: 20 }); if (token !== request.current) return; setVibes(current => more ? [...current, ...page.reels] : page.reels); setCursor(page.nextCursor); }
  else { const page = tab === 'Drafts' ? await activitiesProductionService.listHosted({ statuses: ['draft'], pageSize: 50, page: more ? Number(cursor || 1) : 1 }) : await activitiesProductionService.listVibeEligible(more ? cursor || undefined : undefined); const items = await prepareReferenceActivities(page.items); if (token !== request.current) return; setActivities(current => more ? [...current, ...items] : items); setData(current => current.userId !== data.userId ? current : ({ ...current, activities: [...current.activities.filter(a => !items.some(i => i.id === a.id)), ...items] })); setCursor('nextCursor' in page ? page.nextCursor : page.hasMore ? String(page.page + 1) : null); }
 } catch (e: any) { if (token === request.current) setError(e.message); } finally { if (token === request.current) setLoading(false); } };
 useEffect(() => { setActivities([]); setVibes([]); setCursor(null); void load(); return () => { request.current++; }; }, [tab, data.userId]);
 const rows = activities.filter(a => tab === 'Drafts' ? a.status === 'draft' : tab === 'Completed' ? a.status === 'completed' || Boolean(a.endsAt && new Date(a.endsAt).getTime() < Date.now()) : a.status !== 'completed' && (!a.endsAt || new Date(a.endsAt).getTime() >= Date.now()));
 const values = [['Activities', metrics?.activities, 'calendar-outline', '#7464F4'], ['Squad', metrics?.squad, 'people-outline', '#E44FA4'], ['Karma', metrics ? metrics.karma.toFixed(1) : undefined, 'star-outline', '#F5A623'], ['V-Nitro', metrics?.nitro, 'flash-outline', '#35C77A']] as const;
 const username = data.username.replace(/^@/, '');
 const initials = data.name.split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || username.slice(0, 2).toUpperCase();
 const trustValue = metrics?.trust_score ?? null;
 const openContact = () => { void supabase.rpc('profile_contact', { p_user_id: Number(data.userId) }).then(({ data, error }) => { if (error) setError(error.message); else setContact(data); }); };
 const openSocialLink = (key: keyof typeof socialPlatforms) => {
  const value = String(socialLinks[key] || '').trim();
  if (!/^https:\/\//i.test(value)) { setSocialNotice(`${socialPlatforms[key].label} is not connected yet.`); return; }
  setSocialNotice('');
  void Linking.openURL(value).catch(() => setSocialNotice(`Could not open the ${socialPlatforms[key].label} link.`));
 };
 const changeContentTab = (value: string) => { const next = value as ProfileContentTab; setContentTab(next); if (next === 'Vibes') setTab('My Vibes'); if (next === 'Activities' && tab === 'My Vibes') setTab('Upcoming'); };

 return <Page>
  <ScrollView contentContainerStyle={[profileStyles.scroll, { backgroundColor: c.bg }]} showsVerticalScrollIndicator={false}>
   <LinearGradient colors={c.isDark ? ['#3214B6', '#4319D6', '#171D58'] : ['#4B25DA', '#3827C9', '#2831A4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={profileStyles.hero}>
    <View pointerEvents="none" style={profileStyles.heroGlow} />
    <View pointerEvents="none" style={profileStyles.heroWaveOne} />
    <View pointerEvents="none" style={profileStyles.heroWaveTwo} />
    <View style={profileStyles.heroActions}><Pressable accessibilityRole="button" accessibilityLabel="V-Nitro Store" onPress={() => go('shop')} style={profileStyles.heroAction}><Icon name="bag-handle-outline" size={21} color="#FFF" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => go('settings')} style={profileStyles.heroAction}><Icon name="settings-outline" size={21} color="#FFF" /></Pressable></View>
    <View style={profileStyles.identityRow}>
     <View style={profileStyles.avatarWrap}>{data.avatarUri ? <Image source={{ uri: data.avatarUri }} style={profileStyles.avatar} /> : <View style={[profileStyles.avatar, profileStyles.avatarFallback]}><Text style={profileStyles.initials}>{initials}</Text></View>}</View>
     <View style={profileStyles.identityCopy}><View style={profileStyles.nameRow}><Text numberOfLines={1} style={profileStyles.name}>{data.name}</Text><VerifiedBadge userId={data.userId} color="#FFF" size={18} />{(gender === 'male' || gender === 'female') ? <Icon name={gender === 'male' ? 'male' : 'female'} color="#D8D4FF" size={16} /> : null}</View><Text style={profileStyles.handle}>@{username}</Text>{data.location ? <View style={profileStyles.locationRow}><Icon name="location-outline" color="#DED9FF" size={13} /><Text numberOfLines={1} style={profileStyles.location}>{data.location}</Text></View> : null}</View>
     <View style={profileStyles.trustCard}><Text style={profileStyles.trustLabel}>Trust Score</Text><Text style={[profileStyles.trustNumber, { color: metrics?.verified ? '#42E58E' : '#FFFFFF' }]}>{trustValue ?? '—'}{trustValue != null ? <Text style={profileStyles.trustDenominator}>/100</Text> : null}</Text><View style={profileStyles.trustStatus}><Icon name={metrics?.verified ? 'shield-checkmark' : 'shield-outline'} color={metrics?.verified ? '#38E68A' : '#D3CEF9'} size={13} /><Text style={[profileStyles.trustStatusText, { color: metrics?.verified ? '#38E68A' : '#D3CEF9' }]}>{metrics?.verified ? 'Verified' : 'Standard'}</Text></View></View>
    </View>
    <View style={profileStyles.socialRow}>{visibleSocialPlatforms.map(key => { const linked = /^https:\/\//i.test(String(socialLinks[key] || '').trim()); return <Pressable accessibilityRole="button" accessibilityLabel={`${socialPlatforms[key].label}${linked ? '' : ', not connected'}`} accessibilityHint={linked ? `Open ${socialPlatforms[key].label}` : 'Tap to learn why the link is unavailable'} key={key} onPress={() => openSocialLink(key)} style={[profileStyles.socialButton, { backgroundColor: linked ? socialPlatforms[key].color : '#FFFFFF14', borderColor: linked ? '#FFFFFF36' : '#FFFFFF24' }, !linked && profileStyles.socialButtonMissing]}>{key === 'twitter' ? <Text style={[profileStyles.socialX, !linked && { color: '#D6D1F3' }]}>X</Text> : <Icon name={socialPlatforms[key].icon} color={linked ? '#FFF' : '#D6D1F3'} size={18} />}{!linked ? <View style={profileStyles.socialMissingDot}><Icon name="add" color="#3F2CD4" size={8} /></View> : null}</Pressable>})}<Pressable accessibilityRole="button" accessibilityLabel="Edit social links" onPress={() => { setSocialNotice(''); setSocial(true); }} style={[profileStyles.socialButton, profileStyles.socialEdit]}><Icon name="pencil" color="#FFF" size={15} /></Pressable></View>
    {socialNotice ? <Text accessibilityLiveRegion="polite" style={profileStyles.socialNotice}>{socialNotice} Use the edit button to add it.</Text> : null}
    {data.interests.length ? <View style={profileStyles.heroInterests}>{data.interests.slice(0, 4).map(item => <View key={item} style={profileStyles.heroInterest}><Text style={profileStyles.heroInterestText}>{item}</Text></View>)}{data.interests.length > 4 ? <View style={profileStyles.heroInterest}><Text style={profileStyles.heroInterestText}>+{data.interests.length - 4}</Text></View> : null}</View> : null}
   </LinearGradient>

   <View style={profileStyles.body}>
    <View style={profileStyles.actionRow}><Pressable accessibilityRole="button" onPress={() => go('editProfile')} style={[profileStyles.primaryAction, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="create-outline" color={c.accent} size={18} /><Text style={[profileStyles.actionText, { color: c.accent }]}>Edit profile</Text></Pressable><Pressable accessibilityRole="button" onPress={() => go('verification')} style={[profileStyles.primaryAction, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="shield-checkmark-outline" color={c.accent} size={18} /><Text style={[profileStyles.actionText, { color: c.accent }]}>{metrics?.verified ? 'Verification' : 'Get verified'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Contact details" onPress={openContact} style={[profileStyles.contactAction, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="mail-outline" color={c.accent} size={18} /></Pressable></View>
    <View style={[profileStyles.statsCard, { backgroundColor: c.card, borderColor: c.border }]}>{values.map(([label, value, icon, color], index) => { const interactive = label === 'Squad' || label === 'Karma'; return <Pressable accessibilityRole={interactive ? 'button' : undefined} disabled={!interactive} onPress={label === 'Squad' ? openSquad : label === 'Karma' ? () => changeContentTab('Reviews') : undefined} key={label} style={[profileStyles.stat, index > 0 && { borderLeftWidth: 1, borderLeftColor: c.border }]}><Icon name={icon} color={color} size={19} /><Text style={[profileStyles.statValue, { color: c.text }]}>{value ?? '—'}</Text><Text numberOfLines={1} style={[profileStyles.statLabel, { color: c.muted }]}>{label}</Text></Pressable>; })}</View>
    <View style={[profileStyles.sectionCard, profileStyles.aboutCard, { backgroundColor: c.card, borderColor: c.border }]}><View style={profileStyles.aboutCopy}><Text style={[profileStyles.sectionTitle, { color: c.text }]}>About me</Text><Text numberOfLines={3} style={[profileStyles.bodyCopy, { color: data.bio ? c.muted : c.iconMuted }]}>{data.bio || 'Add a bio to tell people a little about you.'}</Text>{!data.bio ? <Pressable accessibilityRole="button" onPress={() => go('editProfile')}><Text style={[profileStyles.inlineAction, { color: c.accent }]}>Add bio</Text></Pressable> : null}</View><View pointerEvents="none" style={[profileStyles.aboutArt, { backgroundColor: c.inset }]}><View style={profileStyles.aboutSun} /><View style={profileStyles.aboutHillBack} /><View style={profileStyles.aboutHillFront} /><Icon name="person" color="#3928B4" size={22} /></View></View>
    <View style={[profileStyles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}><View style={profileStyles.sectionHeader}><Text style={[profileStyles.sectionTitle, { color: c.text }]}>Interests</Text><Pressable accessibilityRole="button" onPress={() => go('editProfile')}><Text style={[profileStyles.inlineAction, { color: c.accent }]}>Manage</Text></Pressable></View>{data.interests.length ? <View style={profileStyles.interestGrid}>{data.interests.slice(0, 5).map((interest, index) => { const visual = interestVisual(interest, index); return <View key={interest} style={profileStyles.interestTile}><View style={[profileStyles.interestIcon, { backgroundColor: c.isDark ? `${visual.color}22` : visual.bg }]}><Icon name={visual.icon} color={visual.color} size={18} /></View><Text numberOfLines={1} style={[profileStyles.interestText, { color: c.muted }]}>{interest}</Text></View>})}{data.interests.length > 5 ? <View style={profileStyles.interestTile}><View style={[profileStyles.interestIcon, { backgroundColor: c.inset }]}><Text style={[profileStyles.moreInterests, { color: c.text }]}>+{data.interests.length - 5}</Text></View><Text style={[profileStyles.interestText, { color: c.muted }]}>More</Text></View> : null}</View> : <Text style={[profileStyles.bodyCopy, { color: c.iconMuted }]}>No interests added yet.</Text>}</View>
    <LinearGradient colors={c.isDark ? ['#29215E', '#652A8D', '#214D82'] : ['#5C55D8', '#BA4FD1', '#4388DA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={profileStyles.achievements}><View pointerEvents="none" style={profileStyles.achievementGlow} /><View style={profileStyles.sectionHeader}><Text style={profileStyles.achievementTitle}>Achievements</Text><View style={profileStyles.comingSoon}><Icon name="lock-closed" color="#FFF" size={11} /><Text style={profileStyles.comingSoonText}>COMING SOON</Text></View></View><View style={profileStyles.badgeRow}>{[['trophy-outline', '#367DEB'], ['heart-outline', '#D243A7'], ['people-outline', '#2EBFC3'], ['calendar-outline', '#F09A31'], ['flame-outline', '#ED465B']].map(([icon, color]) => <Pressable accessibilityRole="button" accessibilityLabel="Locked achievement" accessibilityHint="Shows achievement availability" onPress={() => setAchievementNotice('Achievements are coming soon.')} key={icon} style={[profileStyles.badgePlaceholder, { backgroundColor: `${color}CC`, borderColor: '#FFFFFF99' }]}><Icon name={icon as any} color="#FFF" size={21} /></Pressable>)}</View><Text accessibilityLiveRegion="polite" style={profileStyles.achievementCopy}>{achievementNotice || 'Badges will appear here when achievements launch.'}</Text></LinearGradient>
    <ErrorLine text={error} />
    <View style={[profileStyles.contentCard, { backgroundColor: c.card, borderColor: c.isDark ? c.border : 'transparent' }]}>
     <View style={[profileStyles.contentTabs, { borderBottomColor: c.border }]}>{(['Activities', 'Vibes', 'Reviews', 'Communities'] as const).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: contentTab === item }} key={item} onPress={() => changeContentTab(item)} style={[profileStyles.contentTab, contentTab === item && { borderBottomColor: c.accent }]}><Text numberOfLines={1} style={[profileStyles.contentTabText, { color: contentTab === item ? c.accent : c.muted }, contentTab === item && profileStyles.contentTabTextActive]}>{item}</Text></Pressable>)}</View>
     {contentTab === 'Activities' ? <View style={profileStyles.contentBody}><Pills values={['Upcoming', 'Completed', 'Drafts']} selected={tab} onChange={setTab} />{loading && !rows.length ? <Skeleton count={2} /> : rows.length ? rows.map(a => <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${a.title}`} key={a.id} onPress={() => tab === 'Drafts' ? openDraft() : openActivity(a.id)} style={[profileStyles.activityRow, { borderColor: c.border }]}><View style={[profileStyles.activityIcon, { backgroundColor: c.inset }]}><Icon name="calendar-outline" color={c.accent} size={19} /></View><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={[profileStyles.activityTitle, { color: c.text }]}>{a.title}</Text><Text numberOfLines={1} style={[profileStyles.activityMeta, { color: c.muted }]}>{a.when}{a.where ? ` · ${a.where}` : ''}</Text></View><Icon name="chevron-forward" color={c.iconMuted} size={17} /></Pressable>) : <View style={profileStyles.emptyState}><Icon name="calendar-clear-outline" color={c.iconMuted} size={35} /><Text style={[profileStyles.emptyText, { color: c.muted }]}>No {tab.toLowerCase()} activities.</Text></View>}</View> : contentTab === 'Vibes' ? <View style={profileStyles.vibeGrid}>{loading && !vibes.length ? <View style={{ width: '100%' }}><Skeleton count={2} /></View> : vibes.map(v => <Pressable accessibilityRole="button" accessibilityLabel={`Open vibe ${v.caption || v.id}`} key={v.id} onPress={() => openVibe(v.id)} style={[profileStyles.vibeTile, { backgroundColor: c.inset }]}>{v.mediaType === 'image' ? <Image source={{ uri: v.mediaUrl }} style={profileStyles.vibeImage} /> : <><Icon name="play-circle" size={34} color="#FFF" /><Text style={profileStyles.videoLabel}>Video</Text></>}<View style={profileStyles.vibeStats}><View style={profileStyles.vibeStat}><Icon name="heart-outline" color="#FFF" size={11} /><Text style={profileStyles.vibeStatText}>{v.likeCount}</Text></View><View style={profileStyles.vibeStat}><Icon name="chatbubble-outline" color="#FFF" size={10} /><Text style={profileStyles.vibeStatText}>{v.commentCount}</Text></View></View></Pressable>)}{!loading && !vibes.length ? <View style={profileStyles.emptyState}><Icon name="film-outline" color={c.iconMuted} size={36} /><Text style={[profileStyles.emptyText, { color: c.muted }]}>No vibes posted yet.</Text></View> : null}</View> : <View style={profileStyles.emptyState}><Icon name={contentTab === 'Reviews' ? 'chatbox-ellipses-outline' : 'people-outline'} color={c.iconMuted} size={38} /><Text style={[profileStyles.emptyTitle, { color: c.text }]}>{contentTab}</Text><Text style={[profileStyles.emptyText, { color: c.muted }]}>Coming soon</Text></View>}
     {cursor && (contentTab === 'Activities' || contentTab === 'Vibes') ? <View style={profileStyles.loadMore}><Button label="Load more" busy={loading} onPress={() => void load(true)} /></View> : null}
    </View>
   </View>
  </ScrollView>
  {social && <SocialLinks close={() => setSocial(false)} />}
  {contact && <ContactSheet contact={contact} close={() => setContact(null)} />}
 </Page>;
}

const profileStyles = StyleSheet.create({
 scroll: { paddingBottom: 22 },
 hero: { paddingHorizontal: 17, paddingTop: 8, paddingBottom: 16, minHeight: 218, borderBottomLeftRadius: 25, borderBottomRightRadius: 25, overflow: 'hidden' },
 heroGlow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#8B5BFF33', top: -150, left: 90 },
 heroWaveOne: { position: 'absolute', width: 470, height: 138, borderRadius: 235, borderWidth: 1, borderColor: '#A47CFF30', right: -205, bottom: -68, transform: [{ rotate: '-9deg' }] },
 heroWaveTwo: { position: 'absolute', width: 420, height: 116, borderRadius: 210, borderWidth: 1, borderColor: '#FFFFFF14', right: -172, bottom: -55, transform: [{ rotate: '-4deg' }] },
 heroActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginBottom: 3 },
 heroAction: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#1711516E', borderWidth: 1, borderColor: '#FFFFFF1F', alignItems: 'center', justifyContent: 'center' },
 identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
 avatarWrap: { width: 82, height: 82 },
 avatar: { width: 82, height: 82, borderRadius: 42, borderWidth: 3, borderColor: '#FFF' },
 avatarFallback: { backgroundColor: '#E15E72', alignItems: 'center', justifyContent: 'center' },
 initials: { color: '#FFF', fontSize: 26, fontWeight: '800' },
 identityCopy: { flex: 1, minWidth: 0, gap: 3 },
 nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
 name: { color: '#FFF', fontSize: 18, fontWeight: '800', flexShrink: 1 },
 handle: { color: '#E5E1FF', fontSize: 11, fontWeight: '600' },
 locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
 location: { color: '#DED9FF', fontSize: 9, flexShrink: 1 },
 trustCard: { width: 91, borderRadius: 13, backgroundColor: '#101449B8', borderWidth: 1, borderColor: '#FFFFFF35', paddingHorizontal: 9, paddingVertical: 8, gap: 3 },
 trustLabel: { color: '#D8D5F6', fontSize: 8, fontWeight: '600' },
 trustNumber: { fontSize: 22, fontWeight: '800' },
 trustDenominator: { color: '#C4EFD7', fontSize: 9, fontWeight: '600' },
 trustStatus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
 trustStatusText: { fontSize: 8, fontWeight: '700' },
 socialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, paddingLeft: 7 },
 socialButton: { width: 32, height: 32, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
 socialButtonMissing: { borderStyle: 'dashed' },
 socialEdit: { backgroundColor: '#FFFFFF20', borderColor: '#FFFFFF3D', marginLeft: 2 },
 socialX: { color: '#FFF', fontSize: 15, fontWeight: '800' },
 socialMissingDot: { position: 'absolute', right: -2, bottom: -1, width: 12, height: 12, borderRadius: 7, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
 socialNotice: { color: '#F2EFFF', backgroundColor: '#0D103E6E', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 6, fontSize: 8.5, lineHeight: 12, alignSelf: 'flex-start' },
 heroInterests: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
 heroInterest: { borderRadius: 13, backgroundColor: '#FFFFFF14', borderWidth: 1, borderColor: '#FFFFFF1F', paddingHorizontal: 9, paddingVertical: 4 },
 heroInterestText: { color: '#F4F2FF', fontSize: 8, fontWeight: '600' },
 body: { paddingHorizontal: 13, paddingTop: 11, paddingBottom: 14, gap: 10 },
 actionRow: { flexDirection: 'row', gap: 7 },
 primaryAction: { flex: 1, minHeight: 41, borderWidth: 1, borderRadius: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
 contactAction: { width: 43, minHeight: 41, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
 actionText: { fontSize: 10, fontWeight: '700' },
 statsCard: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
 stat: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2, gap: 3 },
 statValue: { fontSize: 15, fontWeight: '800' },
 statLabel: { fontSize: 7.5, fontWeight: '600' },
 sectionCard: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, gap: 7 },
 sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
 sectionTitle: { fontSize: 12.5, fontWeight: '800' },
 bodyCopy: { fontSize: 10.5, lineHeight: 15 },
 inlineAction: { fontSize: 9, fontWeight: '700' },
 aboutCard: { minHeight: 85, flexDirection: 'row', overflow: 'hidden' },
 aboutCopy: { flex: 1, gap: 6, paddingRight: 4 },
 aboutArt: { width: 104, minHeight: 64, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
 aboutSun: { position: 'absolute', width: 15, height: 15, borderRadius: 8, backgroundColor: '#FFB927', right: 10, top: 7 },
 aboutHillBack: { position: 'absolute', width: 86, height: 56, borderRadius: 22, backgroundColor: '#A89BFF', left: 13, bottom: -29, transform: [{ rotate: '-13deg' }] },
 aboutHillFront: { position: 'absolute', width: 82, height: 51, borderRadius: 22, backgroundColor: '#6046E8', right: -13, bottom: -24, transform: [{ rotate: '13deg' }] },
 interestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
 interestTile: { width: 48, gap: 4, alignItems: 'center' },
 interestIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
 interestText: { fontSize: 7.5, fontWeight: '600', maxWidth: 48, textAlign: 'center' },
 moreInterests: { fontSize: 10, fontWeight: '800' },
 achievements: { borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, gap: 9, overflow: 'hidden' },
 achievementGlow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: '#5BE5FF24', left: -42, top: -58 },
 achievementTitle: { color: '#FFF', fontSize: 12.5, fontWeight: '800' },
 comingSoon: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF1C', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4 },
 comingSoonText: { color: '#FFF', fontSize: 7, fontWeight: '800', letterSpacing: .35 },
 badgeRow: { flexDirection: 'row', justifyContent: 'space-between', opacity: .72 },
 badgePlaceholder: { width: 43, height: 43, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '5deg' }] },
 achievementCopy: { color: '#F0EAFF', fontSize: 8 },
 contentCard: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
 contentTabs: { height: 42, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, paddingHorizontal: 3 },
 contentTab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 1 },
 contentTabText: { fontSize: 9, fontWeight: '500' },
 contentTabTextActive: { fontWeight: '800' },
 contentBody: { paddingBottom: 8 },
 activityRow: { minHeight: 66, borderTopWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
 activityIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
 activityTitle: { fontSize: 11, fontWeight: '700' },
 activityMeta: { fontSize: 8.5 },
 vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 7 },
 vibeTile: { width: '32.4%', aspectRatio: .82, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
 vibeImage: { width: '100%', height: '100%' },
 videoLabel: { color: '#FFF', fontSize: 8, marginTop: 3 },
 vibeStats: { position: 'absolute', left: 5, right: 5, bottom: 5, flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
 vibeStat: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#07111F99', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
 vibeStatText: { color: '#FFF', fontSize: 7, fontWeight: '700' },
 emptyState: { width: '100%', alignItems: 'center', paddingVertical: 30, gap: 6 },
 emptyTitle: { fontSize: 13, fontWeight: '700' },
 emptyText: { fontSize: 10, textAlign: 'center' },
 loadMore: { padding: 10 },
});

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
  ['V-NITRO', profileMeta?.points == null ? null : Number(profileMeta.points), 'flash-outline', '#A76BDD'],
  ['KARMA', profileMeta?.rating == null ? null : Number(profileMeta.rating).toFixed(1), 'star', '#E89256'],
 ] as const;
 const username = String(person?.username || '').replace(/^@/, '');
 const gender = String(profileMeta?.gender || '').toLowerCase();
 const isVerified = person?.is_verified === true || profileMeta?.isverified === 1;
 const publicTrustScore = person?.trust_score == null || !Number.isFinite(Number(person.trust_score)) ? null : Number(person.trust_score);
 const initials = String(person?.fullname || username).split(' ').map((word: string) => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'WN';
 const message = () => {
  setBusy(true);
  void realtimeChatService.createDirectConversation(Number(id))
   .then(room => onConversation(String(room), person))
   .catch(e => setError(e.message))
   .finally(() => setBusy(false));
 };

 return <Page>
  <ErrorLine text={error} />
  {!person && !error ? <Skeleton /> : person && <ScrollView contentContainerStyle={[profileStyles.scroll, { backgroundColor: c.bg }]} showsVerticalScrollIndicator={false}>
   <LinearGradient colors={c.isDark ? ['#3214B6', '#4319D6', '#171D58'] : ['#4B25DA', '#3827C9', '#2831A4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={profileStyles.hero}>
    <View pointerEvents="none" style={profileStyles.heroGlow} /><View pointerEvents="none" style={profileStyles.heroWaveOne} /><View pointerEvents="none" style={profileStyles.heroWaveTwo} />
    <View style={profileStyles.heroActions}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={profileStyles.heroAction}><Icon name="arrow-back" size={21} color="#FFF" /></Pressable><View style={profileStyles.heroAction}><Icon name={isVerified ? 'shield-checkmark' : 'shield-outline'} size={20} color={isVerified ? '#42E58E' : '#D3CEF9'} /></View></View>
    <View style={profileStyles.identityRow}><View style={profileStyles.avatarWrap}>{person.profile_image ? <Image source={{ uri: person.profile_image }} style={profileStyles.avatar} /> : <View style={[profileStyles.avatar, profileStyles.avatarFallback]}><Text style={profileStyles.initials}>{initials}</Text></View>}</View><View style={profileStyles.identityCopy}><View style={profileStyles.nameRow}><Text numberOfLines={1} style={profileStyles.name}>{person.fullname || username}</Text>{isVerified ? <Icon name="checkmark-circle" color="#FFF" size={18} /> : null}{(gender === 'male' || gender === 'female') ? <Icon name={gender === 'male' ? 'male' : 'female'} color="#D8D4FF" size={16} /> : null}</View><Text style={profileStyles.handle}>@{username}</Text>{profileMeta?.nationality ? <Text style={profileStyles.location}>{profileMeta.nationality}</Text> : null}</View><View style={profileStyles.trustCard}><Text style={profileStyles.trustLabel}>Trust Score</Text><Icon name="shield-checkmark-outline" color={isVerified ? '#42E58E' : '#FFF'} size={22} /><Text style={[profileStyles.trustStatusText, { color: publicTrustScore === null ? '#D3CEF9' : '#42E58E' }]}>{publicTrustScore ?? '—'}</Text></View></View>
    <View style={profileStyles.socialRow}>{visibleSocialPlatforms.map(key => <View accessibilityLabel={`${socialPlatforms[key].label} is not shared publicly`} key={key} style={[profileStyles.socialButton, profileStyles.socialButtonMissing, { backgroundColor: '#FFFFFF14', borderColor: '#FFFFFF24' }]}>{key === 'twitter' ? <Text style={[profileStyles.socialX, { color: '#D6D1F3' }]}>X</Text> : <Icon name={socialPlatforms[key].icon} color="#D6D1F3" size={18} />}</View>)}</View>
    {interests.length ? <View style={profileStyles.heroInterests}>{interests.slice(0, 4).map(item => <View key={item} style={profileStyles.heroInterest}><Text style={profileStyles.heroInterestText}>{item}</Text></View>)}{interests.length > 4 ? <View style={profileStyles.heroInterest}><Text style={profileStyles.heroInterestText}>+{interests.length - 4}</Text></View> : null}</View> : null}
   </LinearGradient>
   <View style={profileStyles.body}>
   <View style={[profileStyles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}><Text style={[profileStyles.sectionTitle, { color: c.text }]}>About</Text><Text style={[profileStyles.bodyCopy, { color: c.muted }]}>{person.bio || 'No bio added yet.'}</Text><Text style={[profileStyles.bodyCopy, { color: c.iconMuted }]}>Social profile links are not shared publicly for this profile.</Text></View>

   <View style={[profileStyles.statsCard, { backgroundColor: c.card, borderColor: c.border }]}>{metrics.map(([label, value, icon, color], index) => { const interactive = label === 'SQUAD' || label === 'KARMA'; return <Pressable accessibilityRole={interactive ? 'button' : undefined} disabled={!interactive} onPress={label === 'SQUAD' ? () => onOpenSquad(id) : label === 'KARMA' ? () => setTab('Reviews') : undefined} key={label} style={[profileStyles.stat, index > 0 && { borderLeftWidth: 1, borderLeftColor: c.border }]}><Icon name={icon} color={color} size={18} /><Text style={[profileStyles.statValue, { color: c.text }]}>{value ?? '—'}</Text><Text style={[profileStyles.statLabel, { color }]}>{label}</Text></Pressable>; })}</View>

   <View style={{ flexDirection: 'row', gap: 8 }}>
    {person.can_message && <View style={{ flex: 1 }}><Button label="Message" busy={busy} onPress={message} /></View>}
    <Pressable accessibilityRole="button" onPress={() => setContact(true)} style={{ flex: 1, minHeight: 46, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>Contact</Text></Pressable>
   </View>

   <View style={{ marginHorizontal: -13 }}><Pills underline values={['Upcoming', 'Completed', 'Vibes', 'Reviews']} selected={tab} onChange={setTab} /></View>
   {loadingHosted ? <Skeleton count={2} /> : tab === 'Reviews' ? <View style={profileStyles.emptyState}><Icon name="chatbox-ellipses-outline" color={c.iconMuted} size={38} /><Text style={[profileStyles.emptyTitle, { color: c.text }]}>Reviews</Text><Text style={[profileStyles.emptyText, { color: c.muted }]}>No public reviews are available yet.</Text></View> : tab === 'Vibes' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{vibes.map(vibe => <Pressable accessibilityRole="button" accessibilityLabel={`Open vibe ${vibe.caption || vibe.id}`} onPress={() => onOpenVibe(vibe.id)} key={vibe.id} style={{ width: '31.8%', aspectRatio: .8, borderRadius: 9, overflow: 'hidden', backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>{vibe.mediaType === 'image' ? <Image source={{ uri: vibe.mediaUrl }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="play-circle-outline" color="#FFF" size={32} /><Text style={{ color: c.muted, fontSize: 9, marginTop: 5 }}>Video</Text></>}</Pressable>)}{!vibes.length && <Text style={{ width: '100%', color: c.muted, fontSize: 12, textAlign: 'center', padding: 26 }}>No public Vibes yet.</Text>}</View> : visibleActivities.length ? visibleActivities.map(activity => <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${activity.title}`} key={activity.id} onPress={() => onOpenActivity(activity)} style={{ backgroundColor: c.card, padding: 15, borderRadius: 11, gap: 6 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{activity.title}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{activity.when} · {activity.where}</Text></Pressable>) : <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', padding: 26 }}>No {tab.toLowerCase()} activities.</Text>}
   </View>
  </ScrollView>}
  {contact && <ContactSheet contact={person} close={() => setContact(false)} />}
 </Page>;
}
function SocialLinks({ close }: { close: () => void }) {
 const c = usePalette(); const [values, setValues] = useState<Record<string, string>>({}), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
 useEffect(() => { void supabase.rpc('my_social_links').then(({ data, error }) => { if (error) setError(error.message); else setValues(data || {}); setLoading(false); }); }, []);
 return <Sheet title="Connect Socials" close={() => { if (!busy) close(); }}>{loading ? <Skeleton /> : <>{['instagram', 'linkedin', 'facebook', 'twitter', 'youtube'].map(key => <View key={key} style={{ gap: 7 }}><Text style={{ color: c.text, fontSize: 12 }}>{key[0].toUpperCase() + key.slice(1)}</Text><Field accessibilityLabel={key} value={values[key] || ''} placeholder="https://" onChangeText={v => setValues(current => ({ ...current, [key]: v }))} autoCapitalize="none" /></View>)}<ErrorLine text={error} /><Button label="Save Changes" busy={busy} onPress={() => { setBusy(true); void Promise.resolve(supabase.rpc('my_social_links', { p_patch: values })).then(({ error }) => { if (error) throw error; close(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }} /></>}</Sheet>;
}
