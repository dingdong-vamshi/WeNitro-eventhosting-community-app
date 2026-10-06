import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = ts.transpile(fs.readFileSync('src/services/home-location.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });

function service({
  stored = null,
  permission = { granted: true, status: 'granted', canAskAgain: true },
  requested = permission,
  position = { coords: { latitude: 17.38, longitude: 78.47 } },
  reverse = { locality: 'Nampally', status: 'ready' },
  enabled = true,
  activity = null,
} = {}) {
  let value = stored;
  let permissionCalls = 0;
  let positionCalls = 0;
  let reverseCalls = 0;
  let rpcCalls = 0;
  const result = {};
  new Function('exports', 'require', source)(result, name => {
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async () => value, setItem: async (_key, next) => { value = next; }, removeItem: async () => { value = null; } } };
    if (name === 'expo-location') return { getForegroundPermissionsAsync: async () => permission, requestForegroundPermissionsAsync: async () => { permissionCalls++; return requested; }, getCurrentPositionAsync: async () => { positionCalls++; if (position instanceof Error) throw position; return position; }, getLastKnownPositionAsync: async () => null, Accuracy: { Balanced: 1 } };
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === './google-places') return { googlePlacesEnabled: enabled, reverseGeocodeGoogle: async () => { reverseCalls++; return reverse; } };
    if (name === '../lib/supabase') return { supabase: { rpc: () => ({ abortSignal: async () => { rpcCalls++; return { data: activity ? { locality: activity, source: 'activity' } : null, error: null }; } }) } };
    throw new Error(name);
  });
  return { result, stats: () => ({ permissionCalls, positionCalls, reverseCalls, rpcCalls, stored: value }) };
}

let fixture = service({ permission: { granted: false, status: 'undetermined', canAskAgain: true }, requested: { granted: false, status: 'denied', canAskAgain: true }, activity: 'Pune' });
assert.deepEqual(await fixture.result.resolveHomeLocality('user-A'), { locality: 'Pune', source: 'activity' });
assert.deepEqual(fixture.stats(), { permissionCalls: 1, positionCalls: 0, reverseCalls: 0, rpcCalls: 1, stored: null });

fixture = service({ permission: { granted: false, status: 'denied', canAskAgain: true } });
assert.equal(await fixture.result.resolveHomeLocality('user-A'), null);
assert.equal(fixture.stats().permissionCalls, 0, 'A decided browser denial must not prompt again');

fixture = service();
assert.equal((await fixture.result.resolveHomeLocality('user-A')).source, 'live');
assert.equal((await fixture.result.getCachedHomeLocationBias('user-A')).latitude, 17.38);
assert.equal(fixture.stats().reverseCalls, 1);
assert.match(fixture.stats().stored, /Nampally/);

const cached = JSON.stringify({ locality: 'Wakad', latitude: 18.6, longitude: 73.7, resolvedAt: Date.now() });
fixture = service({ stored: cached, position: { coords: { latitude: 18.6005, longitude: 73.7005 } } });
assert.equal((await fixture.result.resolveHomeLocality('user-A')).locality, 'Wakad');
assert.deepEqual(fixture.stats(), { permissionCalls: 0, positionCalls: 1, reverseCalls: 0, rpcCalls: 0, stored: cached });

fixture = service({ stored: cached, permission: { granted: false, status: 'denied', canAskAgain: true } });
assert.equal((await fixture.result.resolveHomeLocality('user-A')).source, 'cache');
assert.deepEqual(fixture.stats(), { permissionCalls: 0, positionCalls: 0, reverseCalls: 0, rpcCalls: 0, stored: cached });

fixture = service({ reverse: { locality: '', status: 'unavailable', errorCode: 'REQUEST_DENIED' }, activity: 'Hyderabad' });
assert.deepEqual(await fixture.result.resolveHomeLocality('user-A'), { locality: 'Hyderabad', source: 'activity' });
assert.equal(fixture.stats().reverseCalls, 1);
assert.equal(fixture.stats().rpcCalls, 1);

fixture = service({ enabled: false, activity: 'Bengaluru' });
assert.deepEqual(await fixture.result.resolveHomeLocality('user-A'), { locality: 'Bengaluru', source: 'activity' });
assert.equal(fixture.stats().permissionCalls, 0);

const feed = fs.readFileSync('src/components/reconstruction/feed-search.tsx', 'utf8');
assert.match(feed, /result\.source === 'activity'.*recent activity/);
assert.match(feed, /location=\{homeLocality\}/);
assert.doesNotMatch(feed, /location=\{data\.location \|\| 'Nearby'\}/);
console.log('PASS: Home uses live locality, nearby cache, denied-permission cache, current-user activity fallback, Nearby-safe null fallback, no repeated permission calls, and recent-activity context.');
