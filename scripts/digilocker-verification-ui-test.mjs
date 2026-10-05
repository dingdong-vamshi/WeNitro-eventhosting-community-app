import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
const compile = (source, require) => {
  const exports = {};
  new Function('exports', 'require', ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(exports, require);
  return exports;
};
const walk = (node, predicate) => !node || typeof node !== 'object' ? [] : [
  ...(!Array.isArray(node) && predicate(node) ? [node] : []),
  ...(Array.isArray(node) ? node : node.children || []).flatMap(child => walk(child, predicate)),
];
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const scenario of ['disabled', 'success', 'error', 'stale']) {
  const state = [], refs = [], calls = [], verified = [];
  let cursor = 0, refCursor = 0, effectUsed = false, cleanup, current = true, resolvePending, tree;
  const service = {
    availability: async () => scenario === 'stale' ? new Promise(resolve => { resolvePending = resolve; })
      : { available: scenario !== 'disabled', verified: false, status: scenario === 'disabled' ? 'unavailable' : 'not_started' },
    sendOtp: async (aadhaarNumber, consent) => {
      calls.push(['sendOtp', aadhaarNumber, consent]);
      if (scenario === 'error') throw new Error('Sandbox is temporarily unavailable');
      return { available: true, verified: false, status: 'otp_sent', maskedAadhaar: '•••• •••• 9012', message: 'OTP sent.' };
    },
    verifyOtp: async otp => {
      calls.push(['verifyOtp', otp]);
      return { available: true, verified: true, status: 'verified', maskedAadhaar: '•••• •••• 9012', message: 'Aadhaar verified.' };
    },
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const hooks = { ...React, default: React, __esModule: true,
    useState: init => { const key = cursor++; if (!(key in state)) state[key] = init; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef: init => refs[refCursor++] ??= { current: init },
    useEffect: fn => { if (!effectUsed) { effectUsed = true; cleanup = fn(); } },
  };
  const api = compile(fs.readFileSync('src/components/aadhaar-verification-card.tsx', 'utf8'), name => name === 'react' ? hooks
    : name === 'react-native' ? { Text: 'Text', View: 'View', Pressable: 'Pressable' }
    : name.includes('aadhaar-verification') ? { aadhaarVerificationService: service }
    : name.includes('internal-share') ? { captureShareScope: () => () => current }
    : { Button: 'Button', ErrorLine: 'ErrorLine', Field: 'Field', usePalette: () => ({ card: '', border: '', text: '', muted: '' }) });
  const render = () => { cursor = 0; refCursor = 0; tree = api.AadhaarVerificationCard({ verified: false, onVerified: async () => { verified.push(true); } }); };
  render(); await tick();
  if (scenario === 'stale') {
    current = false; cleanup(); resolvePending({ available: true, verified: true, status: 'verified' }); await tick();
    eq(verified, []); continue;
  }
  render();
  if (scenario === 'disabled') {
    eq(walk(tree, node => node.props.label === 'Send Aadhaar OTP').length, 0); eq(calls, []); cleanup(); continue;
  }
  const aadhaarField = walk(tree, node => node.props.accessibilityLabel === '12-digit Aadhaar number')[0];
  const consent = walk(tree, node => node.props.accessibilityRole === 'checkbox')[0];
  let send = walk(tree, node => node.props.label === 'Send Aadhaar OTP')[0];
  eq(send.props.disabled, true);
  aadhaarField.props.onChangeText('1234 5678 9012'); consent.props.onPress(); render();
  send = walk(tree, node => node.props.label === 'Send Aadhaar OTP')[0]; eq(send.props.disabled, false);
  send.props.onPress(); await tick(); render();
  eq(calls[0], ['sendOtp', '123456789012', true]);
  if (scenario === 'error') {
    eq(walk(tree, node => node.type === 'ErrorLine')[0].props.text, 'Sandbox is temporarily unavailable'); eq(verified, []); cleanup(); continue;
  }
  const otpField = walk(tree, node => node.props.accessibilityLabel === '6-digit Aadhaar OTP')[0];
  otpField.props.onChangeText('123456'); render();
  const verify = walk(tree, node => node.props.label === 'Verify Aadhaar OTP')[0]; eq(verify.props.disabled, false);
  verify.props.onPress(); await tick(); render();
  eq(calls[1], ['verifyOtp', '123456']); eq(verified.length, 1);
  cleanup();
}

let reply = { available: false, verified: false, status: 'unavailable' };
const requests = [];
const client = compile(fs.readFileSync('src/services/aadhaar-verification.ts', 'utf8'), () => ({ supabase: { functions: { invoke: async (name, args) => { requests.push({ name, ...args }); return { data: reply, error: null }; } } } })).aadhaarVerificationService;
await client.sendOtp('123456789012', true);
eq(requests[0], { name: 'aadhaar-verification', body: { action: 'sendOtp', aadhaarNumber: '123456789012', consent: true, consentVersion: 'wenitro-aadhaar-okyc-v1' } });
reply = { available: true, verified: false, status: 'otp_sent', maskedAadhaar: '•••• •••• 9012' };
await client.verifyOtp('123456');
eq(requests[1], { name: 'aadhaar-verification', body: { action: 'verifyOtp', otp: '123456' } });
reply = { available: true, status: 'otp_sent' };
await assert.rejects(client.availability(), /invalid result/); checks += 1;
const profile = fs.readFileSync('src/components/reconstruction/profile-utilities.tsx', 'utf8');
assert.match(profile, /AadhaarVerificationCard verified=\{Boolean\(metrics\?\.aadhaar_verified\)\} onVerified=\{load\}/); checks += 1;
console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Aadhaar OTP consent gating, sanitized input, send/verify transitions, safe masked state, error handling, stale identity protection, client payloads, and profile refresh.' }));
