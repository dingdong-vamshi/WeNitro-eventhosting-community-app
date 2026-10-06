import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let authUser = { id: 'qa-user', phone: null, phone_confirmed_at: null };
let ledger = { balance: 250, items: [] };
let ledgerError = null;
const supabase = {
  auth: {
    getUser: async () => ({ data: { user: authUser }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
  },
  rpc: async name => {
    assert.equal(name, 'list_my_nitro_history');
    return { data: ledger, error: ledgerError };
  },
};
const module = { exports: {} };
vm.runInNewContext(compile('src/services/hubble.ts'), {
  module,
  exports: module.exports,
  require(name) {
    if (name === '../lib/supabase') return { supabase };
    if (name === './request-deadline') return { withRequestDeadline: task => task(new AbortController().signal) };
    throw new Error(`Unexpected dependency: ${name}`);
  },
  process: { env: {} },
  URL,
  AbortController,
});
const { requestHubbleReadiness } = module.exports;

let result = await requestHubbleReadiness();
assert.equal(result.balance, 250, 'ledger balance must remain visible before phone verification');
assert.equal(result.eligible, true, '250 meets the 200-point threshold');
assert.equal(result.phoneVerified, false, 'missing confirmed Auth phone remains blocked');

ledger = { balance: 199, items: [] };
result = await requestHubbleReadiness();
assert.equal(result.eligible, false, '199 remains ineligible');

ledger = { balance: 200, items: [] };
authUser = { ...authUser, phone: '+919000000000', phone_confirmed_at: '2026-10-06T00:00:00Z' };
result = await requestHubbleReadiness();
assert.equal(result.eligible, true, '200 is eligible');
assert.equal(result.phoneVerified, true, 'confirmed Auth phone unlocks the phone gate');

ledger = { balance: -1, items: [] };
await assert.rejects(() => requestHubbleReadiness(), /invalid result/i);
ledger = { balance: 250, items: [] };
ledgerError = { message: 'temporarily unavailable' };
await assert.rejects(() => requestHubbleReadiness(), /temporarily unavailable/i);

console.log(JSON.stringify({
  status: 'PASS',
  checks: 8,
  scope: 'authoritative Nitro ledger is displayed independently from the verified-phone Hubble launch gate; 199/200 thresholds and invalid/error states',
}));
