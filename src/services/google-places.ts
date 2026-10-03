import { supabase } from '../lib/supabase';

export type GooglePlace = {
  id: string; title: string; address: string; latitude: number; longitude: number;
  attributions: { provider: string; uri?: string }[];
};
export type GooglePlacesResult = { places: GooglePlace[]; status: 'disabled' | 'ready' | 'unavailable' };
export const googlePlacesEnabled = process.env.EXPO_PUBLIC_GOOGLE_PLACES_ENABLED === 'true';
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

/** Transient discovery only: never put Places content into HostDraft or Activity storage. */
export async function searchGooglePlaces(query: string, signal: AbortSignal): Promise<GooglePlacesResult> {
  if (!googlePlacesEnabled || !projectUrl || !publishableKey) return { places: [], status: 'disabled' };
  if (signal.aborted) throw new Error('Location search cancelled.');
  if (query.trim().length < 2) return { places: [], status: 'ready' };
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
      body: JSON.stringify({ query: query.trim() }),
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
    return { places: body.places, status: 'ready' };
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
