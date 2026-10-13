import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const serviceSource = compile(fs.readFileSync('src/services/activity-location.ts', 'utf8'));
const latitude = 18.5741234, longitude = 73.7632345;
function service(fetch, gps = {}) {
  const exports = {};
  new Function('exports', 'require', 'fetch', 'process', serviceSource)(exports, name => {
    assert.equal(name, 'expo-location');
    return { Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ granted: true }), getCurrentPositionAsync: async () => ({ coords: { latitude, longitude } }), ...gps };
  }, fetch, { env: {} });
  return exports.activityLocationService;
}
const nearby = service(async url => ({ ok: true, json: async () => url.includes('photon')
  ? { features: [{ geometry: { coordinates: [73.9, 18.7] }, properties: { name: 'Nearby stadium', city: 'Pune' } }] }
  : { name: 'Different nearby address' } }));
assert.deepEqual(await nearby.reverse(latitude, longitude), { label: 'Nearby stadium, Pune', latitude, longitude });
assert.deepEqual(await nearby.current(), { label: 'Nearby stadium, Pune', latitude, longitude });
const offline = service(async () => { throw new Error('offline'); });
assert.deepEqual(await offline.reverse(latitude, longitude), { label: `Map pin (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`, latitude, longitude });
for (const point of [[NaN, 0], [0, Infinity], [91, 0], [0, 181], [-91, -181]]) await assert.rejects(nearby.reverse(...point), /valid map coordinates/);
const cancelled = new AbortController(); cancelled.abort();
await assert.rejects(nearby.reverse(latitude, longitude, cancelled.signal), /cancelled/);
// Both provider calls receive the same abort signal, and late results are rejected.
const lateController = new AbortController();
const late = service(async (_url, { signal }) => {
  lateController.abort();
  assert.equal(signal.aborted, true);
  return { ok: true, json: async () => ({}) };
});
await assert.rejects(late.reverse(latitude, longitude, lateController.signal), /cancelled/);
const taxonomy = {};
new Function('exports', compile(fs.readFileSync('src/domain/interest-categories.ts', 'utf8')))(taxonomy);
const domain = {};
new Function('exports', 'require', compile(fs.readFileSync('src/domain/host-activity.ts', 'utf8')))(domain, () => taxonomy);
const location = { source: 'openstreetmap', label: 'QA meeting point', latitude, longitude };
const draft = { ...domain.newHostDraft(), title: 'OSM pin QA', description: 'Exact meeting point', category: 'Sports', location, dateLater: true };
assert.deepEqual(domain.persistedHostDraft(draft).location, location);
assert.equal(domain.hostStepError(draft, 2, false), '');
assert.deepEqual(domain.draftFromActivity({ id: 'qa', title: draft.title, where: location.label, latitude, longitude, locationSource: 'openstreetmap' }).location, location);
const screen = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
assert.match(screen, /initial=\{draft.location\}/);
assert.match(screen, /draft.location.source !== 'google'/);
assert.match(screen, /id === pinGeneration.current/);
assert.match(screen, /onPick=\{movePin\}/);
const map = fs.readFileSync('src/components/hosting/osm-location-map.tsx', 'utf8');
assert.match(map, /instance.on\('click'/);
assert.match(map, /marker.current.on\('dragend'/);
assert.match(map, /OpenStreetMap contributors/);
assert.match(map, /map.current\?\.remove\(\)/);
assert.doesNotMatch(map, /googleapis|googlePlaceId/);
console.log('PASS: OSM/GPS exact coordinates, reverse lookup/offline/invalid/cancelled boundaries, draft and edit rehydration, and map integration guards. No remote data written.');
