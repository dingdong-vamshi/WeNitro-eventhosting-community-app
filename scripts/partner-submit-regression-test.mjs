import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

// Exercise the installed SDK: a method-only mock misses the lost `this.rest`
// receiver that broke production submission. HTTP is intercepted; no records
// or payout destinations are sent to Supabase.
const requests = [];
const underReview = {
  eligible: true,
  can_host_paid: false,
  profile: { user_id: 1, business_name: 'QA Club', status: 'UNDER_REVIEW', activity_types: ['Outdoors'] },
  payout_account: { review_status: 'UNDER_REVIEW' },
};
let response = underReview;
let responseStatus = 200;
const client = createClient('https://partner-test.invalid', 'offline-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (url, init) => {
    requests.push({ url: String(url), method: init.method, payload: JSON.parse(init.body ?? '{}') });
    return new Response(JSON.stringify(response), { status: responseStatus, headers: { 'Content-Type': 'application/json' } });
  } },
});
const exports = {};
new Function('exports', 'require', ts.transpile(
  fs.readFileSync('src/services/partner-account.ts', 'utf8'),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
))(exports, name => {
  assert.equal(name, '../lib/supabase');
  return { supabase: client };
});
const { partnerAccountService, validatePartnerAccount } = exports;
const upi = {
  business_name: ' QA Club ', description: '', city: ' Pune ', activity_types: [' Outdoors ', 'Outdoors'],
  activity_location: ' Pune park ', age_category: ' 18+ ', bank_name: '',
  account_holder_name: '', account_number: '', ifsc: '', upi_id: ' Qa.Member@UPI ',
};
const bank = { ...upi, upi_id: '', bank_name: ' QA Bank ', account_holder_name: ' QA Member ', account_number: '1234 567890', ifsc: 'abcd0123456' };

for (const input of [upi, bank]) {
  assert.equal(validatePartnerAccount(input), null);
  assert.deepEqual(await partnerAccountService.submit(input), underReview);
  const sent = requests.at(-1);
  assert.equal(sent.url, 'https://partner-test.invalid/rest/v1/rpc/submit_partner_application');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.payload.p_application.business_name, 'QA Club');
  assert.deepEqual(sent.payload.p_application.activity_types, ['Outdoors']);
}
assert.equal(requests[0].payload.p_application.upi_id, 'qa.member@upi');
assert.equal(requests[1].payload.p_application.account_number, '1234567890');
assert.equal(requests[1].payload.p_application.ifsc, 'ABCD0123456');

const invalidInputs = [
  { ...upi, upi_id: 'missing-provider' },
  { ...upi, upi_id: `${'x'.repeat(101)}@upi` },
  { ...upi, upi_id: `qa@${'x'.repeat(56)}` },
  { ...upi, upi_id: 'a@upi' },
  { ...upi, upi_id: 'valid@u' },
  { ...upi, upi_id: '' },
  { ...upi, bank_name: 'Leftover bank' },
  { ...bank, upi_id: 'qa@upi' },
  { ...bank, bank_name: '' },
  { ...bank, account_holder_name: '' },
  { ...bank, account_number: '123' },
  { ...bank, account_number: '1'.repeat(35) },
  { ...bank, ifsc: 'ABCD1123456' },
];
for (const input of invalidInputs) {
  assert.equal(typeof validatePartnerAccount(input), 'string');
  await assert.rejects(partnerAccountService.submit(input));
}
assert.equal(requests.length, 2, 'Invalid destinations must not reach the API');
assert.equal(validatePartnerAccount({ ...upi, upi_id: `${'x'.repeat(100)}@${'y'.repeat(55)}` }), null);

response = { message: 'A suspended Partner account must be reviewed by WeNitro', code: '42501' };
responseStatus = 403;
await assert.rejects(partnerAccountService.submit(upi), /suspended Partner/);
assert.equal(requests.length, 3, 'Failed submissions must not automatically retry');
response = underReview;
responseStatus = 200;
assert.deepEqual(await partnerAccountService.submit(upi), underReview, 'An explicit retry can succeed');
assert.deepEqual(await partnerAccountService.get(), underReview);
assert.equal(requests.at(-1).url, 'https://partner-test.invalid/rest/v1/rpc/get_my_partner_profile');
console.log('PASS: real Supabase SDK submission retains receiver; bank/UPI payloads, validation, server error and retry verified offline.');

const listeners = [];
let onStatus;
let removed = false;
const channel = {
  on(_type, _filter, listener) { listeners.push(listener); return this; },
  subscribe(listener) { onStatus = listener; return this; },
};
const scheduled = new Map();
let timerId = 0;
const dashboardExports = {};
new Function('exports', 'require', 'setTimeout', 'clearTimeout', ts.transpile(
  fs.readFileSync('src/services/partner-production.ts', 'utf8'),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
))(dashboardExports, () => ({ supabase: {
  channel: () => channel,
  removeChannel: async value => { assert.equal(value, channel); removed = true; },
} }), callback => { scheduled.set(++timerId, callback); return timerId; }, id => scheduled.delete(id));
let refreshes = 0;
const cleanup = dashboardExports.partnerProductionService.subscribe('qa-user', () => { refreshes++; });
onStatus('SUBSCRIBED');
assert.equal(scheduled.size, 0, 'Initial subscription must not duplicate the screen load');
onStatus('CHANNEL_ERROR');
onStatus('SUBSCRIBED');
assert.equal(scheduled.size, 1, 'Reconnect must refresh missed changes');
for (const callback of scheduled.values()) callback();
scheduled.clear();
assert.equal(refreshes, 1);
for (const listener of listeners) listener();
assert.equal(scheduled.size, 1, 'A burst of realtime table events is coalesced');
cleanup();
assert.equal(scheduled.size, 0);
assert.equal(removed, true);
console.log('PASS: Partner realtime avoids initial duplicate fetch, refreshes reconnects, coalesces changes and cleans up.');
