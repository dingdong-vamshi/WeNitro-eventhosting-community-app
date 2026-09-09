import { Asset } from 'expo-asset';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { Activity, AppData, Screen } from '../../../App';
import { activitiesProductionService, type ActivityListItem } from '../../services/activities-production';
import { communitiesProductionService, type CommunitySummary } from '../../services/communities-production';
import { activityService, loadActivityParticipantCounts } from '../../services/wenitro';
import { supabase } from '../../lib/supabase';
import { activityLocationService } from '../../services/activity-location';
import { INTEREST_CATEGORIES } from '../../domain/interest-categories';
import { Action, BrandBar, Button, ErrorLine, Header, Icon, Page, Pills, SearchField, SectionHeading, Sheet, Skeleton, ui, usePalette, purple } from './ui';
const displayableMedia = (value?: string) => Boolean(value && /^(https?:|data:|blob:|file:)/i.test(value));
function activityState(a: Activity) {
  const ended = a.status === 'completed' || Boolean(a.endsAt && Date.parse(a.endsAt) <= Date.now());
  if (ended) return 'Completed';
  if (a.registrationClosesAt && Date.parse(a.registrationClosesAt) <= Date.now()) return 'Registration Closed';
  return 'Upcoming';
}

function activityTime(value?: string) {
  if (!value) return 'To Be Decided';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ActivityFeedSkeleton() {
  const c = usePalette();
  return <View accessibilityLabel="Loading activities" style={{ gap: 15 }}>{[0, 1].map(index => <View key={index} style={{ backgroundColor: c.card, borderRadius: 18, overflow: 'hidden' }}><View style={{ height: 194, backgroundColor: c.inset }} /><View style={{ padding: 13, gap: 11 }}><View style={{ width: '72%', height: 15, borderRadius: 5, backgroundColor: c.inset }} /><View style={{ width: '35%', height: 34, borderRadius: 7, backgroundColor: c.inset }} /><View style={{ width: '100%', height: 34, borderRadius: 7, backgroundColor: c.inset }} /><View style={{ width: '58%', height: 25, borderRadius: 13, backgroundColor: c.inset }} /></View></View>)}</View>;
}

export function ReferenceActivityCard({ activity: a, liked, onLike, onShowLikers, open }: { activity: Activity; liked: boolean; onLike: () => void; onShowLikers: () => void; open: () => void }) {
  const c = usePalette(); const state = activityState(a);
  const joined = ['approved', 'going', 'paid'].includes(String(a.viewerStatus));
  return <View style={{ backgroundColor: c.card, borderRadius: 18, overflow: 'hidden', marginBottom: 15, borderWidth: 1, borderColor: c.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${a.title}`} onPress={open}>
      <Image source={typeof a.image === 'string' ? { uri: a.image } : a.image} style={{ width: '100%', height: 194, backgroundColor: c.inset }} resizeMode="cover" />
      <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', gap: 6 }}>{joined && <View style={{ backgroundColor: '#12B886', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5 }}><Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>Joined</Text></View>}<View style={{ backgroundColor: '#FFF', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5 }}><Text style={{ color: '#1A202C', fontSize: 9, fontWeight: '700' }}>◷ {state}</Text></View></View>
      <View style={{ position: 'absolute', right: 9, top: 8, width: 31, height: 31, borderRadius: 16, backgroundColor: '#111827B8', alignItems: 'center', justifyContent: 'center' }}><Icon name="ellipsis-vertical" size={17} color="#FFF" /></View>
    </Pressable>
    <View style={{ padding: 13, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Pressable accessibilityRole="button" onPress={open} style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>{a.title}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={liked ? `Unlike ${a.title}` : `Like ${a.title}`} accessibilityHint="Long-Press to see who liked" onPress={onLike} onLongPress={onShowLikers} delayLongPress={450} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={liked ? 'heart' : 'heart-outline'} color={liked ? '#F3285F' : c.muted} size={21} /><Text style={{ color: c.muted, fontSize: 9 }}>{a.likeCount || 0}</Text></Pressable></View>
      <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: c.border, borderRadius: 7, padding: 9, flexDirection: 'row', gap: 6 }}><Icon name="calendar-outline" size={12} color={purple} /><Text style={{ fontSize: 10, color: c.text }}>{activityTime(a.startsAt)}</Text></View>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 7, padding: 9, flexDirection: 'row', gap: 6 }}><Icon name="location-outline" size={12} color="#C95781" /><Text style={{ fontSize: 10, color: c.text, flex: 1 }} numberOfLines={1}>{a.where || 'Location to be decided'}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>{a.hostAvatar ? <Image source={{ uri: a.hostAvatar }} style={{ width: 29, height: 29, borderRadius: 15 }} /> : <Icon name="person-circle-outline" color={c.muted} size={29} />}<Text style={{ color: c.muted, fontSize: 11, flex: 1 }}>@{a.host || 'host'}</Text><Icon name={a.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'} color={c.muted} size={14} /><Icon name="people-outline" color={c.muted} size={17} /><Text style={{ color: c.muted, fontSize: 10 }}>{a.joined}</Text></View>
    </View>
  </View>;
}

export function ReferenceFeed({ data, setData, go, openActivity, refreshOnMount = true }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (s: Screen) => void; openActivity: (id: string) => void; refreshOnMount?: boolean }) {
  const c = usePalette();
  const [filter, setFilter] = useState('All');
  const [categories, setCategories] = useState<string[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [price, setPrice] = useState('All');
  const [gender, setGender] = useState('All');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [draft, setDraft] = useState({ dateFrom: '', dateTo: '', price: 'All', gender: 'All', verifiedOnly: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(data.activities.length === 0);
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => { if (!refreshOnMount) { setLoading(false); return; } const controller = new AbortController(); let active = true; setLoading(true); void activitiesProductionService.discover({ pageSize: 50, upcomingOnly: false, sort: 'newest', signal: controller.signal }).then(async page => { const prepared = await prepareReferenceActivities(page.items); if (active) setData(current => ({ ...current, activities: prepared })); }).catch(e => { if (active && !controller.signal.aborted) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; controller.abort(); }; }, [refreshOnMount]);
  const chooseFilter = async (value: string) => { setFilter(value); if (value !== 'Nearby' || nearby || locating) return; setLocating(true); setError(''); try { setNearby(await activityLocationService.current()); } catch (e: any) { setError(e.message); } finally { setLocating(false); } };
  const activities = useMemo(() => { let list = data.activities.filter(a => a.status !== 'draft' && a.status !== 'cancelled'); if (categories.length) list = list.filter(a => categories.includes(a.category)); if (dateFrom) list = list.filter(a => a.startsAt && Date.parse(a.startsAt) >= Date.parse(`${dateFrom}T00:00:00`)); if (dateTo) list = list.filter(a => a.startsAt && Date.parse(a.startsAt) <= Date.parse(`${dateTo}T23:59:59`)); if (price === 'Free') list = list.filter(a => a.price === 'Free' || Number(a.price.replace(/[^0-9.]/g, '')) === 0); if (price === 'Paid') list = list.filter(a => a.price !== 'Free' && Number(a.price.replace(/[^0-9.]/g, '')) > 0); if (gender !== 'All') { const wanted = gender === 'Non-binary' ? 'non_binary' : gender.toLowerCase(); list = list.filter(a => String(a.genderPreference || '').toLowerCase() === wanted); } if (verifiedOnly) list = list.filter(a => a.verifiedOnly); if (filter === 'Trending') list = [...list].sort((a, b) => (b.likeCount || 0) + b.joined - ((a.likeCount || 0) + a.joined)); if (filter === 'Nearby') list = nearby ? list.filter(a => a.latitude != null && a.longitude != null && distanceKm(nearby.latitude, nearby.longitude, a.latitude, a.longitude) <= 25) : []; if (filter === 'Today' || filter === 'Tomorrow') { const day = new Date(); if (filter === 'Tomorrow') day.setDate(day.getDate() + 1); list = list.filter(a => a.startsAt && new Date(a.startsAt).toDateString() === day.toDateString()); } return list; }, [data.activities, nearby, filter, categories, dateFrom, dateTo, price, gender, verifiedOnly]);
  const like = async (a: Activity) => { const key = 'activity:' + a.id, liked = data.likedIds.includes(key); try { await activityService.setLiked(a.id, !liked); setData(current => ({ ...current, likedIds: liked ? current.likedIds.filter(id => id !== key) : [...current.likedIds, key], activities: current.activities.map(item => item.id === a.id ? { ...item, likeCount: Math.max(0, (item.likeCount || 0) + (liked ? -1 : 1)) } : item) })); } catch (e: any) { setError(e.message); } };
  const showLikers = async (a: Activity) => { try { const likers = await activityService.listLikers(a.id); Alert.alert(likers.length ? `Liked by ${likers.length}` : 'No likes yet', likers.length ? likers.map(item => item.name).join('\n') : 'Be the first to like this Activity.'); } catch (e: any) { setError(e.message); } };
  const communityCards = data.communities.filter(room => room.membership !== 'created').slice(0, 8);
  return <Page>
    <BrandBar go={go} location={data.location || 'Nearby'} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Create an activity" onPress={() => go('host')} style={{ width: 282, minHeight: 136, borderRadius: 20, overflow: 'hidden', backgroundColor: c.isDark ? '#21185B' : '#3327CB', padding: 18, justifyContent: 'space-between' }}><View style={{ flexDirection: 'row', alignItems: 'flex-start' }}><View style={{ flex: 1, gap: 6 }}><Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800', maxWidth: 205 }}>Host activities. Bring people together.</Text><Text style={{ color: '#D9D5FF', fontSize: 10, lineHeight: 15, maxWidth: 215 }}>Create something people can join and enjoy.</Text></View><Icon name="people-circle-outline" size={41} color="#54D9E8" /></View><View style={{ alignSelf: 'flex-start', backgroundColor: '#FFF', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ color: '#3D2BD5', fontSize: 9, fontWeight: '800' }}>Create Activity  →</Text></View></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Nitro Store" onPress={() => go('shop')} style={{ width: 154, minHeight: 136, borderRadius: 20, overflow: 'hidden', backgroundColor: c.isDark ? '#351276' : '#5B32DC', padding: 16, justifyContent: 'space-between' }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#FFF', fontSize: 14, lineHeight: 18, fontWeight: '800', width: 82 }}>Explore Nitro Store</Text><Icon name={data.nitro >= 500 ? 'gift' : 'lock-closed'} size={25} color="#F0D14E" /></View><View><Text style={{ color: '#FFF', fontSize: 17, fontWeight: '900' }}>{data.nitro}</Text><Text style={{ color: '#D9D5FF', fontSize: 9 }}>Nitro points</Text></View></Pressable>
      </ScrollView>
      <SectionHeading title="Discover Activities" action="Explore all" onAction={() => go('activities')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14, marginTop: -4 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 7 }}>{[['Trending', 'flame-outline'], ['Nearby', 'location-outline'], ['Today', 'time-outline'], ['Tomorrow', 'calendar-outline']].map(([value, icon]) => { const active = filter === value; return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => void chooseFilter(active ? 'All' : value)} key={value} style={{ minHeight: 33, paddingHorizontal: 11, borderRadius: 17, backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name={icon as any} size={12} color={active ? '#FFF' : c.accent} /><Text style={{ color: active ? '#FFF' : c.muted, fontSize: 9, fontWeight: '700' }}>{value}</Text></Pressable>; })}<Pressable accessibilityRole="button" accessibilityLabel="Open activity filters" onPress={() => { setDraftCategories(categories); setDraft({ dateFrom, dateTo, price, gender, verifiedOnly }); setFilterOpen(true); }} style={{ minHeight: 33, paddingHorizontal: 11, borderRadius: 17, backgroundColor: categories.length || dateFrom || dateTo || price !== 'All' || gender !== 'All' || verifiedOnly ? c.accent : c.card, borderWidth: 1, borderColor: categories.length || dateFrom || dateTo || price !== 'All' || gender !== 'All' || verifiedOnly ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="options-outline" size={12} color={categories.length || dateFrom || dateTo || price !== 'All' || gender !== 'All' || verifiedOnly ? '#FFF' : c.accent} /><Text style={{ color: categories.length || dateFrom || dateTo || price !== 'All' || gender !== 'All' || verifiedOnly ? '#FFF' : c.muted, fontSize: 9, fontWeight: '700' }}>Filter</Text></Pressable></ScrollView>
      {loading ? <View style={{ height: 164, borderRadius: 17, backgroundColor: c.card, marginTop: 10 }} /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14, marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>{activities.slice(0, 6).map(a => { const liked = data.likedIds.includes(`activity:${a.id}`); return <View key={a.id} style={{ width: 208, height: 170, borderRadius: 17, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
        <View style={{ height: 108 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${a.title}`} onPress={() => openActivity(a.id)} style={({ pressed }) => ({ flex: 1, opacity: pressed ? .8 : 1 })}>
            <Image source={typeof a.image === 'string' ? { uri: a.image } : a.image} style={{ width: '100%', height: '100%', backgroundColor: c.inset }} resizeMode="cover" />
            <View style={{ position: 'absolute', left: 8, top: 8, borderRadius: 11, backgroundColor: '#FFFFFFEC', paddingHorizontal: 7, paddingVertical: 4 }}><Text style={{ color: '#392CC3', fontSize: 8, fontWeight: '800' }}>{a.category || 'Activity'}</Text></View>
            {a.price ? <View style={{ position: 'absolute', right: 8, bottom: 8, borderRadius: 11, backgroundColor: '#07111FD2', paddingHorizontal: 7, paddingVertical: 4 }}><Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>{a.price}</Text></View> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? `Unlike ${a.title}` : `Like ${a.title}`} onPress={() => void like(a)} onLongPress={() => void showLikers(a)} style={{ position: 'absolute', top: 7, right: 7, minWidth: 31, height: 31, borderRadius: 16, paddingHorizontal: 7, backgroundColor: '#07111FC7', flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' }}><Icon name={liked ? 'heart' : 'heart-outline'} color={liked ? '#FF527E' : '#FFF'} size={14} />{a.likeCount ? <Text style={{ color: '#FFF', fontSize: 7, fontWeight: '700' }}>{a.likeCount}</Text> : null}</Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${a.title} details`} onPress={() => openActivity(a.id)} style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 8, gap: 4, opacity: pressed ? .7 : 1 })}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 12 }} numberOfLines={1}>{a.title}</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="calendar-outline" color={c.accent} size={11} /><Text style={{ color: c.muted, fontSize: 8, flex: 1 }} numberOfLines={1}>{activityTime(a.startsAt)}</Text></View>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="location-outline" color={c.muted} size={11} /><Text style={{ color: c.muted, fontSize: 8, flex: 1 }} numberOfLines={1}>{a.where || 'Location to be decided'}</Text></View>
        </Pressable>
      </View>; })}</ScrollView>}
      {!loading && !activities.length ? <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 20 }}>No activities are available yet.</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => go('host')} style={{ marginTop: 18, backgroundColor: c.isDark ? '#241D55' : '#F0EDFF', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13 }}><View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#6650F5', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" color="#FFF" /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 14 }}>Host an activity</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>Bring a group together around something you enjoy.</Text></View><Icon name="arrow-forward-circle" color={c.accent} size={26} /></Pressable>
      {data.people.length ? <><SectionHeading title="People to Discover" action="Find people" onAction={() => go('search')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>{data.people.slice(0, 8).map(person => <View key={person.id} style={{ width: 70, alignItems: 'center', gap: 6 }}>{displayableMedia(person.avatar) ? <Image source={{ uri: person.avatar }} style={{ width: 58, height: 58, borderRadius: 30, borderWidth: 2, borderColor: c.border }} /> : <Icon name="person-circle" size={58} color={c.muted} />}<Text numberOfLines={1} style={{ color: c.text, width: 70, textAlign: 'center', fontSize: 10, fontWeight: '700' }}>{person.name}</Text></View>)}</ScrollView></> : null}
      {communityCards.length ? <><SectionHeading title="Communities" action="Explore all" onAction={() => go('communities')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{communityCards.map(room => <Pressable accessibilityRole="button" accessibilityLabel={`Open community ${room.name}`} onPress={() => go('communities')} key={room.id} style={{ width: 154, height: 142, borderRadius: 17, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>{room.image ? <Image source={{ uri: room.image }} style={{ height: 86, width: '100%' }} /> : <View style={{ height: 86, backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center' }}><Icon name="people" color={c.accent} size={30} /></View>}<View style={{ padding: 9 }}><Text style={{ color: c.text, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{room.name}</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 3 }}>{room.memberCount} members</Text></View></Pressable>)}</ScrollView></> : null}
      <SectionHeading title="Discover Your Tribe" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{(data.interests.length ? data.interests : INTEREST_CATEGORIES).filter(value => !/qa|automation|test/i.test(value)).slice(0, 7).map((value, index) => <Pressable accessibilityRole="button" onPress={() => go('search')} key={value} style={{ width: 112, minHeight: 58, borderRadius: 15, padding: 11, backgroundColor: ['#6553F5', '#D94C9A', '#2D8FE9', '#ED8D39'][index % 4] }}><Icon name={['book-outline', 'barbell-outline', 'airplane-outline', 'musical-notes-outline'][index % 4] as any} size={17} color="#FFF" /><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800', marginTop: 5 }} numberOfLines={2}>Find {value}</Text></Pressable>)}</ScrollView>
      <Pressable accessibilityRole="button" onPress={() => go('inviteSquad')} style={{ marginTop: 18, minHeight: 78, borderRadius: 18, padding: 15, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 13 }}><View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.isDark ? '#19385D' : '#E6F6FF', alignItems: 'center', justifyContent: 'center' }}><Icon name="people" color="#268DDC" size={24} /></View><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>Invite your friends</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 4 }}>Share WeNitro and plan something together.</Text></View><Icon name="chevron-forward" color={c.accent} /></Pressable>
      {data.vibes.length ? <><SectionHeading title="Vibes from the community" action="See all vibes" onAction={() => go('vibes')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>{data.vibes.slice(0, 6).map(vibe => <Pressable accessibilityRole="button" onPress={() => go('vibes')} key={vibe.id} style={{ width: 132, height: 92, borderRadius: 15, overflow: 'hidden', backgroundColor: c.inset }}>{vibe.mediaType !== 'video' && displayableMedia(vibe.mediaUrl) ? <Image source={{ uri: vibe.mediaUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="film-outline" size={30} color={c.accent} /></View>}<View style={{ position: 'absolute', inset: 0, backgroundColor: '#00000026', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 29, height: 29, borderRadius: 15, backgroundColor: '#07111FAD', alignItems: 'center', justifyContent: 'center' }}><Icon name="play" size={12} color="#FFF" /></View></View></Pressable>)}</ScrollView></> : null}
      <SectionHeading title="Earn Nitro Points" action="View history" onAction={() => go('nitroHistory')} />
      <Pressable accessibilityRole="button" onPress={() => go('shop')} style={{ borderWidth: 1, borderColor: '#6650F550', backgroundColor: c.isDark ? '#171938' : '#F1EFFF', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name={data.nitro >= 500 ? 'gift' : 'lock-closed'} color="#E6C84D" size={24} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{data.nitro} Nitro points</Text><Text style={{ color: c.muted, fontSize: 10, marginTop: 3 }}>{data.nitro < 500 ? `${500 - data.nitro} more points unlock the store.` : 'Your Nitro Store is unlocked.'}</Text></View><Icon name="chevron-forward" color={c.muted} /></Pressable>
      <ErrorLine text={error} />
    </ScrollView>
    {filterOpen && <Sheet title="Filters" close={() => setFilterOpen(false)} footer={<View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="Reset All" onPress={() => { setDraftCategories([]); setDraft({ dateFrom:'', dateTo:'', price:'All', gender:'All', verifiedOnly:false }); }} /></View><View style={{ flex: 1 }}><Button label="Apply Filters" onPress={() => { setCategories(draftCategories); setDateFrom(draft.dateFrom); setDateTo(draft.dateTo); setPrice(draft.price); setGender(draft.gender); setVerifiedOnly(draft.verifiedOnly); setFilterOpen(false); }} /></View></View>}>
      <Text style={{ color:c.text,fontWeight:'700',fontSize:14 }}>Date Filter</Text><View style={{ flexDirection:'row',gap:10 }}>{(['dateFrom','dateTo'] as const).map((key,index) => <View key={key} style={{ flex:1,gap:7 }}><Text style={{ color:c.muted,fontSize:10 }}>{index ? 'To' : 'From'}</Text>{Platform.OS==='web' ? <View style={{ minHeight:44,backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:9,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,overflow:'hidden' }}><Icon name="calendar-outline" color={c.muted} size={15}/><Text style={{ color:c.text,fontSize:12 }}>{draft[key] ? new Date(`${draft[key]}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Today'}</Text>{React.createElement('input',{type:'date','aria-label':index?'Date to':'Date from',value:draft[key],onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setDraft(v=>({...v,[key]:e.target.value})),style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer',colorScheme:useDarkColorScheme(c)}})}</View> : <Pressable style={{ backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:9,padding:12 }}><Text style={{ color:c.text }}>{draft[key]||'Today'}</Text></Pressable>}</View>)}</View>
      <Text style={{ color:c.text,fontWeight:'700',fontSize:14 }}>Price</Text><Pills values={['All','Free','Paid']} selected={draft.price} onChange={value=>setDraft(v=>({...v,price:value}))} />
      <Text style={{ color:c.text,fontWeight:'700',fontSize:14 }}>Gender Preference</Text><Pills values={['All','Male','Female']} selected={draft.gender} onChange={value=>setDraft(v=>({...v,gender:value}))} /><Pressable accessibilityRole="radio" accessibilityState={{ checked:draft.gender==='Non-binary' }} onPress={()=>setDraft(v=>({...v,gender:'Non-binary'}))} style={{ alignSelf:'flex-start',backgroundColor:draft.gender==='Non-binary'?purple:c.card,borderRadius:20,paddingHorizontal:18,paddingVertical:9 }}><Text style={{ color:draft.gender==='Non-binary'?'#FFF':c.muted,fontSize:13 }}>Non-binary</Text></Pressable>
      <View style={{ flexDirection:'row',alignItems:'center',gap:12,paddingVertical:6 }}><View style={{ flex:1,gap:4 }}><Text style={{ color:c.text,fontWeight:'700',fontSize:14 }}>Exclusive for Verified Users</Text><Text style={{ color:c.muted,fontSize:10 }}>Show activities restricted to verified profiles.</Text></View><Switch accessibilityLabel="Exclusive for Verified Users" value={draft.verifiedOnly} onValueChange={value=>setDraft(v=>({...v,verifiedOnly:value}))} trackColor={{true:purple,false:c.border}} /></View>
      <Text style={{ color:c.text,fontWeight:'700',fontSize:14 }}>Categories</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{INTEREST_CATEGORIES.filter(value => !/qa|automation|test/i.test(value)).map(value => { const selected = draftCategories.includes(value); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={value} onPress={() => setDraftCategories(current => selected ? current.filter(item => item !== value) : [...current, value])} style={{ width: '47%', minHeight: 58, borderWidth: 1, borderColor: selected ? '#8E7CFF' : c.border, backgroundColor: selected ? '#6D5AEF24' : c.card, borderRadius: 10, padding: 10, justifyContent: 'center' }}><Text style={{ color: selected ? '#A99CFF' : c.text, fontSize: 11, fontWeight: '600' }}>{value}</Text></Pressable>; })}</View>
    </Sheet>}
  </Page>;
}
function useDarkColorScheme(c: ReturnType<typeof usePalette>) { return c.bg === '#101824' ? 'dark' : 'light'; }
export function productionActivity(a: Omit<ActivityListItem, 'viewerState'> & { viewerState?: ActivityListItem['viewerState'] }): Activity { return { id: a.id, title: a.title, category: a.category, when: a.startsAt || 'To Be Decided', where: a.locationName, latitude: a.latitude, longitude: a.longitude, price: a.priceInr ? `₹${a.priceInr}` : 'Free', seats: a.capacity || 0, joined: 0, image: a.coverUrl || Asset.fromModule(require('../../../assets/wenitro-logo-transparent.png')).uri, host: a.owner?.username || a.owner?.fullName || 'Host', hostAvatar: a.owner?.avatarUrl || undefined, ownerId: a.ownerId, startsAt: a.startsAt || undefined, end: a.endsAt || undefined, endsAt: a.endsAt || undefined, closes: a.registrationClosesAt || undefined, registrationClosesAt: a.registrationClosesAt || undefined, status: a.status, description: a.description || '', visibility: a.visibility, activityType: a.activityType, joinType: a.joinType, communityId: a.communityId, locationInstruction: a.locationInstruction || undefined, verifiedOnly: a.verifiedOnly, ageMin: a.ageMin, ageMax: a.ageMax, genderPreference: a.genderPreference, viewerStatus: a.viewerState?.participation?.status === 'going' ? 'going' : a.viewerState?.participation?.status || null }; }
type SearchScope = 'Activities' | 'People' | 'Communities';
type SearchRow =
 | { kind: 'activity'; id: string; activity: Activity }
 | { kind: 'person'; id: string; name: string; username: string; bio: string; image?: string }
 | { kind: 'community'; id: string; community: CommunitySummary };

const SEARCH_PAGE_SIZE = 10;

function searchPerson(value: unknown): SearchRow | null {
 if (!value || typeof value !== 'object') return null;
 const row = value as Record<string, unknown>;
 const id = String(row.id ?? '');
 const username = String(row.username ?? '').trim();
 if (!/^[1-9]\d*$/.test(id) || !username) return null;
 return {
  kind: 'person', id,
  name: String(row.fullname ?? username),
  username: `@${username}`,
  bio: String(row.bio ?? ''),
  image: typeof row.profile_image === 'string' && displayableMedia(row.profile_image) ? row.profile_image : undefined,
 };
}

function communityForApp(room: CommunitySummary): AppData['communities'][number] {
 return {
  id: room.id,
  name: room.name,
  tagline: room.tagline || room.description,
  category: room.category,
  tags: room.tags,
  memberCount: room.memberCount ?? 0,
  onlineCount: 0,
  visibility: room.visibility === 'private' ? 'Private' : 'Public',
  membership: room.membership,
  image: room.imageUrl || '',
  cover: room.coverUrl || room.imageUrl || '',
  rules: [],
  posts: [],
 };
}

function compactDate(value?: string) {
 if (!value) return 'Date to be decided';
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) return 'Date to be decided';
 return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SearchActivityResult({ row, open }: { row: Extract<SearchRow, { kind: 'activity' }>; open: () => void }) {
 const c = usePalette();
 const a = row.activity;
 return <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${a.title}`} onPress={open} style={({ pressed }) => ({ minHeight: 112, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, overflow: 'hidden', flexDirection: 'row', opacity: pressed ? .76 : 1 })}>
  <Image source={typeof a.image === 'string' ? { uri: a.image } : a.image} style={{ width: 116, alignSelf: 'stretch', backgroundColor: c.inset }} resizeMode="cover" />
  <View style={{ flex: 1, paddingHorizontal: 11, paddingVertical: 9, gap: 4 }}>
   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ backgroundColor: c.isDark ? '#6E5AEF35' : '#EEEAFE', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9 }}><Text numberOfLines={1} style={{ color: c.accent, fontSize: 8, fontWeight: '800', maxWidth: 92 }}>{a.category || 'Activity'}</Text></View>{a.price ? <Text style={{ color: c.success, fontSize: 9, fontWeight: '800', marginLeft: 'auto' }}>{a.price}</Text> : null}</View>
   <Text numberOfLines={2} style={{ color: c.text, fontSize: 13, lineHeight: 17, fontWeight: '800' }}>{a.title}</Text>
   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="calendar-outline" color={c.accent} size={11} /><Text numberOfLines={1} style={{ color: c.muted, fontSize: 9, flex: 1 }}>{compactDate(a.startsAt)}</Text></View>
   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="location-outline" color={c.muted} size={11} /><Text numberOfLines={1} style={{ color: c.muted, fontSize: 9, flex: 1 }}>{a.where || 'Location to be decided'}</Text></View>
   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' }}><Icon name="people-outline" color={c.accent} size={12} /><Text style={{ color: c.muted, fontSize: 8 }}>{a.joined}{a.seats > 0 ? ` / ${a.seats} joined` : ' joined'}</Text><View style={{ marginLeft: 'auto' }}><Icon name="chevron-forward" color={c.iconMuted} size={12} /></View></View>
  </View>
 </Pressable>;
}

function SearchPersonResult({ row, open }: { row: Extract<SearchRow, { kind: 'person' }>; open: () => void }) {
 const c = usePalette();
 return <Pressable accessibilityRole="button" accessibilityLabel={`Open profile ${row.name}`} onPress={open} style={({ pressed }) => ({ minHeight: 76, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: pressed ? .76 : 1 })}>
  {row.image ? <Image source={{ uri: row.image }} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.inset }} /> : <Icon name="person-circle-outline" size={50} color={c.muted} />}
  <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{row.name}</Text><Text style={{ color: c.accent, fontSize: 10 }}>{row.username}</Text>{row.bio ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 10 }}>{row.bio}</Text> : null}</View>
  <Icon name="chevron-forward" size={17} color={c.muted} />
 </Pressable>;
}

function SearchCommunityResult({ row, open }: { row: Extract<SearchRow, { kind: 'community' }>; open: () => void }) {
 const c = usePalette(); const room = row.community;
 const state = room.membership === 'created' ? 'Created' : room.membership === 'joined' ? 'Joined' : room.membership === 'pending' ? 'Pending' : room.requiresApproval ? 'Request' : 'View';
 return <Pressable accessibilityRole="button" accessibilityLabel={`Open community ${room.name}`} onPress={open} style={({ pressed }) => ({ minHeight: 92, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: pressed ? .76 : 1 })}>
  {room.imageUrl ? <Image source={{ uri: room.imageUrl }} style={{ width: 66, height: 66, borderRadius: 12, backgroundColor: c.inset }} resizeMode="cover" /> : <View style={{ width: 66, height: 66, borderRadius: 12, backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center' }}><Icon name="people" size={28} color={c.accent} /></View>}
  <View style={{ flex: 1, gap: 5 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{room.name}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 10 }}>{room.tagline || room.description || room.category}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{room.memberCount ?? 0} members · {room.visibility === 'private' ? 'Private' : 'Public'}</Text></View>
  <View style={{ borderRadius: 13, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: room.membership === 'joined' || room.membership === 'created' ? '#167C5530' : '#6E5AEF24' }}><Text style={{ color: room.membership === 'joined' || room.membership === 'created' ? c.success : c.accent, fontSize: 9, fontWeight: '700' }}>{state}</Text></View>
 </Pressable>;
}

export function ReferenceSearch({ back, openActivity, openProfile, openCommunity, setData }: { back: () => void; openActivity: (id: string) => void; openProfile: (id: string) => void; openCommunity: (id: string) => void; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
 const c = usePalette();
 const [scope, setScope] = useState<SearchScope>('Activities');
 const [query, setQuery] = useState('');
 const [category, setCategory] = useState('All');
 const [categoriesOpen, setCategoriesOpen] = useState(false);
 const [page, setPage] = useState(1);
 const [rows, setRows] = useState<SearchRow[]>([]);
 const [more, setMore] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const cleanQuery = query.trim().slice(0, 80);

 useEffect(() => { setPage(1); setRows([]); }, [scope, cleanQuery, category]);
 useEffect(() => {
  const controller = new AbortController(); let active = true;
  setError(''); setLoading(true);
  const timer = setTimeout(() => { void (async () => {
   try {
    let result: SearchRow[] = []; let hasMore = false;
    if (scope === 'Activities') {
     const response = await activitiesProductionService.discover({ search: cleanQuery || undefined, categories: category === 'All' ? undefined : [category], page, pageSize: SEARCH_PAGE_SIZE, upcomingOnly: true, sort: 'soonest', signal: controller.signal });
     const prepared = await prepareReferenceActivities(response.items);
     result = prepared.map(activity => ({ kind: 'activity', id: activity.id, activity }));
     hasMore = response.hasMore;
     if (active) setData(current => ({ ...current, activities: [...current.activities.filter(activity => !prepared.some(item => item.id === activity.id)), ...prepared] }));
    } else if (scope === 'Communities') {
     const response = await communitiesProductionService.discover({ query: cleanQuery || undefined, page, pageSize: SEARCH_PAGE_SIZE });
     result = response.items.map(community => ({ kind: 'community', id: community.id, community }));
     hasMore = response.hasMore;
     if (active) { const incoming = response.items.map(communityForApp); setData(current => ({ ...current, communities: [...current.communities.filter(room => !incoming.some(item => item.id === room.id)), ...incoming] })); }
    } else {
     const response = await supabase.rpc('list_discoverable_people', { p_limit: 60 });
     if (response.error) throw response.error;
     const all = (Array.isArray(response.data) ? response.data : []).map(searchPerson).filter((item): item is Extract<SearchRow, { kind: 'person' }> => Boolean(item));
     const matching = cleanQuery ? all.filter(person => `${person.name} ${person.username} ${person.bio}`.toLowerCase().includes(cleanQuery.toLowerCase())) : all;
     const from = (page - 1) * SEARCH_PAGE_SIZE;
     result = matching.slice(from, from + SEARCH_PAGE_SIZE);
     hasMore = from + SEARCH_PAGE_SIZE < matching.length;
    }
    if (active) { setRows(current => page === 1 ? result : [...current, ...result]); setMore(hasMore); }
   } catch (caught) {
    if (active && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Search is unavailable. Please try again.');
   } finally { if (active) setLoading(false); }
  })(); }, cleanQuery ? 320 : 0);
  return () => { active = false; controller.abort(); clearTimeout(timer); };
 }, [scope, cleanQuery, category, page]);

 const title = cleanQuery ? `${scope} matching “${cleanQuery}”` : scope === 'Activities' ? 'Activities to Explore' : scope === 'People' ? 'People to Discover' : 'Communities to Explore';
 const shownCategories = ['All', ...INTEREST_CATEGORIES.filter(value => !/qa|automation|test/i.test(value)).slice(0, categoriesOpen ? 18 : 7)];
 const result = (row: SearchRow) => row.kind === 'activity'
  ? <SearchActivityResult key={`activity:${row.id}`} row={row} open={() => openActivity(row.id)} />
  : row.kind === 'person'
    ? <SearchPersonResult key={`person:${row.id}`} row={row} open={() => openProfile(row.id)} />
    : <SearchCommunityResult key={`community:${row.id}`} row={row} open={() => openCommunity(row.id)} />;

 const categoryRail = scope === 'Activities' && (!cleanQuery || categoriesOpen || category !== 'All') ? <View style={{ marginHorizontal: -14, paddingVertical: 7, gap: 9 }}><View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}><Text style={{ color: c.text, fontSize: 12, fontWeight: '800', flex: 1 }}>Browse Categories</Text>{category !== 'All' ? <Pressable accessibilityRole="button" onPress={() => setCategory('All')}><Text style={{ color: c.accent, fontSize: 10, fontWeight: '700' }}>Clear</Text></Pressable> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>{shownCategories.map((value, index) => <Pressable accessibilityRole="button" accessibilityState={{ selected: category === value }} key={value} onPress={() => setCategory(value)} style={{ minHeight: 38, minWidth: value === 'All' ? 54 : 88, borderRadius: 13, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: category === value ? c.accent : c.card, borderWidth: 1, borderColor: category === value ? c.accent : c.border }}><Icon name={(['apps-outline', 'football-outline', 'trail-sign-outline', 'people-outline', 'musical-notes-outline', 'restaurant-outline'][index % 6]) as any} color={category === value ? '#FFF' : c.accent} size={14} /><Text numberOfLines={1} style={{ color: category === value ? '#FFF' : c.muted, fontSize: 9, fontWeight: category === value ? '800' : '600', marginTop: 3 }}>{value}</Text></Pressable>)}</ScrollView></View> : null;
 const splitRecommendations = scope === 'Activities' && !cleanQuery && !categoriesOpen && category === 'All';
 const leadRows = splitRecommendations ? rows.slice(0, 4) : [];
 const trailingRows = splitRecommendations ? rows.slice(4) : rows;

 return <Page>
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8, paddingTop: 3 }}><Action name="arrow-back" label="Back" onPress={back} /><View style={{ flex: 1 }}><SearchField accessibilityLabel="Search activities, people, and communities" placeholder="Search activities, people, communities..." value={query} onChangeText={setQuery} style={{ paddingRight: 38 }} /></View><Pressable accessibilityRole="button" accessibilityLabel="Browse search filters" accessibilityState={{ expanded: categoriesOpen }} onPress={() => { setCategoriesOpen(value => !value); if (scope !== 'Activities') setScope('Activities'); }} style={{ position: 'absolute', right: 22, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: categoriesOpen || category !== 'All' ? c.accent : c.inset }}><Icon name="options-outline" color={categoriesOpen || category !== 'All' ? '#FFF' : c.icon} size={18} /></Pressable></View>
  <Pills values={['Activities', 'People', 'Communities']} selected={scope} onChange={value => { setScope(value as SearchScope); setCategory('All'); setCategoriesOpen(false); }} />
  <ErrorLine text={error} />
  {loading && !rows.length ? <Skeleton count={5} /> : <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 34, gap: 9 }}>
   <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{title}</Text><Text style={{ color: c.muted, fontSize: 9 }}>{rows.length}{more ? '+' : ''} shown</Text></View>
   {leadRows.map(result)}
   {categoryRail}
   {trailingRows.map(result)}
   {!loading && !rows.length && !error ? <View style={{ alignItems: 'center', paddingVertical: 64, paddingHorizontal: 26, gap: 11 }}><View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center' }}><Icon name="search-outline" color={c.accent} size={28} /></View><Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>No {scope.toLowerCase()} found</Text><Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>{cleanQuery ? 'Try a broader search or choose another category.' : `There are no discoverable ${scope.toLowerCase()} yet.`}</Text></View> : null}
   {more ? <Button label="Load more" busy={loading} onPress={() => setPage(value => value + 1)} /> : null}
   {loading && rows.length ? <View style={{ padding: 12 }}><Skeleton count={1} /></View> : null}
  </ScrollView>}
 </Page>;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) { const r = Math.PI / 180; const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))); }

export async function prepareReferenceActivities(items: Parameters<typeof productionActivity>[0][]): Promise<Activity[]> {
 const paths = [...new Set(items.flatMap(a => a.coverUrl && !/^https?:\/\//.test(a.coverUrl) && !a.coverUrl.startsWith('data:') && !a.coverUrl.startsWith('media/events/') ? [a.coverUrl] : []))];
 const [counts, likesResult, signed] = await Promise.all([loadActivityParticipantCounts(items.map(a => a.id)), items.length ? supabase.from('tbl_event_likes').select('event_id').in('event_id', items.map(a => Number(a.id))) : Promise.resolve({ data: [], error: null }), paths.length ? supabase.storage.from('activity-media').createSignedUrls(paths, 3600) : Promise.resolve({ data: [], error: null })]);
 if (likesResult.error) throw likesResult.error;
 const likeCounts = new Map<string, number>(); for (const row of likesResult.data || []) { const id = String(row.event_id); likeCounts.set(id, (likeCounts.get(id) || 0) + 1); }
 const urls = new Map((signed.data || []).map(row => [row.path, row.signedUrl]));
 return items.map(a => ({ ...productionActivity(a), joined: counts.get(a.id) || 0, likeCount: likeCounts.get(a.id) || 0, image: a.coverUrl && /^(https?:|data:)/.test(a.coverUrl) ? a.coverUrl : urls.get(a.coverUrl || '') || Asset.fromModule(require('../../../assets/wenitro-logo-transparent.png')).uri }));
}
