export { INTEREST_CATEGORIES as HOST_CATEGORIES } from "./interest-categories";
export const AGE_PRESETS = [
  { label: '15+ only', min: '15', max: '' }, { label: '18-25 years', min: '18', max: '25' },
  { label: '25-35 years', min: '25', max: '35' }, { label: '35-50 years', min: '35', max: '50' },
] as const;
export const GENDER_OPTIONS = [
  { label: 'Open to All', value: '' }, { label: 'Male Only', value: 'male' },
  { label: 'Female Only', value: 'female' }, { label: 'Non-binary Only', value: 'non_binary' },
] as const;
export type HostLocation = { label: string; latitude: number; longitude: number };
export type HostDraft = {
  title: string; description: string; coverUri: string; coverContentType: string;
  visibility: 'public' | 'squad' | 'private'; approval: boolean; verifiedOnly: boolean;
  capacity: string; ageLabel: string; ageMin: string; ageMax: string; gender: string;
  paid: boolean; price: string; category: string; location: HostLocation | null;
  locationInstruction: string; dateLater: boolean; start: string; end: string; deadline: string;
};
export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function newHostDraft(now = new Date()): HostDraft {
  const start = new Date(now.getTime() + 86400000);
  return { title: '', description: '', coverUri: '', coverContentType: 'image/jpeg', visibility: 'public', approval: false,
    verifiedOnly: false, capacity: '', ageLabel: '15+ only', ageMin: '15', ageMax: '', gender: '', paid: false,
    price: '', category: '', location: null, locationInstruction: '', dateLater: false,
    start: localDateTime(start), end: localDateTime(new Date(start.getTime() + 3600000)), deadline: localDateTime(start) };
}
export function ageError(min: string, max: string) {
  if (!/^\d+$/.test(min) || Number(min) < 0 || Number(min) > 120) return 'Minimum age must be between 0 and 120.';
  if (max && (!/^\d+$/.test(max) || Number(max) < Number(min) || Number(max) > 120)) return 'Maximum age must be between the minimum age and 120.';
  return '';
}
export function hostStepError(d: HostDraft, step: number, isPartner: boolean, now = Date.now()) {
  if (step === 0) {
    if (!d.title.trim() || d.title.trim().length > 50) return 'Enter a title of 1–50 characters.';
    if (!d.description.trim()) return 'Describe the activity and the partner you are looking for.';
  }
  if (step === 1) {
    if (d.capacity && (!/^\d+$/.test(d.capacity) || Number(d.capacity) < 1 || Number(d.capacity) > 2147483647)) return 'Enter a positive participant limit, or leave it empty for no limit.';
    const age = ageError(d.ageMin, d.ageMax); if (age) return age;
    if (!GENDER_OPTIONS.some(o => o.value === d.gender)) return 'Choose a gender preference.';
    if (d.paid && !isPartner) return 'Paid hosting requires an active Partner account. You can continue with a free activity.';
    if (d.paid && (!/^\d+(\.\d{1,2})?$/.test(d.price) || Number(d.price) <= 0)) return 'Enter a positive price with at most two decimal places.';
  }
  if (step === 2) {
    if (!d.category) return 'Select a category.';
    if (!d.location || !Number.isFinite(d.location.latitude) || !Number.isFinite(d.location.longitude)) return 'Select an actual location.';
    if (!d.dateLater) {
      const start = Date.parse(d.start), end = Date.parse(d.end), deadline = Date.parse(d.deadline);
      if (![start, end, deadline].every(Number.isFinite)) return 'Choose the start, end and join deadline.';
      if (start <= now) return 'Choose a future start time.';
      if (end < start) return 'Wrap-up time cannot be before kickoff.';
      if (deadline > start || deadline <= now) return 'Join deadline must be in the future and no later than kickoff.';
    }
  }
  return '';
}
