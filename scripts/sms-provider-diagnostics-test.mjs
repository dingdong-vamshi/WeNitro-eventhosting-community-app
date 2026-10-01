// Offline handler test: no real credentials, phone calls, or SMS requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const logs = [];
const requests = [];
let handler;
const secrets = { SEND_SMS_HOOK_SECRET: 'mock-hook', FAST2SMS_API_KEY: 'mock-key', FAST2SMS_OTP_ID: 'mock-template', VERIPHONE_API_KEY: 'mock-veriphone' };
const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../supabase/functions/send-sms/' + name, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: module.exports, module,
    require: name => name === 'standardwebhooks' ? { Webhook: class { verify(body) { return JSON.parse(body); } } } : load(name.replace('./', '')),
    Deno: { env: { get: name => secrets[name] }, serve: fn => { handler = fn; } },
    Request, Response, URL, TextEncoder, AbortController, setTimeout, clearTimeout,
    console: { warn: line => logs.push(JSON.parse(line)), info: line => logs.push(JSON.parse(line)) },
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return String(url).includes('veriphone')
        ? Response.json({ status: 'success', phone_valid: true })
        : Response.json({ return: false, status_code: 412, message: 'Invalid Authentication, Check Authorization Key', sensitive: 'must-not-log' }, { status: 401 });
    },
  });
  return modules[name] = module.exports;
}
load('index.ts');
const response = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ user: { phone: '+919876543210' }, sms: { otp: '123456' } }) }));
assert.equal(response.status, 502);
assert.equal(requests[1].url, 'https://www.fast2sms.com/dev/otp/send');
assert.equal(requests[1].options.headers.Authorization, secrets.FAST2SMS_API_KEY);
assert.equal(JSON.parse(requests[1].options.body).otp_id, secrets.FAST2SMS_OTP_ID);
assert.deepEqual(logs.at(-1), { event: 'sms_provider_rejected', provider: 'fast2sms', http_status: 401, provider_code: 412, reason: 'invalid_authorization_key' });
const serialized = JSON.stringify(logs);
for (const sensitive of [...Object.values(secrets), '9876543210', '123456', 'must-not-log']) assert.ok(!serialized.includes(sensitive));
console.log('PASS provider 401/412 traced to hook 502; exact authorization header; sanitized diagnostics only (mocked)');
