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
const avatarStoragePath = (url?: string | null) => {
  const marker = '/storage/v1/object/public/avatars/';
  if (!url?.includes(marker)) return null;
  try { return decodeURIComponent(url.split(marker)[1].split('?')[0]); }
  catch { return null; }
};

export const publicProfileImageUrl = (value?: string | null) => {
  const path = value?.trim();
  if (!path) return '';
  if (/^(https?:|data:|blob:|file:)/i.test(path)) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
};

const normalizeProfilePhoto = (photo: ProfilePhoto): ProfilePhoto => ({
  ...photo,
  public_url: publicProfileImageUrl(photo.public_url || photo.storage_path),
});

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
    return ((result.data || []) as ProfilePhoto[]).map(normalizeProfilePhoto);
  },
  async uploadProfilePhoto(position: number, uri: string, mimeType?: string | null) {
    if (position === 1) return { public_url: await profileProductionService.uploadAvatar(uri), position };
    if (!Number.isInteger(position) || position < 2 || position > 3) throw new Error('You can add up to 3 profile photos.');
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
    const saved = await rpc<ProfilePhoto>('save_my_profile_photo', { p_position: position, p_storage_path: path, p_public_url: publicUrl }).catch(async error => {
      await supabase.storage.from('avatars').remove([path]);
      throw error;
    });
    if (existing.data?.storage_path && existing.data.storage_path !== path) await supabase.storage.from('avatars').remove([existing.data.storage_path]);
    return saved;
  },
  async removeProfilePhoto(photo: ProfilePhoto) {
    await currentIdentity();
    const removed = await rpc<{ removed_path?: string }>('delete_my_profile_photo', { p_photo_id: photo.id });
    const path = removed.removed_path || photo.storage_path;
    if (path) {
      const cleanup = await supabase.storage.from('avatars').remove([path]);
      if (cleanup.error) throw new Error('Photo was removed from your profile, but storage cleanup needs to be retried.');
    }
  },
  async removePrimaryProfilePhoto() {
    const { auth } = await currentIdentity();
    const result = await rpc<{ public_url?: string | null; removed_url?: string | null }>('delete_my_primary_profile_photo');
    const path = avatarStoragePath(result.removed_url);
    if (path?.startsWith(`${auth.id}/`)) {
      const cleanup = await supabase.storage.from('avatars').remove([path]);
      if (cleanup.error) throw new Error('Primary photo changed, but storage cleanup needs to be retried.');
    }
    return result.public_url || null;
  },
  async listPublicProfilePhotos(userId: number): Promise<ProfilePhoto[]> {
    const photos = await (supabase as any).from('tbl_user_profile_photos').select('id,user_id,storage_path,public_url,position').eq('user_id', userId).lte('position', 3).order('position');
    if (!photos.error && Array.isArray(photos.data) && photos.data.length) return (photos.data as ProfilePhoto[]).map(normalizeProfilePhoto);
    const images = await (supabase as any).from('tbl_user_profile_images').select('id,user_id,image_url,slot_index').eq('user_id', userId).gte('slot_index', 2).lte('slot_index', 3).order('slot_index');
    if (images.error || !Array.isArray(images.data)) return [];
    return images.data.map((row: any) => normalizeProfilePhoto({ id: Number(row.id), user_id: Number(row.user_id), storage_path: String(row.image_url), public_url: String(row.image_url), position: Number(row.slot_index) || 2 }));
  },
  async setPrimaryProfilePhoto(position: number, extraUri: string, currentPrimaryUri?: string) {
    if (position === 1) return extraUri;
    const result = await rpc<{ public_url: string }>('promote_my_profile_photo', {
      p_position: position,
      p_previous_path: avatarStoragePath(currentPrimaryUri),
      p_previous_url: currentPrimaryUri || null,
    });
    if (!result.public_url) throw new Error('Primary photo could not be updated.');
    return result.public_url;
  },
};
