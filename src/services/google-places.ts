import { supabase } from '../lib/supabase';

export type GooglePlace = {
  id: string; title: string; address: string; latitude: number; longitude: number;
  attributions: { provider: string; uri?: string }[];
};
export type GooglePlacesResult = { places: GooglePlace[]; status: 'disabled' | 'ready' | 'unavailable' };
export const googlePlacesEnabled = process.env.EXPO_PUBLIC_GOOGLE_PLACES_ENABLED === 'true';
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

type PlacesResponse = GooglePlacesResult & { coordinateReceipt?: { expiresAt: string } };
/** Names/addresses remain in disposable view state; only IDs enter app persistence. */
async function requestGooglePlaces(payload: { query: string } | { placeId: string }, signal: AbortSignal): Promise<PlacesResponse> {
  if (!googlePlacesEnabled || !projectUrl || !publishableKey) return { places: [], status: 'disabled' };
  if (signal.aborted) throw new Error('Location search cancelled.');
  if ('query' in payload && payload.query.trim().length < 2) return { places: [], status: 'ready' };
  const { data, error } = await supabase.auth.getSession();
  if (signal.aborted) throw new Error('Location search cancelled.');
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
    if (signal.aborted) throw new Error('Location search cancelled.');
    if (!response.ok) return { places: [], status: response.status === 503 ? 'disabled' : 'unavailable' };
    const body = await response.json();
    const latest = await supabase.auth.getSession();
    if (signal.aborted) throw new Error('Location search cancelled.');
    if (latest.error || latest.data.session?.user.id !== session.user.id) return { places: [], status: 'unavailable' };
    if (!Array.isArray(body.places) || !body.places.every((place: GooglePlace) =>
      place && typeof place.id === 'string' && typeof place.title === 'string' && typeof place.address === 'string' &&
      Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && Array.isArray(place.attributions) &&
      place.attributions.every(attribution => attribution && typeof attribution.provider === 'string' &&
        (attribution.uri === undefined || (typeof attribution.uri === 'string' && attribution.uri.startsWith('https://')))))) {
      return { places: [], status: 'unavailable' };
    }
    return { places: body.places, status: 'ready', ...(body.coordinateReceipt ? { coordinateReceipt: body.coordinateReceipt } : {}) };
  } catch (error) {
    if (signal.aborted) throw error;
    return { places: [], status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export function googlePlaceUrl(place: GooglePlace) {
  const params = new URLSearchParams({ api: '1', query: place.title, query_place_id: place.id });
  return `https://www.google.com/maps/search/?${params}`;
}

export function searchGooglePlaces(query: string, signal: AbortSignal) {
  return requestGooglePlaces({ query: query.trim() }, signal);
}
export async function resolveGooglePlace(placeId: string, signal = new AbortController().signal): Promise<GooglePlace> {
  if ((!placeId.trim() || placeId.length > 300 || /[\x00-\x1f\x7f]/.test(placeId))) throw new Error('Choose a valid Google Maps venue.');
  const result = await requestGooglePlaces({ placeId }, signal);
  if (result.status === 'disabled') throw new Error('Google Maps is not enabled. Enable the configured provider or choose an OpenStreetMap venue.');
  if (result.status !== 'ready' || result.places.length !== 1 || result.places[0].id !== placeId ||
      !result.coordinateReceipt || Date.parse(result.coordinateReceipt.expiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(result.coordinateReceipt.expiresAt))) throw new Error('Could not refresh this Google Maps venue. Please retry or choose another location.');
  return result.places[0];
}
export function googlePlaceIdUrl(placeId: string) {
  return googlePlaceUrl({ id: placeId, title: 'Google Maps venue' } as GooglePlace);
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
