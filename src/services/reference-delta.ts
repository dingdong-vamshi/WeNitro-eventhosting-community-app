import { supabase } from '../lib/supabase';
import { normalizeIndianPhone } from './auth-production';
import { profileProductionService } from './profile-production';

export type EmergencyContact = {
  id?: number;
  contact_name: string;
  relation: string;
  countrycode: string;
  phone_number: string;
  is_verified: boolean;
  updated_at?: string;
};

export type SquadRow = {
  id: number;
  username: string;
  fullname: string | null;
  profile_image: string | null;
  isverified: number | null;
  connected_at?: string;
};

export type NitroLedgerRow = {
  id: number;
  points: number;
  created_at: string;
  event_id: number | null;
  description: string;
};

export type ProfilePhoto = {
  id: number;
  user_id: number;
  storage_path: string;
  public_url: string;
  position: number;
};

export type ParticipantRating = {
  id: number;
  rated_user_id: number;
  behaviour_rating: number;
  friendly_rating: number;
  communication_rating: number;
  overall_rating: number;
  comment: string;
  updated_at: string;
};

const rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const result = await (supabase.rpc as unknown as (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message?: string } | null }>)(name, args);
  if (result.error) throw result.error;
  return result.data;
};

const currentIdentity = async () => {
  const [auth, legacy] = await Promise.all([supabase.auth.getUser(), supabase.rpc('get_current_legacy_user_id')]);
  if (auth.error) throw auth.error;
  if (legacy.error) throw legacy.error;
  if (!auth.data.user) throw new Error('Authentication required.');
  const legacyId = Number(legacy.data);
  if (!Number.isSafeInteger(legacyId) || legacyId <= 0) throw new Error('Your WeNitro profile is unavailable.');
  return { auth: auth.data.user, legacyId };
};

const imageType = (uri: string, mimeType?: string | null) => {
  const mime = (mimeType || '').toLowerCase();
  if (mime === 'image/png' || /\.png(?:$|[?#])/i.test(uri)) return { mime: 'image/png', extension: 'png' };
  if (mime === 'image/webp' || /\.webp(?:$|[?#])/i.test(uri)) return { mime: 'image/webp', extension: 'webp' };
  return { mime: 'image/jpeg', extension: 'jpg' };
};

const randomName = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export const referenceDeltaService = {
  getEmergencyContact: () => rpc<EmergencyContact | Record<string, never>>('get_my_emergency_contact'),
  saveEmergencyContact: (input: { name: string; relation: string; phone: string }) => rpc<EmergencyContact>('save_my_emergency_contact', {
    p_contact_name: input.name,
    p_relation: input.relation,
    p_phone_number: input.phone,
  }),
  listSquad: () => rpc<SquadRow[]>('list_my_squad'),
  removeSquadMember: (id: number) => rpc<void>('remove_my_squad_member', { p_member_id: id }),
  listNitroHistory: () => rpc<{ balance: number; items: NitroLedgerRow[] }>('list_my_nitro_history'),
  listParticipantRatings: (eventId: number) => rpc<ParticipantRating[]>('list_activity_participant_ratings', { p_event_id: eventId }),
  rateParticipant: (input: { eventId: number; userId: number; behaviour: number; friendly: number; communication: number; comment: string }) => rpc<ParticipantRating>('rate_activity_participant', {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_behaviour: input.behaviour,
    p_friendly: input.friendly,
    p_communication: input.communication,
    p_comment: input.comment,
  }),
  async requestPhoneChange(phone: string) {
    const normalized = normalizeIndianPhone(phone);
    const result = await supabase.auth.updateUser({ phone: normalized });
    if (result.error) throw result.error;
    return normalized;
  },
  async verifyPhoneChange(phone: string, token: string) {
    const normalized = normalizeIndianPhone(phone);
    const cleanToken = token.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanToken)) throw new Error('Enter the 6-digit OTP.');
    const result = await supabase.auth.verifyOtp({ phone: normalized, token: cleanToken, type: 'phone_change' });
    if (result.error) throw result.error;
    await rpc('sync_my_phone_verification');
    return normalized;
  },
  async listProfilePhotos(): Promise<ProfilePhoto[]> {
    const { legacyId } = await currentIdentity();
    const result = await (supabase as any).from('tbl_user_profile_photos').select('id,user_id,storage_path,public_url,position').eq('user_id', legacyId).order('position');
    if (result.error) throw result.error;
    return (result.data || []) as ProfilePhoto[];
  },
  async uploadProfilePhoto(position: number, uri: string, mimeType?: string | null) {
    if (position === 1) return { public_url: await profileProductionService.uploadAvatar(uri), position };
    if (!Number.isInteger(position) || position < 2 || position > 6) throw new Error('Choose a photo slot from 2 to 6.');
    const { auth, legacyId } = await currentIdentity();
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected photo.');
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 5 * 1024 * 1024) throw new Error('Each photo must be no larger than 5 MB.');
    const type = imageType(uri, mimeType);
    const path = `${auth.id}/profile-gallery/${randomName()}.${type.extension}`;
    const existing = await (supabase as any).from('tbl_user_profile_photos').select('storage_path').eq('user_id', legacyId).eq('position', position).maybeSingle();
    if (existing.error) throw existing.error;
    const upload = await supabase.storage.from('avatars').upload(path, buffer, { contentType: type.mime, cacheControl: '31536000', upsert: false });
    if (upload.error) throw upload.error;
    const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const saved = await (supabase as any).from('tbl_user_profile_photos').upsert({ user_id: legacyId, position, storage_path: path, public_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'user_id,position' }).select('id,user_id,storage_path,public_url,position').single();
    if (saved.error) { await supabase.storage.from('avatars').remove([path]); throw saved.error; }
    if (existing.data?.storage_path && existing.data.storage_path !== path) await supabase.storage.from('avatars').remove([existing.data.storage_path]);
    return saved.data as ProfilePhoto;
  },
  async removeProfilePhoto(photo: ProfilePhoto) {
    const { legacyId } = await currentIdentity();
    const removed = await (supabase as any).from('tbl_user_profile_photos').delete().eq('id', photo.id).eq('user_id', legacyId);
    if (removed.error) throw removed.error;
    await supabase.storage.from('avatars').remove([photo.storage_path]);
  },
  async removePrimaryProfilePhoto() {
    const { auth, legacyId } = await currentIdentity();
    const existing = await supabase.from('tbl_users').select('profile_image').eq('id', legacyId).single();
    if (existing.error) throw existing.error;
    const updated = await supabase.from('tbl_users').update({ profile_image: null }).eq('id', legacyId).select('id').single();
    if (updated.error) throw updated.error;
    const marker = '/storage/v1/object/public/avatars/';
    const url = existing.data.profile_image || '';
    const path = url.includes(marker) ? decodeURIComponent(url.split(marker)[1].split('?')[0]) : '';
    if (path.startsWith(`${auth.id}/`)) await supabase.storage.from('avatars').remove([path]);
  },
};
