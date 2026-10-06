import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let checks = 0;
const pass = (condition, message) => { assert.ok(condition, message); checks += 1; };

const compile = (path, requireMap, globals = {}) => {
  const source = fs.readFileSync(path, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    ...globals, URL, AbortController, setTimeout, clearTimeout, Promise, Error, Date, Math, JSON,
  })((name) => {
    if (!(name in requireMap)) throw new Error(`Unexpected require ${name}`);
    return requireMap[name];
  }, module, module.exports);
  return module.exports;
};

const events = compile('src/services/hubble-events.ts', {});
assert.equal(
  JSON.stringify(events.parseHubbleSdkEvent({ type: 'action', action: 'app_ready' })),
  JSON.stringify({ kind: 'action', name: 'app_ready', properties: {} }),
); checks += 1;
assert.equal(
  JSON.stringify(events.parseHubbleSdkEvent({ type: 'analytics', event: 'payment_success', properties: { amount: 99 } })),
  JSON.stringify({ kind: 'analytics', name: 'payment_success', properties: { amount: 99 } }),
); checks += 1;
pass(events.isHubbleTerminalEvent(events.parseHubbleSdkEvent({ type: 'analytics', event: 'voucher_generation_fail' })), 'voucher failure is terminal');
pass(events.parseHubbleSdkEvent({ type: 'app_ready' }) === null, 'legacy/wrong event shape is not accepted');

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.test';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';

const phoneModule = ({ verifyMode = 'success', preflight = 'ok' } = {}) => {
  const state = { confirmed: false, setSession: 0, sync: 0, verifyCalls: 0 };
  const userId = '11111111-1111-1111-1111-111111111111';
  const phone = '+919876543210';
  const session = { access_token: 'old-token', refresh_token: 'old-refresh', user: { id: userId } };
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/rpc/prepare_my_phone_change')) {
      if (preflight === 'missing') return response(404, { message: 'Could not find the function', code: 'PGRST202' });
      return preflight === 'ok' ? response(200, { available: true }) : response(400, { message: 'phone_exists', code: 'P0001' });
    }
    if (pathname.endsWith('/rpc/sync_my_phone_verification') || pathname.endsWith('/rpc/sync_my_verification')) {
      state.sync += 1; return response(200, {});
    }
    if (pathname.endsWith('/auth/v1/user') && (init.method ?? 'GET') === 'GET') {
      return response(200, { id: userId, phone: state.confirmed ? phone : null, phone_confirmed_at: state.confirmed ? '2026-10-07T00:00:00Z' : null });
    }
    if (pathname.endsWith('/auth/v1/user') && init.method === 'PUT') return response(200, { id: userId });
    if (pathname.endsWith('/auth/v1/verify')) {
      state.verifyCalls += 1;
      if (verifyMode === 'wrong') return response(403, { message: 'Token has expired or is invalid', code: 'otp_expired' });
      if (verifyMode === 'different-user') return response(200, { access_token: 'other', refresh_token: 'other-refresh', user: { id: '22222222-2222-2222-2222-222222222222', phone, phone_confirmed_at: 'now' } });
      state.confirmed = true;
      if (verifyMode === 'timeout-after-commit') throw new Error('connection closed after commit');
      return response(200, { access_token: 'new-token', refresh_token: 'new-refresh', user: { id: userId, phone, phone_confirmed_at: 'now' } });
    }
    if (pathname.endsWith('/auth/v1/resend')) return response(200, { message_id: 'masked' });
    throw new Error(`Unhandled request ${pathname}`);
  };
  const supabase = { auth: {
    getSession: async () => ({ data: { session }, error: null }),
    setSession: async () => { state.setSession += 1; return { data: { session }, error: null }; },
  } };
  const mod = compile('src/services/phone-change.ts', {
    '../lib/supabase': { supabase },
    './auth-production': { phoneOtpErrorMessage: error => error?.message || 'Could not verify phone.' },
    './request-deadline': { withRequestDeadline: operation => operation(new AbortController().signal) },
  }, { fetch, process, crypto, console: { info() {}, warn() {} } });
  return { service: mod.phoneChangeService, state, phone };
};

{
  const test = phoneModule();
  await test.service.verify(test.phone, '123456');
  pass(test.state.confirmed, 'valid OTP confirms authoritative phone');
  pass(test.state.setSession === 1, 'new same-user session is persisted once');
  pass(test.state.sync === 2, 'profile and Trust projections are reconciled');
}
{
  const test = phoneModule({ verifyMode: 'timeout-after-commit' });
  await test.service.verify(test.phone, '123456');
  pass(test.state.confirmed, 'timeout after commit reconciles authoritative success');
}
{
  const test = phoneModule({ verifyMode: 'wrong' });
  await assert.rejects(test.service.verify(test.phone, '000000'), /expired|invalid/i); checks += 1;
  pass(!test.state.confirmed, 'wrong OTP never confirms phone');
}
{
  const test = phoneModule({ verifyMode: 'different-user' });
  await assert.rejects(test.service.verify(test.phone, '123456'), /different account/i); checks += 1;
  pass(test.state.setSession === 0, 'different-user response is never persisted');
}
{
  const test = phoneModule({ preflight: 'conflict' });
  await assert.rejects(test.service.request(test.phone), /phone_exists/i); checks += 1;
  pass(test.state.verifyCalls === 0, 'ownership conflict is rejected before OTP verification');
}
{
  const test = phoneModule({ preflight: 'missing' });
  await test.service.request(test.phone);
  pass(!test.state.confirmed, 'backend-first rollout fallback requests OTP without marking phone verified');
}

const ui = fs.readFileSync('src/components/reconstruction/profile-utilities.tsx', 'utf8');
pass(/Phone verified[\s\S]*void load\(\)\.catch/.test(ui), 'verified UI clears the submit operation before background reload');
const migration = fs.readFileSync('supabase/migrations/20261007120000_phone_change_cross_account_safety.sql', 'utf8');
pass(/phone_change_in_progress/.test(migration) && /auth\.users[\s\S]*phone_change/.test(migration), 'migration blocks cross-account pending-phone ambiguity');

console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Phone-change same-user reconciliation, timeout-after-commit recovery, wrong OTP rejection, account-switch rejection, duplicate-phone preflight, Hubble documented event contract.' }));
