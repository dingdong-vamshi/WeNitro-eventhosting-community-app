/** Google Places requests are disabled until the owner explicitly enables and configures them. */
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Dependencies = {
  env: (name: string) => string | undefined;
  authenticate: (request: Request) => Promise<void>;
  fetch: typeof fetch;
  cacheCoordinates?: (placeId: string, latitude: number, longitude: number) => Promise<{ expiresAt: string }>;
  timeoutMs?: number;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function mapGooglePlaces(body: unknown) {
  const places = record(body).places;
  if (!Array.isArray(places)) return [];
  return places.slice(0, 10).flatMap(value => {
    const place = record(value), location = record(place.location);
    const id = typeof place.id === 'string' ? place.id : '';
    const title = record(place.displayName).text;
    const address = typeof place.formattedAddress === 'string' ? place.formattedAddress : '';
    const latitude = location.latitude, longitude = location.longitude;
    if (!id || id.length > 300 || typeof title !== 'string' || !title.trim() ||
      typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return [];
    const attributions = (Array.isArray(place.attributions) ? place.attributions : []).flatMap(value => {
      const attribution = record(value);
      if (typeof attribution.provider !== 'string' || !attribution.provider.trim()) return [];
      let uri: string | undefined;
      try { const url = new URL(String(attribution.providerUri)); if (url.protocol === 'https:') uri = url.href; } catch { /* Text attribution remains visible. */ }
      return [{ provider: attribution.provider, ...(uri ? { uri } : {}) }];
    });
    return [{ id, title, address, latitude, longitude, attributions }];
  });
}
export function createGooglePlacesHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    const key = dependencies.env('GOOGLE_PLACES_API_KEY')?.trim();
    if (dependencies.env('GOOGLE_PLACES_ENABLED') !== 'true' || !key) {
      return reply({ code: 'PROVIDER_NOT_CONFIGURED', error: 'Google Maps search is not enabled.' }, 503);
    }
    try { await dependencies.authenticate(request); }
    catch { return reply({ error: 'Sign in to search Google Maps.' }, 401); }
    let body: Record<string, unknown>;
    try {
      if (Number(request.headers.get('content-length') || 0) > 2048) return reply({ error: 'Search is too long.' }, 400);
      const raw = await request.text();
      if (raw.length > 2048) return reply({ error: 'Search is too long.' }, 400);
      body = record(JSON.parse(raw));
    } catch { return reply({ error: 'Invalid location search.' }, 400); }
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    if (body.placeId !== undefined && (!placeId.trim() || placeId.length > 300 || /[\x00-\x1f\x7f]/.test(placeId))) return reply({ error: 'Invalid Google place ID.' }, 400);
    if (!placeId && (query.length < 2 || query.length > 200)) return reply({ error: 'Enter a location between 2 and 200 characters.' }, 400);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const timeout = setTimeout(abort, dependencies.timeoutMs ?? 8000);
    try {
      if (controller.signal.aborted) return reply({ error: 'Search cancelled.' }, 499);
      const fieldMask = 'id,displayName,formattedAddress,location,attributions';
      const response = await dependencies.fetch(placeId ? `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` : 'https://places.googleapis.com/v1/places:searchText', {
        method: placeId ? 'GET' : 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': placeId ? fieldMask : fieldMask.split(',').map(field => `places.${field}`).join(',') },
        // Never forward arbitrary caller fields, GPS coordinates, tokens, or account IDs to Google.
        ...(placeId ? {} : { body: JSON.stringify({ textQuery: query, pageSize: 10, languageCode: 'en' }) }),
      });
      if (!response.ok) return reply({ code: 'PROVIDER_UNAVAILABLE', error: 'Google Maps search is unavailable. OpenStreetMap search remains available.' }, 502);
      const body = await response.json();
      const places = mapGooglePlaces(placeId ? { places: [body] } : body);
      if (placeId) {
        if (places.length !== 1 || places[0].id !== placeId || !dependencies.cacheCoordinates) return reply({ error: 'Google venue could not be resolved.' }, 502);
        const place = places[0];
        const receipt = await dependencies.cacheCoordinates(place.id, place.latitude, place.longitude);
        return reply({ places, coordinateReceipt: receipt });
      }
      return reply({ places });
    } catch {
      return reply({ code: 'PROVIDER_UNAVAILABLE', error: 'Google Maps search could not finish. OpenStreetMap search remains available.' }, 502);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abort);
    }
  };
}
