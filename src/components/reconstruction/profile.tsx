import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import type { AppData, Activity, Screen } from '../../../App';
import { VerifiedBadge } from '../verified-badge';
import { supabase } from '../../lib/supabase';
import { activitiesProductionService } from '../../services/activities-production';
import { listReels, type VibeReel } from '../../services/vibes-production';
import { realtimeChatService } from '../../services/realtime-chat';
import { publicProfileImageUrl, referenceDeltaService, type ProfilePhoto } from '../../services/reference-delta';
import { verificationService } from '../../services/verification-production';
import { profileProductionService } from '../../services/profile-production';
import { derivedTrustScore, trustScoreParts } from '../../domain/profile-signals';
import { safeSocialUrl, SOCIAL_PLATFORMS, type SocialLinks } from '../../domain/social-profiles';
import { SocialPlatformIcon } from './social-profiles';
import { Button, ErrorLine, Icon, Page, Sheet, Skeleton, usePalette } from './ui';
import { prepareReferenceActivities } from './feed-search';

type Metrics = { verified?: boolean; nitro?: number | null; karma?: number | null; trust_score?: number | null; rating?: number | null; activities?: number | null; squad?: number | null; phone_verified?: boolean; aadhaar_verified?: boolean; email_verified?: boolean; selfie_verified?: boolean; social_linked?: boolean; activities_joined?: number | null };
type Tab = 'Activities' | 'My Vibes' | 'Reviews' | 'Communities' | 'Drafts';
type Identity = { id: string; name: string; username: string; avatar?: string; bio?: string };
type GalleryItem = { uri: string; position: number };
type ProfileSummary = { location?: string | null; about?: string | null; interests?: string[]; communities?: string[] };
type ProfileReview = { id: number; rating: number; comment?: string | null; created_at: string; event_title?: string | null; rater_id: number; rater_username?: string | null; rater_name?: string | null; rater_avatar?: string | null };
const completed = (a: Activity) => a.status === 'completed' || Boolean(a.endsAt && new Date(a.endsAt).getTime() < Date.now());

function trustFrom(metrics: Metrics | null, socialLinked?: boolean) {
  return derivedTrustScore({
    email_verified: Boolean(metrics?.email_verified),
    phone_verified: Boolean(metrics?.phone_verified),
    selfie_verified: Boolean(metrics?.selfie_verified),
    aadhaar_verified: Boolean(metrics?.aadhaar_verified),
    social_linked: socialLinked ?? Boolean(metrics?.social_linked),
    rating: Number(metrics?.rating ?? metrics?.karma ?? 0),
    activities_joined: Number(metrics?.activities_joined ?? 0),
  });
}

function trustMetrics(value: unknown): Partial<Metrics> {
 const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const rawScore = typeof value === 'number' ? value : row.trust_score ?? row.score ?? row.total;
 const score = Number(rawScore);
 const joined = Number(row.activities_joined ?? row.joined_count);
 const rating = Number(row.rating ?? row.karma);
 const result: Partial<Metrics> = {};
 if (Number.isFinite(score)) result.trust_score = Math.max(0, Math.min(100, score));
 if (Number.isFinite(joined)) result.activities_joined = Math.max(0, joined);
 if (Number.isFinite(rating)) result.rating = rating;
 for (const key of ['email_verified', 'phone_verified', 'selfie_verified', 'aadhaar_verified', 'social_linked'] as const) {
  if (typeof row[key] === 'boolean') result[key] = row[key] as never;
 }
 return result;
}

function ProfileLayout({ identity, summary, metrics, links, gallery, linksAvailable = true, owner = false, back, store, settings, editSocial, editProfile, verify, partnerAccount, partnerDashboard, contact, message, busy, activities, squad, nitro, tab, setTab, onPhoto, children }: {
 identity: Identity; summary?: ProfileSummary; metrics: Metrics | null; links: SocialLinks; gallery: GalleryItem[]; linksAvailable?: boolean; owner?: boolean; back?: () => void; store?: () => void; settings?: () => void; editSocial?: () => void; editProfile?: () => void; verify?: () => void; partnerAccount?: { label: string; onPress: () => void }; partnerDashboard?: () => void; contact: () => void; message?: () => void; busy?: boolean; activities?: () => void; squad: () => void; nitro?: () => void; tab: Tab; setTab: (tab: Tab) => void; onPhoto?: (item: GalleryItem) => void; children: React.ReactNode;
}) {
 const c = usePalette(), [notice, setNotice] = useState(''), [verificationNotice, setVerificationNotice] = useState(false);
 const configured = SOCIAL_PLATFORMS.filter(item => safeSocialUrl(item.key, links[item.key]));
 const socials = configured;
 const scroll = useRef<ScrollView>(null);
 const showTab = (next: Tab) => { setTab(next); requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true })); };
 const initials = identity.name.split(' ').map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'WN';
 const rating = metrics?.rating ?? metrics?.karma;
 const score = owner ? trustFrom(metrics, linksAvailable ? configured.length > 0 : undefined) : metrics?.trust_score ?? null;
 const photos = gallery.length ? gallery.slice(0, 3) : identity.avatar ? [{ uri: identity.avatar, position: 1 }] : [];
 const values = [
  { label: 'Activities', value: metrics?.activities, icon: 'calendar-outline' as const, color: '#9563D4', action: activities ?? (() => showTab('Activities')) },
  { label: 'Squad', value: metrics?.squad, icon: 'people-outline' as const, color: '#7769D0', action: squad },
  { label: 'Karma', value: rating == null ? null : Number(rating).toFixed(1), icon: 'star-outline' as const, color: '#D98737', action: () => showTab('Reviews') },
  { label: 'Nitro Points', value: metrics?.nitro, icon: 'flash-outline' as const, color: '#AA62D0', action: nitro },
 ];
 return <Page>
  <View style={[s.header, { backgroundColor: c.card, borderColor: c.border }]}>
   {back && <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={s.headerAction}><Icon name="arrow-back" size={21} /></Pressable>}
   <Text numberOfLines={1} style={[s.username, { color: c.text }]}>{identity.username.replace(/^@/, '') || 'Profile'}</Text>
   {store && <Pressable accessibilityRole="button" accessibilityLabel="Nitro Store" onPress={store} style={s.headerAction}><Icon name="bag-handle-outline" size={22} /></Pressable>}
   {settings && <Pressable accessibilityRole="button" accessibilityLabel="Profile settings" onPress={settings} style={s.headerAction}><Icon name="menu-outline" size={25} /></Pressable>}
  </View>
  <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
   <LinearGradient colors={['#4F3BEE', '#7A5BFF', '#9B6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
    <View style={[s.heroOrb, s.heroOrbLarge]} /><View style={[s.heroOrb, s.heroOrbSmall]} />
    <View style={s.heroTop}>
     <View style={s.photoRow}>
      {photos.length ? photos.map((photo, index) => (
       <Pressable key={`${photo.position}-${photo.uri}`} accessibilityRole="button" accessibilityLabel={owner ? `Manage photo ${index + 1}` : `View photo ${index + 1}`} onPress={() => onPhoto?.(photo)} style={[s.heroPhotoWrap, index === 0 && s.heroPhotoPrimary, { zIndex: 3 - index, marginLeft: index ? -16 : 0 }]}>
        <Image source={{ uri: photo.uri }} style={s.heroPhoto} resizeMode="cover" />
        {owner && index === 0 ? <View style={s.primaryDot}><Text style={s.primaryDotText}>1</Text></View> : null}
       </Pressable>
      )) : <View style={[s.heroPhotoWrap, s.heroPhotoPrimary]}><LinearGradient colors={['#FFA350', '#DB6B3D']} style={[s.heroPhoto, s.center]}><Text style={s.initials}>{initials}</Text></LinearGradient></View>}
      {owner && photos.length < 3 ? <Pressable accessibilityRole="button" accessibilityLabel="Add profile photo" onPress={() => onPhoto?.({ uri: '', position: ([1, 2, 3].find(position => !photos.some(photo => photo.position === position)) ?? 3) })} style={[s.addPhoto, { marginLeft: photos.length ? -10 : 8 }]}><Icon name="add" color="#FFF" size={18} /></Pressable> : null}
     </View>
     <View style={s.heroIdentity}>
      <View style={s.nameRow}><Text numberOfLines={1} style={s.heroName}>{identity.name || identity.username}</Text><VerifiedBadge userId={identity.id} size={15} /></View>
      <Text numberOfLines={1} style={s.heroHandle}>@{identity.username.replace(/^@/, '')}</Text>
      {summary?.location ? <View style={s.heroLocation}><Icon name="location-outline" size={13} color="#EDE7FF" /><Text numberOfLines={1} style={s.heroBio}>{summary.location}</Text></View> : identity.bio ? <Text numberOfLines={1} style={s.heroBio}>{identity.bio}</Text> : null}
     </View>
    <View style={s.heroTrust} accessibilityLabel={score == null ? 'Trust Score unavailable' : `Trust Score ${score} out of 100`}>
      <Text style={s.heroTrustLabel}>Trust Score</Text>
      <Text style={s.heroTrustValue}>{score ?? '—'}<Text style={s.heroTrustMax}>{score == null ? '' : '/100'}</Text></Text>
     </View>
    </View>
   </LinearGradient>
   <View style={s.socials}>{socials.map(item => {
    const url = safeSocialUrl(item.key, links[item.key]);
    return <Pressable key={item.key} accessibilityRole={url ? 'link' : 'button'} accessibilityLabel={`${item.label}${url ? '' : ', not configured'}`} {...(Platform.OS === 'web' && url ? { href: url, hrefAttrs: { target: '_self', rel: 'noopener noreferrer' } } as any : {})} onPress={() => {
     if (!url) { setNotice(linksAvailable ? `No ${item.label} profile added yet.` : `${item.label} is not shared publicly yet.`); return; }
     setNotice(''); if (Platform.OS !== 'web') void Linking.openURL(url).catch(() => setNotice(`Could not open ${item.label}. Please try again.`));
    }} style={[s.social, { backgroundColor: c.card, borderColor: url ? `${item.color}55` : c.border }]}><SocialPlatformIcon platform={item.key} size={17} color={!url ? c.iconMuted : item.key === 'twitter' ? c.text : item.color} /></Pressable>;
   })}{owner && <Pressable accessibilityRole="button" accessibilityLabel="Add social profile" onPress={editSocial} style={[s.social, { borderStyle: 'dashed', borderColor: c.iconMuted }]}><Icon name="add" color={c.muted} size={19} /></Pressable>}</View>
   {!owner && (!linksAvailable || !configured.length) && <Text style={[s.secondary, { color: c.muted }]}>No social profiles are shared publicly yet.</Text>}
   {notice ? <View style={[s.notice, { backgroundColor: c.inset }]}><Text accessibilityLiveRegion="polite" style={[s.secondary, { color: c.muted }]}>{notice}</Text>{owner && <Pressable accessibilityRole="button" onPress={editSocial}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Add social profile</Text></Pressable>}</View> : null}
   {summary && (summary.location || summary.about || summary.interests?.length || summary.communities?.length) ? <View style={[s.profileSummary, { backgroundColor: c.card, borderColor: c.border }]}>
    {summary.location ? <View style={s.summaryLocation}><Icon name="location-outline" size={17} color={c.accent} /><Text style={[s.summaryText, { color: c.text }]}>{summary.location}</Text></View> : null}
    {summary.about ? <View style={{ gap: 5 }}><Text style={[s.summaryHeading, { color: c.text }]}>About</Text><Text style={[s.summaryText, { color: c.muted }]}>{summary.about}</Text></View> : null}
    {summary.interests?.length ? <View style={{ gap: 7 }}><Text style={[s.summaryHeading, { color: c.text }]}>Interests</Text><View style={s.summaryChips}>{summary.interests.map(interest => <View key={interest} style={[s.summaryChip, { backgroundColor: c.inset }]}><Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{interest}</Text></View>)}</View></View> : null}
   </View> : null}
   {partnerAccount || partnerDashboard ? <View style={{ gap: 10 }}>
    {partnerDashboard ? <Button label="Partner Dashboard" onPress={partnerDashboard} /> : null}
    {partnerAccount ? <Button label={partnerAccount.label} onPress={partnerAccount.onPress} /> : null}
   </View> : null}
   <Pressable accessibilityRole="button" accessibilityLabel={metrics?.verified ? 'View verified profile status' : owner ? 'Get verified' : 'View profile verification status'} onPress={owner ? verify : () => setVerificationNotice(true)} style={[s.verification, { backgroundColor: c.isDark ? '#28251D' : '#FFFAED', borderColor: c.isDark ? '#51462E' : '#F0E2BB' }]}>
    <View style={[s.trustShield, { backgroundColor: c.isDark ? '#45391F' : '#F8EAC1' }]}><Icon name="shield-checkmark-outline" color="#B88325" size={21} /></View><Text style={[s.verificationTitle, { color: c.text }]}>{metrics?.verified ? 'Badge of Trust' : owner ? 'Get Badge of Trust' : 'Profile verification'}</Text><Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{metrics?.verified ? 'Verified' : owner ? 'Get Verified' : 'View status'}</Text><Icon name="chevron-forward" color={c.accent} size={15} />
   </Pressable>
   <View style={s.metrics}>{values.map(item => { const card = <LinearGradient colors={c.isDark ? [`${item.color}28`, `${item.color}0A`] : [`${item.color}12`, '#FFFFFF']} style={[s.metric, { borderColor: `${item.color}90` }]}><View style={[s.metricIcon, { backgroundColor: `${item.color}18` }]}><Icon name={item.icon} color={item.color} size={19} /></View><Text style={[s.metricValue, { color: c.text }]}>{item.value ?? '—'}</Text><Text numberOfLines={2} style={[s.metricLabel, { color: item.color }]}>{item.label.toUpperCase()}</Text></LinearGradient>; return item.action ? <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.value ?? 'unavailable'}`} onPress={item.action} style={{ flex: 1, minWidth: 0 }}>{card}</Pressable> : <View key={item.label} accessibilityLabel={`${item.label}: ${item.value ?? 'unavailable'}`} style={{ flex: 1, minWidth: 0 }}>{card}</View>; })}</View>
   <View style={s.actions}>{(owner || message) && <Pressable accessibilityRole="button" disabled={busy} onPress={owner ? editProfile : message} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name={owner ? 'create-outline' : 'chatbubble-outline'} size={15} color={c.text} /><Text style={[s.actionText, { color: c.text }]}>{owner ? 'Edit profile' : busy ? 'Opening…' : 'Message'}</Text></Pressable>}{owner ? <Pressable accessibilityRole="button" onPress={verify} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="shield-checkmark-outline" size={15} color={c.accent} /><Text style={[s.actionText, { color: c.accent }]}>Verification</Text></Pressable> : <Pressable accessibilityRole="button" onPress={contact} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="call-outline" size={15} color={c.text} /><Text style={[s.actionText, { color: c.text }]}>Contact</Text></Pressable>}</View>
   <View style={s.achievements}><Text style={[s.sectionTitle, { color: c.text }]}>Achievements</Text><View accessibilityLabel="Achievements locked. Feature unlocks soon." style={[s.achievementCard, { backgroundColor: c.card, borderColor: c.border }]}><View style={s.badgeRow}>{(['trophy-outline', 'heart-outline', 'people-outline', 'calendar-outline', 'flame-outline'] as const).map((icon, i) => <View key={icon} style={[s.diamond, { borderColor: ['#6B84DD', '#C87CC8', '#51A8B0', '#D4A366', '#CF7783'][i], backgroundColor: c.inset }]}><View style={{ transform: [{ rotate: '-45deg' }] }}><Icon name={icon} size={24} color={['#6B84DD', '#C87CC8', '#51A8B0', '#D4A366', '#CF7783'][i]} /></View></View>)}</View><View style={[s.lockPill, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="lock-closed" color={c.accent} size={12} /><Text style={{ color: c.text, fontSize: 12, letterSpacing: .5, fontWeight: '800' }}>FEATURE UNLOCKS SOON</Text></View></View></View>
   <TrustCard metrics={metrics} socialLinked={linksAvailable ? configured.length > 0 : undefined} owner={owner} />
   <View style={[s.content, { backgroundColor: c.card, borderColor: c.border }]}><View style={[s.tabs, { borderColor: c.border }]}>{(['Activities', 'My Vibes', 'Reviews', 'Communities', ...(owner ? ['Drafts'] as const : [])] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[s.tab, { borderBottomColor: tab === item ? c.accent : 'transparent' }]}><Text style={{ color: tab === item ? c.accent : c.muted, fontSize: owner ? 10 : 11, fontWeight: tab === item ? '700' : '500' }}>{item === 'My Vibes' ? 'Vibes' : item}</Text></Pressable>)}</View>{children}</View>
  </ScrollView>
  {verificationNotice && <Sheet title="Verification status" close={() => setVerificationNotice(false)}><Text style={{ color: c.text }}>{metrics?.verified ? 'This profile has earned its verified badge through WeNitro’s verification system.' : 'This profile has not earned a verified badge yet.'}</Text><Text style={{ color: c.muted }}>Private verification details are not shared. Aadhaar verification is currently unavailable.</Text></Sheet>}
 </Page>;
}

function TrustCard({ metrics, socialLinked, owner }: { metrics: Metrics | null; socialLinked?: boolean; owner: boolean }) {
 const c = usePalette();
 const { parts, total } = trustScoreParts({
  email_verified: Boolean(metrics?.email_verified),
  phone_verified: Boolean(metrics?.phone_verified),
  selfie_verified: Boolean(metrics?.selfie_verified),
  aadhaar_verified: Boolean(metrics?.aadhaar_verified),
  social_linked: socialLinked ?? Boolean(metrics?.social_linked),
  rating: Number(metrics?.rating ?? metrics?.karma ?? 0),
  activities_joined: Number(metrics?.activities_joined ?? 0),
 });
 const detailsAvailable = owner || metrics?.email_verified !== undefined || metrics?.phone_verified !== undefined || metrics?.selfie_verified !== undefined || metrics?.aadhaar_verified !== undefined;
 const visibleParts = detailsAvailable ? parts : parts.filter(part => ['social', 'rating', 'activities'].includes(part.key));
 const displayedTotal = owner ? total : metrics?.trust_score ?? null;
 return <View style={[s.trust, { backgroundColor: c.card, borderColor: c.border }]}><View style={s.nameRow}><Icon name="shield-checkmark-outline" color={c.accent} size={19} /><Text style={[s.sectionTitle, { color: c.text }]}>Trust Score</Text></View><Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 3, marginLeft: 25 }}>{detailsAvailable ? `${metrics?.verified ? 'Verified Profile' : 'Standard Profile'} · verification + rating + activities joined` : 'Public signals only · private verification details are not exposed'}</Text><View style={s.trustBody}><View style={[s.scoreRing, { borderColor: c.isDark ? '#363248' : '#E9E5F6' }]}><Text style={[s.score, { color: c.text }]}>{displayedTotal ?? '—'}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{displayedTotal == null ? 'pending' : '/ 100'}</Text></View><View style={{ flex: 1, gap: 8 }}>{visibleParts.map(check => <View key={check.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name={check.done ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={check.done ? '#22A377' : c.iconMuted} /><Text style={{ flex: 1, color: check.done ? c.text : c.muted, fontSize: 12 }}>{check.label}</Text><Text style={{ color: check.done ? '#22A377' : c.iconMuted, fontSize: 12 }}>+{check.earned}</Text></View>)}</View></View></View>;
}

function Content({ tab, loading, vibes, rows, reviews, communities = [], openVibe, openActivity, openDraft }: { tab: Tab; loading: boolean; vibes: VibeReel[]; rows: Activity[]; reviews: ProfileReview[]; communities?: string[]; openVibe: (id: string) => void; openActivity: (a: Activity) => void; openDraft?: () => void }) {
 const c = usePalette();
 const upcoming = rows.filter(a => !completed(a));
 const done = rows.filter(completed);
 if (tab === 'Communities') return communities.length ? <View style={{ padding: 12, gap: 8 }}>{communities.map(community => <View key={community} style={[s.communityRow, { backgroundColor: c.inset }]}><Icon name="people-outline" color={c.accent} size={18} /><Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{community}</Text></View>)}</View> : <Empty icon="people-outline" text="No public communities to show yet." />;
 if (loading && !(tab === 'My Vibes' ? vibes.length : rows.length)) return <Skeleton count={2} />;
 if (tab === 'Reviews') return reviews.length ? <View>{reviews.map(review => <View key={review.id} style={[s.activity, { borderColor: c.border, alignItems: 'flex-start' }]}>{review.rater_avatar ? <Image source={{ uri: publicProfileImageUrl(review.rater_avatar) }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : <Icon name="person-circle-outline" size={36} color={c.iconMuted} />}<View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{review.rater_name || review.rater_username || 'WeNitro member'}</Text><Text style={{ color: '#D98737', fontSize: 12, fontWeight: '700' }}>★ {review.rating.toFixed(1)}</Text></View>{review.comment ? <Text style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>{review.comment}</Text> : null}{review.event_title ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{review.event_title}</Text> : null}</View></View>)}</View> : <Empty icon="chatbox-ellipses-outline" text="No public reviews are available yet. Karma rating points to this section." />;
 if (tab === 'My Vibes') return vibes.length ? <View style={s.grid}>{vibes.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`Open vibe ${v.caption || v.id}`} onPress={() => openVibe(v.id)} style={[s.vibe, { backgroundColor: c.inset }]}>{v.mediaType === 'image' ? <Image source={{ uri: v.mediaUrl }} style={{ width: '100%', height: '100%' }} /> : <Icon name="play-circle-outline" size={32} color={c.accent} />}<View style={s.vibeMeta}><Icon name="heart-outline" size={12} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 12 }}>{v.likeCount}</Text><Icon name="chatbubble-outline" size={12} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 12 }}>{v.commentCount}</Text></View></Pressable>)}</View> : <Empty icon="film-outline" text="No vibes posted yet." />;
 if (tab === 'Activities') return (!upcoming.length && !done.length) ? <Empty icon="calendar-clear-outline" text="No activities yet." /> : <View>
  <Text style={[s.subHead, { color: c.muted }]}>Upcoming</Text>
  {upcoming.length ? upcoming.map(a => <ActivityRow key={a.id} activity={a} onPress={() => openActivity(a)} />) : <Text style={{ color: c.muted, fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 }}>No upcoming activities.</Text>}
  <Text style={[s.subHead, { color: c.muted }]}>Completed</Text>
  {done.length ? done.map(a => <ActivityRow key={a.id} activity={a} onPress={() => openActivity(a)} />) : <Text style={{ color: c.muted, fontSize: 12, paddingHorizontal: 12, paddingBottom: 12 }}>No completed activities.</Text>}
 </View>;
 return rows.length ? <View>{rows.map(a => <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Open activity ${a.title}`} onPress={() => tab === 'Drafts' ? openDraft?.() : openActivity(a)} style={[s.activity, { borderColor: c.border }]}><Icon name="calendar-outline" size={24} color={c.accent} /><View style={{ flex: 1, gap: 5 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{a.title}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{a.when}{a.where ? ` · ${a.where}` : ''}</Text></View><Icon name="chevron-forward" size={15} color={c.iconMuted} /></Pressable>)}</View> : <Empty icon="calendar-clear-outline" text="No draft activities." />;
}
function ActivityRow({ activity, onPress }: { activity: Activity; onPress: () => void }) {
 const c = usePalette();
 return <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${activity.title}`} onPress={onPress} style={[s.activity, { borderColor: c.border }]}><Icon name="calendar-outline" size={24} color={c.accent} /><View style={{ flex: 1, gap: 5 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{activity.title}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{activity.when}{activity.where ? ` · ${activity.where}` : ''}</Text></View><Icon name="chevron-forward" size={15} color={c.iconMuted} /></Pressable>;
}
function Empty({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) { const c = usePalette(); return <View style={s.empty}><Icon name={icon} color={c.iconMuted} size={32} /><Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{text}</Text></View>; }
function ContactSheet({ contact, close }: { contact: { email?: string | null; phone?: string | null }; close: () => void }) { const c = usePalette(); return <Sheet title="Contact" centered close={close}>{contact.email ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('mailto:' + contact.email)}><Text style={{ color: c.accent }}>{contact.email}</Text></Pressable> : <Text style={{ color: c.muted }}>Email is private or not added.</Text>}{contact.phone ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('tel:' + contact.phone)}><Text style={{ color: c.accent }}>{contact.phone}</Text></Pressable> : <Text style={{ color: c.muted }}>Phone is private or not added.</Text>}</Sheet>; }

async function pickProfileImage() {
 const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
 if (!permission.granted) throw new Error('Photo-library permission is required to change photos.');
 const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 });
 return result.canceled ? null : result.assets[0];
}

export function ReferenceProfile({ data, setData, go, openActivity, openDraft, openVibe, openSquad }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void; openDraft: () => void; openVibe: (id: string) => void; openSquad: () => void }) {
 const [metrics, setMetrics] = useState<Metrics | null>(null), [links, setLinks] = useState<SocialLinks>({});
 const [summary, setSummary] = useState<ProfileSummary>({ location: data.location, about: data.bio, interests: data.interests });
 const [tab, setTab] = useState<Tab>('Activities'), [error, setError] = useState(''), [loading, setLoading] = useState(true), [vibes, setVibes] = useState<VibeReel[]>([]), [activities, setActivities] = useState<Activity[]>([]), [cursor, setCursor] = useState<string | null>(null), [contact, setContact] = useState<{ email?: string; phone?: string } | null>(null);
 const [photos, setPhotos] = useState<ProfilePhoto[]>([]), [reviews, setReviews] = useState<ProfileReview[]>([]), [activePhoto, setActivePhoto] = useState<GalleryItem | null>(null), [photoBusy, setPhotoBusy] = useState(false);
 const request = useRef(0);
 const refreshMetrics = () => Promise.all([
  supabase.rpc('my_profile_metrics'),
  supabase.rpc('my_social_links'),
  verificationService.syncMethods(),
  supabase.from('tbl_event_participants').select('id', { count: 'exact', head: true }).eq('user_id', Number(data.userId)).in('status', ['going', 'approved', 'paid']),
  referenceDeltaService.listProfilePhotos(),
  profileProductionService.loadProfile().catch(() => null),
  Promise.resolve(supabase.rpc('my_trust_score')).catch(() => ({ data: null, error: null })),
  Promise.resolve(supabase.rpc('profile_reviews', { p_user_id: Number(data.userId) })).catch(() => ({ data: [], error: null })),
 ]).then(([m, l, methods, joined, gallery, details, trust, reviewResult]) => {
  if (m.error || l.error) { setError(m.error?.message || l.error?.message || 'Could not load profile.'); return; }
  const base = (m.data || {}) as Metrics;
  const fallback = { ...base, verified: methods.is_verified, email_verified: methods.email_verified, selfie_verified: methods.live_photo_verified, phone_verified: methods.phone_verified || base.phone_verified, activities_joined: joined.count ?? 0, social_linked: Boolean((l.data as SocialLinks) && Object.values(l.data || {}).some(Boolean)), trust_score: derivedTrustScore({ email_verified: methods.email_verified, phone_verified: methods.phone_verified || Boolean(base.phone_verified), selfie_verified: methods.live_photo_verified, aadhaar_verified: Boolean(base.aadhaar_verified), social_linked: Boolean((l.data as SocialLinks) && Object.values(l.data || {}).some(Boolean)), rating: Number(base.rating ?? 0), activities_joined: joined.count ?? 0 }) };
  setMetrics({ ...fallback, ...(trust.error ? {} : trustMetrics(trust.data)) });
  setLinks(l.data || {});
  setReviews(Array.isArray(reviewResult.data) ? reviewResult.data as ProfileReview[] : []);
  setPhotos(gallery.filter(photo => photo.position <= 3));
  if (details) setSummary({ location: details.profile.location, about: details.profile.about || details.profile.bio, interests: details.interests.map(item => item.name) });
 });
 useEffect(() => { let active = true; void refreshMetrics().catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [data.userId]);
 const load = async (more = false) => { const token = ++request.current; setLoading(true); setError(''); try {
  if (tab === 'Reviews' || tab === 'Communities') return;
  if (tab === 'My Vibes') { const page = await listReels({ ownOnly: true, cursor: more ? cursor : null, pageSize: 20 }); if (token !== request.current) return; setVibes(current => more ? [...current, ...page.reels] : page.reels); setCursor(page.nextCursor); }
  else { const page = tab === 'Drafts' ? await activitiesProductionService.listHosted({ statuses: ['draft'], pageSize: 50, page: more ? Number(cursor || 1) : 1 }) : await activitiesProductionService.listVibeEligible(more ? cursor || undefined : undefined); const items = await prepareReferenceActivities(page.items); if (token !== request.current) return; setActivities(current => more ? [...current, ...items] : items); setData(current => current.userId !== data.userId ? current : ({ ...current, activities: [...current.activities.filter(a => !items.some(i => i.id === a.id)), ...items] })); setCursor('nextCursor' in page ? page.nextCursor : page.hasMore ? String(page.page + 1) : null); }
 } catch (e: any) { if (token === request.current) setError(e.message); } finally { if (token === request.current) setLoading(false); } };
 useEffect(() => { setActivities([]); setVibes([]); setCursor(null); void load(); return () => { request.current++; }; }, [tab, data.userId]);
 const rows = tab === 'Drafts' ? activities.filter(a => a.status === 'draft') : activities.filter(a => a.status !== 'draft');
 const gallery: GalleryItem[] = [...new Map([{ uri: data.avatarUri || '', position: 1 }, ...photos.map(photo => ({ uri: photo.public_url, position: photo.position }))].filter(item => item.uri).map(item => [item.position, item])).values()].slice(0, 3);
 const openContact = () => { void supabase.rpc('profile_contact', { p_user_id: Number(data.userId) }).then(({ data: value, error: failure }) => { if (failure) setError(failure.message); else setContact(value); }); };
 const runPhoto = async (work: () => Promise<void>) => { setPhotoBusy(true); setError(''); try { await work(); await refreshMetrics(); } catch (caught: any) { setError(caught.message || 'Could not update photos.'); } finally { setPhotoBusy(false); setActivePhoto(null); } };
 const communityNames = data.communities.filter(room => room.membership === 'joined' || room.membership === 'created').map(room => room.name);
 const partnerLabel = data.partnerProfile ? data.partnerProfile.status === 'DRAFT' ? 'Complete Partner Application' : data.partnerProfile.status === 'UNDER_REVIEW' ? 'Partner Application · Under Review' : 'Partner Account · View Details' : data.partnerUnavailable ? 'Partner Account' : 'Become a Partner';
 return <><ProfileLayout identity={{ id: data.userId!, name: data.name, username: data.username, avatar: data.avatarUri, bio: data.bio }} summary={{ ...summary, communities: communityNames }} metrics={metrics} links={links} gallery={gallery} owner store={() => go('shop')} settings={() => go('settings')} editSocial={() => go('socialLinks')} editProfile={() => go('editProfile')} verify={() => go('verification')} partnerAccount={{ label: partnerLabel, onPress: () => go('partnerAccount') }} partnerDashboard={data.accountType === 'partner' ? () => go('partnerDashboard') : undefined} contact={openContact} activities={() => go('activityHistory')} squad={openSquad} nitro={() => go('nitroHistory')} tab={tab} setTab={setTab} onPhoto={setActivePhoto}><ErrorLine text={error} /><Content tab={tab} loading={loading} vibes={vibes} rows={rows} reviews={reviews} communities={communityNames} openVibe={openVibe} openActivity={a => openActivity(a.id)} openDraft={openDraft} />{cursor && !['Reviews', 'Communities'].includes(tab) && <View style={{ padding: 10 }}><Button label="Load more" busy={loading} onPress={() => void load(true)} /></View>}</ProfileLayout>
 {activePhoto ? <Sheet title={activePhoto.uri ? 'Profile photo' : 'Add photo'} close={() => { if (!photoBusy) setActivePhoto(null); }}>
  {activePhoto.uri ? <Image source={{ uri: activePhoto.uri }} style={{ width: '100%', height: 220, borderRadius: 14, backgroundColor: '#EEE' }} /> : <Text style={{ color: '#73809A' }}>Add up to 3 photos others can view.</Text>}
  <Button label={activePhoto.uri ? 'Change photo' : 'Choose photo'} busy={photoBusy} onPress={() => void runPhoto(async () => { const asset = await pickProfileImage(); if (!asset?.uri) return; const saved = await referenceDeltaService.uploadProfilePhoto(activePhoto.position || gallery.length + 1, asset.uri, asset.mimeType); if ((activePhoto.position || 1) === 1) setData(current => ({ ...current, avatarUri: saved.public_url })); })} />
  {activePhoto.uri && activePhoto.position !== 1 ? <Button label="Set as primary" busy={photoBusy} onPress={() => void runPhoto(async () => { const url = await referenceDeltaService.setPrimaryProfilePhoto(activePhoto.position, activePhoto.uri, data.avatarUri); setData(current => ({ ...current, avatarUri: url })); })} /> : null}
  {activePhoto.uri ? <Button label="Delete" danger busy={photoBusy} onPress={() => void runPhoto(async () => { if (activePhoto.position === 1) { const fallback = await referenceDeltaService.removePrimaryProfilePhoto(); setData(current => ({ ...current, avatarUri: fallback || undefined })); } else { const photo = photos.find(item => item.position === activePhoto.position); if (photo) await referenceDeltaService.removeProfilePhoto(photo); } })} /> : null}
 </Sheet> : null}
 {contact && <ContactSheet contact={contact} close={() => setContact(null)} />}</>;
}

export function ReferenceMemberProfile({ id, back, onConversation, onOpenActivity, onOpenVibe, onOpenSquad }: { id: string; back: () => void; onConversation: (id: string, person: any) => void; onOpenActivity: (activity: Activity) => void; onOpenVibe: (id: string) => void; onOpenSquad: (id: string) => void }) {
 const [person, setPerson] = useState<any>(null), [metrics, setMetrics] = useState<Metrics | null>(null), [links, setLinks] = useState<SocialLinks>({}), [vibes, setVibes] = useState<VibeReel[]>([]), [reviews, setReviews] = useState<ProfileReview[]>([]), [hosted, setHosted] = useState<Activity[]>([]), [tab, setTab] = useState<Tab>('Activities'), [error, setError] = useState(''), [loading, setLoading] = useState(true), [contact, setContact] = useState(false), [busy, setBusy] = useState(false), [gallery, setGallery] = useState<GalleryItem[]>([]), [preview, setPreview] = useState<string | null>(null);
 useEffect(() => { let active = true; setLoading(true); setPerson(null); setError(''); void (async () => {
  const userId = Number(id);
  const p = await supabase.rpc('profile_contact', { p_user_id: userId });
  if (p.error) throw p.error;
  if (!active) return;
  setPerson(p.data);
  setLinks(p.data?.social_links || {});
  const [m, a, v, squad, photos, joined, trust, reviews] = await Promise.all([
   supabase.from('tbl_users').select('id,rating,points,isverified').eq('id', userId).maybeSingle(),
   activitiesProductionService.discover({ ownerId: id, pageSize: 50, upcomingOnly: false, sort: 'latest' }),
   listReels({ userId: id, pageSize: 50 }),
   supabase.from('tbl_friends').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},friend_id.eq.${userId}`),
   referenceDeltaService.listPublicProfilePhotos(userId),
   supabase.from('tbl_event_participants').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['going', 'approved', 'paid']),
   Promise.resolve(supabase.rpc('profile_trust_score', { p_user_id: userId })).catch(() => ({ data: null, error: null })),
   Promise.resolve(supabase.rpc('profile_reviews', { p_user_id: userId })).catch(() => ({ data: [], error: null })),
  ]);
  const items = await prepareReferenceActivities(a.items);
  if (!active) return;
  setHosted(items); setVibes(v.reels); setReviews(Array.isArray(reviews.data) ? reviews.data as ProfileReview[] : []);
  const socialLinked = p.data?.social_links != null && Object.values(p.data.social_links || {}).some(Boolean);
  setMetrics({ verified: p.data?.is_verified === true || m.data?.isverified === 1, activities: a.total ?? items.length, squad: squad.error ? null : squad.count, nitro: m.data?.points == null ? null : Number(m.data.points), karma: m.data?.rating == null ? null : Number(m.data.rating), rating: m.data?.rating == null ? null : Number(m.data.rating), ...(trust.error ? {} : trustMetrics(trust.data)), activities_joined: joined.count ?? 0, social_linked: socialLinked });
  setGallery([...new Map([{ uri: publicProfileImageUrl(p.data?.profile_image), position: 1 }, ...photos.map(photo => ({ uri: photo.public_url, position: photo.position }))].filter(item => item.uri).map(item => [item.position, item])).values()].slice(0, 3));
  if (m.error || squad.error) setError('Some public profile details could not be loaded. Please reopen this profile.');
 })().catch(e => active && setError(e.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [id]);
 const message = () => { setBusy(true); void realtimeChatService.createDirectConversation(Number(id)).then(room => onConversation(String(room), person)).catch(e => setError(e.message)).finally(() => setBusy(false)); };
 if (!person) return <Page><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={s.headerAction}><Icon name="arrow-back" /></Pressable><ErrorLine text={error} />{loading && <Skeleton />}</Page>;
 const communities = Array.isArray(person.communities) ? person.communities : [];
 return <><ProfileLayout identity={{ id, name: person.fullname, username: person.username || '', avatar: publicProfileImageUrl(person.profile_image), bio: person.bio }} summary={{ location: person.location, about: person.about || person.bio, interests: Array.isArray(person.interests) ? person.interests : [], communities }} metrics={metrics} links={links} gallery={gallery} linksAvailable={person.social_links != null} back={back} contact={() => setContact(true)} message={person.can_message ? message : undefined} busy={busy} squad={() => onOpenSquad(id)} tab={tab} setTab={setTab} onPhoto={photo => setPreview(photo.uri)}><ErrorLine text={error} /><Content tab={tab} loading={loading} vibes={vibes} rows={hosted.filter(a => a.status !== 'draft')} reviews={reviews} communities={communities} openVibe={onOpenVibe} openActivity={onOpenActivity} /></ProfileLayout>
 {preview ? <Sheet title="Profile photo" close={() => setPreview(null)}><Image source={{ uri: preview }} style={{ width: '100%', height: 280, borderRadius: 14 }} /></Sheet> : null}
 {contact && <ContactSheet contact={person} close={() => setContact(false)} />}</>;
}

const s = StyleSheet.create({
 header: { height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, headerAction: { width: 38, height: 44, justifyContent: 'center', alignItems: 'center' }, username: { flex: 1, fontSize: 17, fontWeight: '700', paddingLeft: 2 },
 body: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, gap: 12 },
 hero: { borderRadius: 22, minHeight: 144, paddingVertical: 22, paddingHorizontal: 15, overflow: 'hidden', justifyContent: 'center' },
 heroOrb: { position: 'absolute', borderRadius: 160, backgroundColor: '#FFFFFF', opacity: .08 },
 heroOrbLarge: { width: 260, height: 260, left: -95, bottom: -185 },
 heroOrbSmall: { width: 150, height: 150, right: -40, top: -80 },
 heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
 photoRow: { flexDirection: 'row', alignItems: 'center' },
 heroPhotoWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden' },
 heroPhotoPrimary: { width: 64, height: 64, borderRadius: 32 },
 heroPhoto: { width: '100%', height: '100%' },
 addPhoto: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#FFFFFF88', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
 primaryDot: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFE28A', alignItems: 'center', justifyContent: 'center' },
 primaryDotText: { fontSize: 11, fontWeight: '800', color: '#4F3BEE' },
 heroIdentity: { flex: 1, minWidth: 0, gap: 2 },
 heroName: { color: '#FFF', fontSize: 16, fontWeight: '800', flexShrink: 1 },
 heroHandle: { color: '#E4DCFF', fontSize: 12, fontWeight: '600' },
 heroBio: { color: '#EDE7FF', fontSize: 12, lineHeight: 17 }, heroLocation: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 150 },
 heroTrust: { alignItems: 'flex-end', gap: 1 },
 heroTrustLabel: { color: '#E4DCFF', fontSize: 12, fontWeight: '600' },
 heroTrustValue: { color: '#FFF', fontSize: 20, fontWeight: '800' },
 heroTrustMax: { color: '#E4DCFF', fontSize: 12, fontWeight: '600' },
 identity: { flexDirection: 'row', alignItems: 'center', gap: 14 }, avatar: { width: 61, height: 61, borderRadius: 31 }, center: { alignItems: 'center', justifyContent: 'center' }, initials: { fontSize: 22, fontWeight: '600', color: '#FFF' }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { fontSize: 17, fontWeight: '700', flexShrink: 1 }, secondary: { fontSize: 12, lineHeight: 18 },
 socials: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: -2 }, social: { width: 31, height: 31, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, notice: { padding: 10, borderRadius: 10, gap: 5 },
 profileSummary: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 12 }, summaryLocation: { flexDirection: 'row', alignItems: 'center', gap: 7 }, summaryHeading: { fontSize: 14, fontWeight: '700' }, summaryText: { flex: 1, fontSize: 13, lineHeight: 19 }, summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, summaryChip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
 verification: { minHeight: 51, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, trustShield: { width: 33, height: 33, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, verificationTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
 metrics: { flexDirection: 'row', gap: 7 }, metric: { minHeight: 104, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 }, metricIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, metricValue: { fontSize: 16, fontWeight: '800' }, metricLabel: { fontSize: 12, lineHeight: 14, fontWeight: '700', letterSpacing: 0, textAlign: 'center' },
 actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 9, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 12, fontWeight: '600' },
 achievements: { gap: 9, marginTop: 3 }, sectionTitle: { fontSize: 14, fontWeight: '700' }, achievementCard: { height: 90, borderWidth: 1, borderRadius: 14, overflow: 'hidden', justifyContent: 'center' }, badgeRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 9, opacity: .35 }, diamond: { width: 41, height: 41, borderWidth: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }, lockPill: { position: 'absolute', alignSelf: 'center', top: 32, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
 trust: { padding: 14, borderRadius: 18, borderWidth: 1, shadowColor: '#20214F', shadowOpacity: .035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, trustBody: { flexDirection: 'row', gap: 17, alignItems: 'center', marginTop: 12 }, scoreRing: { width: 87, height: 87, borderWidth: 7, borderRadius: 44, alignItems: 'center', justifyContent: 'center' }, score: { fontSize: 28, fontWeight: '800' },
 content: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' }, tabs: { height: 44, flexDirection: 'row', borderBottomWidth: 1 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 }, empty: { paddingVertical: 30, paddingHorizontal: 15, alignItems: 'center', gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 6 }, vibe: { width: '32.3%', aspectRatio: .82, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, vibeMeta: { position: 'absolute', bottom: 4, right: 4, borderRadius: 7, backgroundColor: '#151425AA', padding: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }, activity: { minHeight: 70, padding: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
 communityRow: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
 subHead: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
});
