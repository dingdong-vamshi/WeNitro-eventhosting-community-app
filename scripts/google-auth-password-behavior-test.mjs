import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = ts.transpile(fs.readFileSync('src/services/auth-production.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
let identities = [], email = 'member@example.test', recoveryCalls = [];
const supabase = { auth: {
  getUser: async () => ({ data: { user: { id: 'user-A', email, identities } }, error: null }),
}, functions: { invoke: async (...args) => { recoveryCalls.push(args); return { error: null }; } } };
const auth = {};
new Function('exports', 'require', source)(auth, name => {
  if (name === 'expo-linking') return { createURL: path => `wenitro://${path}`, getInitialURL: async () => null };
  if (name === 'react-native') return { Platform: { OS: 'web' } };
  if (name === '../lib/supabase') return { isSupabaseConfigured: true, supabase };
  if (name === '../utils/validation') return { validateEmail: value => ({ valid: /@/.test(value), error: 'Invalid email' }), validateFullName: () => ({ valid: true }) };
  if (name === './request-deadline') return { withRequestDeadline: async value => await value };
  throw new Error(`Unexpected module ${name}`);
});

assert.equal(auth.classifySignInMethods([{ provider: 'google' }], email).kind, 'google-only');
assert.equal(auth.classifySignInMethods([{ provider: 'email' }], email).kind, 'password-only');
assert.equal(auth.classifySignInMethods([{ provider: 'google' }, { provider: 'email' }], email).kind, 'linked');
assert.equal(auth.classifySignInMethods([{ provider: 'phone' }], null).kind, 'phone-only');

identities = [{ provider: 'google', user_id: 'user-A' }];
assert.equal((await auth.getCurrentSignInMethods()).kind, 'google-only');
await assert.rejects(auth.requestCurrentUserPasswordReset(), /Google password with Google/i);
assert.equal(recoveryCalls.length, 0, 'Google-only users must not trigger password recovery');

identities = [{ provider: 'email', user_id: 'user-A' }];
await auth.requestCurrentUserPasswordReset();
assert.equal(recoveryCalls.length, 1);
assert.equal(recoveryCalls[0][0], 'password-recovery');
assert.deepEqual(recoveryCalls[0][1].body, { email });

identities = [{ provider: 'google', user_id: 'user-A' }, { provider: 'email', user_id: 'user-A' }];
await auth.requestCurrentUserPasswordReset();
assert.equal(recoveryCalls.length, 2, 'Linked users retain password management');

const appAndServices = ['App.tsx', ...fs.readdirSync('src/services').filter(name => name.endsWith('.ts')).map(name => `src/services/${name}`)]
  .map(path => fs.readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(appAndServices, /successful login email|login_success|send_login_email/i);
assert.match(fs.readFileSync('src/components/account-security-card.tsx', 'utf8'), /managed by Google/);
assert.match(fs.readFileSync('App.tsx', 'utf8'), /Google Sign-In accounts manage their Google password with Google/);

console.log('PASS: provider-aware Google-only, email/password and linked behavior; Google-only reset blocked with zero email calls; password identities retain Supabase reset; no custom successful-login email implementation.');
