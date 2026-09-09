import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { activityService } from '../../services/wenitro';
import { activityLocationService } from '../../services/activity-location';
import { AGE_PRESETS, GENDER_OPTIONS, HOST_CATEGORIES, ageError, hostStepError, localDateTime, newHostDraft, type HostDraft, type HostLocation } from '../../domain/host-activity';
import CoverEditor from './cover-editor';
import { MOBILE_APP_MAX_WIDTH, MobileOverlayFrame } from '../mobile-app-shell';
import { usePalette as useReferencePalette } from '../reconstruction/ui';
type HostColors = {
  isDark: boolean; bg: string; input: string; border: string; muted: string; text: string;
  purple: string; overlay: string; danger: string;
};
function useHostColors(): HostColors {
  const palette = useReferencePalette();
  return React.useMemo(() => ({
    isDark: palette.isDark,
    bg: palette.bg,
    input: palette.input,
    border: palette.border,
    muted: palette.muted,
    text: palette.text,
    purple: palette.accent,
    overlay: palette.overlay,
    danger: palette.danger,
  }), [palette]);
}
function useHostTheme() {
  const c = useHostColors();
  const s = React.useMemo(() => createStyles(c), [c]);
  return { c, s };
}
type Icon = React.ComponentProps<typeof Ionicons>['name'];
function Glyph({ name, size = 20, color }: { name: Icon; size?: number; color?: string }) { const c = useHostColors(); return <Ionicons name={name} size={size} color={color || c.purple} />; }
function Control({ label, icon, style, ...props }: TextInputProps & { label: string; icon?: Icon }) {
  const { c, s } = useHostTheme();
  const [focused, setFocused] = useState(false);
  return <View style={[s.inputShell, props.multiline && { alignItems: 'flex-start', minHeight: 108 }, focused && { borderColor: c.purple }, style]}>
    {icon ? <View style={{ paddingTop: props.multiline ? 2 : 0 }}><Glyph name={icon} color={focused ? c.purple : c.muted} /></View> : null}
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={c.muted} onFocus={e => { setFocused(true); props.onFocus?.(e); }} onBlur={e => { setFocused(false); props.onBlur?.(e); }} style={[s.input, props.multiline && { minHeight: 82, textAlignVertical: 'top' }]} />
  </View>;
}
function Toggle({ label, description, value, onChange, icon }: { label: string; description: string; value: boolean; onChange: () => void; icon?: Icon }) {
  const { c, s } = useHostTheme();
  const motion = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => { Animated.timing(motion, { toValue: value ? 1 : 0, duration: 140, useNativeDriver: true }).start(); }, [value, motion]);
  // Custom geometry is intentional: the supplied Android reference defines this switch.
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} aria-checked={value} onPress={onChange} style={s.toggleRow}>
    <View style={{ flex: 1, gap: 9 }}><View style={s.inline}>{icon && <Glyph name={icon} size={18} />}<Text style={s.settingTitle}>{label}</Text></View><Text style={s.settingDescription}>{description}</Text></View>
    <View style={[s.track, value && { backgroundColor: c.isDark ? '#4C3E99' : '#D7D1FF' }]}><Animated.View style={[s.thumb, { backgroundColor: value ? c.purple : c.isDark ? '#24313E' : '#FFFFFF', transform: [{ translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [0, 13] }) }] }]} /></View>
  </Pressable>;
}
function ChoiceRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { const { c, s } = useHostTheme(); return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={s.choice}><Text style={s.body}>{label}</Text><View style={s.inline}><Text style={s.value}>{value}</Text><Glyph name="chevron-forward" size={12} color={c.muted} /></View></Pressable>; }
function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { s } = useHostTheme();
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}><MobileOverlayFrame><KeyboardAvoidingView style={s.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Pressable accessibilityLabel="Close dialog" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View accessibilityViewIsModal style={s.dialog}><Text style={s.dialogTitle}>{title}</Text><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>{children}</ScrollView><Pressable accessibilityRole="button" onPress={onClose} style={s.cancel}><Text style={s.settingTitle}>Cancel</Text></Pressable></View>
  </KeyboardAvoidingView></MobileOverlayFrame></Modal>;
}
function Option({ label, subtitle, selected, onPress }: { label: string; subtitle?: string; selected: boolean; onPress: () => void }) { const { c, s } = useHostTheme(); return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected} accessibilityLabel={label} onPress={onPress} style={s.option}><View style={{ flex: 1, gap: 4 }}><Text style={[s.body, selected && { color: c.purple }]}>{label}</Text>{subtitle && <Text style={s.small}>{subtitle}</Text>}</View>{selected && <Glyph name="checkmark" size={18} />}</Pressable>; }
function ScheduleField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { c, s } = useHostTheme();
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const current = Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  return <View style={{ flex: 1, gap: 10 }}><Text style={s.scheduleLabel}>{label}</Text>
    {Platform.OS === 'web' ? React.createElement('input', { type: 'datetime-local', 'aria-label': label, value, onInput: (e: React.FormEvent<HTMLInputElement>) => onChange(e.currentTarget.value), onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), style: { width: '100%', minWidth: 0, boxSizing: 'border-box', border: 0, borderBottom: `1px solid ${c.border}`, color: c.text, colorScheme: c.isDark ? 'dark' : 'light', background: 'transparent', padding: '5px 0 12px', fontSize: 13, fontFamily: 'inherit' } }) : <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setMode('date')} style={s.dateButton}><Text style={s.body}>{current.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></Pressable>}
    {mode && Platform.OS !== 'web' ? <DateTimePicker value={current} mode={mode} onChange={(event, next) => { if (event.type !== 'set' || !next) { setMode(null); return; } onChange(localDateTime(next)); setMode(mode === 'date' ? 'time' : null); }} /> : null}
  </View>;
}
function LocationSearch({ onSelect, onClose }: { onSelect: (l: HostLocation) => void; onClose: () => void }) {
  const { c, s } = useHostTheme();
  const [search, setSearch] = useState(''), [results, setResults] = useState<HostLocation[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current; const controller = new AbortController(); currentRequest.current?.abort(); currentRequest.current = controller;
    setResults([]); setError(''); setBusy(false);
    const timer = setTimeout(async () => {
      if (search.trim().length < 3 || id !== generation.current) return; setBusy(true);
      try { const rows = await activityLocationService.search(search, controller.signal); if (id === generation.current) setResults(rows); }
      catch (e) { if (!controller.signal.aborted && id === generation.current) setError(e instanceof Error ? e.message : 'Could not search locations.'); }
      finally { if (id === generation.current) setBusy(false); }
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); generation.current++; };
  }, [search]);
  useEffect(() => () => currentRequest.current?.abort(), []);
  const current = async () => {
    const id = ++generation.current; currentRequest.current?.abort(); const controller = new AbortController(); currentRequest.current = controller; setBusy(true); setError('');
    try { const place = await activityLocationService.current(controller.signal); if (id === generation.current) onSelect(place); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not locate you.'); }
    finally { if (id === generation.current) setBusy(false); }
  };
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}><MobileOverlayFrame><SafeAreaView style={s.root} edges={['top', 'bottom']}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Close location search" onPress={onClose} style={s.back}><Glyph name="close" color={c.text} /></Pressable><Text style={[s.headerTitle, { textAlign: 'center' }]}>Search Location</Text><View style={{ width: 40 }} /></View>
    <View style={{ padding: 18 }}><Control label="Search Location" icon="search-outline" value={search} onChangeText={setSearch} placeholder="Enter address or place..." autoCapitalize="none" /><Pressable accessibilityRole="button" disabled={busy} onPress={() => void current()} style={[s.inline, { minHeight: 56 }]}><Glyph name="locate-outline" size={18} /><Text style={s.settingTitle}>Use Current Location</Text></Pressable></View>
    {busy && <ActivityIndicator color={c.purple} />}{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18 }}>{results.map((r, i) => <Pressable key={`${r.latitude}:${r.longitude}:${i}`} accessibilityRole="button" onPress={() => onSelect(r)} style={[s.option, { paddingHorizontal: 0 }]}><Glyph name="navigate-outline" size={18} /><View style={{ flex: 1, gap: 5, marginLeft: 9 }}><Text style={s.settingTitle}>{r.label}</Text><Text style={s.small}>{r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}</Text></View></Pressable>)}{!busy && !error && search.trim().length >= 3 && !results.length ? <Text style={s.small}>No results found</Text> : null}</ScrollView>
    <Text onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')} style={[s.small, { textAlign: 'center', padding: 12 }]}>Location data © OpenStreetMap contributors · Photon</Text>
  </SafeAreaView></MobileOverlayFrame></Modal>;
}
export function HostLanding({ onActivity, onVibe, onCommunity }: { onActivity: () => void; onVibe: () => void; onCommunity: () => void }) {
  const palette = useReferencePalette(); const { c, s } = useHostTheme(); const light = !palette.isDark;
  return <SafeAreaView edges={['top']} style={[s.root, { backgroundColor: palette.bg }]}><ScrollView contentContainerStyle={{ padding: 20, paddingTop: 32, gap: 18 }}><View style={{ gap: 8, marginBottom: 12 }}><Text style={[s.heading, { color: palette.text }]}>Create &amp; Share</Text><Text style={[s.subtitle, { color: palette.muted }]}>Plan an activity, capture your experiences, or build group communities</Text></View>
    {([
      ['calendar-outline', 'Host an Activity', 'Plan a meet-up, sports gathering, match, or custom event with others.', '#6857F1', light ? '#F6F5FF' : '#222A3C', onActivity],
      ['film-outline', 'Post a Vibe', 'Share photos and video highlights of active experiences in real-time.', '#EB258E', light ? '#FFF4F9' : '#352338', onVibe],
      ['people-outline', 'Create a Community', 'Start a new group chat room for your interests, vibe, or events.', '#0EC1C7', light ? '#F0FBFC' : '#1C3944', onCommunity],
    ] as const).map(([icon, title, description, color, bg, action]) => <Pressable accessibilityRole="button" accessibilityLabel={title} key={title} onPress={action} style={[s.landingCard, { backgroundColor: bg, borderWidth: light ? 1 : 0, borderColor: palette.border }]}><View style={[s.landingIcon, { backgroundColor: color }]}><Glyph name={icon} color="white" size={26} /></View><View style={{ flex: 1, gap: 6 }}><Text style={[s.settingTitle, { color: palette.text }]}>{title}</Text><Text style={[s.small, { color: palette.muted }]}>{description}</Text></View><View style={[s.roundArrow, { backgroundColor: light ? palette.inset : '#FFFFFF13' }]}><Glyph name="chevron-forward" size={14} color={palette.text} /></View></Pressable>)}
  </ScrollView></SafeAreaView>;
}
export function HostActivityScreen({ userId, isPartner, onBack, onCreated, onDrafted }: { userId: string; isPartner: boolean; onBack: () => void; onCreated: (activity: Awaited<ReturnType<typeof activityService.create>>) => void; onDrafted?: (activity: Awaited<ReturnType<typeof activityService.createDraft>>) => void }) {
  const { c, s } = useHostTheme();
  const [draft, setDraft] = useState<HostDraft>(() => newHostDraft()), [step, setStep] = useState(0), [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<'visibility' | 'age' | 'gender' | 'exit' | 'customAge' | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false), [categorySearch, setCategorySearch] = useState('');
  const [locationOpen, setLocationOpen] = useState(false), [cropUri, setCropUri] = useState('');
  const [ageMin, setAgeMin] = useState(''), [ageMax, setAgeMax] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [draftNotice, setDraftNotice] = useState('');
  const draftLoaded = useRef(false), completed = useRef(false);
  const committedId = useRef<string | null>(null); const [createdId, setCreatedId] = useState<string | null>(null);
  const committedStatus = useRef<'draft' | 'published' | null>(null);
  const persistedCoverUri = useRef('');
  const lock = useRef(false), alive = useRef(true), scroll = useRef<ScrollView>(null), pendingStorage = useRef(Promise.resolve());
  const opacity = useRef(new Animated.Value(1)).current;
  const draftRef = useRef(draft); draftRef.current = draft; const storageKey = `wenitro:host-draft:v2:${userId}`;
  const patch = (p: Partial<HostDraft>) => { setDraft(d => ({ ...d, ...p })); setError(''); setDraftNotice(''); };
  useEffect(() => { alive.current = true; let active = true; void AsyncStorage.getItem(storageKey).then(raw => {
    if (raw && active) { const saved = JSON.parse(raw); if (saved.version === 2 && saved.draft && typeof saved.draft.title === 'string') { setDraft({ ...newHostDraft(), ...saved.draft }); if (typeof saved.createdId === 'string') { committedId.current = saved.createdId; committedStatus.current = saved.createdStatus === 'draft' ? 'draft' : 'published'; persistedCoverUri.current = typeof saved.persistedCoverUri === 'string' ? saved.persistedCoverUri : ''; setCreatedId(saved.createdId); setStep(2); } setDraftNotice('Your saved draft has been restored.'); } }
  }).catch(() => { if (active) setDraftNotice('Could not restore the local draft.'); }).finally(() => { if (active) { draftLoaded.current = true; setLoaded(true); } }); return () => { active = false; alive.current = false; if (draftLoaded.current && !completed.current) void store().catch(() => undefined); }; }, [storageKey]);
  const store = (d = draftRef.current) => {
    const serialized = JSON.stringify({ version: 2, draft: d, createdId: committedId.current, createdStatus: committedStatus.current, persistedCoverUri: persistedCoverUri.current });
    pendingStorage.current = pendingStorage.current.catch(() => undefined).then(() => AsyncStorage.setItem(storageKey, serialized)); return pendingStorage.current;
  };
  useEffect(() => { if (!loaded || lock.current) return; const timer = setTimeout(() => { void store().catch(() => { if (alive.current) setDraftNotice('Draft could not be saved on this device. Keep this screen open.'); }); }, 350); return () => clearTimeout(timer); }, [draft, loaded]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unload = (e: BeforeUnloadEvent) => { if (draftRef.current.title || draftRef.current.description) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, []);
  const transition = (next: number) => { Keyboard.dismiss(); setCategoryOpen(false); setError(''); setStep(next); scroll.current?.scrollTo({ y: 0, animated: false }); opacity.setValue(.55); Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start(); };
  const back = () => { if (lock.current) return; if (step) transition(step - 1); else if (draft.title || draft.description || draft.coverUri) setDialog('exit'); else onBack(); };
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => handler.remove(); }, [step, draft]);
  const pick = async () => {
    try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: Platform.OS !== 'web', aspect: [1080, 600], quality: .85 });
      const asset = !result.canceled && result.assets[0]; if (!asset) return;
      if ((asset.fileSize ?? 0) > 12 * 1024 * 1024) throw new Error('Choose a photo smaller than 12 MB.');
      if (Platform.OS === 'web') setCropUri(asset.uri); else patch({ coverUri: asset.uri, coverContentType: asset.mimeType || 'image/jpeg' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the photo picker.'); }
  };
  const activityInput = (onCommitted?: (id: string) => Promise<void>) => ({
    onCommitted,
    title: draft.title,
    description: draft.description,
    category: draft.category,
    location: draft.location!.label,
    latitude: draft.location!.latitude,
    longitude: draft.location!.longitude,
    locationInstruction: draft.locationInstruction,
    verifiedOnly: draft.verifiedOnly,
    ageMin: Number(draft.ageMin),
    ageMax: draft.ageMax ? Number(draft.ageMax) : null,
    genderPreference: draft.gender || null,
    capacity: draft.capacity ? Number(draft.capacity) : null,
    startsAt: draft.dateLater ? null : new Date(draft.start).toISOString(),
    endsAt: draft.dateLater ? null : new Date(draft.end).toISOString(),
    registrationClosesAt: draft.dateLater ? null : new Date(draft.deadline).toISOString(),
    priceInr: draft.paid ? Number(draft.price) : 0,
    activityType: 'meetup',
    visibility: draft.visibility,
    joinType: draft.approval ? 'approval' : 'direct',
    coverMedia: draft.coverUri && draft.coverUri !== persistedCoverUri.current ? { uri: draft.coverUri, contentType: draft.coverContentType } : undefined,
  } as const);
  const saveDraft = async () => {
    if (lock.current) return;
    const invalid = [0, 1, 2].map(i => hostStepError(draft, i, isPartner)).find(Boolean);
    if (invalid) {
      await store();
      setDraftNotice('Draft saved on this device. Complete the required fields to add it to Profile.');
      return;
    }
    lock.current = true; setSaving(true); setError('');
    try {
      const input = activityInput(async id => {
        committedId.current = id;
        committedStatus.current = 'draft';
        persistedCoverUri.current = draft.coverUri;
        setCreatedId(id);
        await store();
      });
      const saved = committedId.current
        ? await activityService.update(committedId.current, { ...input, status: 'draft' })
        : await activityService.createDraft(input);
      committedStatus.current = 'draft';
      if (draft.coverUri) persistedCoverUri.current = draft.coverUri;
      await store();
      onDrafted?.(saved);
      setDraftNotice('Draft saved to Profile. You can reopen and publish it later.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the draft.'); }
    finally { lock.current = false; setSaving(false); }
  };
  const submit = async () => {
    if (lock.current) return;
    const invalid = [0, 1, 2].map(i => hostStepError(draft, i, isPartner)).find(Boolean); if (invalid && !committedId.current) { setError(invalid); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      const input = activityInput(async id => { committedId.current = id; committedStatus.current = 'published'; persistedCoverUri.current = draft.coverUri; setCreatedId(id); await store(); });
      const created = committedId.current
        ? committedStatus.current === 'draft'
          ? await activityService.update(committedId.current, { ...input, status: 'published' })
          : (await activityService.getDetails(committedId.current)).activity
        : await activityService.create(input);
      committedStatus.current = 'published';
      completed.current = true; await pendingStorage.current.catch(() => undefined); await AsyncStorage.removeItem(storageKey).catch(() => undefined);
      if (alive.current) onCreated(created);
    } catch (e) { if (alive.current) setError(committedId.current ? 'Your activity was created. Tap Open Activity to retry loading it.' : e instanceof Error ? e.message : 'Could not host your activity. Please try again.'); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  if (!loaded) return <View style={[s.root, { justifyContent: 'center' }]}><ActivityIndicator color={c.purple} /></View>;
  const invalid = createdId ? '' : hostStepError(draft, step, isPartner);
  return <SafeAreaView style={s.root} edges={['top']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={saving} onPress={back} style={s.back}><Glyph name="arrow-back" color={c.text} /></Pressable><Text style={s.headerTitle}>Host Activity</Text><Pressable accessibilityRole="button" accessibilityLabel="Save Draft" disabled={saving} onPress={() => { void saveDraft(); }} style={{ padding: 10 }}><Text style={{ color: c.purple, fontWeight: '700', fontSize: 14 }}>Draft</Text></Pressable></View>
    <View style={s.progress} accessibilityLabel={`Step ${step + 1} of 3`}>{[0, 1, 2].map(i => <View key={i} style={{ height: 5, width: i === step ? 20 : 5, borderRadius: 4, backgroundColor: i <= step ? c.purple : '#343E4A' }} />)}</View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Animated.View style={{ opacity }}><Text style={s.heading}>{['Find a Partner', 'Access & Privacy', 'Categories & Venue'][step]}</Text><Text style={s.subtitle}>{['Explain what kind of partner you are looking for.', 'Control who can see and join your circle.', 'Define the categories, setting and schedule for your upcoming meetup.'][step]}</Text>
      {step === 0 && <View style={s.sections}>
        <View style={{ gap: 12 }}><View style={s.between}><Text style={s.label}>TITLE</Text><Text style={s.small}>{draft.title.length}/50</Text></View><Control label="Title" icon="create-outline" value={draft.title} onChangeText={title => patch({ title })} maxLength={50} placeholder="I'm looking for a partner for..." /></View>
        <View style={s.cover}><View style={{ flex: 1, gap: 10 }}><Text style={s.label}>COVER IMAGE</Text><Text style={s.subtitle}>Add a cover photo to make your activity stand out.</Text><Text style={s.small}>Recommended: 1080x600 px (PNG, JPG)</Text></View><View><Pressable accessibilityRole="button" accessibilityLabel={draft.coverUri ? 'Change cover photo' : 'Add Photo'} onPress={() => void pick()} style={s.photo}>{draft.coverUri ? <Image source={{ uri: draft.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <><View style={s.photoCircle}><Glyph name="camera-outline" size={21} /></View><Text style={[s.value, { fontWeight: '700', fontSize: 11 }]}>Add Photo</Text></>}</Pressable>{draft.coverUri ? <Pressable accessibilityRole="button" accessibilityLabel="Remove cover photo" onPress={() => patch({ coverUri: '' })} style={s.remove}><Glyph name="close" color="white" size={12} /></Pressable> : null}</View></View>
        <View style={{ gap: 12 }}><View style={s.inline}><Text style={s.label}>DESCRIPTION</Text><Glyph name="information-circle-outline" size={18} /></View><Control label="Description" icon="reorder-three-outline" multiline value={draft.description} onChangeText={description => patch({ description })} maxLength={5000} placeholder="Give more details about your activity and what you expect from a partner..." /></View>
      </View>}
      {step === 1 && <View style={{ marginTop: 34 }}><Text style={s.label}>ACCESS SETTINGS</Text><View style={{ marginTop: 22 }}><ChoiceRow label="Visibility" value={draft.visibility === 'public' ? 'Public' : draft.visibility === 'squad' ? 'Squad' : 'Private'} onPress={() => setDialog('visibility')} />
        <Toggle label="Approval Requirement" icon="shield-checkmark-outline" description="Hosts manually review and approve each participant request" value={draft.approval} onChange={() => patch({ approval: !draft.approval })} />
        <Toggle label="Verified Membership" icon="person-add-outline" description="Restrict participation to verified profiles only" value={draft.verifiedOnly} onChange={() => patch({ verifiedOnly: !draft.verifiedOnly })} />
      </View><Text style={[s.label, { marginTop: 28, marginBottom: 24 }]}>PARTICIPATION DETAILS</Text>
        <Text style={[s.body, { fontSize: 12, marginBottom: 10 }]}>Participant Limit</Text><Control label="Participant Limit" keyboardType="number-pad" value={draft.capacity} onChangeText={capacity => patch({ capacity })} placeholder="No limit" />
        <View style={{ marginTop: 14 }}><ChoiceRow label="Age Restriction" value={draft.ageLabel} onPress={() => setDialog('age')} />
        {draft.ageLabel === 'Custom range' ? <View style={[s.inline, { alignItems: 'flex-start' }]}>{(['ageMin', 'ageMax'] as const).map((key, i) => <View key={key} style={{ flex: 1, gap: 8 }}><Text style={s.small}>{i ? 'Maximum Age' : 'Minimum Age'}</Text><Control label={i ? 'Maximum Age' : 'Minimum Age'} value={draft[key]} keyboardType="number-pad" onChangeText={value => patch({ [key]: value })} /></View>)}</View> : null}
        <ChoiceRow label="Gender Preference" value={GENDER_OPTIONS.find(o => o.value === draft.gender)?.label || 'Open to All'} onPress={() => setDialog('gender')} /></View>
        <Toggle label="Paid Activity" description="This activity requires payment to join" value={draft.paid} onChange={() => patch({ paid: !draft.paid })} />
        {draft.paid ? <View style={{ marginTop: 18, gap: 12 }}><Text style={s.body}>Price (INR)</Text><Control label="Price in INR" keyboardType="decimal-pad" value={draft.price} onChangeText={price => patch({ price })} placeholder="0.00" />{!isPartner ? <Text style={s.error}>Paid hosting requires an active Partner account. Free hosting remains available.</Text> : null}</View> : null}
      </View>}
      {step === 2 && <View style={{ marginTop: 30, gap: 28 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose category" onPress={() => setCategoryOpen(v => !v)} style={[s.inputShell, categoryOpen && { borderColor: c.purple }]}><Text style={[s.body, { flex: 1 }, !draft.category && { color: c.muted }]}>{draft.category || 'Search and select categories...'}</Text><Glyph name="chevron-down" size={16} color={c.muted} /></Pressable>
        {categoryOpen && <View style={s.categories}><Control label="Search categories" icon="search-outline" value={categorySearch} onChangeText={setCategorySearch} placeholder="Search..." /><ScrollView nestedScrollEnabled style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">{HOST_CATEGORIES.filter(v => v.toLowerCase().includes(categorySearch.toLowerCase())).map(cat => <Option key={cat} label={cat} selected={draft.category === cat} onPress={() => { patch({ category: cat }); setCategoryOpen(false); }} />)}{!HOST_CATEGORIES.some(v => v.toLowerCase().includes(categorySearch.toLowerCase())) && <Text style={[s.small, { padding: 18 }]}>No categories found</Text>}</ScrollView></View>}
        <Pressable accessibilityRole="button" accessibilityLabel={draft.location ? 'Change location' : 'Add Location'} onPress={() => setLocationOpen(true)} style={s.location}><View style={s.locationIcon}><Glyph name="location-outline" size={24} /></View><View style={{ flex: 1, gap: 4 }}><Text style={s.settingTitle}>{draft.location?.label || 'Add Location'}</Text><Text style={s.small}>{draft.location ? 'Tap to change location' : 'Where is this meetup happening?'}</Text></View><Glyph name="chevron-forward" size={17} color={c.muted} /></Pressable>
        <View style={{ gap: 12 }}><Text style={[s.body, { fontSize: 12 }]}>Location Instructions</Text><TextInput accessibilityLabel="Location Instructions" value={draft.locationInstruction} onChangeText={locationInstruction => patch({ locationInstruction })} multiline maxLength={1000} placeholder="e.g., Meet near the red bench, Room 404..." placeholderTextColor={c.muted} style={s.instructions} /></View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Decide Date Later" accessibilityState={{ checked: draft.dateLater }} aria-checked={draft.dateLater} onPress={() => patch({ dateLater: !draft.dateLater })} style={s.later}><Text style={s.value}>📅 {draft.dateLater ? 'Add Date Now' : 'Decide Date Later'}</Text></Pressable>
        {draft.dateLater ? <View style={{ gap: 24 }}><View style={s.location}><Text style={s.subtitle}>📅 Date and time will be decided later. You can discuss with participants after they join!</Text></View><View><Text style={s.scheduleLabel}>JOIN DEADLINE</Text><Text style={[s.small, { marginTop: 12 }]}>Not set</Text></View></View> : <><View style={[s.inline, { alignItems: 'flex-start', gap: 16 }]}><ScheduleField label="KICKS OFF AT" value={draft.start} onChange={start => patch({ start })} /><ScheduleField label="WRAPS UP AT" value={draft.end} onChange={end => patch({ end })} /></View><ScheduleField label="JOIN DEADLINE" value={draft.deadline} onChange={deadline => patch({ deadline })} /></>}
      </View>}
      {draftNotice ? <Text accessibilityLiveRegion="polite" style={[s.small, { marginTop: 20 }]}>{draftNotice}</Text> : null}
      {(error || invalid) ? <Text accessibilityRole={error ? 'alert' : undefined} style={[error ? s.error : s.small, { marginTop: 20 }]}>{error || invalid}</Text> : null}
      </Animated.View>
    </ScrollView>
    <View style={s.footer}><Pressable accessibilityRole="button" accessibilityLabel={createdId && committedStatus.current === 'published' ? 'Open Activity' : step === 2 ? 'Host Now' : 'Continue'} accessibilityState={{ disabled: !!invalid || saving, busy: saving }} disabled={!!invalid || saving} onPress={() => step < 2 && committedStatus.current !== 'published' ? transition(step + 1) : void submit()} style={[s.cta, (!!invalid || saving) && { opacity: .5 }]}>{saving ? <ActivityIndicator color="white" /> : <><Text style={s.ctaText}>{createdId && committedStatus.current === 'published' ? 'Open Activity' : step === 2 ? 'Host Now' : 'Continue'}</Text><Glyph name="arrow-forward" color="white" /></>}</Pressable></View>
  </KeyboardAvoidingView>
    {dialog && <Dialog title={dialog === 'visibility' ? 'Visibility' : dialog === 'age' ? 'Age Restriction' : dialog === 'customAge' ? 'Custom Age Range' : dialog === 'gender' ? 'Gender Preference' : 'Keep your draft?'} onClose={() => setDialog(null)}>
      {dialog === 'visibility' && ([['public', 'Public', 'Anyone can find it'], ['squad', 'Squad', 'Limited to your network'], ['private', 'Private', 'Participants/invite-only']] as const).map(([value, label, subtitle]) => <Option key={value} label={label} subtitle={subtitle} selected={draft.visibility === value} onPress={() => { patch({ visibility: value }); setDialog(null); }} />)}
      {dialog === 'age' && <>{AGE_PRESETS.map(p => <Option key={p.label} label={p.label} selected={draft.ageLabel === p.label} onPress={() => { patch({ ageLabel: p.label, ageMin: p.min, ageMax: p.max }); setDialog(null); }} />)}<Option label="Custom range" selected={draft.ageLabel === 'Custom range'} onPress={() => { setAgeMin(draft.ageMin); setAgeMax(draft.ageMax); setDialog('customAge'); }} /></>}
      {dialog === 'customAge' && <View style={{ padding: 18, gap: 14 }}><Text style={s.body}>Minimum Age</Text><Control label="Custom Minimum Age" value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad" /><Text style={s.body}>Maximum Age</Text><Control label="Custom Maximum Age" value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad" />{ageError(ageMin, ageMax) ? <Text style={s.error}>{ageError(ageMin, ageMax)}</Text> : null}<Pressable accessibilityRole="button" disabled={!!ageError(ageMin, ageMax)} style={s.cta} onPress={() => { patch({ ageLabel: 'Custom range', ageMin, ageMax }); setDialog(null); }}><Text style={s.ctaText}>Save</Text></Pressable></View>}
      {dialog === 'gender' && GENDER_OPTIONS.map(o => <Option key={o.value} label={o.label} selected={draft.gender === o.value} onPress={() => { patch({ gender: o.value }); setDialog(null); }} />)}
      {dialog === 'exit' && <View style={{ padding: 18, gap: 14 }}><Text style={s.subtitle}>Your activity is not published. Keep your draft on this device and return later.</Text><Pressable accessibilityRole="button" style={s.cta} onPress={() => { void store().then(onBack).catch(() => setError('Could not save your draft.')); }}><Text style={s.ctaText}>Save & Exit</Text></Pressable></View>}
    </Dialog>}
    {locationOpen && <LocationSearch onClose={() => setLocationOpen(false)} onSelect={location => { patch({ location }); setLocationOpen(false); }} />}
    {!!cropUri && <CoverEditor uri={cropUri} onCancel={() => setCropUri('')} onSave={coverUri => { patch({ coverUri, coverContentType: 'image/jpeg' }); setCropUri(''); }} />}
  </SafeAreaView>;
}
const createStyles = (c: HostColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg }, header: { minHeight: 64, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerTitle: { flex: 1, color: c.text, fontSize: 18, fontWeight: '700' }, back: { width: 36, height: 36, borderRadius: 22, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 28 }, content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 }, heading: { color: c.text, fontSize: 26, fontWeight: '700', letterSpacing: -.5 }, subtitle: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 5 }, sections: { marginTop: 30, gap: 24 }, label: { color: c.muted, fontSize: 13, fontWeight: '700', letterSpacing: .4 }, small: { color: c.muted, fontSize: 10, lineHeight: 15 }, body: { color: c.text, fontSize: 14 }, value: { color: c.purple, fontSize: 12 }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inputShell: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.3, borderColor: c.border, borderRadius: 13, minHeight: 50, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: c.input }, input: { flex: 1, minWidth: 0, padding: 0, color: c.text, fontSize: 14, outlineStyle: 'none' } as any,
  cover: { flexDirection: 'row', borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 16, padding: 12, gap: 12, alignItems: 'center' }, photo: { width: 98, height: 74, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 10, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' }, photoCircle: { borderRadius: 20, backgroundColor: c.isDark ? '#342A77' : '#E9E6FF', padding: 6 }, remove: { position: 'absolute', right: -3, top: -5, padding: 4, borderRadius: 14, backgroundColor: '#E34C67' },
  toggleRow: { minHeight: 88, paddingVertical: 16, borderBottomWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 20 }, settingTitle: { color: c.text, fontSize: 14, fontWeight: '600' }, settingDescription: { color: c.muted, fontSize: 12, lineHeight: 21 }, track: { width: 30, height: 15, borderRadius: 10, backgroundColor: c.isDark ? '#384252' : '#D7DBE5', marginHorizontal: 9 }, thumb: { width: 19, height: 19, borderRadius: 11, top: -2, left: -2 }, choice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, gap: 8 },
  footer: { paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg }, cta: { backgroundColor: '#6958EB', minHeight: 48, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, ctaText: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 20 }, dialog: { width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH - 40, maxHeight: '90%', alignSelf: 'center', borderRadius: 18, backgroundColor: c.bg, overflow: 'hidden' }, dialogTitle: { color: c.text, fontSize: 15, fontWeight: '700', textAlign: 'center', padding: 20, borderBottomWidth: 1, borderColor: c.border }, option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, padding: 16, borderBottomWidth: 1, borderColor: c.border }, cancel: { backgroundColor: c.input, borderRadius: 12, margin: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  categories: { backgroundColor: c.input, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden', marginTop: -18 }, location: { padding: 16, minHeight: 72, backgroundColor: c.input, borderRadius: 16, borderWidth: 1, borderColor: c.border, flexDirection: 'row', gap: 12, alignItems: 'center' }, locationIcon: { padding: 6, backgroundColor: c.isDark ? '#25263F' : '#E9E6FF', borderRadius: 12 }, instructions: { fontSize: 14, lineHeight: 21, color: c.text, borderBottomWidth: 1, borderColor: c.border, minHeight: 46, paddingVertical: 12 }, later: { borderColor: c.purple, borderWidth: 1.5, borderRadius: 7, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, scheduleLabel: { color: c.muted, fontSize: 10, fontWeight: '600', letterSpacing: .4 }, dateButton: { borderBottomWidth: 1, borderColor: c.border, paddingBottom: 12, minHeight: 44 }, error: { color: c.danger, fontSize: 12, lineHeight: 18, paddingHorizontal: 2 },
  landingCard: { padding: 18, minHeight: 110, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }, landingIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, roundArrow: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF13', alignItems: 'center', justifyContent: 'center' },
});

export function HostNavigation({ onNavigate }: { onNavigate: (screen: 'feed' | 'vibes' | 'host' | 'chat' | 'profile') => void }) {
  const { c } = useHostTheme();
  return <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.input }}><View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: c.border, minHeight: 58 }}>{([
    ['feed', 'home-outline', 'Feed'], ['vibes', 'film-outline', 'Vibes'], ['host', 'add-circle-outline', 'Host'], ['chat', 'chatbubble-outline', 'Chat'], ['profile', 'person-outline', 'Profile'],
  ] as const).map(([screen, icon, label]) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: screen === 'host' }} key={screen} onPress={() => onNavigate(screen)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}><Glyph name={icon} size={25} color={screen === 'host' ? c.purple : c.muted} /><Text style={{ color: screen === 'host' ? c.purple : c.muted, fontSize: 10 }}>{label}</Text></Pressable>)}</View></SafeAreaView>;
}
