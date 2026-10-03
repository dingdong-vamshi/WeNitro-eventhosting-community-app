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

// Execute the real location component's rendered callbacks: Google content opens Maps;
// only the existing OSM row can enter the durable Activity draft.
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
const googleAction = nodes.find(node => node.props.accessibilityLabel === 'View Test Venue on Google Maps');
assert.ok(googleAction); googleAction.props.onPress(); await Promise.resolve();
assert.equal(opened.length, 1); assert.deepEqual(selected, []);
const osmAction = nodes.find(node => String(node.props.key ?? '').startsWith('OSM venue:'));
assert.ok(osmAction); osmAction.props.onPress(); assert.deepEqual(selected, [osm]);
assert.ok(nodes.some(node => node.children.includes('Google Maps')));
assert.ok(nodes.some(node => node.children.includes('Example data')));
console.log('PASS: actual LocationSearch render/callback isolation and provider attribution; Google suggestions cannot be selected into persisted HostDraft.');
