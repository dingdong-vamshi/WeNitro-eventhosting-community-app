// Isolated regression assertions only: no real Google/Supabase requests or records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://klyjzbisgycegkkacbjw.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'isolated-test-public-key',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-isolated_test.apps.googleusercontent.com',
};
const session = {
  access_token: 'isolated-test-access-token',
  refresh_token: 'isolated-test-refresh-token',
  user: { id: 'isolated-test-user' },
};
let mode = 'success';
let commits = 0;
let exchanges = 0;
let createdOptions;
let deadline;
let finishChooser;
let finishUncooperativeExchange;
let lastFetchSignal;

const backend = {
  isSupabaseConfigured: true,
  supabase: { auth: { setSession: async (tokens) => {
    assert.equal(tokens.access_token, session.access_token);
    assert.equal(tokens.refresh_token, session.refresh_token);
    commits++;
    return { data: { session }, error: null };
  } } },
};
const mockFetch = async (_input, init) => {
  lastFetchSignal = init.signal;
  await new Promise((_resolve, reject) => {
    if (init.signal.aborted) reject(new Error('aborted'));
    else init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
};
const library = {
  createClient: (url, key, options) => {
    assert.equal(url, env.EXPO_PUBLIC_SUPABASE_URL);
    assert.equal(key, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    createdOptions = options;
    return { auth: {
      stopAutoRefresh: async () => {},
      signInWithIdToken: async (credentials) => {
        exchanges++;
        assert.equal(credentials.provider, 'google');
        assert.equal(credentials.token, 'isolated-google-id-token');
        if (mode === 'pending') await options.global.fetch('isolated-test-url');
        if (mode === 'ignores-abort') await new Promise((resolve) => { finishUncooperativeExchange = resolve; });
        return mode === 'disabled'
          ? { data: {}, error: { code: 'provider_disabled', message: 'provider disabled' } }
          : { data: { session }, error: null };
      },
    } };
  },
};
const googleSdk = {
  statusCodes: { SIGN_IN_CANCELLED: 'NATIVE_CANCELLED', IN_PROGRESS: 'NATIVE_IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'NATIVE_PLAY_SERVICES_UNAVAILABLE' },
  GoogleSignin: {
    configure: (options) => { assert.equal(options.webClientId, env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID); assert.equal(options.offlineAccess, false); },
    hasPlayServices: async () => true,
    hasPreviousSignIn: () => false,
    signIn: async () => {
      if (mode === 'chooser-pending') return new Promise((resolve) => { finishChooser = resolve; });
      if (mode === 'chooser-cancel') return { type: 'cancelled' };
      if (mode === 'chooser-error') throw { code: googleSdk.statusCodes.PLAY_SERVICES_NOT_AVAILABLE };
      return { type: 'success', data: { idToken: 'isolated-google-id-token' } };
    },
  },
};

function loadModule(relativeFile, imports) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relativeFile), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name]; },
    process: { env }, AbortController, fetch: mockFetch,
    setTimeout: (callback, delay) => { assert.equal(delay, 30000); deadline = callback; return 1; },
    clearTimeout: () => {},
  }, { filename: relativeFile });
  return module.exports;
}

const shared = loadModule('src/services/google-auth.shared.ts', { '@supabase/supabase-js': library, '../lib/supabase': backend });
const native = loadModule('src/services/google-auth.ts', {
  'react-native': { Platform: { OS: 'android' } },
  './google-auth.shared': shared,
  '@react-native-google-signin/google-signin': googleSdk,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

assert.equal((await native.signInWithGoogleIdentity()).status, 'authenticated');
assert.equal(commits, 1);
assert.equal(createdOptions.auth.persistSession, false);
assert.equal(createdOptions.auth.autoRefreshToken, false);
assert.equal(createdOptions.auth.detectSessionInUrl, false);

mode = 'chooser-cancel';
const previousExchanges = exchanges;
assert.equal((await native.signInWithGoogleIdentity()).status, 'cancelled');
assert.equal(exchanges, previousExchanges, 'Dismissing Google must not exchange a token');

mode = 'chooser-pending';
const firstAttempt = native.signInWithGoogleIdentity();
await flush();
await assert.rejects(native.signInWithGoogleIdentity(), (error) => error.code === 'in_progress');
finishChooser({ type: 'cancelled' });
await firstAttempt;

const alreadyCancelled = new AbortController();
alreadyCancelled.abort();
assert.equal((await native.signInWithGoogleIdentity({ signal: alreadyCancelled.signal })).status, 'cancelled');

mode = 'pending';
const abort = new AbortController();
const pending = shared.exchangeGoogleIdentity('isolated-google-id-token', undefined, abort.signal);
abort.abort();
assert.equal((await pending).status, 'cancelled');
assert.ok(lastFetchSignal.aborted);
assert.equal(commits, 1, 'An aborted request must not publish a main-client session');

const timedOut = shared.exchangeGoogleIdentity('isolated-google-id-token');
deadline();
await assert.rejects(timedOut, (error) => error.code === 'timeout');
assert.equal(commits, 1, 'The deadline must not leave a late session write');

mode = 'ignores-abort';
const ignoredAbort = new AbortController();
const lateResponse = shared.exchangeGoogleIdentity('isolated-google-id-token', undefined, ignoredAbort.signal);
ignoredAbort.abort();
finishUncooperativeExchange();
assert.equal((await lateResponse).status, 'cancelled');
assert.equal(commits, 1, 'Even a transport ignoring abort must not publish after cancellation');

mode = 'disabled';
await assert.rejects(native.signInWithGoogleIdentity(), (error) => error.code === 'provider_disabled');
assert.equal(commits, 1);
mode = 'chooser-error';
await assert.rejects(native.signInWithGoogleIdentity(), (error) => error.code === 'play_services_unavailable');
env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '';
await assert.rejects(native.signInWithGoogleIdentity(), (error) => error.code === 'missing_client_id');
assert.equal(commits, 1);

console.log('PASS: Google isolated exchange, native cancellation, duplicate taps, abort, 30s deadline, ignored-abort response, provider errors, and client-ID validation. No real auth or database requests.');
