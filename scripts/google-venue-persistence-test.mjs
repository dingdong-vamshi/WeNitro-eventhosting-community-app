import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = text => ts.transpile(text, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
function evaluate(path, modules = {}, extra = '') { const exports = {}; new Function('exports', 'require', compile(fs.readFileSync(path, 'utf8')) + extra)(exports, name => { assert.ok(name in modules, name); return modules[name]; }); return exports; }
const taxonomy = evaluate('src/domain/interest-categories.ts');
const host = evaluate('src/domain/host-activity.ts', { './interest-categories': taxonomy });
const google = { source: 'google', googlePlaceId: 'ChIJ_test' };
const dirtyDraft = { ...host.newHostDraft(), location: { ...google, label: 'Provider name and address', latitude: 14, longitude: 75, attributions: ['provider'] } };
const saved = JSON.parse(JSON.stringify(host.persistedHostDraft(dirtyDraft)));
assert.deepEqual(saved.location, google); assert.doesNotMatch(JSON.stringify(saved), /Provider name|"latitude"|"longitude"|attributions/);
assert.deepEqual(host.persistedHostDraft(saved).location, google);
assert.equal(host.persistedHostDraft({ ...saved, location: { source: 'google' } }).location, null);
assert.deepEqual(host.draftFromActivity({ id: '1', locationSource: 'google', googlePlaceId: 'ChIJ_test', where: 'Must not persist', latitude: 14, longitude: 75 }).location, google);
const valid = { ...host.newHostDraft(), category: 'Sports', location: google, dateLater: true };
assert.equal(host.hostStepError(valid, 2, false), ''); assert.match(host.hostStepError({ ...valid, location: { ...google, googlePlaceId: 'bad\u0000id' } }, 2, false), /location/);
const osm = { label: 'User selected OSM venue', latitude: 14, longitude: 75 };
assert.deepEqual(host.persistedHostDraft({ ...valid, location: osm }).location, osm);
const production = evaluate('src/services/activities-production.ts', { './registration-questions': { validateRegistrationQuestions: () => null }, '../lib/supabase': { isSupabaseConfigured: true, supabase: {} }, './content-moderation': { moderatePublicContent: async () => ({ status: 'safe' }), moderationArrayValue: values => (values ?? []).join('\n') } }, ';exports.test={activityFromDb,buildPayload};');
const { activityFromDb, buildPayload } = production.test;
const row = { id: 1, created_by: 2, location_source: 'google', google_place_id: 'ChIJ_test', location: 'Google secret name', display_location: 'Google secret address', latitude: 14, longitude: 75, location_coordinates_expires_at: new Date(Date.now() + 86400000).toISOString() };
let activity = activityFromDb(row, 'Sports'); assert.equal(activity.locationName, 'Google Maps venue'); assert.equal(activity.latitude, 14); assert.equal(activity.googlePlaceId, 'ChIJ_test');
for (const expiry of [null, '', 'invalid', new Date(Date.now() - 1).toISOString()]) { activity = activityFromDb({ ...row, location_coordinates_expires_at: expiry }, 'Sports'); assert.equal(activity.latitude, null); assert.equal(activity.longitude, null); }
activity = activityFromDb({ ...row, location_source: 'openstreetmap' }, 'Sports'); assert.equal(activity.locationName, 'Google secret address'); assert.equal(activity.latitude, 14); assert.equal(activity.googlePlaceId, null);
const payload = buildPayload({ locationSource: 'google', googlePlaceId: 'ChIJ_test', locationName: 'Provider address', latitude: 14, longitude: 75 });
assert.deepEqual(payload, { location_source: 'google', google_place_id: 'ChIJ_test', location: 'Google Maps venue', display_location: 'Google Maps venue' });
assert.deepEqual(buildPayload({ locationSource: 'openstreetmap', locationName: 'OSM venue', latitude: 14, longitude: 75 }), { location_source: 'openstreetmap', google_place_id: null, location: 'OSM venue', display_location: 'OSM venue', latitude: 14, longitude: 75 });
// Actual create wrapper used by Host, with malicious extra provider label/coordinates.
const source = fs.readFileSync('src/services/wenitro.ts', 'utf8');
const writeSource = source.slice(source.indexOf('const writeActivityFromUi ='), source.indexOf('export const activityService ='));
const writes = [], resolutions = [];
const deps = { require: name => { assert.equal(name, './google-places'); return { resolveGooglePlace: async id => { resolutions.push(id); } }; }, currentLegacyUserId: async () => 10, validateRegistrationQuestions: () => null, normalizeRegistrationQuestions: x => x,
 supabase: { rpc: async (name, args) => { writes.push({ name, args }); return { data: 5, error: null }; } }, activityIdFromRpc: String,
 activitiesProductionService: { getDetails: async () => ({ activity: {}, viewerState: {} }) }, activityForWorkspace: async value => value };
const write = new Function(...Object.keys(deps), compile(writeSource) + ';return writeActivityFromUi;')(...Object.values(deps));
await write({ title: 'Meetup', description: 'User description', category: 'Sports', location: 'Provider secret address', locationSource: 'google', googlePlaceId: 'ChIJ_test', latitude: 14, longitude: 75, priceInr: 0 }, 'published');
assert.deepEqual(resolutions, ['ChIJ_test']); assert.equal(writes[0].args.p_payload.location, 'Google Maps venue'); assert.equal(writes[0].args.p_payload.google_place_id, 'ChIJ_test'); assert.equal(writes[0].args.p_payload.latitude, undefined); assert.equal(writes[0].args.p_payload.longitude, undefined);
// Execute the actual nearby query segment, asserting freshness is a server predicate.
const serviceSource = fs.readFileSync('src/services/activities-production.ts', 'utf8');
const start = serviceSource.indexOf('    if (input.nearby) {'), end = serviceSource.indexOf('    if (input.freeOnly', start);
const filters = []; const query = new Proxy({}, { get: (_, method) => (...args) => { filters.push([method, ...args]); return query; } });
new Function('input', 'finite', 'query', compile(serviceSource.slice(start, end)))({ nearby: { latitude: 14, longitude: 75, radiusKm: 25 } }, Number, query);
assert.ok(filters.some(([method, value]) => method === 'or' && /^location_source\.neq\.google,location_coordinates_expires_at\.gt\./.test(value)));
console.log('PASS: actual ID-only draft serialization/restore/edit, provider label stripping, expiry-aware Activity mapping, create payload and fresh-coordinate nearby filter. No network/provider calls.');

const app = fs.readFileSync('App.tsx', 'utf8');
const safetyStart = app.indexOf('  const safetyDetails = `');
const safetyEnd = app.indexOf('  const runSafetyAction =', safetyStart);
const safety = new Function('activity', 'googlePlaceIdUrl', compile(app.slice(safetyStart, safetyEnd)) + ';return safetyDetails;')(
 { title: 'User title', when: 'Tomorrow', where: 'Google address must not escape', locationSource: 'google', googlePlaceId: 'ChIJ_test', locationInstruction: 'Meet at the red bench' }, id => 'https://www.google.com/maps/search/?api=1&query_place_id=' + id);
assert.match(safety, /query_place_id=ChIJ_test/); assert.match(safety, /Meet at the red bench/); assert.doesNotMatch(safety, /Google address must not escape/);
console.log('PASS: actual SOS text uses PlaceID Google Maps link and user instructions, never resolved provider address.');
// Execute the disposable venue view's actual effect: it resolves a place ID,
// aborts on unmount, and ignores a late provider result.
const venueSource = fs.readFileSync('src/components/google-venue.tsx', 'utf8');
let effect, states = [], controllerSignal, finish;
const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
const componentExports = {};
new Function('exports', 'require', ts.transpile(venueSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(componentExports, name => {
 if (name === 'react') return { ...React, default: React, useState: value => [value, next => states.push(next)], useEffect: callback => { effect = callback; } };
 if (name === 'react-native') return { Linking: {}, Platform: { OS: 'web' }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
 if (name === './reconstruction/ui') return { usePalette: () => ({}) };
 if (name === '../services/google-places') return { googlePlaceIdUrl: id => id, resolveGooglePlace: (_id, signal) => { controllerSignal = signal; return new Promise(resolve => { finish = resolve; }); } };
 throw Error(name);
});
componentExports.GoogleVenue({ placeId: 'ChIJ_test' });
const dispose = effect(); assert.equal(controllerSignal.aborted, false); dispose(); assert.equal(controllerSignal.aborted, true);
const stateCount = states.length; finish({ id: 'ChIJ_test', title: 'Late private view content', address: 'Must not persist' }); await Promise.resolve(); await Promise.resolve();
assert.equal(states.length, stateCount);
console.log('PASS: actual transient GoogleVenue effect aborts and suppresses late content after unmount.');
