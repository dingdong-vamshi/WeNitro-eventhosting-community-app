import { supabase } from '../lib/supabase';

export type GooglePlaceSuggestion = { id: string; title: string; address: string };
export type GooglePlace = GooglePlaceSuggestion & {
  latitude: number; longitude: number;
  attributions: { provider: string; uri?: string }[];
};
export type GooglePlacesResult = { places: GooglePlaceSuggestion[]; status: 'disabled' | 'ready' | 'unavailable'; errorCode?: string };
export type GoogleLocationBias = { latitude: number; longitude: number };
export const googlePlacesEnabled = process.env.EXPO_PUBLIC_GOOGLE_PLACES_ENABLED === 'true';
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

type PlacesResponse = GooglePlacesResult & { coordinateReceipt?: { expiresAt: string }; locality?: string };
type GooglePayload =
  | { action: 'autocomplete'; query: string; sessionToken: string; latitude?: number; longitude?: number }
  | { action: 'details'; placeId: string; sessionToken?: string }
  | { action: 'reverseGeocode'; latitude: number; longitude: number };

function validSuggestions(value: unknown): value is GooglePlaceSuggestion[] {
  return Array.isArray(value) && value.every(place => place && typeof place.id === 'string' && typeof place.title === 'string' && typeof place.address === 'string');
}
function validDetails(value: unknown): value is GooglePlace[] {
  return validSuggestions(value) && value.every(place => {
    const candidate = place as GooglePlace;
    return Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) && Array.isArray(candidate.attributions) &&
      candidate.attributions.every(attribution => attribution && typeof attribution.provider === 'string' &&
        (attribution.uri === undefined || (typeof attribution.uri === 'string' && attribution.uri.startsWith('https://'))));
  });
}

async function requestGooglePlaces(payload: GooglePayload, signal: AbortSignal): Promise<PlacesResponse> {
  if (!googlePlacesEnabled || !projectUrl || !publishableKey) return { places: [], status: 'disabled' };
  if (signal.aborted) throw new Error('Location request cancelled.');
  if (payload.action === 'autocomplete' && payload.query.trim().length < 2) return { places: [], status: 'ready' };
  const { data, error } = await supabase.auth.getSession();
  if (signal.aborted) throw new Error('Location request cancelled.');
  const session = data.session;
  if (error || !session?.access_token) return { places: [], status: 'unavailable' };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${projectUrl.replace(/\/$/, '')}/functions/v1/google-places`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (signal.aborted) throw new Error('Location request cancelled.');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { places: [], status: response.status === 503 ? 'disabled' : 'unavailable', errorCode: typeof body.code === 'string' ? body.code : undefined };
    const latest = await supabase.auth.getSession();
    if (signal.aborted) throw new Error('Location request cancelled.');
    if (latest.error || latest.data.session?.user.id !== session.user.id) return { places: [], status: 'unavailable' };
    const places = body.places ?? [];
    if (payload.action === 'autocomplete' && !validSuggestions(places)) return { places: [], status: 'unavailable' };
    if (payload.action === 'details' && !validDetails(places)) return { places: [], status: 'unavailable' };
    if (payload.action === 'reverseGeocode' && typeof body.locality !== 'string') return { places: [], status: 'unavailable' };
    return { places, status: 'ready', ...(body.coordinateReceipt ? { coordinateReceipt: body.coordinateReceipt } : {}), ...(body.locality ? { locality: body.locality } : {}) };
  } catch (caught) {
    if (signal.aborted) throw caught;
    return { places: [], status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export function createGooglePlacesSessionToken() {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function googlePlaceUrl(place: GooglePlaceSuggestion) {
  const params = new URLSearchParams({ api: '1', query: place.title, query_place_id: place.id });
  return `https://www.google.com/maps/search/?${params}`;
}
export function searchGooglePlaces(query: string, signal: AbortSignal, options: { sessionToken: string; bias?: GoogleLocationBias }) {
  return requestGooglePlaces({ action: 'autocomplete', query: query.trim(), sessionToken: options.sessionToken, ...(options.bias ?? {}) }, signal);
}
export async function resolveGooglePlace(placeId: string, signal = new AbortController().signal, sessionToken?: string): Promise<GooglePlace> {
  if ((!placeId.trim() || placeId.length > 300 || /[\x00-\x1f\x7f]/.test(placeId))) throw new Error('Choose a valid Google Maps venue.');
  const result = await requestGooglePlaces({ action: 'details', placeId, ...(sessionToken ? { sessionToken } : {}) }, signal);
  if (result.status === 'disabled') throw new Error('Google Maps is not enabled. Choose an OpenStreetMap venue instead.');
  if (result.status !== 'ready' || result.places.length !== 1 || result.places[0].id !== placeId || !validDetails(result.places) ||
      !result.coordinateReceipt || Date.parse(result.coordinateReceipt.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(result.coordinateReceipt.expiresAt))) {
    throw new Error('Could not refresh this Google Maps venue. Please retry or choose another location.');
  }
  return result.places[0];
}
export async function reverseGeocodeGoogle(latitude: number, longitude: number, signal = new AbortController().signal) {
  const result = await requestGooglePlaces({ action: 'reverseGeocode', latitude, longitude }, signal);
  return { locality: result.status === 'ready' ? result.locality?.trim() || '' : '', status: result.status, errorCode: result.errorCode };
}
export function googlePlaceIdUrl(placeId: string) {
  return googlePlaceUrl({ id: placeId, title: 'Google Maps venue', address: '' });
}

type GoogleCoordinateRecord = { locationSource?: string; locationCoordinatesExpiresAt?: string | null; latitude?: number | null; longitude?: number | null };
export function clearExpiredGoogleCoordinates<T extends GoogleCoordinateRecord>(items: T[], now = Date.now()): T[] {
  return items.map(item => item.locationSource === 'google' && !(Date.parse(item.locationCoordinatesExpiresAt || '') > now)
    ? { ...item, latitude: null, longitude: null } : item);
}
export function googleCoordinateExpiryDelay(items: GoogleCoordinateRecord[], now = Date.now()): number | undefined {
  const deadlines = items.filter(item => item.locationSource === 'google' && (item.latitude != null || item.longitude != null))
    .map(item => Date.parse(item.locationCoordinatesExpiresAt || '') || now);
  return deadlines.length ? Math.min(86400000, Math.max(0, Math.min(...deadlines) - now)) : undefined;
}
