// Verification contact-flow service tests. Every provider request is mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const load = (path, dependencies) => {
  const module = { exports: {} };
  vm.runInNewContext(compile(path), {
    exports: module.exports,
    module,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    URL,
    URLSearchParams,
  });
  return module.exports;
};

const validation = load('src/utils/validation.ts', {});
const calls = [];
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: undefined,
  email_confirmed_at: undefined,
  phone: '+919876543210',
  phone_confirmed_at: '2026-10-06T00:00:00Z',
  identities: [{ provider: 'phone' }],
};
let updateError = null;
let returnedUserId = user.id;
const session = { user, access_token: 'mock-access', refresh_token: 'mock-refresh', expires_at: 9_999_999_999 };
const mockAuth = {
  getSession: async () => ({ data: { session }, error: null }),
  getUser: async () => ({ data: { user }, error: null }),
  updateUser: async (attributes, options) => {
    calls.push({ method: 'updateUser', attributes, options });
    if (updateError) return { data: { user: null }, error: updateError };
    return { data: { user: { ...user, id: returnedUserId, new_email: attributes.email, email_change_sent_at: '2026-10-06T00:01:00Z' } }, error: null };
  },
  resend: async input => { calls.push({ method: 'resend', input }); return { data: {}, error: null }; },
};
const auth = load('src/services/auth-production.ts', {
  'expo-linking': { createURL: value => `wenitro://${value}` },
  'react-native': { Platform: { OS: 'ios' } },
  '../lib/supabase': { supabase: { auth: mockAuth }, isSupabaseConfigured: true },
  '../utils/validation': validation,
  './request-deadline': { withRequestDeadline: task => task() },
});

const beforeInvalidEmail = calls.length;
await assert.rejects(() => auth.requestCurrentUserEmailChange({ email: 'not-an-email' }), /valid email/i);
assert.equal(calls.length, beforeInvalidEmail, 'malformed email must stop before Auth');

const emailResult = await auth.requestCurrentUserEmailChange({ email: ' New.Email@Example.com ' });
assert.equal(emailResult.userId, user.id, 'email remains on the same authenticated UUID');
assert.equal(emailResult.email, 'new.email@example.com');
assert.equal(calls.at(-1).method, 'updateUser');
assert.equal(calls.at(-1).attributes.email, 'new.email@example.com');
assert.equal(calls.at(-1).options.emailRedirectTo, 'wenitro://auth/callback');
assert.equal(calls.some(call => call.method === 'signUp'), false, 'email linking must never call signup');

await auth.resendCurrentUserEmailChange({ email: 'new.email@example.com' });
assert.equal(calls.at(-1).method, 'resend');
assert.equal(calls.at(-1).input.type, 'email_change');
assert.equal(calls.at(-1).input.email, 'new.email@example.com');

updateError = { code: 'email_exists', message: 'A user with this email address has already been registered' };
await assert.rejects(() => auth.requestCurrentUserEmailChange({ email: 'owned@example.com' }), /another WeNitro account/i);
updateError = null;
returnedUserId = '22222222-2222-4222-8222-222222222222';
await assert.rejects(() => auth.requestCurrentUserEmailChange({ email: 'safe@example.com' }), /signed-in account changed/i);
returnedUserId = user.id;

const phoneCalls = [];
let phoneUpdateError = null;
let phoneVerifyError = null;
let phoneAuthUser = { ...user, phone: null, phone_confirmed_at: null };
const phoneSupabase = {
  auth: {
    getUser: async () => ({ data: { user: phoneAuthUser }, error: null }),
    updateUser: async attributes => { phoneCalls.push({ method: 'updateUser', attributes }); return { data: { user: phoneAuthUser }, error: phoneUpdateError }; },
    resend: async input => { phoneCalls.push({ method: 'resend', input }); return { data: {}, error: null }; },
    verifyOtp: async input => {
      phoneCalls.push({ method: 'verifyOtp', input });
      if (!phoneVerifyError) phoneAuthUser = { ...phoneAuthUser, phone: input.phone, phone_confirmed_at: '2026-10-06T00:02:00Z' };
      return { data: {}, error: phoneVerifyError };
    },
  },
  rpc: async name => { phoneCalls.push({ method: 'rpc', name }); return { data: null, error: null }; },
};
const reference = load('src/services/reference-delta.ts', {
  '../lib/supabase': { supabase: phoneSupabase },
  './auth-production': auth,
  './profile-production': { profileProductionService: {} },
}).referenceDeltaService;

await assert.rejects(() => reference.requestPhoneChange('123'), /valid 10-digit/i);
assert.equal(phoneCalls.length, 0, 'invalid phone must stop before Auth/provider');
await reference.requestPhoneChange('9876543210');
assert.equal(phoneCalls.at(-1).attributes.phone, '+919876543210');

phoneUpdateError = { code: 'phone_exists', message: 'already registered' };
await assert.rejects(() => reference.requestPhoneChange('9876543210'), /another WeNitro account/i);
phoneUpdateError = null;
await reference.resendPhoneChange('9876543210');
assert.equal(phoneCalls.at(-1).input.type, 'phone_change');

phoneVerifyError = { code: 'otp_expired', message: 'Token has expired' };
await assert.rejects(() => reference.verifyPhoneChange('9876543210', '123456'), /expired/i);
phoneVerifyError = { code: 'otp_disabled', message: 'Token is invalid' };
await assert.rejects(() => reference.verifyPhoneChange('9876543210', '123456'), /incorrect/i);
phoneVerifyError = null;
await reference.verifyPhoneChange('9876543210', '123456');
assert.equal(phoneCalls.findLast(call => call.method === 'verifyOtp').input.type, 'phone_change');
assert.deepEqual(phoneCalls.filter(call => call.method === 'rpc').slice(-2).map(call => call.name), ['sync_my_phone_verification', 'sync_my_verification']);

const uiSource = fs.readFileSync('src/components/reconstruction/profile-utilities.tsx', 'utf8');
for (const required of [
  'Add & Verify Email',
  'Send verification email',
  'Resend verification email',
  'resendCurrentUserEmailChange',
  'Resend OTP in ${resendIn}s',
  'resendPhoneChange',
  'Phone verified. Your Trust Score now includes +10 once.',
]) assert.ok(uiSource.includes(required), `missing UI flow: ${required}`);

console.log(JSON.stringify({
  status: 'PASS',
  scope: 'same-user email link/resend/duplicate/invalid/UUID integrity; phone validation/duplicate/resend/wrong/expired/success; provider-aware verification UI and cooldown',
  network: 'all provider calls mocked',
}));
