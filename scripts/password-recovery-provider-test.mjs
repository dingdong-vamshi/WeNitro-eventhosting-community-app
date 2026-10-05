import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpile(fs.readFileSync('supabase/functions/password-recovery/handler.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const edge = {}; new Function('exports', compiled)(edge);
let passwordIdentity = false, checked = [], sent = [], waits = [];
const handler = edge.createPasswordRecoveryHandler({
  hasPasswordIdentity: async email => { checked.push(email); return passwordIdentity; },
  sendReset: async email => { sent.push(email); },
  wait: async ms => { waits.push(ms); }, minimumResponseMs: 50,
});
const request = email => new Request('https://project.test/password-recovery', { method: 'POST', body: JSON.stringify({ email }) });

assert.equal((await handler(new Request('https://project.test', { method: 'OPTIONS' }))).status, 204);
assert.equal((await handler(request('bad-email'))).status, 400);
let response = await handler(request('GoogleOnly@Example.test'));
assert.equal(response.status, 202); assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(sent.length, 0); assert.deepEqual(checked, ['googleonly@example.test']); assert.equal(waits.length, 1);
const googleBody = await response.json();

passwordIdentity = true;
response = await handler(request('Password@Example.test'));
assert.equal(response.status, 202); assert.deepEqual(sent, ['password@example.test']);
assert.deepEqual(await response.json(), googleBody, 'public response must not reveal provider/account state');

const failing = edge.createPasswordRecoveryHandler({ hasPasswordIdentity: async () => { throw new Error('database detail'); }, sendReset: async () => { throw new Error('unexpected'); }, wait: async () => {}, minimumResponseMs: 0 });
response = await failing(request('unknown@example.test'));
assert.equal(response.status, 202); assert.doesNotMatch(await response.text(), /database detail|unknown@example.test/);
console.log('PASS: enumeration-safe provider-aware password recovery sends only for email/password identities and returns identical generic responses for Google-only/unknown accounts.');
