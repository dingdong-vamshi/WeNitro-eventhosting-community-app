import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { Activity, AppData, Screen } from '../../../App';
import { activitiesProductionService } from '../../services/activities-production';
import { activityLocationService } from '../../services/activity-location';
import { activityService } from '../../services/wenitro';
import { INTEREST_CATEGORIES } from '../../domain/interest-categories';
import { BrandBar, ErrorLine, Icon, Page, Pills, SearchField, usePalette } from '../reconstruction/ui';
import { prepareReferenceActivities } from '../reconstruction/feed-search';
import { UserAvatar } from '../user-avatar';
import { VerifiedBadge } from '../verified-badge';

type Filter = 'All' | 'Popular' | 'Nearby' | 'Today' | 'Tomorrow';
const distanceKm = (a: number, b: number, c: number, d: number) => { const r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))); };
const time = (value?: string) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date to be decided';
const filterIcon: Record<Filter, React.ComponentProps<typeof Icon>['name']> = { All: 'apps-outline', Popular: 'flame-outline', Nearby: 'location-outline', Today: 'time-outline', Tomorrow: 'calendar-outline' };
const participationLabel = (value?: Activity['viewerStatus']) => ['approved', 'going', 'paid'].includes(String(value)) ? 'Joined' : ['pending', 'waitlist'].includes(String(value)) ? 'Pending' : null;

export function ClientActivitiesScreen({ data, setData, go, openActivity }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void }) {
  const c = usePalette();
  const [filter, setFilter] = useState<Filter>('All');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(data.activities.length === 0);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchGeneration = useRef(0);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    searchGeneration.current += 1;
    setLoading(true); setLoadingMore(false); setError(''); setPage(1); setHasMore(false);
    const timer = setTimeout(() => {
      void activitiesProductionService.discover({ pageSize: 30, search: query, upcomingOnly: false, sort: 'newest', signal: controller.signal })
        .then(async result => { const rows = await prepareReferenceActivities(result.items); if (active) { setData(current => ({ ...current, activities: rows })); setHasMore(result.hasMore); } })
        .catch(e => { if (active && !controller.signal.aborted) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; searchGeneration.current += 1; clearTimeout(timer); controller.abort(); };
  }, [query]);
  const loadMore = async () => {
    if (loadingMore || loading) return;
    const generation = searchGeneration.current;
    setLoadingMore(true); setError('');
    try {
      const result = await activitiesProductionService.discover({ page: page + 1, pageSize: 30, search: query, upcomingOnly: false, sort: 'newest' });
      const next = await prepareReferenceActivities(result.items);
      if (generation !== searchGeneration.current) return;
      setData(current => ({ ...current, activities: [...current.activities, ...next.filter(row => !current.activities.some(existing => existing.id === row.id))] }));
      setPage(result.page); setHasMore(result.hasMore);
    } catch (e: any) { if (generation === searchGeneration.current) setError(e.message); } finally { if (generation === searchGeneration.current) setLoadingMore(false); }
  };
  const chooseFilter = async (next: Filter) => { setFilter(next); if (next !== 'Nearby' || position) return; setLoading(true); setError(''); try { setPosition(await activityLocationService.current()); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  const rows = useMemo(() => {
    let result = data.activities.filter(item => item.status !== 'draft' && item.status !== 'cancelled');
    if (query.trim()) { const q = query.trim().toLowerCase(); result = result.filter(item => `${item.title} ${item.description || ''} ${item.where} ${item.category}`.toLowerCase().includes(q)); }
    if (category !== 'All') result = result.filter(item => item.category === category);
    if (freeOnly) result = result.filter(item => !item.costsMayApply && !item.entryFeeRequired && item.price === 'Free');
    if (filter === 'Popular') result = [...result].sort((a, b) => (b.likeCount || 0) + b.joined - ((a.likeCount || 0) + a.joined));
    if (filter === 'Nearby') result = position ? result.filter(item => item.latitude != null && item.longitude != null && distanceKm(position.latitude, position.longitude, item.latitude, item.longitude) <= 25) : [];
    if (filter === 'Today' || filter === 'Tomorrow') { const target = new Date(); if (filter === 'Tomorrow') target.setDate(target.getDate() + 1); result = result.filter(item => item.startsAt && new Date(item.startsAt).toDateString() === target.toDateString()); }
    return result;
  }, [data.activities, query, category, freeOnly, filter, position]);
  const save = async (activity: Activity) => { const key = `activity:${activity.id}`; const saved = data.savedIds.includes(key); try { await activityService.setSaved(activity.id, !saved); setData(current => ({ ...current, savedIds: saved ? current.savedIds.filter(id => id !== key) : [...current.savedIds, key] })); } catch (e: any) { setError(e.message); } };

  return <Page><BrandBar go={go} location={data.location || 'Nearby'} /><ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}>
    <View style={{ marginHorizontal: -14, marginTop: 2 }}><SearchField accessibilityLabel="Search activities" placeholder="Search activities, places, or interests" value={query} onChangeText={setQuery} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 5 }}>{(['All', 'Popular', 'Nearby', 'Today', 'Tomorrow'] as Filter[]).map(item => { const active = item === filter; return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={item} onPress={() => void chooseFilter(item)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name={filterIcon[item]} size={13} color={active ? '#FFF' : c.accent} /><Text style={{ color: active ? '#FFF' : c.muted, fontSize: 10, fontWeight: '700' }}>{item}</Text></Pressable>; })}<Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: filtersOpen || freeOnly || category !== 'All' ? c.accent : c.card, borderWidth: 1, borderColor: filtersOpen || freeOnly || category !== 'All' ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="options-outline" size={13} color={filtersOpen || freeOnly || category !== 'All' ? '#FFF' : c.accent} /><Text style={{ color: filtersOpen || freeOnly || category !== 'All' ? '#FFF' : c.muted, fontSize: 10, fontWeight: '700' }}>Filters</Text></Pressable></ScrollView>
    {filtersOpen ? <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginTop: 8, paddingVertical: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 12, flex: 1 }}>Refine activities</Text>{category !== 'All' || freeOnly ? <Pressable accessibilityRole="button" onPress={() => { setCategory('All'); setFreeOnly(false); }}><Text style={{ color: c.accent, fontSize: 10, fontWeight: '700' }}>Reset</Text></Pressable> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 4 }}><Pills values={['All', ...INTEREST_CATEGORIES.filter(value => !/qa|test|automation/i.test(value)).slice(0, 12)]} selected={category} onChange={setCategory} /></ScrollView><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: freeOnly }} onPress={() => setFreeOnly(value => !value)} style={{ minHeight: 42, marginHorizontal: 13, borderTopWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name={freeOnly ? 'checkbox' : 'square-outline'} color={freeOnly ? c.accent : c.muted} size={19} /><Text style={{ color: c.text, fontSize: 11, flex: 1 }}>Free activities only</Text></Pressable></View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 10 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Activities{data.location ? ` in ${data.location}` : ''}</Text><Text style={{ color: c.muted, fontSize: 9, marginTop: 2 }}>{filter === 'Nearby' ? 'Within 25 km of your current location' : category !== 'All' ? category : 'Explore available activities'}</Text></View><Text style={{ color: c.accent, fontSize: 10, fontWeight: '700' }}>{rows.length} found</Text></View>
    <ErrorLine text={error} />
    {loading ? <ActivityIndicator color={c.accent} style={{ marginTop: 36 }} /> : rows.map(item => { const saved = data.savedIds.includes(`activity:${item.id}`); const participation = participationLabel(item.viewerStatus); return <View key={item.id} style={{ backgroundColor: c.card, borderRadius: 17, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 11 }}>
      <View style={{ height: 148 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${item.title}`} onPress={() => openActivity(item.id)} style={({ pressed }) => ({ flex: 1, opacity: pressed ? .8 : 1 })}>
          <Image source={typeof item.image === 'string' ? { uri: item.image } : item.image} resizeMode="cover" style={{ width: '100%', height: '100%', backgroundColor: c.inset }} />
          <View style={{ position: 'absolute', inset: 0, backgroundColor: '#06101D14' }} />
          <View style={{ position: 'absolute', top: 9, left: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#FFFFFFEE' }}><Text style={{ color: '#392CC3', fontSize: 8, fontWeight: '800' }}>{item.category || 'Activity'}</Text></View>{participation ? <View style={{ borderRadius: 13, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: participation === 'Joined' ? '#159B67E8' : '#E08B27E8' }}><Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>{participation}</Text></View> : null}</View>
          <View style={{ position: 'absolute', right: 9, bottom: 9, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#07111FD9' }}><Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>{item.price || 'Free'} · {item.entryFeeRequired ? 'Entry fee required' : 'Free to join'}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Unsave ${item.title}` : `Save ${item.title}`} onPress={() => void save(item)} style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 18, backgroundColor: '#07111FCC', alignItems: 'center', justifyContent: 'center' }}><Icon name={saved ? 'bookmark' : 'bookmark-outline'} color="#FFF" size={17} /></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${item.title} details`} onPress={() => openActivity(item.id)} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 11, gap: 6, opacity: pressed ? .8 : 1 })}>
        <Text numberOfLines={2} style={{ color: c.text, fontSize: 15, lineHeight: 19, fontWeight: '800' }}>{item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="calendar-outline" color={c.accent} size={13} /><Text numberOfLines={1} style={{ color: c.accent, fontSize: 9, fontWeight: '700', flex: 1 }}>{time(item.startsAt)}</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="location-outline" color={c.muted} size={13} /><Text numberOfLines={1} style={{ color: c.muted, fontSize: 9, flex: 1 }}>{item.where || 'Location to be decided'}</Text></View>
        {item.description ? <Text style={{ color: c.muted, fontSize: 10, lineHeight: 15 }} numberOfLines={1}>{item.description}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 7 }}><UserAvatar uri={item.hostAvatar} name={item.host} size={26} /><Text numberOfLines={1} style={{ color: c.text, fontSize: 10, fontWeight: '700', flexShrink: 1 }}>{item.host}</Text><VerifiedBadge userId={item.ownerId} size={14} /><View style={{ flex: 1 }} />{item.likeCount ? <><Icon name="heart-outline" size={13} color={c.muted} /><Text style={{ color: c.muted, fontSize: 9 }}>{item.likeCount}</Text></> : null}<Icon name="people-outline" size={14} color={c.muted} /><Text style={{ color: c.muted, fontSize: 9 }}>{item.joined}{item.seats ? ` / ${item.seats}` : ''}</Text></View>
      </Pressable>
    </View>; })}
    {hasMore && !loading ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={{ padding: 16, alignItems: 'center' }}><Text style={{ color: c.accent, fontWeight: '700' }}>{loadingMore ? 'Loading…' : 'Load more activities'}</Text></Pressable> : null}
    {!loading && !rows.length ? <View style={{ alignItems: 'center', gap: 9, paddingVertical: 42 }}><Icon name="compass-outline" size={40} color={c.muted} /><Text style={{ color: c.text, fontWeight: '800' }}>No activities found</Text><Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>Try another filter or explore a different category.</Text></View> : null}
  </ScrollView></Page>;
}
