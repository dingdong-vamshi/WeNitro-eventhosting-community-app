// Service-boundary tests only. Every Supabase call is mocked; no network/OTP/account creation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const calls = [];
const mockAuth = Object.fromEntries(['signUp', 'signInWithOtp', 'signInWithPassword', 'verifyOtp'].map(method => [method, async input => {
  calls.push({ method, input });
  return { data: { user: { id: 'mock-user' }, session: method === 'signUp' ? null : { user: { id: 'mock-user' } } }, error: null };
}]));
const moduleObject = { exports: {} };
const validationModule = { exports: {} };
const validationSource = fs.readFileSync(new URL('../src/utils/validation.ts', import.meta.url), 'utf8');
const validationCompiled = ts.transpileModule(validationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(validationCompiled, { exports: validationModule.exports, module: validationModule });
const source = fs.readFileSync(new URL('../src/services/auth-production.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, {
  exports: moduleObject.exports,
  module: moduleObject,
  require(name) {
    if (name === 'expo-linking') return { createURL: () => 'wenitro://auth/callback' };
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === '../lib/supabase') return { supabase: { auth: mockAuth }, isSupabaseConfigured: true };
    if (name === '../utils/validation') return validationModule.exports;
    if (name === './request-deadline') return { withRequestDeadline: task => task() };
    throw new Error(`Unexpected dependency: ${name}`);
  },
  URL,
  URLSearchParams,
});
const auth = moduleObject.exports;
const appSource = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
let passed = 0;
const check = (label, assertion) => { assertion(); passed += 1; console.log(`PASS ${label}`); };
const latest = () => calls.at(-1).input;
for (const accountType of ['individual', 'partner']) {
  const result = await auth.signUpWithPassword({ accountType, fullName: ' Contact Name ', email: ' QA@EXAMPLE.COM ', password: 'mock-only-password' });
  check(`${accountType} email signup metadata and verification`, () => {
    assert.equal(latest().options.data.account_type, accountType);
    assert.equal(latest().options.data.full_name, 'Contact Name');
    assert.equal(latest().email, 'qa@example.com');
    assert.equal(result.verificationRequired, true);
    assert.equal(result.profile, null);
  });
  const phoneInput = { accountType, fullName: ' Contact Name ', phone: '9876543210', createAccount: true };
  await auth.requestPhoneOtp(phoneInput);
  check(`${accountType} phone signup metadata`, () => {
    assert.equal(latest().options.data.account_type, accountType);
    assert.equal(latest().options.data.full_name, 'Contact Name');
    assert.equal(latest().options.shouldCreateUser, true);
    assert.equal(latest().phone, '+919876543210');
  });
  const firstRequest = JSON.stringify(latest());
  await auth.requestPhoneOtp(phoneInput);
  check(`${accountType} phone resend preserves selection`, () => assert.equal(JSON.stringify(latest()), firstRequest));
}
await auth.signUpWithPassword({ fullName: 'Name', email: 'qa@example.com', password: 'mock-only-password' });
check('email signup defaults to Individual', () => assert.equal(latest().options.data.account_type, 'individual'));
await auth.requestPhoneOtp({ fullName: 'Name', phone: '9876543210', createAccount: true });
check('phone signup defaults to Individual', () => assert.equal(latest().options.data.account_type, 'individual'));
await auth.requestPhoneOtp({ accountType: 'partner', fullName: 'Ignored on login', phone: '9876543210', createAccount: false });
check('phone login cannot send classification metadata', () => {
  assert.equal(latest().options.shouldCreateUser, false);
  assert.equal(latest().options.data, undefined);
});
check('unknown-phone login error is actionable without enabling signup', () => {
  assert.equal(auth.phoneOtpErrorMessage({ code: 'otp_disabled', message: 'Signups not allowed for otp' }, false), 'No WeNitro account was found for this phone number. Create an account to continue.');
  assert.equal(auth.phoneOtpErrorMessage({ code: 'otp_disabled', message: 'Signups not allowed for otp' }, true), 'Signups not allowed for otp');
  assert.ok(appSource.includes('onPhoneSignup={phone => { setPhoneSignupHandoff(phone); go("authSignup"); }}'));
  assert.ok(appSource.includes('initialPhone={phoneSignupHandoff}'));
});
await auth.loginWithPassword({ email: ' QA@EXAMPLE.COM ', password: 'mock-only-password' });
check('email login uses existing identity without classification', () => {
  assert.equal(latest().email, 'qa@example.com');
  assert.equal(latest().options, undefined);
  assert.equal(latest().account_type, undefined);
});
const requestsBeforeInvalid = calls.length;
await assert.rejects(() => auth.requestPhoneOtp({ accountType: 'partner', fullName: ' ', phone: '9876543210', createAccount: true }), /Full name/);
check('invalid signup makes no auth request', () => assert.equal(calls.length, requestsBeforeInvalid));
for (const invalid of [
  { fullName: '--', email: 'qa@example.com' },
  { fullName: 'Contact Name', email: 'suchitkumar@gmail' },
  { fullName: 'Gamer', email: 'qa@example.com' },
]) {
  await assert.rejects(() => auth.signUpWithPassword({ ...invalid, password: 'mock-only-password' }));
}
await assert.rejects(() => auth.loginWithPassword({ email: 'qa@gmail', password: 'mock-only-password' }), /valid email/i);
check('invalid email and full-name values stop at the service boundary', () => assert.equal(calls.length, requestsBeforeInvalid));
await auth.verifyPhoneOtp({ phone: '9876543210', token: '123456' });
check('OTP verification uses same phone identity without profile insertion', () => {
  assert.equal(latest().phone, '+919876543210');
  assert.equal(latest().type, 'sms');
  assert.equal(latest().options, undefined);
});
console.log(`${passed} auth service checks passed; all requests mocked.`);
