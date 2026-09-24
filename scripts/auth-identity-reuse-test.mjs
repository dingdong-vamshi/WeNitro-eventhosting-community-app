import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the real auth, onboarding and profile services with an entirely
// offline transport. A server-validated identity is reused only within the
// current bootstrap, never as a settled global identity cache.
const calls = [];
let session = { user: { id: 'auth-7', user_metadata: {} }, access_token: 'token-seven' };
let getUserOverride;
const query = result => {
  const builder = { select: () => builder, eq: () => builder, order: () => builder,
    abortSignal: () => builder, single: () => Promise.resolve(result),
    then: (yes, no) => Promise.resolve(result).then(yes, no) };
  return builder;
};
const backend = { isSupabaseConfigured: true, supabase: {
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async token => { calls.push(['getUser', token]); return getUserOverride ? getUserOverride() : { data: { user: session.user }, error: null }; },
  },
  rpc(name) {
    calls.push([name]);
    if (name === 'bootstrap_my_profile') return query({ data: 7, error: null });
    if (name === 'get_user_privacy_settings') return query({ data: { user_id: 7 }, error: null });
    throw new Error(`Unexpected RPC ${name}`);
  },
  from(table) {
    calls.push([table]);
    return query({ data: table === 'tbl_users' ? { id: 7, username: 'qauser', fullname: 'QA User', onboarding_completed: true } : [], error: null });
  },
} };
function load(file, dependencies) {
  const output = {};
  new Function('exports', 'require', ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(output, name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return output;
}
const deadline = load('src/services/request-deadline.ts', {});
const auth = load('src/services/auth-production.ts', {
  '../lib/supabase': backend, './request-deadline': deadline,
  'expo-linking': {}, 'react-native': { Platform: { OS: 'web' } }, '../utils/validation': {},
});
const profile = load('src/services/profile-production.ts', { '../lib/supabase': backend, '../domain/interest-categories': { INTEREST_CATEGORIES: [] } });
const onboarding = load('src/services/profile-onboarding.ts', {
  '../lib/supabase': backend, './auth-production': auth, './profile-production': profile, '../utils/onboarding': {},
});

const restored = await auth.bootstrapSession();
const setup = await onboarding.profileOnboardingService.load(undefined, restored.user);
assert.equal(setup.profile.id, 7);
assert.equal(calls.filter(([name]) => name === 'getUser').length, 1, 'One server Auth validation for the entire initial bootstrap');
assert.equal(calls.filter(([name]) => name === 'bootstrap_my_profile').length, 1);
assert.ok(!calls.some(([name]) => name === 'get_current_legacy_user_id'), 'Reuse the canonical profile ID returned by the authenticated repair RPC');
assert.equal(calls.filter(([name]) => name === 'tbl_users').length, 1);

calls.length = 0;
await onboarding.profileOnboardingService.load();
assert.equal(calls.filter(([name]) => name === 'getUser').length, 1, 'Standalone SIGNED_IN bootstrap still validates with Auth once');

let resolveUser;
getUserOverride = () => new Promise(resolve => { resolveUser = resolve; });
calls.length = 0;
const one = auth.getValidatedUser(), two = auth.getValidatedUser();
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls.length, 1, 'Concurrent validation for the same session shares one server request');
resolveUser({ data: { user: session.user }, error: null });
await Promise.all([one, two]);
getUserOverride = undefined;
await auth.getValidatedUser();
assert.equal(calls.length, 2, 'Settled validations are not globally cached');

getUserOverride = () => new Promise(resolve => { resolveUser = resolve; });
const oldUser = session.user;
const oldValidation = auth.getValidatedUser();
await new Promise(resolve => setImmediate(resolve));
session = { user: { id: 'auth-8', user_metadata: {} }, access_token: 'token-eight' };
resolveUser({ data: { user: oldUser }, error: null });
await assert.rejects(oldValidation, /account changed/);
await assert.rejects(onboarding.profileOnboardingService.load(undefined, oldUser), /account changed/);
await assert.rejects(profile.profileProductionService.loadProfile(undefined, { user: oldUser, appUserId: 7 }), /account changed/);

getUserOverride = () => ({ data: { user: null }, error: new Error('Temporary Auth failure') });
await assert.rejects(auth.getValidatedUser(), /Temporary Auth failure/);
getUserOverride = undefined;
assert.equal((await auth.getValidatedUser()).id, 'auth-8', 'Rejected validation does not poison retry or a new account');
console.log('PASS: actual initial/standalone bootstrap performs one Auth user validation, reuses canonical profile identity, coalesces only in-flight same-session requests, rejects stale identities and supports explicit retry.');
