import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpile(fs.readFileSync(path, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const edge = {};
new Function('exports', compile('supabase/functions/google-places/handler.ts'))(edge);
const place = { id: 'test-place', displayName: { text: 'Test Venue' }, formattedAddress: 'Test street', location: { latitude: 18.52, longitude: 73.85 }, attributions: [{ provider: 'Example data', providerUri: 'https://example.test/data' }, { provider: 'Text only', providerUri: 'javascript:unsafe()' }] };
const mapped = edge.mapGooglePlaces({ places: [place] });
assert.deepEqual(mapped, [{ id: 'test-place', title: 'Test Venue', address: 'Test street', latitude: 18.52, longitude: 73.85, attributions: [{ provider: 'Example data', uri: 'https://example.test/data' }, { provider: 'Text only' }] }]);
for (const invalid of [null, {}, { ...place, id: '' }, { ...place, location: { latitude: 91, longitude: 5 } }, { ...place, location: { latitude: '2', longitude: 5 } }, { ...place, location: { latitude: 2, longitude: NaN } }]) assert.deepEqual(edge.mapGooglePlaces({ places: [invalid] }), []);
assert.equal(edge.mapGooglePlaces({ places: Array(15).fill(place) }).length, 10);
let calls = [], authCalls = 0;
const env = { GOOGLE_PLACES_ENABLED: 'true', GOOGLE_PLACES_API_KEY: 'server-test-key' };
let authenticate = async () => { authCalls++; };
let provider = async (url, options) => { calls.push({ url, options }); return Response.json({ places: [place] }); };
const handler = config => edge.createGooglePlacesHandler({ env: key => (config ?? env)[key], authenticate: request => authenticate(request), fetch: (...args) => provider(...args), timeoutMs: 10 });
const request = (body = { query: 'Test venue' }, extra = {}) => new Request('https://local.test/google-places', { method: 'POST', headers: { Authorization: 'Bearer test-user' }, body: JSON.stringify(body), ...extra });
for (const config of [{}, { GOOGLE_PLACES_ENABLED: 'false', GOOGLE_PLACES_API_KEY: 'server-test-key' }, { GOOGLE_PLACES_ENABLED: 'true' }]) {
  const response = await handler(config)(request()); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'PROVIDER_NOT_CONFIGURED');
}
assert.equal(calls.length, 0); assert.equal(authCalls, 0);
assert.equal((await handler()(new Request('https://local.test', { method: 'OPTIONS' }))).status, 204);
assert.equal((await handler()(new Request('https://local.test'))).status, 405);
authenticate = async () => { throw new Error('Bad token'); };
assert.equal((await handler()(request())).status, 401); assert.equal(calls.length, 0);
authenticate = async () => { authCalls++; };
for (const body of [{}, { query: 'a' }, { query: 'x'.repeat(201) }, { query: 12 }, { query: 'venue', padding: 'a'.repeat(2100) }]) assert.equal((await handler()(request(body))).status, 400);
assert.equal(calls.length, 0);
const success = await handler()(request({ query: '  Test venue  ', latitude: 14, longitude: 30, accountId: 'private-id', apiKey: 'untrusted' }));
assert.equal(success.status, 200); assert.equal(success.headers.get('cache-control'), 'no-store'); assert.deepEqual((await success.json()).places, mapped);
assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://places.googleapis.com/v1/places:searchText');
assert.deepEqual(JSON.parse(calls[0].options.body), { textQuery: 'Test venue', pageSize: 10, languageCode: 'en' });
assert.equal(calls[0].options.headers['X-Goog-Api-Key'], 'server-test-key');
assert.equal(calls[0].options.headers['X-Goog-FieldMask'], 'places.id,places.displayName,places.formattedAddress,places.location,places.attributions');
assert.equal(calls[0].options.headers.Authorization, undefined);
provider = async () => new Response('provider secret diagnostics', { status: 403 });
let response = await handler()(request()); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /secret diagnostics|server-test-key/);
provider = async () => new Response('invalid json', { status: 200 }); assert.equal((await handler()(request())).status, 502);
provider = async () => Response.json({}); assert.deepEqual((await (await handler()(request())).json()).places, []);
provider = async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
assert.equal((await handler()(request())).status, 502);
const cancelled = new AbortController(); cancelled.abort(); assert.equal((await handler()(request({}, { signal: cancelled.signal }))).status, 400);
assert.equal((await handler()(request({ query: 'venue' }, { signal: cancelled.signal }))).status, 499);

// Execute the actual client adapter, never an HTTP request. The fake boundary rejects any unexpected URL.
const clientSource = compile('src/services/google-places.ts');
let session = { access_token: 'session-A', user: { id: 'account-A' } }, sessionCalls = 0, clientCalls = [];
let fetchClient = async (url, options) => {
  assert.equal(url, 'https://project.test/functions/v1/google-places'); clientCalls.push({ url, options });
  return Response.json({ places: mapped });
};
function client(config) {
  const result = {};
  new Function('exports', 'require', 'process', 'fetch', clientSource)(result, name => {
    assert.equal(name, '../lib/supabase'); return { supabase: { auth: { getSession: async () => { sessionCalls++; return { data: { session }, error: null }; } } } };
  }, { env: config }, (...args) => fetchClient(...args)); return result;
}
const configured = { EXPO_PUBLIC_GOOGLE_PLACES_ENABLED: 'true', EXPO_PUBLIC_SUPABASE_URL: 'https://project.test', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-test' };
const signal = new AbortController().signal;
for (const config of [{}, { ...configured, EXPO_PUBLIC_GOOGLE_PLACES_ENABLED: 'false' }, { ...configured, EXPO_PUBLIC_SUPABASE_URL: '' }]) assert.equal((await client(config).searchGooglePlaces('venue', signal)).status, 'disabled');
assert.equal(sessionCalls, 0); assert.equal(clientCalls.length, 0);
const realClient = client(configured);
assert.deepEqual(await realClient.searchGooglePlaces('Test venue', signal), { places: mapped, status: 'ready' });
assert.equal(clientCalls[0].options.headers.Authorization, 'Bearer session-A'); assert.equal(clientCalls[0].options.headers['X-Goog-Api-Key'], undefined);
assert.deepEqual(JSON.parse(clientCalls[0].options.body), { query: 'Test venue' });
await realClient.searchGooglePlaces('Test venue', signal); assert.equal(clientCalls.length, 2, 'Google content is not cached');
assert.match(realClient.googlePlaceUrl(mapped[0]), /^https:\/\/www.google.com\/maps\/search\/\?api=1&query=Test\+Venue&query_place_id=test-place$/);
fetchClient = async () => new Response('', { status: 503 }); assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'disabled');
fetchClient = async () => new Response('', { status: 401 }); assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'unavailable');
fetchClient = async () => Response.json({ places: ['malformed'] }); assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'unavailable');
fetchClient = async () => { throw new Error('offline'); }; assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'unavailable');
fetchClient = async () => { session = { access_token: 'session-B', user: { id: 'account-B' } }; return Response.json({ places: mapped }); };
assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'unavailable', 'Old-account response cannot be shown for a newly signed-in account');
await assert.rejects(realClient.searchGooglePlaces('venue', cancelled.signal), /cancelled/);
session = null; assert.equal((await realClient.searchGooglePlaces('venue', signal)).status, 'unavailable');
console.log('PASS: Google Places mocked provider/client execution, disabled/no-key no requests, auth, validation, exact mapping/field mask, no GPS/token forwarding, no-store, timeout/error sanitization, cancellation, no client cache, account-switch response rejection. No Google request, provider spend or production mutation.');

// Execute the real location component's rendered callbacks: Google selection returns only provider+placeID;
// no provider content enters the durable Activity draft.
const uiSource = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
const ast = ts.createSourceFile('host.tsx', uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LocationSearch');
assert.ok(node);
const component = ts.transpile(node.getText(ast), { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React });
const osm = { label: 'OSM venue', latitude: 1, longitude: 2 };
let selected = [], opened = [], stateIndex = 0;
const stateValues = ['Test', [osm], '', false, { places: mapped, status: 'ready' }, false];
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
const names = ['React', 'useHostTheme', 'useState', 'useRef', 'useEffect', 'googlePlacesEnabled', 'googlePlaceUrl', 'Platform', 'Linking', 'Modal', 'MobileOverlayFrame', 'SafeAreaView', 'View', 'Pressable', 'Glyph', 'Text', 'Control', 'ActivityIndicator', 'ScrollView'];
const render = new Function(...names, `${component}; return LocationSearch;`)(React, () => ({ c: { border: '#eee', purple: '#333', text: '#111', isDark: false }, s: {} }), () => [stateValues[stateIndex++], () => {}], () => ({ current: null }), () => {}, true, realClient.googlePlaceUrl, { OS: 'web' }, { openURL: async url => { opened.push(url); } }, ...names.slice(9).map(x => x));
const tree = render({ onSelect: value => selected.push(value), onClose: () => {} });
function flatten(node) { return node && typeof node === 'object' ? [node, ...(node.children ?? []).flatMap(flatten)] : []; }
const nodes = flatten(tree);
const googleAction = nodes.find(node => node.props.accessibilityLabel === 'Select Test Venue');
assert.ok(googleAction); googleAction.props.onPress(); await Promise.resolve();
assert.equal(opened.length, 0); assert.deepEqual(selected, [{ source: 'google', googlePlaceId: 'test-place' }]);
const osmAction = nodes.find(node => String(node.props.key ?? '').startsWith('OSM venue:'));
assert.ok(osmAction); osmAction.props.onPress(); assert.deepEqual(selected, [{ source: 'google', googlePlaceId: 'test-place' }, { ...osm, source: 'openstreetmap' }]);
assert.ok(nodes.some(node => node.children.includes('Google Maps')));
assert.ok(nodes.some(node => node.children.includes('Example data')));
console.log('PASS: actual LocationSearch render/callback isolation and provider attribution; Google selection stores only placeID/source and OSM selection remains unchanged.');

// Place Details performs no search POST, and only server-fetched coordinates can reach the cache.
let cached = [], detailRequests = [];
const detailHandler = edge.createGooglePlacesHandler({ env: key => env[key], authenticate: async () => {},
 fetch: async (url, options) => { detailRequests.push({ url, options }); return Response.json(place); },
 cacheCoordinates: async (...args) => { cached.push(args); return { expiresAt: new Date(Date.now() + 28 * 86400000).toISOString() }; } });
const detailResponse = await detailHandler(request({ placeId: 'test-place', latitude: -88, longitude: 0 }));
assert.equal(detailResponse.status, 200); assert.equal(detailRequests[0].url, 'https://places.googleapis.com/v1/places/test-place');
assert.equal(detailRequests[0].options.method, 'GET'); assert.equal(detailRequests[0].options.body, undefined);
assert.equal(detailRequests[0].options.headers['X-Goog-FieldMask'], 'id,displayName,formattedAddress,location,attributions');
assert.deepEqual(cached, [['test-place', 18.52, 73.85]]);
assert.ok(Date.parse((await detailResponse.json()).coordinateReceipt.expiresAt) > Date.now());
assert.equal((await detailHandler(request({ placeId: 'bad\u0000id' }))).status, 400);
session = { access_token: 'session-A', user: { id: 'account-A' } };
fetchClient = async (_url, options) => { assert.deepEqual(JSON.parse(options.body), { placeId: 'test-place' }); return Response.json({ places: mapped, coordinateReceipt: { expiresAt: new Date(Date.now() + 10000).toISOString() } }); };
assert.deepEqual(await realClient.resolveGooglePlace('test-place', signal), mapped[0]);
fetchClient = async () => Response.json({ places: mapped, coordinateReceipt: { expiresAt: new Date(Date.now() - 1).toISOString() } });
await assert.rejects(realClient.resolveGooglePlace('test-place', signal), /refresh/);
console.log('PASS: Details field mask, trusted coordinate callback/receipt, place-ID validation and stale receipt rejection.');

const now = Date.now();
const coordinateRecords = [
 { locationSource: 'google', googlePlaceId: 'old', latitude: 14, longitude: 75, locationCoordinatesExpiresAt: new Date(now - 1).toISOString() },
 { locationSource: 'google', googlePlaceId: 'fresh', latitude: 15, longitude: 76, locationCoordinatesExpiresAt: new Date(now + 1000).toISOString() },
 { locationSource: 'legacy', latitude: 16, longitude: 77 },
];
const purged = realClient.clearExpiredGoogleCoordinates(coordinateRecords, now);
assert.equal(purged[0].latitude, null); assert.equal(purged[0].longitude, null); assert.equal(purged[0].googlePlaceId, 'old');
assert.equal(purged[1].latitude, 15); assert.equal(purged[2].latitude, 16);
assert.equal(realClient.googleCoordinateExpiryDelay(coordinateRecords, now), 0);
assert.equal(realClient.googleCoordinateExpiryDelay(purged, now), 1000);
assert.equal(realClient.googleCoordinateExpiryDelay([{ ...coordinateRecords[1], locationCoordinatesExpiresAt: new Date(now + 28 * 86400000).toISOString() }], now), 86400000);
assert.equal(realClient.googleCoordinateExpiryDelay([coordinateRecords[2]], now), undefined);
console.log('PASS: in-memory Google coordinates purge at expiry; trusted placeID survives, fresh/legacy values remain, timers bounded and disabled for non-Google rows.');

// Execute the deployed index's actual authentication wiring, not only an injected rejection.
let served, googleFetches = 0, appIdentityError = new Error('Account unavailable');
new Function('exports', 'require', 'Deno', 'fetch', compile('supabase/functions/google-places/index.ts'))({}, name => {
 if (name === 'npm:@supabase/supabase-js@2.112.4') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-user', is_anonymous: false } }, error: null }) }, rpc: async name => { assert.equal(name, 'get_current_app_user_id'); return { data: appIdentityError ? null : 10, error: appIdentityError }; } }) };
 if (name === './handler.ts') return edge;
 throw Error(name);
}, { env: { get: key => ({ ...env, SUPABASE_URL: 'https://project.test', SUPABASE_ANON_KEY: 'test-public' })[key] }, serve: callback => { served = callback; } }, async () => { googleFetches++; return Response.json({ places: [] }); });
assert.equal((await served(request())).status, 401); assert.equal(googleFetches, 0);
appIdentityError = null; assert.equal((await served(request())).status, 200); assert.equal(googleFetches, 1);
console.log('PASS: actual Edge index requires active app identity before provider traffic; denied app identity makes zero Google calls.');
