import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { Activity, AppData, Screen } from '../../../App';
import { activitiesProductionService } from '../../services/activities-production';
import { activityLocationService } from '../../services/activity-location';
import { activityService } from '../../services/wenitro';
import { INTEREST_CATEGORIES } from '../../domain/interest-categories';
import { viewerCanListActivity } from '../../domain/activity-visibility';
import { Button, ErrorLine, Header, Icon, Page, Pills, SearchField, Sheet, usePalette, purple } from '../reconstruction/ui';
import { prepareReferenceActivities } from '../reconstruction/feed-search';
import { UserAvatar } from '../user-avatar';
import { VerifiedBadge } from '../verified-badge';

type Filter = 'All' | 'Popular' | 'Nearby' | 'Today' | 'Tomorrow';
const distanceKm = (a: number, b: number, c: number, d: number) => { const r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))); };
const time = (value?: string) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date to be decided';
const filterIcon: Record<Filter, React.ComponentProps<typeof Icon>['name']> = { All: 'apps-outline', Popular: 'flame-outline', Nearby: 'location-outline', Today: 'time-outline', Tomorrow: 'calendar-outline' };
const participationLabel = (value?: Activity['viewerStatus']) => ['approved', 'going', 'paid'].includes(String(value)) ? 'Joined' : ['pending', 'waitlist'].includes(String(value)) ? 'Pending' : null;
const dateLabel = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date';
const paidActivity = (item: Activity) => item.costsMayApply || item.entryFeeRequired || Number(item.price.replace(/[^0-9.]/g, '')) > 0;
function useDarkColorScheme(c: ReturnType<typeof usePalette>) { return c.isDark ? 'dark' : 'light'; }

export function ClientActivitiesScreen({ data, setData, go, openActivity }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; go: (screen: Screen) => void; openActivity: (id: string) => void }) {
  const c = usePalette();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [price, setPrice] = useState('All');
  const [gender, setGender] = useState('All');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [draft, setDraft] = useState({ dateFrom: '', dateTo: '', price: 'All', gender: 'All', verifiedOnly: false });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(data.activities.length === 0);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchGeneration = useRef(0);
  const filtersActive = categories.length || dateFrom || dateTo || price !== 'All' || gender !== 'All' || verifiedOnly;

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
    let result = data.activities.filter(item => item.status !== 'draft' && item.status !== 'cancelled' && viewerCanListActivity(item, data.userId));
    if (query.trim()) { const q = query.trim().toLowerCase(); result = result.filter(item => `${item.title} ${item.description || ''} ${item.where} ${item.category}`.toLowerCase().includes(q)); }
    if (categories.length) result = result.filter(item => categories.includes(item.category));
    if (dateFrom) result = result.filter(item => item.startsAt && Date.parse(item.startsAt) >= Date.parse(`${dateFrom}T00:00:00`));
    if (dateTo) result = result.filter(item => item.startsAt && Date.parse(item.startsAt) <= Date.parse(`${dateTo}T23:59:59`));
    if (price === 'Free') result = result.filter(item => !item.costsMayApply && !item.entryFeeRequired && item.price === 'Free');
    if (price === 'Paid') result = result.filter(paidActivity);
    if (gender !== 'All') { const wanted = gender === 'Non-binary' ? 'non_binary' : gender.toLowerCase(); result = result.filter(item => String(item.genderPreference || '').toLowerCase() === wanted); }
    if (verifiedOnly) result = result.filter(item => item.verifiedOnly);
    if (filter === 'Popular') result = [...result].sort((a, b) => (b.likeCount || 0) + b.joined - ((a.likeCount || 0) + a.joined));
    if (filter === 'Nearby') result = position ? result.filter(item => item.latitude != null && item.longitude != null && distanceKm(position.latitude, position.longitude, item.latitude, item.longitude) <= 25) : [];
    if (filter === 'Today' || filter === 'Tomorrow') { const target = new Date(); if (filter === 'Tomorrow') target.setDate(target.getDate() + 1); result = result.filter(item => item.startsAt && new Date(item.startsAt).toDateString() === target.toDateString()); }
    return result;
  }, [data.activities, query, categories, dateFrom, dateTo, price, gender, verifiedOnly, filter, position]);
  const save = async (activity: Activity) => { const key = `activity:${activity.id}`; const saved = data.savedIds.includes(key); try { await activityService.setSaved(activity.id, !saved); setData(current => ({ ...current, savedIds: saved ? current.savedIds.filter(id => id !== key) : [...current.savedIds, key] })); } catch (e: any) { setError(e.message); } };

  return <Page>
    <Header title="Activities" back={() => go('feed')} />
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}>
      <View style={{ marginHorizontal: -14, marginTop: 2 }}><SearchField accessibilityLabel="Search activities" placeholder="Search activities, places, or interests" value={query} onChangeText={setQuery} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 5 }}>
        {(['All', 'Popular', 'Nearby', 'Today', 'Tomorrow'] as Filter[]).map(item => {
          const active = item === filter;
          return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={item} onPress={() => void chooseFilter(item)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: active ? c.accent : c.card, borderWidth: 1, borderColor: active ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={filterIcon[item]} size={15} color={active ? '#FFF' : c.accent} />
            <Text style={{ color: active ? '#FFF' : c.text, fontSize: 13, fontWeight: '800' }}>{item}</Text>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Open activity filters" accessibilityState={{ expanded: filtersOpen }} onPress={() => { setDraftCategories(categories); setDraft({ dateFrom, dateTo, price, gender, verifiedOnly }); setFiltersOpen(true); }} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: filtersActive ? c.accent : c.card, borderWidth: 1, borderColor: filtersActive ? c.accent : c.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="options-outline" size={15} color={filtersActive ? '#FFF' : c.accent} />
          <Text style={{ color: filtersActive ? '#FFF' : c.text, fontSize: 13, fontWeight: '800' }}>Filter</Text>
        </Pressable>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>Activities{data.location ? ` in ${data.location}` : ''}</Text>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600', marginTop: 3 }}>{filter === 'Nearby' ? 'Within 25 km of your current location' : categories.length ? categories.join(', ') : 'Explore available activities'}</Text>
        </View>
        <Text style={{ color: c.accent, fontSize: 13, fontWeight: '800' }}>{rows.length} found</Text>
      </View>
      <ErrorLine text={error} />
      {loading ? <ActivityIndicator color={c.accent} style={{ marginTop: 36 }} /> : rows.map(item => {
        const saved = data.savedIds.includes(`activity:${item.id}`);
        const participation = participationLabel(item.viewerStatus);
        return <View key={item.id} style={{ backgroundColor: c.card, borderRadius: 17, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 11 }}>
          <View style={{ height: 148 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${item.title}`} onPress={() => openActivity(item.id)} style={({ pressed }) => ({ flex: 1, opacity: pressed ? .8 : 1 })}>
              <Image source={typeof item.image === 'string' ? { uri: item.image } : item.image} resizeMode="cover" style={{ width: '100%', height: '100%', backgroundColor: c.inset }} />
              <View style={{ position: 'absolute', inset: 0, backgroundColor: '#06101D14' }} />
              <View style={{ position: 'absolute', top: 9, left: 9, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#FFFFFFEE' }}><Text style={{ color: '#392CC3', fontSize: 11, fontWeight: '800' }}>{item.category || 'Activity'}</Text></View>
                {participation ? <View style={{ borderRadius: 13, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: participation === 'Joined' ? '#159B67E8' : '#E08B27E8' }}><Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{participation}</Text></View> : null}
              </View>
              <View style={{ position: 'absolute', right: 9, bottom: 9, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#07111FD9' }}><Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{item.price || 'Free'} · {item.entryFeeRequired ? 'Entry fee required' : 'Free to join'}</Text></View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Unsave ${item.title}` : `Save ${item.title}`} onPress={() => void save(item)} style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 18, backgroundColor: '#07111FCC', alignItems: 'center', justifyContent: 'center' }}><Icon name={saved ? 'bookmark' : 'bookmark-outline'} color="#FFF" size={17} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open activity ${item.title} details`} onPress={() => openActivity(item.id)} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 12, gap: 7, opacity: pressed ? .8 : 1 })}>
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }}>{item.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="calendar-outline" color={c.accent} size={15} /><Text numberOfLines={1} style={{ color: c.accent, fontSize: 13, fontWeight: '800', flex: 1 }}>{time(item.startsAt)}</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="location-outline" color={c.muted} size={15} /><Text numberOfLines={1} style={{ color: c.muted, fontSize: 13, fontWeight: '600', flex: 1 }}>{item.where || 'Location to be decided'}</Text></View>
            {item.description ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' }} numberOfLines={2}>{item.description}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 7 }}>
              <UserAvatar uri={item.hostAvatar} name={item.host} size={26} />
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '800', flexShrink: 1 }}>{item.host}</Text>
              <VerifiedBadge userId={item.ownerId} size={14} />
              <View style={{ flex: 1 }} />
              {item.likeCount ? <><Icon name="heart-outline" size={15} color={c.muted} /><Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{item.likeCount}</Text></> : null}
              <Icon name="people-outline" size={16} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{item.joined}{item.seats ? ` / ${item.seats}` : ''}</Text>
            </View>
          </Pressable>
        </View>;
      })}
      {hasMore && !loading ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={{ padding: 16, alignItems: 'center' }}><Text style={{ color: c.accent, fontWeight: '800', fontSize: 14 }}>{loadingMore ? 'Loading…' : 'Load more activities'}</Text></Pressable> : null}
      {!loading && !rows.length ? <View style={{ alignItems: 'center', gap: 9, paddingVertical: 42 }}><Icon name="compass-outline" size={40} color={c.muted} /><Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>No activities found</Text><Text style={{ color: c.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Try another filter or explore a different category.</Text></View> : null}
    </ScrollView>
    {filtersOpen && <Sheet title="Filters" close={() => setFiltersOpen(false)} footer={<View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="Reset All" onPress={() => { setDraftCategories([]); setDraft({ dateFrom: '', dateTo: '', price: 'All', gender: 'All', verifiedOnly: false }); }} /></View><View style={{ flex: 1 }}><Button label="Apply Filters" onPress={() => { setCategories(draftCategories); setDateFrom(draft.dateFrom); setDateTo(draft.dateTo); setPrice(draft.price); setGender(draft.gender); setVerifiedOnly(draft.verifiedOnly); setFiltersOpen(false); }} /></View></View>}>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Date Filter</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['dateFrom', 'dateTo'] as const).map((key, index) => (
          <View key={key} style={{ flex: 1, gap: 7 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{index ? 'To' : 'From'}</Text>
            {Platform.OS === 'web' ? (
              <View style={{ minHeight: 48, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <Icon name="calendar-outline" color={c.muted} size={16} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{dateLabel(draft[key])}</Text>
                {React.createElement('input', { type: 'date', 'aria-label': index ? 'Date to' : 'Date from', value: draft[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(v => ({ ...v, [key]: e.target.value })), style: { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', colorScheme: useDarkColorScheme(c) } })}
              </View>
            ) : (
              <Pressable style={{ minHeight: 48, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 9, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar-outline" color={c.muted} size={16} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{dateLabel(draft[key])}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Price</Text>
      <Pills values={['All', 'Free', 'Paid']} selected={draft.price} onChange={value => setDraft(v => ({ ...v, price: value }))} />
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Gender Preference</Text>
      <Pills values={['All', 'Male', 'Female']} selected={draft.gender} onChange={value => setDraft(v => ({ ...v, gender: value }))} />
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.gender === 'Non-binary' }} onPress={() => setDraft(v => ({ ...v, gender: 'Non-binary' }))} style={{ alignSelf: 'flex-start', backgroundColor: draft.gender === 'Non-binary' ? purple : c.card, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 }}>
        <Text style={{ color: draft.gender === 'Non-binary' ? '#FFF' : c.muted, fontSize: 13, fontWeight: '800' }}>Non-binary</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Exclusive for Verified Users</Text>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>Show activities restricted to verified profiles.</Text>
        </View>
        <Switch accessibilityLabel="Exclusive for Verified Users" value={draft.verifiedOnly} onValueChange={value => setDraft(v => ({ ...v, verifiedOnly: value }))} trackColor={{ true: purple, false: c.border }} />
      </View>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 15 }}>Categories</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {INTEREST_CATEGORIES.filter(value => !/qa|automation|test/i.test(value)).map(value => {
          const selected = draftCategories.includes(value);
          return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={value} onPress={() => setDraftCategories(current => selected ? current.filter(item => item !== value) : [...current, value])} style={{ width: '47%', minHeight: 58, borderWidth: 1, borderColor: selected ? '#8E7CFF' : c.border, backgroundColor: selected ? '#6D5AEF24' : c.card, borderRadius: 10, padding: 10, justifyContent: 'center' }}>
            <Text style={{ color: selected ? '#A99CFF' : c.text, fontSize: 13, fontWeight: '700' }}>{value}</Text>
          </Pressable>;
        })}
      </View>
    </Sheet>}
  </Page>;
}
