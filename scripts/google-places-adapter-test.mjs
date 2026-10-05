import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpile(fs.readFileSync(path, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });

const edge = {};
new Function('exports', compile('supabase/functions/google-places/handler.ts'))(edge);
const details = { id: 'test-place', displayName: { text: 'Test Venue' }, formattedAddress: 'Test street', location: { latitude: 18.52, longitude: 73.85 }, attributions: [{ provider: 'Example data', providerUri: 'https://example.test/data' }] };
const mapped = edge.mapGooglePlaces({ places: [details] });
assert.equal(mapped[0].title, 'Test Venue');
assert.deepEqual(edge.mapGoogleAutocomplete({ suggestions: [{ placePrediction: { placeId: 'test-place', structuredFormat: { mainText: { text: 'Test Venue' }, secondaryText: { text: 'Test street' } } } }] }), [{ id: 'test-place', title: 'Test Venue', address: 'Test street' }]);
assert.equal(edge.shortGoogleLocality({ results: [{ address_components: [{ long_name: 'Pune', types: ['locality'] }, { long_name: 'Wakad', types: ['sublocality_level_1'] }] }] }), 'Wakad');

const env = { GOOGLE_PLACES_ENABLED: 'true', GOOGLE_PLACES_API_KEY: 'server-test-key' };
let calls = [], authCalls = 0, providerBody = {};
let authenticate = async () => { authCalls++; };
let provider = async (url, options) => { calls.push({ url, options }); return Response.json(providerBody); };
const handler = config => edge.createGooglePlacesHandler({ env: key => (config ?? env)[key], authenticate, fetch: (...args) => provider(...args), timeoutMs: 50, cacheCoordinates: async () => ({ expiresAt: new Date(Date.now() + 10000).toISOString() }) });
const request = body => new Request('https://local.test/google-places', { method: 'POST', headers: { Authorization: 'Bearer user' }, body: JSON.stringify(body) });
for (const config of [{}, { GOOGLE_PLACES_ENABLED: 'false', GOOGLE_PLACES_API_KEY: 'server-test-key' }, { GOOGLE_PLACES_ENABLED: 'true' }]) {
  const response = await handler(config)(request({ action: 'autocomplete', query: 'venue', sessionToken: 'session-token' }));
  assert.equal(response.status, 503);
}
assert.equal(calls.length, 0); assert.equal(authCalls, 0);
authenticate = async () => { throw new Error('bad auth'); };
assert.equal((await handler()(request({ action: 'autocomplete', query: 'venue', sessionToken: 'session-token' }))).status, 401);
authenticate = async () => { authCalls++; };
for (const body of [
  { action: 'autocomplete', query: 'a', sessionToken: 'session-token' },
  { action: 'autocomplete', query: 'venue', sessionToken: 'bad token' },
  { action: 'autocomplete', query: 'venue', sessionToken: 'session-token', latitude: 91, longitude: 2 },
  { action: 'details', placeId: 'bad\u0000id' },
  { action: 'reverseGeocode', latitude: 91, longitude: 2 },
]) assert.equal((await handler()(request(body))).status, 400);

providerBody = { suggestions: [{ placePrediction: { placeId: 'test-place', structuredFormat: { mainText: { text: 'Test Venue' }, secondaryText: { text: 'Test street' } } } }] };
let response = await handler()(request({ action: 'autocomplete', query: ' Test venue ', sessionToken: 'session-token', latitude: 18.52, longitude: 73.85, privateId: 'ignored' }));
assert.equal(response.status, 200);
assert.equal(calls.at(-1).url, 'https://places.googleapis.com/v1/places:autocomplete');
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { input: 'Test venue', languageCode: 'en', includedRegionCodes: ['in'], includeQueryPredictions: false, sessionToken: 'session-token', locationBias: { circle: { center: { latitude: 18.52, longitude: 73.85 }, radius: 50000 } } });
assert.equal(calls.at(-1).options.headers['X-Goog-Api-Key'], 'server-test-key');
assert.equal(calls.at(-1).options.headers.Authorization, undefined);

providerBody = details;
response = await handler()(request({ action: 'details', placeId: 'test-place', sessionToken: 'session-token' }));
assert.equal(response.status, 200);
assert.equal(calls.at(-1).url, 'https://places.googleapis.com/v1/places/test-place?sessionToken=session-token');
assert.equal(calls.at(-1).options.headers['X-Goog-FieldMask'], 'id,displayName,formattedAddress,location,attributions');
assert.deepEqual((await response.json()).places, mapped);

providerBody = { status: 'OK', results: [{ address_components: [{ long_name: 'Nampally', types: ['neighborhood'] }, { long_name: 'Hyderabad', types: ['locality'] }] }] };
response = await handler()(request({ action: 'reverseGeocode', latitude: 17.38, longitude: 78.47 }));
assert.equal(response.status, 200); assert.equal((await response.json()).locality, 'Nampally');
assert.match(calls.at(-1).url, /^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\/json\?/);
assert.match(calls.at(-1).url, /latlng=17\.38%2C78\.47/);

provider = async () => new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API has not been activated' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
response = await handler()(request({ action: 'autocomplete', query: 'venue', sessionToken: 'session-token' }));
assert.equal(response.status, 502); assert.equal((await response.json()).code, 'API_NOT_ACTIVATED');
assert.doesNotMatch(await (await handler()(request({ action: 'autocomplete', query: 'venue', sessionToken: 'session-token' }))).text(), /server-test-key/);

const clientSource = compile('src/services/google-places.ts');
let session = { access_token: 'session-A', user: { id: 'account-A' } }, clientCalls = [], responseBody = { places: [{ id: 'test-place', title: 'Test Venue', address: 'Test street' }] };
let fetchClient = async (url, options) => { clientCalls.push({ url, options }); return Response.json(responseBody); };
function client(config) {
  const result = {};
  new Function('exports', 'require', 'process', 'fetch', clientSource)(result, name => {
    assert.equal(name, '../lib/supabase');
    return { supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } } };
  }, { env: config }, (...args) => fetchClient(...args));
  return result;
}
const configured = { EXPO_PUBLIC_GOOGLE_PLACES_ENABLED: 'true', EXPO_PUBLIC_SUPABASE_URL: 'https://project.test', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test' };
const signal = new AbortController().signal, adapter = client(configured);
assert.equal((await client({}).searchGooglePlaces('venue', signal, { sessionToken: 'session-token' })).status, 'disabled');
assert.equal((await adapter.searchGooglePlaces('venue', signal, { sessionToken: 'session-token', bias: { latitude: 1, longitude: 2 } })).status, 'ready');
assert.deepEqual(JSON.parse(clientCalls.at(-1).options.body), { action: 'autocomplete', query: 'venue', sessionToken: 'session-token', latitude: 1, longitude: 2 });
assert.equal(clientCalls.at(-1).options.headers['X-Goog-Api-Key'], undefined);

responseBody = { locality: 'Wakad', places: [] };
assert.deepEqual(await adapter.reverseGeocodeGoogle(18.6, 73.7, signal), { locality: 'Wakad', status: 'ready', errorCode: undefined });
assert.deepEqual(JSON.parse(clientCalls.at(-1).options.body), { action: 'reverseGeocode', latitude: 18.6, longitude: 73.7 });

responseBody = { places: mapped, coordinateReceipt: { expiresAt: new Date(Date.now() + 10000).toISOString() } };
assert.deepEqual(await adapter.resolveGooglePlace('test-place', signal, 'session-token'), mapped[0]);
assert.deepEqual(JSON.parse(clientCalls.at(-1).options.body), { action: 'details', placeId: 'test-place', sessionToken: 'session-token' });
assert.match(adapter.createGooglePlacesSessionToken(), /^[A-Za-z0-9._~-]{8,128}$/);

console.log('PASS: server-side Google Autocomplete (New), session termination, location bias, Place Details, reverse-geocoded short locality, provider error classification, auth boundary, client key isolation and typed adapters.');
