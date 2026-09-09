import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { AppData } from '../../../App';
import { supabase } from '../../lib/supabase';
import { profileProductionService as profiles, type Profile, type ProfileEditInput, type Interest } from '../../services/profile-production';
import { profileOnboardingService } from '../../services/profile-onboarding';
import { referenceDeltaService, type ProfilePhoto } from '../../services/reference-delta';
import { ONBOARDING_GENDERS, validateOnboardingDateOfBirth, validateOnboardingGender, validateOnboardingUsername } from '../../utils/onboarding';
import { COUNTRIES, countryLabel } from '../../domain/countries';
import { Button, ErrorLine, Field, Header, Icon, Page, SearchField, Sheet, Skeleton, usePalette, purple } from './ui';

type Values = { full_name: string; username: string; bio: string; occupation: string; about: string; date_of_birth: string; gender: string; nationality: string };
const formValues = (p: Profile): Values => ({ full_name: p.full_name || '', username: p.username, bio: p.bio || '', occupation: p.occupation || '', about: p.about || '', date_of_birth: p.date_of_birth || '', gender: p.gender || '', nationality: p.nationality || '' });
const message = (e: any) => e?.code === '23505' ? 'That username is already taken. Choose another.' : e?.message || 'Could not save your profile. Try again.';

export function ReferenceEditProfile({ data, setData, back }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; back: () => void }) {
 const c = usePalette();
 const [values, setValues] = useState<Values | null>(null), [original, setOriginal] = useState<Values | null>(null);
 const [email, setEmail] = useState(''), [catalog, setCatalog] = useState<Interest[]>([]), [interests, setInterests] = useState<number[]>([]);
 const [avatar, setAvatar] = useState(data.avatarUri || ''), [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
 const [photos, setPhotos] = useState<ProfilePhoto[]>([]), [photosOpen, setPhotosOpen] = useState(false), [photoBusy, setPhotoBusy] = useState<number | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(false), [availability, setAvailability] = useState('');
 const [selector, setSelector] = useState<'gender' | 'country' | 'date' | null>(null), [query, setQuery] = useState('');
 const lock = useRef(false), expectedAuth = useRef(''), originalInterests = useRef<number[]>([]), availabilityRequest = useRef(0);
 const mounted = useRef(true);
 useEffect(() => {
  mounted.current = true;
  void Promise.all([profiles.loadProfile(), profiles.listAvailableInterests(), supabase.auth.getUser(), referenceDeltaService.listProfilePhotos()]).then(([details, options, auth, gallery]) => {
   if (auth.error || !auth.data.user || String(details.profile.id) !== data.userId) throw new Error('Please reopen Edit Profile after signing in.');
   if (!mounted.current) return;
   expectedAuth.current = auth.data.user.id; setEmail(auth.data.user.email || '');
   const initial = formValues(details.profile); setValues(initial); setOriginal(initial); setAvatar(details.profile.avatar_url || '');
   setCatalog(options); setPhotos(gallery); const ids = details.interests.map(i => i.id); setInterests(ids); originalInterests.current = ids;
  }).catch(e => { if (mounted.current) setError(message(e)); });
  return () => { mounted.current = false; availabilityRequest.current++; };
 }, [data.userId]);
 const patch = (key: keyof Values, value: string) => { setValues(current => current && ({ ...current, [key]: value })); setSuccess(false); if (key === 'username') { availabilityRequest.current++; setAvailability(''); } };
 const sameIdentity = async () => { const auth = await supabase.auth.getUser(); if (auth.error || auth.data.user?.id !== expectedAuth.current) throw new Error('Your signed-in account changed. Reopen Edit Profile before saving.'); };
 const checkUsername = async () => {
  const request = ++availabilityRequest.current;
  if (!values || values.username === original?.username) return;
  try { const result = await profileOnboardingService.checkUsername(values.username); if (mounted.current && request === availabilityRequest.current) setAvailability(result.available ? 'Username available' : 'That username is already taken.'); }
  catch (e) { if (mounted.current && request === availabilityRequest.current) setAvailability(message(e)); }
 };
 const chooseAvatar = async () => {
  try {
   const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
   if (!permission.granted) throw new Error('Photo-library permission is required to change your picture.');
   const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 });
   if (!result.canceled && result.assets[0]?.uri) { setAvatar(result.assets[0].uri); setPendingAvatar(result.assets[0].uri); setSuccess(false); }
  } catch (e) { setError(message(e)); }
 };
 const choosePhoto = async (position: number) => {
  setError('');
  try {
   const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
   if (!permission.granted) throw new Error('Photo-library permission is required to manage photos.');
   const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 });
   const asset = !result.canceled ? result.assets[0] : null;
   if (!asset?.uri) return;
   setPhotoBusy(position);
   const saved = await referenceDeltaService.uploadProfilePhoto(position, asset.uri, asset.mimeType);
   if (position === 1) { setAvatar(saved.public_url); setPendingAvatar(null); setData(current => ({ ...current, avatarUri: saved.public_url })); }
   else setPhotos(current => [saved as ProfilePhoto, ...current.filter(photo => photo.position !== position)].sort((a,b) => a.position-b.position));
  } catch (e) { setError(message(e)); }
  finally { setPhotoBusy(null); }
 };
 const removePhoto = async (position: number) => {
  setPhotoBusy(position); setError('');
  try {
   if (position === 1) { await referenceDeltaService.removePrimaryProfilePhoto(); setAvatar(''); setPendingAvatar(null); setData(current => ({ ...current, avatarUri: undefined })); }
   else { const photo = photos.find(item => item.position === position); if (photo) { await referenceDeltaService.removeProfilePhoto(photo); setPhotos(current => current.filter(item => item.id !== photo.id)); } }
  } catch (e) { setError(message(e)); }
  finally { setPhotoBusy(null); }
 };
 const save = async () => {
  if (lock.current || !values || !original) return;
  lock.current = true; setBusy(true); setError(''); setSuccess(false);
  try {
   const changes: ProfileEditInput = {};
   for (const key of Object.keys(values) as (keyof Values)[]) {
    if (values[key] === original[key]) continue; // Preserve untouched legacy values, including null DOB and older text.
    let value: string | null = values[key].trim() || null;
    if (key === 'full_name' && (!value || value.length > 150)) throw new Error('Full Name must contain 1–150 characters.');
    if (key === 'username') value = validateOnboardingUsername(values.username);
    if (key === 'bio' && (value?.length || 0) > 40) throw new Error('Bio must be 40 characters or fewer.');
    if (key === 'occupation' && (value?.length || 0) > 100) throw new Error('Occupation must be 100 characters or fewer.');
    if (key === 'about' && (value?.length || 0) > 500) throw new Error('About You must be 500 characters or fewer.');
    if (key === 'date_of_birth') value = validateOnboardingDateOfBirth(values.date_of_birth);
    if (key === 'gender') value = validateOnboardingGender(value);
    if (key === 'nationality' && value && !COUNTRIES.some(c => c.code === value)) throw new Error('Choose a nationality from the country list.');
    (changes as Record<string, string | null>)[key] = value;
   }
   await sameIdentity();
   if (changes.username && !(await profileOnboardingService.checkUsername(changes.username)).available) throw new Error('That username is already taken. Choose another.');
   await sameIdentity();
   if (Object.keys(changes).length) await profiles.editProfile(changes);
   if ([...interests].sort().join(',') !== [...originalInterests.current].sort().join(',')) { await sameIdentity(); await profiles.setInterests(interests); }
   if (pendingAvatar) { await sameIdentity(); await profiles.uploadAvatar(pendingAvatar, expectedAuth.current); }
   await sameIdentity();
   const details = await profiles.loadProfile(); await sameIdentity();
   if (!mounted.current) return;
   const p = details.profile, next = formValues(p);
   setValues(next); setOriginal(next); setAvatar(p.avatar_url || ''); setPendingAvatar(null); originalInterests.current = details.interests.map(i => i.id); setInterests(originalInterests.current);
   setData(current => current.userId !== data.userId ? current : ({ ...current, name: p.full_name || p.username, username: '@' + p.username, bio: p.bio || '', avatarUri: p.avatar_url || undefined, nitro: p.nitro_points, interests: details.interests.map(i => i.name),
    activities: current.activities.map(a => a.ownerId === current.userId ? { ...a, host: p.full_name || p.username, hostAvatar: p.avatar_url || undefined } : a),
    vibes: current.vibes.map(v => v.mine ? { ...v, author: p.full_name || p.username, authorAvatar: p.avatar_url || undefined } : v),
    stories: current.stories.map(s => s.mine ? { ...s, authorAvatar: p.avatar_url || undefined } : s),
   }));
   setSuccess(true);
  } catch (e) { if (mounted.current) setError(message(e)); }
  finally { lock.current = false; if (mounted.current) setBusy(false); }
 };
 const label = (text: string) => <Text style={{ color: c.text, fontSize: 13, fontWeight: '500', marginBottom: 8 }}>{text}</Text>;
 const field = (key: keyof Values, title: string, maxLength?: number, placeholder?: string, multiline = false) => <View>{label(title)}<Field accessibilityLabel={title.split(' (')[0]} value={values?.[key] || ''} onChangeText={v => patch(key, v)} editable={!busy} maxLength={maxLength} placeholder={placeholder} multiline={multiline} autoCapitalize={key === 'username' ? 'none' : 'sentences'} onBlur={key === 'username' ? () => void checkUsername() : undefined} style={multiline ? { minHeight: key === 'about' ? 112 : 70, textAlignVertical: 'top' } : undefined} /></View>;
 const select = (title: string, text: string, kind: typeof selector, icon: 'calendar-outline' | 'chevron-down' = 'chevron-down') => <View>{label(title)}<Pressable accessibilityRole="button" accessibilityLabel={title} disabled={busy} onPress={() => { setQuery(''); setSelector(kind); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 9, minHeight: 46 }}><Text style={{ color: c.text, flex: 1, fontSize: 13 }}>{text}</Text><Icon name={icon} size={18} color={c.muted} /></Pressable></View>;
 return <Page><Header title="Edit Profile" back={() => { if (!busy) back(); }} /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 36, gap: 19 }}><ErrorLine text={error} />{!values ? !error && <Skeleton /> : <>
  <View style={{ alignItems: 'center', gap: 9 }}>{avatar ? <Image source={{ uri: avatar }} style={{ width: 72, height: 72, borderRadius: 36 }} /> : <Icon name="person-circle-outline" size={72} color={c.muted} />}<Pressable accessibilityRole="button" disabled={busy || photoBusy !== null} onPress={() => setPhotosOpen(true)}><Text style={{ color: purple, fontSize: 13 }}>Edit Photo</Text></Pressable><Text style={{ color: c.muted, fontSize: 10 }}>Manage up to 6 profile photos</Text>{pendingAvatar && <Text style={{ color: c.muted, fontSize: 11 }}>Photo uploads when you save.</Text>}</View>
  {field('full_name', 'Full Name', 150)}{field('username', 'Username', 30)}{availability && <Text accessibilityLiveRegion="polite" style={{ color: availability === 'Username available' ? '#52AF80' : '#EF7C87', fontSize: 12 }}>{availability}</Text>}
  <View>{label('Email')}<Field accessibilityLabel="Email" value={email} editable={false} placeholder="No email added" /><Text style={{ color: c.muted, fontSize: 10, marginTop: 6 }}>Email is managed securely through your sign-in account.</Text></View>
  {field('bio', `Bio (${values.bio.length}/40)`, 40, 'Enter a short bio headline...')}
  {field('occupation', `Occupation (${values.occupation.length}/100)`, 100, 'Enter your occupation...')}
  {field('about', `About You (${values.about.length}/500)`, 500, 'Write a longer description about your lifestyle...', true)}
  {select('Date of Birth', values.date_of_birth || 'YYYY-MM-DD', 'date', 'calendar-outline')}
  {select('Gender', ONBOARDING_GENDERS.find(g => g.value === values.gender)?.label || values.gender || 'Select gender', 'gender')}
  {select('Nationality', countryLabel(values.nationality), 'country')}
  <View>{label('Interests')}<Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, marginBottom: 13 }}>Choose categories that interest you to personalize your profile</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{catalog.map(i => { const selected = interests.includes(i.id); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} disabled={busy} key={i.id} onPress={() => { setInterests(ids => selected ? ids.filter(id => id !== i.id) : [...ids, i.id]); setSuccess(false); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: selected ? purple : c.border, backgroundColor: selected ? purple : c.card }}><Text style={{ color: selected ? '#FFF' : c.muted, fontSize: 12 }}>{i.name}</Text></Pressable>; })}</View></View>
  {success && <Text accessibilityRole="alert" style={{ color: '#52AF80', fontSize: 13 }}>Profile updated successfully.</Text>}<ErrorLine text={error} /><Button label="Save Changes" busy={busy} onPress={() => void save()} />
 </>}</ScrollView></KeyboardAvoidingView>
 {selector === 'gender' && values && <Sheet title="Gender" centered close={() => setSelector(null)}>{[{ label: 'Not specified', value: '' }, ...ONBOARDING_GENDERS].map(g => <Pressable accessibilityRole="radio" accessibilityState={{ checked: values.gender === g.value }} key={g.value} onPress={() => { patch('gender', g.value); setSelector(null); }} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}><Text style={{ color: c.text }}>{g.label}</Text>{values.gender === g.value && <Icon name="checkmark" color={purple} />}</Pressable>)}</Sheet>}
 {selector === 'country' && values && <Sheet title="Nationality" close={() => setSelector(null)}><SearchField accessibilityLabel="Search countries" value={query} onChangeText={setQuery} placeholder="Search countries..." /><Pressable accessibilityRole="button" onPress={() => { patch('nationality', ''); setSelector(null); }}><Text style={{ color: c.muted, padding: 10 }}>Not specified</Text></Pressable>{COUNTRIES.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase())).map(item => <Pressable accessibilityRole="radio" accessibilityState={{ checked: values.nationality === item.code }} key={item.code} onPress={() => { patch('nationality', item.code); setSelector(null); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 11 }}><Text style={{ color: c.text, fontSize: 14, flex: 1 }}>{item.flag}  {item.name}</Text>{values.nationality === item.code && <Icon name="checkmark" color={purple} />}</Pressable>)}</Sheet>}
 {selector === 'date' && values && (Platform.OS === 'web' ? <Sheet title="Date of Birth" centered close={() => setSelector(null)}>{React.createElement('input', { type: 'date', 'aria-label': 'Choose Date of Birth', value: values.date_of_birth, max: new Date().toLocaleDateString('en-CA'), onChange: (e: React.ChangeEvent<HTMLInputElement>) => patch('date_of_birth', e.target.value), style: { width: '100%', boxSizing: 'border-box', background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 9, padding: 14, fontSize: 16 } })}<Button label="Done" onPress={() => setSelector(null)} /></Sheet> : <DateTimePicker mode="date" value={values.date_of_birth ? new Date(`${values.date_of_birth}T12:00:00`) : new Date(2000, 0, 1)} maximumDate={new Date()} onChange={(event, date) => { setSelector(null); if (event.type === 'set' && date) patch('date_of_birth', `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`); }} />)}
 {photosOpen && <Sheet title="Manage Photos" close={() => { if (photoBusy === null) setPhotosOpen(false); }}><Text style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>Add, replace, or remove up to 6 photos. The first photo is your main profile picture.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{Array.from({ length: 6 }, (_, index) => { const position=index+1; const photo=position===1 ? avatar ? { public_url: avatar } : null : photos.find(item => item.position===position); return <View key={position} style={{ width: '30.8%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderStyle: photo ? 'solid' : 'dashed', borderColor: c.border, overflow: 'hidden', backgroundColor: c.card }}><Pressable accessibilityRole="button" accessibilityLabel={`${photo ? 'Replace' : 'Add'} photo ${position}`} disabled={photoBusy !== null} onPress={() => void choosePhoto(position)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{photo ? <Image source={{ uri: photo.public_url }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="add" color={purple} /><Text style={{ color: c.muted, fontSize: 9 }}>Photo {position}</Text></>}{photoBusy===position && <View style={{ position:'absolute', inset:0, backgroundColor:'#0008', alignItems:'center', justifyContent:'center' } as any}><Text style={{ color:'#FFF', fontSize:9 }}>Uploading...</Text></View>}</Pressable>{photo && photoBusy===null && <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${position}`} onPress={() => void removePhoto(position)} style={{ position:'absolute', right:4, top:4, width:24, height:24, borderRadius:12, backgroundColor:'#C6384E', alignItems:'center', justifyContent:'center' }}><Icon name="close" color="#FFF" size={14} /></Pressable>}</View>; })}</View><ErrorLine text={error} /></Sheet>}
 </Page>;
}
