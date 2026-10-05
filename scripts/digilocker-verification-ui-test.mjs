import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
const compile = (source, require) => {
  const exports = {};
  new Function('exports', 'require', ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
  }))(exports, require);
  return exports;
};
const walk = (node, predicate) => !node || typeof node !== 'object' ? [] : [
  ...(!Array.isArray(node) && predicate(node) ? [node] : []),
  ...(Array.isArray(node) ? node : node.children || []).flatMap(child => walk(child, predicate)),
];
const tick = () => new Promise(resolve => setImmediate(resolve));

{
  const state = [], refs = [], calls = [], launches = [], verified = [];
  let cursor = 0, refCursor = 0, effectUsed = false, cleanup, current = true, sdkCallback, tree;
  const session = '11111111-1111-4111-8111-111111111111';
  const service = {
    availability: async () => ({ available: true, verified: false, status: 'not_started' }),
    begin: async consent => {
      calls.push(['begin', consent]);
      return { available: true, verified: false, status: 'created', sessionId: session, publicApiKey: 'key_live_public_mock' };
    },
    refresh: async () => {
      calls.push(['refresh']);
      return { available: true, verified: true, status: 'verified', message: 'Aadhaar verified.' };
    },
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const hooks = {
    ...React,
    default: React,
    __esModule: true,
    useState: init => {
      const key = cursor++;
      if (!(key in state)) state[key] = init;
      return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }];
    },
    useRef: init => refs[refCursor++] ??= { current: init },
    useEffect: fn => { if (!effectUsed) { effectUsed = true; cleanup = fn(); } },
  };
  const api = compile(fs.readFileSync('src/components/aadhaar-verification-card.tsx', 'utf8'), name => name === 'react' ? hooks
    : name === 'react-native' ? { Text: 'Text', View: 'View', Pressable: 'Pressable' }
    : name.includes('aadhaar-verification') ? { aadhaarVerificationService: service }
    : name.includes('digilocker-sdk') ? {
      launchDigiLockerSession: async (sessionId, key, callback) => {
        launches.push([sessionId, key]); sdkCallback = callback;
      },
    }
    : name.includes('internal-share') ? { captureShareScope: () => () => current }
    : { Button: 'Button', ErrorLine: 'ErrorLine', usePalette: () => ({ card: '', border: '', text: '', muted: '' }) });
  const render = () => { cursor = 0; refCursor = 0; tree = api.AadhaarVerificationCard({ verified: false, onVerified: async () => { verified.push(true); } }); };
  render(); await tick(); render();
  let begin = walk(tree, node => node.props.label === 'Continue to DigiLocker')[0];
  eq(begin.props.disabled, true);
  walk(tree, node => node.props.accessibilityRole === 'checkbox')[0].props.onPress();
  render();
  begin = walk(tree, node => node.props.label === 'Continue to DigiLocker')[0];
  eq(begin.props.disabled, false);
  begin.props.onPress(); await tick(); await tick(); render();
  eq(calls[0], ['begin', true]);
  eq(launches[0], [session, 'key_live_public_mock']);
  sdkCallback('closed'); await tick(); render();
  eq(calls.filter(call => call[0] === 'refresh').length, 0);
  eq(verified.length, 0);
  sdkCallback('completed'); await tick(); await tick(); render();
  eq(calls.filter(call => call[0] === 'refresh').length, 1);
  eq(verified.length, 1);
  cleanup(); current = false;
}

{
  let reply = { available: true, verified: false, status: 'created', sessionId: '11111111-1111-4111-8111-111111111111', publicApiKey: 'key_live_public_mock' };
  const requests = [];
  const client = compile(fs.readFileSync('src/services/aadhaar-verification.ts', 'utf8'), () => ({
    supabase: { functions: { invoke: async (name, args) => { requests.push({ name, ...args }); return { data: reply, error: null }; } } },
  })).aadhaarVerificationService;
  await client.begin(true);
  eq(requests[0], {
    name: 'aadhaar-verification',
    body: { action: 'begin', consent: true, consentVersion: 'wenitro-aadhaar-digilocker-sdk-v1' },
  });
  reply = { available: true, verified: false, status: 'created', sessionId: 'forged', publicApiKey: 'secret_live_private' };
  await assert.rejects(client.begin(true), /invalid launch session/); checks += 1;
}

const sdkSource = fs.readFileSync('src/services/digilocker-sdk.web.ts', 'utf8');
assert.match(sdkSource, /https:\/\/sdk\.sandbox\.co\.in\/kyc\/digilocker\/sdk\.js/); checks += 1;
assert.match(sdkSource, /digilocker_sdk\.session\.completed/); checks += 1;
assert.match(sdkSource, /digilocker_sdk\.session\.closed/); checks += 1;
assert.match(sdkSource, /setAPIKey\(publicApiKey\)/); checks += 1;
assert.doesNotMatch(sdkSource, /API_SECRET|secret_live_|secret_test_/); checks += 1;
const cardSource = fs.readFileSync('src/components/aadhaar-verification-card.tsx', 'utf8');
assert.match(cardSource, /event === 'completed'/); checks += 1;
assert.match(cardSource, /void run\('refresh'\)/); checks += 1;
assert.match(cardSource, /No verification was granted/); checks += 1;
assert.doesNotMatch(cardSource, /setState\([^)]*verified:\s*true/); checks += 1;

console.log(JSON.stringify({
  status: 'PASS',
  checks,
  scope: 'Consent gate, typed begin action, SDK launch, completed/closed handling, server refresh requirement, client launch validation, official SDK URL/events, and secret non-exposure.',
}));
