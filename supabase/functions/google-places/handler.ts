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
function validCoordinate(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
}
function validSessionToken(value: unknown) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(value);
}
function providerFailure(body: unknown) {
  const source = record(body), nested = record(source.error);
  const status = String(nested.status || source.status || '').toUpperCase();
  const message = String(nested.message || source.error_message || '').toUpperCase();
  const details = JSON.stringify(nested.details || source.details || '').toUpperCase();
  const diagnostic = `${status} ${message} ${details}`;
  if (/API_KEY_SERVICE_BLOCKED/.test(diagnostic)) return 'API_KEY_SERVICE_BLOCKED';
  if (/API_KEY_HTTP_REFERRER_BLOCKED/.test(diagnostic)) return 'API_KEY_HTTP_REFERRER_BLOCKED';
  if (/API_KEY_IP_ADDRESS_BLOCKED/.test(diagnostic)) return 'API_KEY_IP_ADDRESS_BLOCKED';
  if (/API(?: HAS)?[_ ]?NOT(?: BEEN)?[_ ]?ACTIVATED|SERVICE_DISABLED/.test(diagnostic)) return 'API_NOT_ACTIVATED';
  if (/BILLING/.test(diagnostic)) return 'BILLING_NOT_ENABLED';
  if (/REFER+ER|IP ADDRESS|API KEY.*RESTRICT/.test(diagnostic)) return 'API_KEY_RESTRICTION';
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QUOTA/.test(diagnostic)) return 'QUOTA_EXCEEDED';
  if (/REQUEST_DENIED|PERMISSION_DENIED|API_KEY_INVALID/.test(diagnostic)) return 'REQUEST_DENIED';
  return 'PROVIDER_UNAVAILABLE';
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
      !validCoordinate(latitude, 90) || !validCoordinate(longitude, 180)) return [];
    const attributions = (Array.isArray(place.attributions) ? place.attributions : []).flatMap(value => {
      const attribution = record(value);
      if (typeof attribution.provider !== 'string' || !attribution.provider.trim()) return [];
      let uri: string | undefined;
      try { const url = new URL(String(attribution.providerUri)); if (url.protocol === 'https:') uri = url.href; } catch { /* Text attribution remains visible. */ }
      return [{ provider: attribution.provider, ...(uri ? { uri } : {}) }];
    });
    return [{ id, title: title.trim(), address, latitude, longitude, attributions }];
  });
}
export function mapGoogleAutocomplete(body: unknown) {
  const suggestions = record(body).suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.slice(0, 8).flatMap(value => {
    const prediction = record(record(value).placePrediction);
    const id = typeof prediction.placeId === 'string' ? prediction.placeId : String(prediction.place || '').replace(/^places\//, '');
    const structured = record(prediction.structuredFormat);
    const title = String(record(structured.mainText).text || '').trim();
    const address = String(record(structured.secondaryText).text || record(prediction.text).text || '').trim();
    if (!id || id.length > 300 || !title) return [];
    return [{ id, title, address }];
  });
}
export function shortGoogleLocality(body: unknown) {
  const results = record(body).results;
  if (!Array.isArray(results)) return '';
  const priorities = ['neighborhood', 'sublocality_level_1', 'sublocality', 'locality', 'postal_town', 'administrative_area_level_2'];
  const components = results.flatMap(result => Array.isArray(record(result).address_components) ? record(result).address_components as unknown[] : []);
  for (const priority of priorities) {
    const match = components.find(component => Array.isArray(record(component).types) && (record(component).types as unknown[]).includes(priority));
    const value = String(record(match).long_name || '').trim();
    if (value) return value.slice(0, 80);
  }
  return '';
}
export function createGooglePlacesHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    let key = dependencies.env('GOOGLE_PLACES_API_KEY')?.trim();
    let enabled = dependencies.env('GOOGLE_PLACES_ENABLED')?.trim();
    if (!key || enabled !== 'true') return reply({ code: 'PROVIDER_NOT_CONFIGURED', error: 'Google Maps is not enabled.' }, 503);
    try { await dependencies.authenticate(request); }
    catch { return reply({ error: 'Sign in to use Google Maps.' }, 401); }
    let body: Record<string, unknown>;
    try {
      if (Number(request.headers.get('content-length') || 0) > 4096) return reply({ error: 'Location request is too long.' }, 400);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: 'Location request is too long.' }, 400);
      body = record(JSON.parse(raw));
    } catch { return reply({ error: 'Invalid location request.' }, 400); }
    const action = typeof body.action === 'string' ? body.action : body.placeId ? 'details' : 'autocomplete';
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    const sessionToken = validSessionToken(body.sessionToken) ? String(body.sessionToken) : '';
    const latitude = body.latitude, longitude = body.longitude;
    if (!['autocomplete', 'details', 'reverseGeocode'].includes(action)) return reply({ error: 'Unsupported Google Maps action.' }, 400);
    if (action === 'autocomplete' && (query.length < 2 || query.length > 200)) return reply({ error: 'Enter a location between 2 and 200 characters.' }, 400);
    if (action === 'details' && (!placeId || placeId.length > 300 || /[\x00-\x1f\x7f]/.test(placeId))) return reply({ error: 'Invalid Google place ID.' }, 400);
    if (action === 'reverseGeocode' && (!validCoordinate(latitude, 90) || !validCoordinate(longitude, 180))) return reply({ error: 'Invalid coordinates.' }, 400);
    if (body.sessionToken !== undefined && !sessionToken) return reply({ error: 'Invalid autocomplete session.' }, 400);
    if ((body.latitude !== undefined || body.longitude !== undefined) && action === 'autocomplete' && (!validCoordinate(latitude, 90) || !validCoordinate(longitude, 180))) return reply({ error: 'Invalid location bias.' }, 400);

    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const timeout = setTimeout(abort, dependencies.timeoutMs ?? 8000);
    try {
      if (controller.signal.aborted) return reply({ error: 'Location request cancelled.' }, 499);
      let url = '';
      let init: RequestInit;
      if (action === 'autocomplete') {
        url = 'https://places.googleapis.com/v1/places:autocomplete';
        const providerBody: Record<string, unknown> = { input: query, languageCode: 'en', includedRegionCodes: ['in'], includeQueryPredictions: false };
        if (sessionToken) providerBody.sessionToken = sessionToken;
        if (validCoordinate(latitude, 90) && validCoordinate(longitude, 180)) providerBody.locationBias = { circle: { center: { latitude, longitude }, radius: 50000 } };
        init = { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key }, body: JSON.stringify(providerBody) };
      } else if (action === 'details') {
        const suffix = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
        url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${suffix}`;
        init = { method: 'GET', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,attributions' } };
      } else {
        const params = new URLSearchParams({ latlng: `${latitude},${longitude}`, language: 'en', key });
        url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
        init = { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } };
      }
      const response = await dependencies.fetch(url, init);
      let responseBody: unknown = {};
      try { responseBody = await response.json(); } catch { return reply({ code: 'PROVIDER_UNAVAILABLE', error: 'Google Maps returned an invalid response.' }, 502); }
      const legacyStatus = String(record(responseBody).status || '');
      if (!response.ok || (action === 'reverseGeocode' && !['OK', 'ZERO_RESULTS'].includes(legacyStatus))) {
        return reply({ code: providerFailure(responseBody), error: 'Google Maps request was rejected.' }, 502);
      }
      if (action === 'autocomplete') return reply({ places: mapGoogleAutocomplete(responseBody) });
      if (action === 'reverseGeocode') return reply({ locality: shortGoogleLocality(responseBody) });
      const places = mapGooglePlaces({ places: [responseBody] });
      if (places.length !== 1 || places[0].id !== placeId || !dependencies.cacheCoordinates) return reply({ error: 'Google venue could not be resolved.' }, 502);
      const place = places[0];
      const receipt = await dependencies.cacheCoordinates(place.id, place.latitude, place.longitude);
      return reply({ places, coordinateReceipt: receipt });
    } catch {
      return reply({ code: 'PROVIDER_UNAVAILABLE', error: 'Google Maps request could not finish.' }, 502);
    } finally {
      key = '';
      enabled = '';
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abort);
    }
  };
}
