import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Pure helpers only; no Auth users, remote records, browser sessions or uploads.
const source = fs.readFileSync(new URL('../src/utils/onboarding.ts', import.meta.url), 'utf8');
const js = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const helpers = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { validateOnboardingDateOfBirth: dob, validateOnboardingUsername: username,
  validateOnboardingGender: gender, suggestOnboardingUsername: suggest } = helpers;
const today = new Date('2026-09-08T12:00:00Z');
assert.equal(dob('', today), null);
assert.equal(dob('2008-09-08', today), '2008-09-08');
assert.throws(() => dob('2008-09-09', today), /minimum age/);
assert.throws(() => dob('2026-09-09', today), /future/);
assert.throws(() => dob('2000-02-30', today), /real date/);
assert.throws(() => dob('09-08-2000', today), /YYYY-MM-DD/);
assert.equal(dob('2000-02-29', today), '2000-02-29');
assert.equal(username(' @Name_1 '), 'name_1');
for (const invalid of ['', 'ab', 'a'.repeat(31), 'unsafe%name', 'other user', 'test@example.com']) {
  assert.throws(() => username(invalid), /3–30/);
}
assert.equal(gender(null), null);
assert.equal(gender('non_binary'), 'non_binary');
assert.equal(gender('prefer_not_to_say'), 'prefer_not_to_say');
assert.throws(() => gender('unrecognized'), /displayed/);
assert.equal(suggest('José Test'), 'josetest');
assert.equal(suggest('', 'sample@example.com'), 'sample');
assert.equal(suggest('', null), '');
assert.equal(suggest('A'.repeat(100)).length, 30);

// Exercise asynchronous identity changes with isolated in-memory dependencies.
// None of these stubs uses the real Supabase client or creates remote identities.
const serviceSource = fs.readFileSync(new URL('../src/services/profile-onboarding.ts', import.meta.url), 'utf8');
const serviceJs = ts.transpile(serviceSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
function serviceHarness(switchDuring, uploadError) {
  let identity = 'subject-a';
  let authChecks = 0;
  const calls = [];
  const fakeProfile = { id: 1, onboarding_completed: true };
  const dependencies = {
    './auth-production': { getValidatedUser: async () => ({ id: identity }) },
    '../lib/supabase': { isSupabaseConfigured: true, supabase: {
      auth: { getUser: async () => { authChecks += 1; return { data: { user: { id: identity } } }; } },
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'check_onboarding_username') {
          if (switchDuring === 'availability') identity = 'subject-b';
          return { data: true };
        }
        assert.equal(args.p_expected_auth_user_id, 'subject-a');
        if (switchDuring === 'completion') identity = 'subject-b';
        return {};
      },
    } },
    './profile-production': { profileProductionService: {
      uploadAvatar: async (uri, expectedIdentity) => { assert.equal(expectedIdentity, 'subject-a'); calls.push({ name: 'upload', uri }); if (switchDuring === 'upload') identity = 'subject-b'; if (uploadError) throw uploadError; },
      loadProfile: async () => ({ profile: fakeProfile }),
    } },
    '../utils/onboarding': helpers,
  };
  const exports = {};
  new Function('require', 'exports', serviceJs)((name) => {
    assert.ok(name in dependencies, `Unexpected service dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return { service: exports.profileOnboardingService, calls, getAuthChecks: () => authChecks };
}
const input = { fullName: 'Local assertion', username: 'local_assertion', dateOfBirth: '', gender: null, photoUri: 'memory://photo' };
const success = serviceHarness();
assert.equal((await success.service.complete(input)).onboarding_completed, true);
assert.deepEqual(success.calls.map(call => call.name), ['check_onboarding_username', 'upload', 'complete_my_onboarding']);
assert.ok(success.getAuthChecks() >= 5);
for (const phase of ['availability', 'upload', 'completion']) {
  const harness = serviceHarness(phase);
  await assert.rejects(() => harness.service.complete(input), /account changed/);
  if (phase === 'availability') assert.ok(!harness.calls.some(call => call.name === 'upload'));
  if (phase !== 'completion') assert.ok(!harness.calls.some(call => call.name === 'complete_my_onboarding'));
}
const providerInput = { ...input, photoUri: undefined, providerAvatarUri: 'https://example.com/optional-avatar' };
const optionalFailure = serviceHarness(undefined, new Error('Could not read the selected avatar.'));
assert.equal((await optionalFailure.service.complete(providerInput)).onboarding_completed, true);
const explicitFailure = serviceHarness(undefined, new Error('Could not read the selected avatar.'));
await assert.rejects(() => explicitFailure.service.complete({ ...providerInput, photoUri: input.photoUri }), /selected avatar/);
assert.equal(explicitFailure.calls.find(call => call.name === 'upload').uri, input.photoUri);
assert.ok(!explicitFailure.calls.some(call => call.name === 'complete_my_onboarding'));
for (const error of [{ statusCode: '403' }, { code: '42501' }, { name: 'AuthSessionMissingError' }, new Error('Authentication required.')]) {
  const harness = serviceHarness(undefined, error);
  await assert.rejects(() => harness.service.complete(providerInput), /sign in again/);
  assert.ok(!harness.calls.some(call => call.name === 'complete_my_onboarding'));
}
const switchedProvider = serviceHarness('upload', new Error('Could not read the selected avatar.'));
await assert.rejects(() => switchedProvider.service.complete(providerInput), /account changed/);
assert.ok(!switchedProvider.calls.some(call => call.name === 'complete_my_onboarding'));
const insecureProvider = serviceHarness();
await insecureProvider.service.complete({ ...providerInput, providerAvatarUri: 'file:///private/image' });
assert.ok(!insecureProvider.calls.some(call => call.name === 'upload'));

const productionSource = fs.readFileSync(new URL('../src/services/profile-production.ts', import.meta.url), 'utf8');
const productionJs = ts.transpile(productionSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
function avatarHarness(switchAt) {
  let identity = switchAt === 'before' ? 'subject-b' : 'subject-a';
  const writes = [];
  const fakeBackend = {
    auth: {
      getUser: async () => ({ data: { user: { id: identity } } }),
      getSession: async () => ({ data: { session: { user: { id: identity }, access_token: 'isolated-session-fixture' } } }),
    },
    rpc: () => ({ setHeader: async (name, value) => { assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer isolated-session-fixture'); if (switchAt === 'mapping') identity = 'subject-b'; return { data: 1 }; } }),
    from: () => {
      let update;
      const query = {
        select: () => query,
        eq: () => query,
        update: (value) => { update = value; return query; },
        single: () => ({ setHeader: async (name, value) => {
          assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer isolated-session-fixture');
          if (!update) return { data: { profile_image: null } };
          if (switchAt === 'zero_rows') return { error: { code: 'PGRST116' } };
          writes.push('profile');
          return { data: { id: 1 } };
        } }),
      };
      return query;
    },
    storage: { from: () => ({
      upload: async () => { writes.push('storage'); if (switchAt === 'storage') identity = 'subject-b'; return {}; },
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/avatars/photo' } }),
      remove: async () => { writes.push('cleanup'); return {}; },
    }) },
  };
  const fakeFetch = async () => {
    if (switchAt === 'download') identity = 'subject-b';
    return { ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer };
  };
  const exports = {};
  new Function('require', 'exports', 'fetch', productionJs)((name) => {
    if (name === '../domain/interest-categories') return { INTEREST_CATEGORIES: [] };
    assert.equal(name, '../lib/supabase');
    return { isSupabaseConfigured: true, supabase: fakeBackend };
  }, exports, fakeFetch);
  return { service: exports.profileProductionService, writes };
}
for (const stage of ['before', 'mapping', 'download', 'storage']) {
  const harness = avatarHarness(stage);
  await assert.rejects(() => harness.service.uploadAvatar('memory://photo', 'subject-a'), /account changed/);
  assert.ok(!harness.writes.includes('profile'), `${stage} must not update a profile`);
}
const zeroRows = avatarHarness('zero_rows');
await assert.rejects(() => zeroRows.service.uploadAvatar('memory://photo', 'subject-a'), error => error.code === 'PGRST116');
assert.ok(!zeroRows.writes.includes('profile'));
const avatarSuccess = avatarHarness();
await avatarSuccess.service.uploadAvatar('memory://photo', 'subject-a');
assert.deepEqual(avatarSuccess.writes, ['storage', 'profile']);
console.log('PASS: onboarding validation, identity/avatar races, optional-provider recovery, and zero-row rejection. No remote data written.');
