import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/_shared/cashfree.ts', 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const output = {};
const env = { SUPABASE_URL: 'https://cxsznhrkzqndhseodcyy.supabase.co' };
new Function('exports', 'require', 'Deno', compiled)(output, () => ({}), { env: { get: name => env[name] } });
assert.equal(output.cashfreeWebhookUrl(), env.SUPABASE_URL + '/functions/v1/cashfree-webhook');
env.SUPABASE_URL = 'https://another-project.supabase.co/';
assert.equal(output.cashfreeWebhookUrl(), 'https://another-project.supabase.co/functions/v1/cashfree-webhook');
delete env.SUPABASE_URL;
assert.throws(() => output.cashfreeWebhookUrl(), /SUPABASE_URL is not configured/);
const createOrder = fs.readFileSync('supabase/functions/cashfree-create-order/index.ts', 'utf8');
assert.match(createOrder, /notify_url: cashfreeWebhookUrl\(\)/);
assert.match(createOrder, /order_amount: payment.amount_paisa \/ 100/);
console.log('PASS: webhook follows runtime target and order amount remains server-authoritative');
