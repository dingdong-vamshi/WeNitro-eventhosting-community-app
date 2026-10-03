export { INTEREST_CATEGORIES as HOST_CATEGORIES } from "./interest-categories";
export const AGE_PRESETS = [
  { label: '15+ only', min: '15', max: '' }, { label: '18-25 years', min: '18', max: '25' },
  { label: '25-35 years', min: '25', max: '35' }, { label: '35-50 years', min: '35', max: '50' },
] as const;
export const GENDER_OPTIONS = [
  { label: 'Open to All', value: '' }, { label: 'Male Only', value: 'male' },
  { label: 'Female Only', value: 'female' }, { label: 'Non-binary Only', value: 'non_binary' },
] as const;
export type CoordinateLocation = { source?: 'legacy' | 'openstreetmap'; label: string; latitude: number; longitude: number };
export type HostLocation = CoordinateLocation | { source: 'google'; googlePlaceId: string; label?: never; latitude?: never; longitude?: never };
export const GOOGLE_VENUE_LABEL = 'Google Maps venue';
export function persistedHostDraft(draft: HostDraft): HostDraft {
  // A draft survives indefinitely: Google content (including coordinates) never does.
  if (draft.location?.source !== 'google') return draft;
  const id = draft.location.googlePlaceId;
  return { ...draft, location: typeof id === 'string' && id.trim() && id.length <= 300 && !/[\x00-\x1f\x7f]/.test(id)
    ? { source: 'google', googlePlaceId: id.trim() } : null };
}
export type HostEntryCategory = { name: string; price: string; capacity: string };
export type HostDraft = {
  title: string; description: string; coverUri: string; coverContentType: string;
  visibility: 'public' | 'squad' | 'private'; approval: boolean; verifiedOnly: boolean;
  capacity: string; ageLabel: string; ageMin: string; ageMax: string; gender: string;
  isPaid: boolean; price: string; category: string; location: HostLocation | null;
  locationInstruction: string; externalUrl: string; dateLater: boolean; start: string; end: string; deadline: string;
  entryCategories: HostEntryCategory[];
};
export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function newHostDraft(now = new Date()): HostDraft {
  const minimumStart = now.getTime() + 10 * 60 * 1000;
  const start = new Date(minimumStart);
  return { title: '', description: '', coverUri: '', coverContentType: 'image/jpeg', visibility: 'public', approval: false,
    verifiedOnly: false, capacity: '', ageLabel: '15+ only', ageMin: '15', ageMax: '', gender: '', isPaid: false, price: '',
    category: '', location: null, locationInstruction: '', externalUrl: '', entryCategories: [{ name: 'General Admission', price: '', capacity: '' }], dateLater: false,
    start: localDateTime(start), end: localDateTime(new Date(start.getTime() + 3600000)), deadline: localDateTime(start) };
}
export function hasMeaningfulHostDraft(draft: HostDraft) {
  return Boolean(
    draft.title.trim() || draft.description.trim() || draft.coverUri || draft.category || draft.location ||
    draft.locationInstruction.trim() || draft.externalUrl.trim() || draft.entryCategories.some(item => item.price || item.name !== 'General Admission' || item.capacity) || draft.capacity || draft.price || draft.isPaid || draft.approval ||
    draft.verifiedOnly || draft.visibility !== 'public' || draft.ageLabel !== '15+ only' ||
    draft.ageMin !== '15' || draft.ageMax || draft.gender || draft.dateLater
  );
}
export function withFreshHostSchedule(draft: HostDraft, now = new Date()): HostDraft {
  const fresh = newHostDraft(now);
  return { ...draft, start: fresh.start, end: fresh.end, deadline: fresh.deadline };
}
export type HostActivitySource = {
  id: string; title: string; description?: string; image?: string; status?: string;
  visibility?: 'public' | 'community' | 'private' | 'squad'; joinType?: 'direct' | 'approval';
  verifiedOnly?: boolean; seats?: number; ageMin?: number | null; ageMax?: number | null;
  genderPreference?: string | null; costsMayApply?: boolean; entryFeeRequired?: boolean;
  price?: string | null;
  category?: string; where?: string; latitude?: number | null; longitude?: number | null;
  locationSource?: 'legacy' | 'openstreetmap' | 'google'; googlePlaceId?: string | null;
  locationInstruction?: string; externalUrl?: string | null; startsAt?: string; endsAt?: string; registrationClosesAt?: string;
};
export function draftFromActivity(activity: HostActivitySource, now = new Date()): HostDraft {
  const fresh = newHostDraft(now);
  const start = activity.startsAt ? localDateTime(new Date(activity.startsAt)) : fresh.start;
  const end = activity.endsAt ? localDateTime(new Date(activity.endsAt)) : localDateTime(new Date(Date.parse(start) + 3600000));
  const deadline = activity.registrationClosesAt ? localDateTime(new Date(activity.registrationClosesAt)) : start;
  const ageMin = activity.ageMin == null ? '15' : String(activity.ageMin);
  const ageMax = activity.ageMax == null ? '' : String(activity.ageMax);
  const agePreset = AGE_PRESETS.find(p => p.min === ageMin && p.max === ageMax);
  const visibility = activity.visibility === 'squad' || activity.visibility === 'private' ? activity.visibility : 'public';
  const price = Number(String(activity.price || '').replace(/[^0-9.]/g, ''));
  const isPaid = Boolean(activity.costsMayApply || activity.entryFeeRequired || price > 0);
  return {
    ...fresh,
    title: activity.title || '',
    description: activity.description || '',
    coverUri: activity.image || '',
    visibility,
    approval: activity.joinType === 'approval',
    verifiedOnly: Boolean(activity.verifiedOnly),
    capacity: activity.seats ? String(activity.seats) : '',
    ageLabel: agePreset?.label || (activity.ageMin == null && activity.ageMax == null ? '15+ only' : 'Custom range'),
    ageMin, ageMax,
    gender: activity.genderPreference || '',
    isPaid,
    price: isPaid && price > 0 ? String(price) : '',
    entryCategories: [{ name: 'General Admission', price: isPaid && price > 0 ? String(price) : '', capacity: '' }],
    category: activity.category || '',
    location: activity.locationSource === 'google' && activity.googlePlaceId
      ? { source: 'google', googlePlaceId: activity.googlePlaceId }
      : activity.where && activity.latitude != null && activity.longitude != null
      ? { source: activity.locationSource === 'openstreetmap' ? 'openstreetmap' : 'legacy', label: activity.where, latitude: activity.latitude, longitude: activity.longitude } : null,
    locationInstruction: activity.locationInstruction || '',
    externalUrl: activity.externalUrl || '',
    dateLater: !activity.startsAt,
    start, end, deadline,
  };
}
export function scheduleFieldErrors(d: HostDraft, now = Date.now()) {
  if (d.dateLater) return { start: '', end: '', deadline: '' };
  const start = Date.parse(d.start), end = Date.parse(d.end), deadline = Date.parse(d.deadline);
  return {
    start: !Number.isFinite(start) ? 'Choose a start time.' : start < now ? 'Start time cannot be in the past.' : '',
    end: !Number.isFinite(end) ? 'Choose an end time.' : Number.isFinite(start) && end < start + 3600000 ? 'End time must be at least 1 hour after start.' : '',
    deadline: !Number.isFinite(deadline) ? 'Choose a registration close time.' : deadline < now ? 'Registration close cannot be before the current date and time.' : Number.isFinite(start) && deadline > start ? 'Registration close cannot be after start time.' : '',
  };
}
export function ageError(min: string, max: string) {
  if (!/^\d+$/.test(min) || Number(min) < 0 || Number(min) > 120) return 'Minimum age must be between 0 and 120.';
  if (max && (!/^\d+$/.test(max) || Number(max) < Number(min) || Number(max) > 120)) return 'Maximum age must be between the minimum age and 120.';
  return '';
}
export function hostStepError(d: HostDraft, step: number, requiresPrice: boolean, now = Date.now()) {
  if (step === 0) {
    if (!d.title.trim() || d.title.trim().length > 50) return 'Enter a title of 1–50 characters.';
    if (!d.description.trim()) return 'Describe the activity and the partner you are looking for.';
  }
  if (step === 1) {
    if (d.capacity && (!/^\d+$/.test(d.capacity) || Number(d.capacity) < 1 || Number(d.capacity) > 2147483647)) return 'Enter a positive participant limit, or leave it empty for no limit.';
    if (d.isPaid && requiresPrice) {
      if (!d.entryCategories.length || d.entryCategories.length > 8) return 'Add between 1 and 8 entry categories.';
      const names = d.entryCategories.map(item => item.name.trim().toLowerCase());
      if (names.some(name => !name) || new Set(names).size !== names.length) return 'Entry category names must be present and unique.';
      if (d.entryCategories.some(item => !/^\d+(\.\d{1,2})?$/.test(item.price) || Number(item.price) <= 0 || Number(item.price) > 1000000)) return 'Every entry category needs a valid price from ₹0.01 to ₹10,00,000.';
      if (d.entryCategories.some(item => item.capacity && (!/^\d+$/.test(item.capacity) || Number(item.capacity) <= 0))) return 'Category capacity must be a positive number.';
    }
    const age = ageError(d.ageMin, d.ageMax); if (age) return age;
    if (!GENDER_OPTIONS.some(o => o.value === d.gender)) return 'Choose a gender preference.';
  }
  if (step === 2) {
    if (!d.category) return 'Select a category.';
    if (!d.location || (d.location.source === 'google' ? typeof d.location.googlePlaceId !== 'string' || !d.location.googlePlaceId.trim() || d.location.googlePlaceId.length > 300 || /[\x00-\x1f\x7f]/.test(d.location.googlePlaceId) : !Number.isFinite(d.location.latitude) || !Number.isFinite(d.location.longitude))) return 'Select an actual location.';
    if (d.externalUrl && !/^https:\/\/[^\s]+$/i.test(d.externalUrl.trim())) return 'Partner external URL must be a valid HTTPS link.';
    if (!d.dateLater) {
      const fields = scheduleFieldErrors(d, now);
      return fields.start || fields.end || fields.deadline;
    }
  }
  return '';
}
