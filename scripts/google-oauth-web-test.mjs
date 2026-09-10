// Isolated browser-flow assertions only: no real Google/Supabase requests or records.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let initializeOptions;
let renderOptions;
let exchangeError;
let renderedCallback;
const session = { access_token: 'isolated-access', refresh_token: 'isolated-refresh', user: { id: 'isolated-user' } };
const sdk = {
  initialize: (options) => { initializeOptions = options; renderedCallback = options.callback; },
  renderButton: (_container, options) => { renderOptions = options; },
  cancel: () => {},
};
const browserWindow = {
  crypto: webcrypto,
  google: { accounts: { id: sdk } },
  isSecureContext: true,
};
const shared = {
  exchangeGoogleIdentity: async () => {
    if (exchangeError) throw new Error('isolated exchange failure');
    return { status: 'authenticated', session };
  },
  getGoogleWebClientId: () => 'isolated.apps.googleusercontent.com',
  GoogleSignInError: class GoogleSignInError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
  requireGoogleBackend: () => {},
};

const module = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/google-auth.web.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require: (name) => {
    assert.equal(name, './google-auth.shared');
    return shared;
  },
  window: browserWindow,
  crypto: webcrypto,
  TextEncoder,
  AbortController,
  Uint8Array,
  setTimeout,
  clearTimeout,
}, { filename: 'src/services/google-auth.web.ts' });

const container = {
  getBoundingClientRect: () => ({ width: 360 }),
  replaceChildren: () => {},
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const cancelledBusyStates = [];
const retrySuccesses = [];
const cancelController = new AbortController();
const disposeCancelled = await module.exports.mountGoogleIdentityButton(container, {
  onSuccess: (value) => retrySuccesses.push(value),
  onBusyChange: (busy) => cancelledBusyStates.push(busy),
  onError: () => assert.fail('A dismissed chooser must not manufacture an error'),
}, cancelController.signal);
assert.equal(initializeOptions.use_fedcm_for_button, false, 'The web button must not force FedCM');
assert.equal(initializeOptions.ux_mode, 'popup');
assert.equal('click_listener' in renderOptions, false, 'Chooser clicks must not start an app-owned spinner');
assert.deepEqual(cancelledBusyStates, [], 'The real Google button remains usable when the chooser is dismissed');
renderedCallback({ credential: 'isolated-google-id-token' });
await flush();
assert.deepEqual(cancelledBusyStates, [true], 'A retry may start exchanging after a dismissed chooser');
assert.deepEqual(retrySuccesses, [session], 'A retry after dismissal can authenticate');
disposeCancelled();

const successBusyStates = [];
const successes = [];
await module.exports.mountGoogleIdentityButton(container, {
  onSuccess: (value) => successes.push(value),
  onBusyChange: (busy) => successBusyStates.push(busy),
  onError: (error) => assert.fail(error),
}, new AbortController().signal);
renderedCallback({ credential: 'isolated-google-id-token' });
await flush();
assert.deepEqual(successBusyStates, [true], 'Loading begins only after Google returns a credential');
assert.deepEqual(successes, [session]);

exchangeError = true;
const errorBusyStates = [];
const errors = [];
await module.exports.mountGoogleIdentityButton(container, {
  onSuccess: () => assert.fail('A failed exchange must not authenticate'),
  onBusyChange: (busy) => errorBusyStates.push(busy),
  onError: (error) => errors.push(error),
}, new AbortController().signal);
renderedCallback({ credential: 'isolated-google-id-token' });
await flush();
assert.deepEqual(errorBusyStates, [true, false], 'An exchange failure must always restore the button');
assert.equal(errors.length, 1);

console.log('PASS: web Google chooser compatibility, cancellation, credential loading, success, and exchange-error reset. No real auth or database requests.');
