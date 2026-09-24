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
type ProfileCommunity = { id?: string; name: string };
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

const interestAppearance = (label: string): { icon: React.ComponentProps<typeof Icon>['name']; color: string } => {
 const key = label.toLowerCase();
 if (/travel|trek|outdoor|explor/.test(key)) return { icon: 'airplane-outline', color: '#438DDD' };
 if (/sport|badminton|fitness|run|gym/.test(key)) return { icon: 'fitness-outline', color: '#8058DB' };
 if (/read|book|learn/.test(key)) return { icon: 'book-outline', color: '#CF5CAA' };
 if (/coffee|food|cook/.test(key)) return { icon: 'cafe-outline', color: '#CC873E' };
 if (/music|dance/.test(key)) return { icon: 'musical-notes-outline', color: '#37A776' };
 if (/photo|art|creat/.test(key)) return { icon: 'color-palette-outline', color: '#9762D7' };
 if (/well|yoga|nature|environment/.test(key)) return { icon: 'leaf-outline', color: '#37A776' };
 return { icon: 'sparkles-outline', color: '#7765D5' };
};

/** Lightweight decorative landscape: no network request or downloaded stock art. */
function ProfileLandscape() {
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.landscape}>
  <View style={s.landscapeSun} /><View style={[s.landscapeCloud, { top: 14, left: 17 }]} /><View style={[s.landscapeCloud, { top: 31, right: 9, width: 21 }]} />
  <View style={[s.mountain, s.mountainBack]} /><View style={[s.mountain, s.mountainMiddle]} /><View style={[s.mountain, s.mountainFront]} />
  <View style={s.landscapeGround} /><View style={s.landscapeTrail} />
  <View style={[s.landscapeLeaf, { left: 8, bottom: 9, transform: [{ rotate: '-30deg' }] }]} /><View style={[s.landscapeLeaf, { left: 21, bottom: 7, transform: [{ rotate: '28deg' }] }]} />
 </View>;
}

function ProfileLayout({ identity, summary, metrics, links, gallery, linksAvailable = true, owner = false, back, store, settings, editSocial, editProfile, verify, partnerAccount, partnerDashboard, contact, message, busy, activities, squad, nitro, tab, setTab, onPhoto, children }: {
 identity: Identity; summary?: ProfileSummary; metrics: Metrics | null; links: SocialLinks; gallery: GalleryItem[]; linksAvailable?: boolean; owner?: boolean; back?: () => void; store?: () => void; settings?: () => void; editSocial?: () => void; editProfile?: () => void; verify?: () => void; partnerAccount?: { label: string; onPress: () => void }; partnerDashboard?: () => void; contact: () => void; message?: () => void; busy?: boolean; activities?: () => void; squad: () => void; nitro?: () => void; tab: Tab; setTab: (tab: Tab) => void; onPhoto?: (item: GalleryItem) => void; children: React.ReactNode;
}) {
 const c = usePalette(), [notice, setNotice] = useState(''), [verificationNotice, setVerificationNotice] = useState(false), [trustOpen, setTrustOpen] = useState(false), [pointsOpen, setPointsOpen] = useState(false), [aboutExpanded, setAboutExpanded] = useState(false), [interestsExpanded, setInterestsExpanded] = useState(false);
 const configured = SOCIAL_PLATFORMS.filter(item => safeSocialUrl(item.key, links[item.key]));
 const socials = configured;
 const scroll = useRef<ScrollView>(null), contentTop = useRef(0);
 const showTab = (next: Tab) => { setTab(next); requestAnimationFrame(() => scroll.current?.scrollTo({ y: contentTop.current, animated: true })); };
 const initials = (identity.name || identity.username || 'WeNitro member').split(' ').map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'WN';
 const rating = metrics?.rating ?? metrics?.karma;
 const score = owner ? metrics ? trustFrom(metrics, linksAvailable ? configured.length > 0 : undefined) : null : metrics?.trust_score ?? null;
 const photos = gallery.length ? gallery.slice(0, 3) : identity.avatar ? [{ uri: identity.avatar, position: 1 }] : [];
 const values = [
  { label: 'Activities', value: metrics?.activities, icon: 'calendar-outline' as const, color: '#9563D4', action: activities ?? (() => showTab('Activities')) },
  { label: 'Squad', value: metrics?.squad, icon: 'people-outline' as const, color: '#7769D0', action: squad },
  { label: 'Karma', value: rating == null ? null : Number(rating).toFixed(1), icon: 'star-outline' as const, color: '#D98737', action: () => showTab('Reviews') },
  { label: 'Nitro Points', value: metrics?.nitro, icon: 'flash-outline' as const, color: '#36A676', action: nitro ?? (() => setPointsOpen(true)) },
 ];
 return <Page>
  <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
   <LinearGradient colors={['#7229E8', '#3520BD', '#13086B']} locations={[0, .48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
     <View style={[s.heroOrb, s.heroOrbLarge]} /><View style={[s.heroOrb, s.heroOrbSmall]} />
     {[0, 1, 2, 3, 4].map(wave => <View key={wave} style={[s.heroWave, { bottom: -107 + wave * 9, right: -70 - wave * 8, opacity: .16 - wave * .02 }]} />)}
     {[0, 1, 2, 3, 4, 5].map(dot => <View key={dot} style={[s.heroSpark, { left: 21 + dot * 43, top: 73 + (dot % 3) * 38, opacity: .17 + (dot % 2) * .13 }]} />)}
    </View>
    <View style={s.heroToolbar}>
     {back ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={s.heroControl}><Icon name="arrow-back" size={20} color="#FFF" /></Pressable> : <Text style={s.heroToolbarTitle}>My profile</Text>}
     <View style={{ flex: 1 }} />
     {store && <Pressable accessibilityRole="button" accessibilityLabel="Nitro Store" onPress={store} style={s.heroControl}><Icon name="bag-handle-outline" size={20} color="#FFF" /></Pressable>}
     {settings && <Pressable accessibilityRole="button" accessibilityLabel="Profile settings" onPress={settings} style={s.heroControl}><Icon name="settings-outline" size={20} color="#FFF" /></Pressable>}
    </View>
    <View style={s.heroTop}>
     <View style={s.photoRow}>
      {photos.length ? <Pressable accessibilityRole="button" accessibilityLabel={owner ? 'Manage photo 1' : 'View photo 1'} onPress={() => onPhoto?.(photos[0])} style={[s.heroPhotoWrap, s.heroPhotoPrimary]}><Image source={{ uri: photos[0].uri }} style={s.heroPhoto} resizeMode="cover" /></Pressable> : <View style={[s.heroPhotoWrap, s.heroPhotoPrimary]}><LinearGradient colors={['#B798FF', '#6A4DC3']} style={[s.heroPhoto, s.center]}><Text style={s.initials}>{initials}</Text></LinearGradient></View>}
      {owner ? <View accessibilityLabel="Your current signed-in profile" style={s.onlineDot} /> : null}
     </View>
     <View style={s.heroIdentity}>
      <View style={s.nameRow}><Text numberOfLines={1} style={s.heroName}>{identity.name || identity.username}</Text><VerifiedBadge userId={identity.id} size={15} /></View>
      <Text numberOfLines={1} style={s.heroHandle}>@{identity.username.replace(/^@/, '')}</Text>
      {summary?.location ? <View style={s.heroLocation}><Icon name="location-outline" size={13} color="#EDE7FF" /><Text numberOfLines={1} style={s.heroBio}>{summary.location}</Text></View> : identity.bio ? <Text numberOfLines={1} style={s.heroBio}>{identity.bio}</Text> : null}
     </View>
    <Pressable accessibilityRole="button" onPress={() => setTrustOpen(true)} style={s.heroTrust} accessibilityLabel={score == null ? 'Trust Score unavailable' : `Trust Score ${score} out of 100. View breakdown`}>
      <Text style={s.heroTrustLabel}>Trust Score</Text>
      <Text style={s.heroTrustValue}>{score ?? '—'}<Text style={s.heroTrustMax}>{score == null ? '' : '/100'}</Text></Text>
      <View style={s.heroTrustState}><Icon name={metrics?.verified ? 'shield-checkmark' : 'shield-outline'} size={13} color={metrics?.verified ? '#39E7A0' : '#DBD6FF'} /><Text style={{ fontSize: 10, fontWeight: '700', color: metrics?.verified ? '#39E7A0' : '#DBD6FF' }}>{metrics?.verified ? 'Verified' : 'View score'}</Text></View>
     </Pressable>
    </View>
    {photos.length > 1 || owner ? <View style={s.photoGallery}>{photos.slice(1).map((photo, index) => <Pressable key={photo.position} accessibilityRole="button" accessibilityLabel={owner ? `Manage photo ${index + 2}` : `View photo ${index + 2}`} onPress={() => onPhoto?.(photo)} style={s.extraPhoto}><Image source={{ uri: photo.uri }} style={s.heroPhoto} /></Pressable>)}{owner && photos.length < 3 ? <Pressable accessibilityRole="button" accessibilityLabel="Add profile photo" onPress={() => onPhoto?.({ uri: '', position: [1, 2, 3].find(position => !photos.some(photo => photo.position === position)) ?? 3 })} style={s.addPhoto}><Icon name="camera-outline" color="#FFF" size={15} /><Text style={s.photoCount}>{photos.length}/3</Text><Icon name="add" color="#FFF" size={13} /></Pressable> : null}</View> : null}
   <View style={s.socials}>{socials.map(item => {
    const url = safeSocialUrl(item.key, links[item.key]);
    return <Pressable key={item.key} accessibilityRole={url ? 'link' : 'button'} accessibilityLabel={`${item.label}${url ? '' : ', not configured'}`} {...(Platform.OS === 'web' && url ? { href: url, hrefAttrs: { target: '_self', rel: 'noopener noreferrer' } } as any : {})} onPress={() => {
     if (!url) { setNotice(linksAvailable ? `No ${item.label} profile added yet.` : `${item.label} is not shared publicly yet.`); return; }
     setNotice(''); if (Platform.OS !== 'web') void Linking.openURL(url).catch(() => setNotice(`Could not open ${item.label}. Please try again.`));
    }} style={[s.social, { backgroundColor: c.card, borderColor: url ? `${item.color}55` : c.border }]}><SocialPlatformIcon platform={item.key} size={17} color={!url ? c.iconMuted : item.key === 'twitter' ? c.text : item.color} /></Pressable>;
   })}{owner && <Pressable accessibilityRole="button" accessibilityLabel="Add social profile" onPress={editSocial} style={[s.social, { borderStyle: 'dashed', borderColor: '#FFFFFF88', backgroundColor: '#FFFFFF15' }]}><Icon name="add" color="#FFF" size={19} /></Pressable>}{owner && !configured.length ? <Text style={{ color: '#E5DFFF', fontSize: 11 }}>Add your social profiles</Text> : null}</View>
   {!!summary?.interests?.length && <View style={s.heroInterests}>{summary.interests.slice(0, 3).map(interest => <View key={interest} style={s.heroInterest}><Icon name={interestAppearance(interest).icon} size={12} color="#E4DDFF" /><Text numberOfLines={1} style={s.heroInterestText}>{interest}</Text></View>)}{summary.interests.length > 3 ? <Text style={[s.heroInterestText, s.heroInterestMore]}>+{summary.interests.length - 3}</Text> : null}</View>}
   </LinearGradient>
   {notice ? <View style={[s.notice, { backgroundColor: c.inset }]}><Text accessibilityLiveRegion="polite" style={[s.secondary, { color: c.muted }]}>{notice}</Text>{owner && <Pressable accessibilityRole="button" onPress={editSocial}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Add social profile</Text></Pressable>}</View> : null}
   <Pressable accessibilityRole="button" accessibilityLabel={metrics?.verified ? 'View verified profile status' : owner ? 'Get verified' : 'View profile verification status'} onPress={owner ? verify : () => setVerificationNotice(true)} style={[s.verification, { backgroundColor: c.isDark ? '#28251D' : '#FFFAED', borderColor: c.isDark ? '#51462E' : '#F0E2BB' }]}>
    <View style={[s.trustShield, { backgroundColor: c.isDark ? '#45391F' : '#F8EAC1' }]}><Icon name="shield-checkmark-outline" color="#B88325" size={21} /></View><Text style={[s.verificationTitle, { color: c.text }]}>{metrics?.verified ? 'Badge of Trust' : owner ? 'Get Badge of Trust' : 'Profile verification'}</Text><Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{metrics?.verified ? 'Verified' : owner ? 'Get Verified' : 'View status'}</Text><Icon name="chevron-forward" color={c.accent} size={15} />
   </Pressable>
   <View style={s.actions}>{(owner || message) && <Pressable accessibilityRole="button" disabled={busy} onPress={owner ? editProfile : message} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name={owner ? 'create-outline' : 'chatbubble-outline'} size={15} color={c.text} /><Text style={[s.actionText, { color: c.text }]}>{owner ? 'Edit profile' : busy ? 'Opening…' : 'Message'}</Text></Pressable>}{owner ? <Pressable accessibilityRole="button" onPress={verify} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="shield-checkmark-outline" size={15} color={c.accent} /><Text style={[s.actionText, { color: c.accent }]}>Verification</Text></Pressable> : <Pressable accessibilityRole="button" onPress={contact} style={[s.action, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="call-outline" size={15} color={c.text} /><Text style={[s.actionText, { color: c.text }]}>Contact</Text></Pressable>}</View>
   <View style={[s.metrics, { backgroundColor: c.card, borderColor: c.border }]}>{values.map((item, index) => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.value ?? 'unavailable'}`} onPress={item.action} style={[s.metric, { borderLeftWidth: index ? 1 : 0, borderColor: c.border }]}><Icon name={item.icon} color={item.color} size={21} /><Text style={[s.metricValue, { color: c.text }]}>{item.value ?? '—'}</Text><Text numberOfLines={1} style={[s.metricLabel, { color: c.muted }]}>{item.label}</Text></Pressable>)}</View>
   <View style={[s.aboutCard, { backgroundColor: c.card, borderColor: c.border }]}>
    <View style={{ flex: 1, gap: 6 }}><Text style={[s.sectionTitle, { color: c.text }]}>About me</Text><Text numberOfLines={aboutExpanded ? undefined : 3} style={[s.summaryText, { color: c.muted }]}>{summary?.about || (owner ? 'Tell people a little about yourself and the experiences you enjoy.' : 'This member has not added a bio yet.')}</Text>{summary?.about && summary.about.length > 110 ? <Pressable accessibilityRole="button" onPress={() => setAboutExpanded(!aboutExpanded)}><Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{aboutExpanded ? 'Read less' : 'Read more'}</Text></Pressable> : !summary?.about && owner ? <Pressable accessibilityRole="button" onPress={editProfile}><Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>Add bio</Text></Pressable> : null}</View>
    <ProfileLandscape />
   </View>
   <View style={[s.interestsCard, { backgroundColor: c.card, borderColor: c.border }]}><View style={s.sectionHeadingRow}><Text style={[s.sectionTitle, { color: c.text }]}>Interests</Text>{owner && <Pressable accessibilityRole="button" accessibilityLabel="Manage interests" onPress={editProfile}><Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>Manage</Text></Pressable>}</View>
    {summary?.interests?.length ? <View style={s.interestGrid}>{summary.interests.slice(0, interestsExpanded ? undefined : 5).map(interest => { const appearance = interestAppearance(interest); return <View key={interest} style={s.interestItem}><View style={[s.interestIcon, { backgroundColor: `${appearance.color}18` }]}><Icon name={appearance.icon} size={22} color={appearance.color} /></View><Text numberOfLines={2} style={{ color: c.muted, fontSize: 10, textAlign: 'center' }}>{interest}</Text></View>; })}{summary.interests.length > 5 ? <Pressable accessibilityRole="button" accessibilityLabel={interestsExpanded ? 'Show fewer interests' : 'Show all interests'} onPress={() => setInterestsExpanded(!interestsExpanded)} style={s.interestItem}><View style={[s.interestIcon, { backgroundColor: c.inset }]}>{interestsExpanded ? <Icon name="remove" size={18} color={c.text} /> : <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>+{summary.interests.length - 5}</Text>}</View><Text style={{ color: c.muted, fontSize: 10 }}>{interestsExpanded ? 'Less' : 'More'}</Text></Pressable> : null}</View> : <Text style={[s.secondary, { color: c.muted }]}>{owner ? 'Add interests to find your people.' : 'No interests shared yet.'}</Text>}
   </View>
   <LinearGradient colors={['#BA76ED', '#7449DB', '#3923A6']} start={{ x: 0, y: 0 }} end={{ x: .5, y: 1 }} style={s.achievements}><View style={s.sectionHeadingRow}><Text style={[s.sectionTitle, { color: '#FFF' }]}>Achievements</Text><View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="lock-closed-outline" size={11} color="#F1E8FF" /><Text style={{ color: '#F1E8FF', fontSize: 10 }}>Coming soon</Text></View></View><View accessibilityLabel="Achievement badges are locked. FEATURE UNLOCKS SOON." style={s.badgeRow}>{([{ icon: 'trophy-outline', label: 'Super Host', color: '#548AF0' }, { icon: 'heart-outline', label: 'Vibe Creator', color: '#DA67BF' }, { icon: 'people-outline', label: 'People Magnet', color: '#36B3C7' }, { icon: 'calendar-outline', label: 'Weekend Warrior', color: '#E49A50' }, { icon: 'flame-outline', label: 'Early Bird', color: '#E9659D' }] as const).map(item => <View key={item.label} style={s.achievementItem}><View style={[s.achievementBadge, { backgroundColor: `${item.color}88` }]}><Icon name={item.icon} color="#FFFFFFCC" size={24} /><View style={s.achievementLock}><Icon name="lock-closed" color="#EAE2FF" size={9} /></View></View><Text numberOfLines={2} style={s.achievementLabel}>{item.label}</Text><Text style={s.achievementState}>Locked</Text></View>)}</View></LinearGradient>
   {partnerAccount || partnerDashboard ? <View style={{ gap: 8 }}>{partnerDashboard ? <Button label="Partner Dashboard" onPress={partnerDashboard} /> : null}{partnerAccount ? <Pressable accessibilityRole="button" onPress={partnerAccount.onPress} style={[s.partnerRow, { backgroundColor: c.card, borderColor: c.border }]}><Icon name="briefcase-outline" size={19} color={c.accent} /><Text style={{ flex: 1, color: c.text, fontSize: 12, fontWeight: '600' }}>{partnerAccount.label}</Text><Icon name="chevron-forward" color={c.muted} size={15} /></Pressable> : null}</View> : null}
   <View onLayout={event => { contentTop.current = event.nativeEvent.layout.y; }} style={[s.content, { backgroundColor: c.card, borderColor: c.border }]}><View style={[s.tabs, { borderColor: c.border }]}>{(['Activities', 'My Vibes', 'Reviews', 'Communities', ...(owner ? ['Drafts'] as const : [])] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[s.tab, { borderBottomColor: tab === item ? c.accent : 'transparent' }]}><Text style={{ color: tab === item ? c.accent : c.muted, fontSize: owner ? 10 : 11, fontWeight: tab === item ? '700' : '500' }}>{item === 'My Vibes' ? 'Vibes' : item}</Text></Pressable>)}</View>{children}</View>
  </ScrollView>
  {trustOpen && <Sheet title="Trust Score" close={() => setTrustOpen(false)}><TrustCard metrics={metrics} socialLinked={linksAvailable ? configured.length > 0 : undefined} owner={owner} /></Sheet>}
  {pointsOpen && <Sheet title="Nitro Points" close={() => setPointsOpen(false)}><Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>{metrics?.nitro ?? '—'}</Text><Text style={{ color: c.muted }}>This member’s public Nitro Points balance. Their points history and reward redemptions are private.</Text></Sheet>}
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

function Content({ tab, loading, vibes, rows, reviews, communities = [], openVibe, openActivity, openDraft, openCommunity }: { tab: Tab; loading: boolean; vibes: VibeReel[]; rows: Activity[]; reviews: ProfileReview[]; communities?: ProfileCommunity[]; openVibe: (id: string) => void; openActivity: (a: Activity) => void; openDraft?: () => void; openCommunity: (id: string) => void }) {
 const c = usePalette();
 const upcoming = rows.filter(a => !completed(a));
 const done = rows.filter(completed);
 if (tab === 'Communities') return communities.length ? <View style={{ padding: 12, gap: 8 }}>{communities.map((community, index) => <Pressable key={community.id || `${community.name}-${index}`} accessibilityRole={community.id ? 'button' : undefined} accessibilityLabel={community.id ? `Open community ${community.name}` : community.name} disabled={!community.id} onPress={() => community.id && openCommunity(community.id)} style={[s.communityRow, { backgroundColor: c.inset }]}><Icon name="people-outline" color={c.accent} size={18} /><Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{community.name}</Text>{community.id && <Icon name="chevron-forward" color={c.muted} size={15} />}</Pressable>)}</View> : <Empty icon="people-outline" text="No public communities to show yet." />;
 if (loading && !(tab === 'My Vibes' ? vibes.length : tab === 'Reviews' ? reviews.length : rows.length)) return <Skeleton count={2} />;
 if (tab === 'Reviews') return reviews.length ? <View>{reviews.map(review => <View key={review.id} style={[s.activity, { borderColor: c.border, alignItems: 'flex-start' }]}>{review.rater_avatar ? <Image source={{ uri: publicProfileImageUrl(review.rater_avatar) }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : <Icon name="person-circle-outline" size={36} color={c.iconMuted} />}<View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{review.rater_name || review.rater_username || 'WeNitro member'}</Text><Text style={{ color: '#D98737', fontSize: 12, fontWeight: '700' }}>★ {review.rating.toFixed(1)}</Text></View>{review.comment ? <Text style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>{review.comment}</Text> : null}{review.event_title ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{review.event_title}</Text> : null}</View></View>)}</View> : <Empty icon="chatbox-ellipses-outline" text="No public reviews are available yet. Karma rating points to this section." />;
 if (tab === 'My Vibes') return vibes.length ? <View style={s.grid}>{vibes.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`Open vibe ${v.caption || v.id}`} onPress={() => openVibe(v.id)} style={[s.vibe, { backgroundColor: c.inset }]}>{v.mediaType === 'image' ? <Image source={{ uri: v.mediaUrl }} style={{ width: '100%', height: '100%' }} /> : <Icon name="play-circle-outline" size={32} color={c.accent} />}<View style={s.vibeMeta}><Icon name="heart-outline" size={12} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 12 }}>{v.likeCount}</Text><Icon name="chatbubble-outline" size={12} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 12 }}>{v.commentCount}</Text></View></Pressable>)}</View> : <Empty icon="film-outline" text="No vibes posted yet." />;
 if (tab === 'Activities') return <View>
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

export function ReferenceProfile({ data, setData, go, openActivity, openDraft, openVibe, openSquad, openCommunity }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void; openDraft: () => void; openVibe: (id: string) => void; openSquad: () => void; openCommunity: (id: string) => void }) {
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
 const profileCommunities = data.communities.filter(room => room.membership === 'joined' || room.membership === 'created').map(room => ({ id: room.id, name: room.name }));
 const communityNames = profileCommunities.map(room => room.name);
 const partnerLabel = data.partnerProfile ? data.partnerProfile.status === 'DRAFT' ? 'Complete Partner Application' : data.partnerProfile.status === 'UNDER_REVIEW' ? 'Partner Application · Under Review' : 'Partner Account · View Details' : data.partnerUnavailable ? 'Partner Account' : 'Become a Partner';
 return <><ProfileLayout identity={{ id: data.userId!, name: data.name, username: data.username, avatar: data.avatarUri, bio: data.bio }} summary={{ ...summary, communities: communityNames }} metrics={metrics} links={links} gallery={gallery} owner store={() => go('shop')} settings={() => go('settings')} editSocial={() => go('socialLinks')} editProfile={() => go('editProfile')} verify={() => go('verification')} partnerAccount={{ label: partnerLabel, onPress: () => go('partnerAccount') }} partnerDashboard={data.accountType === 'partner' ? () => go('partnerDashboard') : undefined} contact={openContact} activities={() => go('activityHistory')} squad={openSquad} nitro={() => go('nitroHistory')} tab={tab} setTab={setTab} onPhoto={setActivePhoto}><ErrorLine text={error} /><Content tab={tab} loading={loading} vibes={vibes} rows={rows} reviews={reviews} communities={profileCommunities} openCommunity={openCommunity} openVibe={openVibe} openActivity={a => openActivity(a.id)} openDraft={openDraft} />{cursor && !['Reviews', 'Communities'].includes(tab) && <View style={{ padding: 10 }}><Button label="Load more" busy={loading} onPress={() => void load(true)} /></View>}</ProfileLayout>
 {activePhoto ? <Sheet title={activePhoto.uri ? 'Profile photo' : 'Add photo'} close={() => { if (!photoBusy) setActivePhoto(null); }}>
  {activePhoto.uri ? <Image source={{ uri: activePhoto.uri }} style={{ width: '100%', height: 220, borderRadius: 14, backgroundColor: '#EEE' }} /> : <Text style={{ color: '#73809A' }}>Add up to 3 photos others can view.</Text>}
  <Button label={activePhoto.uri ? 'Change photo' : 'Choose photo'} busy={photoBusy} onPress={() => void runPhoto(async () => { const asset = await pickProfileImage(); if (!asset?.uri) return; const saved = await referenceDeltaService.uploadProfilePhoto(activePhoto.position || gallery.length + 1, asset.uri, asset.mimeType); if ((activePhoto.position || 1) === 1) setData(current => ({ ...current, avatarUri: saved.public_url })); })} />
  {activePhoto.uri && activePhoto.position !== 1 ? <Button label="Set as primary" busy={photoBusy} onPress={() => void runPhoto(async () => { const url = await referenceDeltaService.setPrimaryProfilePhoto(activePhoto.position, activePhoto.uri, data.avatarUri); setData(current => ({ ...current, avatarUri: url })); })} /> : null}
  {activePhoto.uri ? <Button label="Delete" danger busy={photoBusy} onPress={() => void runPhoto(async () => { if (activePhoto.position === 1) { const fallback = await referenceDeltaService.removePrimaryProfilePhoto(); setData(current => ({ ...current, avatarUri: fallback || undefined })); } else { const photo = photos.find(item => item.position === activePhoto.position); if (photo) await referenceDeltaService.removeProfilePhoto(photo); } })} /> : null}
 </Sheet> : null}
 {contact && <ContactSheet contact={contact} close={() => setContact(null)} />}</>;
}

export function ReferenceMemberProfile({ id, back, onConversation, onOpenActivity, onOpenVibe, onOpenSquad, onOpenCommunity }: { id: string; back: () => void; onConversation: (id: string, person: any) => void; onOpenActivity: (activity: Activity) => void; onOpenVibe: (id: string) => void; onOpenSquad: (id: string) => void; onOpenCommunity: (id: string) => void }) {
 const [person, setPerson] = useState<any>(null), [metrics, setMetrics] = useState<Metrics | null>(null), [links, setLinks] = useState<SocialLinks>({}), [vibes, setVibes] = useState<VibeReel[]>([]), [reviews, setReviews] = useState<ProfileReview[]>([]), [hosted, setHosted] = useState<Activity[]>([]), [tab, setTab] = useState<Tab>('Activities'), [error, setError] = useState(''), [loading, setLoading] = useState(true), [contact, setContact] = useState(false), [busy, setBusy] = useState(false), [gallery, setGallery] = useState<GalleryItem[]>([]), [preview, setPreview] = useState<string | null>(null);
 const [vibesLoaded, setVibesLoaded] = useState(false), [reviewsLoaded, setReviewsLoaded] = useState(false), [tabLoading, setTabLoading] = useState(false), [tabError, setTabError] = useState(''), [tabRetry, setTabRetry] = useState(0), [vibeCursor, setVibeCursor] = useState<string | null>(null);
 const [activityNextPage, setActivityNextPage] = useState<number | null>(null), [activityMoreLoading, setActivityMoreLoading] = useState(false);
 useEffect(() => { let active = true; setLoading(true); setPerson(null); setError(''); void (async () => {
  const userId = Number(id);
  const p = await supabase.rpc('profile_contact', { p_user_id: userId });
  if (p.error) throw p.error;
  if (!active) return;
  setPerson(p.data);
  setMetrics({ verified: p.data?.is_verified === true });
  setLinks(p.data?.social_links || {});
  const [m, a, squad, photos, joined, trust] = await Promise.all([
   supabase.from('tbl_users').select('id,rating,points,isverified').eq('id', userId).maybeSingle(),
   activitiesProductionService.listPublicHosted(id, { pageSize: 20 }),
   supabase.from('tbl_friends').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},friend_id.eq.${userId}`),
   referenceDeltaService.listPublicProfilePhotos(userId),
   supabase.from('tbl_event_participants').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['going', 'approved', 'paid']),
   Promise.resolve(supabase.rpc('profile_trust_score', { p_user_id: userId })).catch(() => ({ data: null, error: null })),
  ]);
  const items = await prepareReferenceActivities(a.items);
  if (!active) return;
  setHosted(items); setActivityNextPage(a.hasMore ? a.page + 1 : null);
  const socialLinked = p.data?.social_links != null && Object.values(p.data.social_links || {}).some(Boolean);
  setMetrics({ verified: p.data?.is_verified === true || m.data?.isverified === 1, activities: a.total ?? items.length, squad: squad.error ? null : squad.count, nitro: m.data?.points == null ? null : Number(m.data.points), karma: m.data?.rating == null ? null : Number(m.data.rating), rating: m.data?.rating == null ? null : Number(m.data.rating), ...(trust.error ? {} : trustMetrics(trust.data)), activities_joined: joined.count ?? 0, social_linked: socialLinked });
  setGallery([...new Map([{ uri: publicProfileImageUrl(p.data?.profile_image), position: 1 }, ...photos.map(photo => ({ uri: photo.public_url, position: photo.position }))].filter(item => item.uri).map(item => [item.position, item])).values()].slice(0, 3));
  if (m.error || squad.error) setError('Some public profile details could not be loaded. Please reopen this profile.');
 })().catch(e => active && setError(e.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [id]);
 // Media signing and review queries are needed only when their tab is opened.
 // Keep successful results while switching tabs; do not block public identity on media.
 useEffect(() => {
  if (!person || (tab !== 'My Vibes' && tab !== 'Reviews')) return;
  if (tab === 'My Vibes' ? vibesLoaded : reviewsLoaded) return;
  let active = true; setTabLoading(true); setTabError('');
  void (async () => {
   if (tab === 'My Vibes') {
    const result = await listReels({ userId: id, pageSize: 20 });
    if (active) { setVibes(result.reels); setVibeCursor(result.nextCursor); setVibesLoaded(true); }
   } else {
    const result = await supabase.rpc('profile_reviews', { p_user_id: Number(id) });
    if (result.error) throw result.error;
    if (active) { setReviews(Array.isArray(result.data) ? result.data as ProfileReview[] : []); setReviewsLoaded(true); }
   }
  })().catch(caught => { if (active) setTabError(caught.message || 'Could not load profile content.'); }).finally(() => { if (active) setTabLoading(false); });
  return () => { active = false; };
 }, [id, person, tab, tabRetry]);
 const moreVibes = async () => {
  if (!vibeCursor || tabLoading) return;
  setTabLoading(true); setTabError('');
  try { const result = await listReels({ userId: id, pageSize: 20, cursor: vibeCursor }); setVibes(current => [...current, ...result.reels.filter(item => !current.some(existing => existing.id === item.id))]); setVibeCursor(result.nextCursor); }
  catch (caught: any) { setTabError(caught.message || 'Could not load more vibes.'); }
  finally { setTabLoading(false); }
 };
 const moreActivities = async () => {
  if (!activityNextPage || activityMoreLoading) return;
  setActivityMoreLoading(true); setError('');
  try {
   const result = await activitiesProductionService.listPublicHosted(id, { page: activityNextPage, pageSize: 20 });
   const items = await prepareReferenceActivities(result.items);
   setHosted(current => [...current, ...items.filter(item => !current.some(existing => existing.id === item.id))]);
   setActivityNextPage(result.hasMore ? result.page + 1 : null);
  } catch (caught: any) { setError(caught.message || 'Could not load more activities.'); }
  finally { setActivityMoreLoading(false); }
 };
 const message = () => { setBusy(true); void realtimeChatService.createDirectConversation(Number(id)).then(room => onConversation(String(room), person)).catch(e => setError(e.message)).finally(() => setBusy(false)); };
 if (!person) return <Page><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={s.headerAction}><Icon name="arrow-back" /></Pressable><ErrorLine text={error} />{loading && <Skeleton />}</Page>;
 const communities = Array.isArray(person.communities) ? person.communities : [];
 const profileCommunities: ProfileCommunity[] = Array.isArray(person.community_links)
  ? person.community_links.filter((room: any) => /^[1-9]\d*$/.test(String(room?.id)) && typeof room?.name === 'string').map((room: any) => ({ id: String(room.id), name: room.name }))
  : communities.map((name: string) => ({ name }));
 return <><ProfileLayout identity={{ id, name: person.fullname, username: person.username || '', avatar: publicProfileImageUrl(person.profile_image), bio: person.bio }} summary={{ location: person.location, about: person.about || person.bio, interests: Array.isArray(person.interests) ? person.interests : [], communities }} metrics={metrics} links={links} gallery={gallery} linksAvailable={person.social_links != null} back={back} contact={() => setContact(true)} message={person.can_message ? message : undefined} busy={busy} squad={() => onOpenSquad(id)} tab={tab} setTab={setTab} onPhoto={photo => setPreview(photo.uri)}><ErrorLine text={error} /><ErrorLine text={tabError} />{tabError && <View style={{ padding: 10 }}><Button label="Retry profile content" onPress={() => { if (tab === 'My Vibes' && vibesLoaded) void moreVibes(); else setTabRetry(value => value + 1); }} /></View>}<Content tab={tab} loading={tab === 'My Vibes' || tab === 'Reviews' ? tabLoading || (!tabError && !(tab === 'My Vibes' ? vibesLoaded : reviewsLoaded)) : loading} vibes={vibes} rows={hosted.filter(a => a.status !== 'draft')} reviews={reviews} communities={profileCommunities} openCommunity={onOpenCommunity} openVibe={onOpenVibe} openActivity={onOpenActivity} />{tab === 'Activities' && activityNextPage && <View style={{ padding: 10 }}><Button label={error ? 'Retry activities' : 'Load more activities'} busy={activityMoreLoading} onPress={() => void moreActivities()} /></View>}{tab === 'My Vibes' && vibeCursor && <View style={{ padding: 10 }}><Button label="Load more vibes" busy={tabLoading} onPress={() => void moreVibes()} /></View>}</ProfileLayout>
 {preview ? <Sheet title="Profile photo" close={() => setPreview(null)}><Image source={{ uri: preview }} style={{ width: '100%', height: 280, borderRadius: 14 }} /></Sheet> : null}
 {contact && <ContactSheet contact={person} close={() => setContact(false)} />}</>;
}

const s = StyleSheet.create({
 header: { height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, headerAction: { width: 38, height: 44, justifyContent: 'center', alignItems: 'center' }, username: { flex: 1, fontSize: 17, fontWeight: '700', paddingLeft: 2 },
 body: { paddingHorizontal: 12, paddingTop: 0, paddingBottom: 24, gap: 10 },
 hero: { borderBottomLeftRadius: 26, borderBottomRightRadius: 26, minHeight: 226, paddingTop: 10, paddingBottom: 18, paddingHorizontal: 16, marginHorizontal: -12, overflow: 'hidden', gap: 10 },
 heroToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
 heroToolbarTitle: { color: '#E6DDFF', fontSize: 12, fontWeight: '600' },
 heroControl: { height: 34, width: 34, borderRadius: 17, backgroundColor: '#10055455', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF13' },
 heroWave: { position: 'absolute', width: 350, height: 170, borderRadius: 170, borderWidth: 1, borderColor: '#C5A5FF', transform: [{ rotate: '-13deg' }] },
 heroSpark: { position: 'absolute', width: 2, height: 2, borderRadius: 1, backgroundColor: '#FFF' },
 heroOrb: { position: 'absolute', borderRadius: 160, backgroundColor: '#FFFFFF', opacity: .08 },
 heroOrbLarge: { width: 260, height: 260, left: -95, bottom: -185 },
 heroOrbSmall: { width: 150, height: 150, right: -40, top: -80 },
 heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
 photoRow: { flexDirection: 'row', alignItems: 'center' },
 heroPhotoWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden' },
 heroPhotoPrimary: { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5 },
 heroPhoto: { width: '100%', height: '100%' },
 addPhoto: { height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#FFFFFF77', backgroundColor: '#FFFFFF12', borderStyle: 'dashed', flexDirection: 'row', gap: 5, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
 onlineDot: { position: 'absolute', right: 2, bottom: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFF', backgroundColor: '#2DCC88' },
 photoGallery: { flexDirection: 'row', alignItems: 'center', gap: 6 },
 extraPhoto: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFFFFFBB', overflow: 'hidden' },
 photoCount: { color: '#EFEAFF', fontSize: 10, fontWeight: '600' },
 primaryDot: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFE28A', alignItems: 'center', justifyContent: 'center' },
 primaryDotText: { fontSize: 11, fontWeight: '800', color: '#4F3BEE' },
 heroIdentity: { flex: 1, minWidth: 0, gap: 2 },
 heroName: { color: '#FFF', fontSize: 16, fontWeight: '800', flexShrink: 1 },
 heroHandle: { color: '#E4DCFF', fontSize: 12, fontWeight: '600' },
 heroBio: { color: '#EDE7FF', fontSize: 12, lineHeight: 17 }, heroLocation: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 150 },
 heroTrust: { alignItems: 'flex-start', width: 83, paddingHorizontal: 10, paddingVertical: 12, gap: 5, borderRadius: 13, borderWidth: 1, borderColor: '#A990FF66', backgroundColor: '#0E074966', boxShadow: 'inset 0 1px 12px #B397FF22' },
 heroTrustLabel: { color: '#E4DCFF', fontSize: 10, fontWeight: '600' },
 heroTrustValue: { color: '#39E7A0', fontSize: 23, fontWeight: '800' },
 heroTrustMax: { color: '#39E7A0', fontSize: 10, fontWeight: '600' },
 heroTrustState: { flexDirection: 'row', alignItems: 'center', gap: 3 },
 heroInterests: { flexDirection: 'row', gap: 5, marginTop: 1, alignItems: 'center' },
 heroInterest: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#FFFFFF18', flexShrink: 1, maxWidth: '30%' },
 heroInterestText: { color: '#E4DDFF', fontSize: 10, flexShrink: 1 },
 heroInterestMore: { borderRadius: 12, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#FFFFFF18', overflow: 'hidden' },
 identity: { flexDirection: 'row', alignItems: 'center', gap: 14 }, avatar: { width: 61, height: 61, borderRadius: 31 }, center: { alignItems: 'center', justifyContent: 'center' }, initials: { fontSize: 22, fontWeight: '600', color: '#FFF' }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { fontSize: 17, fontWeight: '700', flexShrink: 1 }, secondary: { fontSize: 12, lineHeight: 18 },
 socials: { flexDirection: 'row', gap: 8, alignItems: 'center' }, social: { width: 31, height: 31, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, notice: { padding: 10, borderRadius: 10, gap: 5 },
 profileSummary: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 12 }, summaryLocation: { flexDirection: 'row', alignItems: 'center', gap: 7 }, summaryHeading: { fontSize: 14, fontWeight: '700' }, summaryText: { flex: 1, fontSize: 13, lineHeight: 19 }, summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, summaryChip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
 verification: { minHeight: 51, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, trustShield: { width: 33, height: 33, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, verificationTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
 metrics: { flexDirection: 'row', borderRadius: 13, borderWidth: 1, paddingVertical: 13 }, metric: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 2 }, metricValue: { fontSize: 16, fontWeight: '800' }, metricLabel: { fontSize: 10, lineHeight: 13, fontWeight: '500', textAlign: 'center' },
 actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 9, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 12, fontWeight: '600' },
 aboutCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, padding: 12, gap: 8, overflow: 'hidden' },
 interestsCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 12 },
 sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
 interestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
 interestItem: { flex: 1, minWidth: 42, maxWidth: 62, alignItems: 'center', gap: 6 },
 interestIcon: { width: 35, height: 35, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
 landscape: { width: 108, height: 90, overflow: 'hidden', borderRadius: 12, backgroundColor: '#F1EDFF' },
 landscapeSun: { position: 'absolute', right: 14, top: 11, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F8BC37', borderWidth: 3, borderColor: '#FFDA75' },
 landscapeCloud: { position: 'absolute', width: 16, height: 5, borderRadius: 5, backgroundColor: '#DCD3F7' },
 mountain: { position: 'absolute', width: 66, height: 66, transform: [{ rotate: '45deg' }], borderRadius: 4 },
 mountainBack: { left: 14, bottom: -12, backgroundColor: '#B49AF2' },
 mountainMiddle: { right: -11, bottom: -21, backgroundColor: '#8D63E2' },
 mountainFront: { left: -22, bottom: -32, backgroundColor: '#7141D3' },
 landscapeGround: { position: 'absolute', width: 140, height: 33, borderRadius: 60, right: -26, bottom: -9, backgroundColor: '#4925C5', transform: [{ rotate: '-15deg' }] },
 landscapeTrail: { position: 'absolute', height: 36, width: 7, backgroundColor: '#B497F7', bottom: -9, left: 62, transform: [{ rotate: '48deg' }] },
 landscapeLeaf: { position: 'absolute', height: 27, width: 13, borderRadius: 10, backgroundColor: '#9C75EC' },
 achievements: { gap: 13, padding: 12, borderRadius: 14, overflow: 'hidden' }, sectionTitle: { fontSize: 13, fontWeight: '800' },
 badgeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
 achievementItem: { flex: 1, alignItems: 'center', gap: 4 },
 achievementBadge: { width: 42, height: 45, borderRadius: 13, borderWidth: 1.5, borderColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' },
 achievementLock: { position: 'absolute', right: -3, bottom: -3, backgroundColor: '#422489', width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
 achievementLabel: { fontSize: 9, color: '#FFF', fontWeight: '600', textAlign: 'center', minHeight: 23 },
 achievementState: { fontSize: 9, color: '#E2D7FF' },
 partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 46, borderRadius: 12, borderWidth: 1 },
 trust: { padding: 14, borderRadius: 18, borderWidth: 1, shadowColor: '#20214F', shadowOpacity: .035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, trustBody: { flexDirection: 'row', gap: 17, alignItems: 'center', marginTop: 12 }, scoreRing: { width: 87, height: 87, borderWidth: 7, borderRadius: 44, alignItems: 'center', justifyContent: 'center' }, score: { fontSize: 28, fontWeight: '800' },
 content: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' }, tabs: { height: 44, flexDirection: 'row', borderBottomWidth: 1 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 }, empty: { paddingVertical: 30, paddingHorizontal: 15, alignItems: 'center', gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 6 }, vibe: { width: '32.3%', aspectRatio: .82, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, vibeMeta: { position: 'absolute', bottom: 4, right: 4, borderRadius: 7, backgroundColor: '#151425AA', padding: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }, activity: { minHeight: 70, padding: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
 communityRow: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
 subHead: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
});
