import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute App's actual auth effect and deadline helper with deterministic
// timers, deferred service responses and no browser/Auth/database requests.
const source = fs.readFileSync('App.tsx', 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const acceptIdentity')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect);
const compile = text => ts.transpile(text, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const profile = id => ({ profile: { id, onboarding_completed: true }, suggestedFullName: `User ${id}`, workspaceProfile: { authUserId: `auth-${id}`, details: {} } });
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function harness(options = {}) {
  const timers = new Map(); let timerId = 0, callback;
  const setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const deadlines = {};
  new Function('exports', 'setTimeout', 'clearTimeout', compile(fs.readFileSync('src/services/request-deadline.ts', 'utf8')))(deadlines, setTimeout, clearTimeout);
  const state = { data: { mode: 'unauthenticated' }, authLoading: false, authError: '', workspaceError: '', sessionChecked: false, profileCalls: 0, workspaceCalls: 0, bootstrapCalls: 0, signals: [], validatedUsers: [] };
  const noop = () => {};
  const dep = {
    loaded: true, isSupabaseConfigured: true, initialData: { mode: 'unauthenticated' }, initialWebRoute: null, Platform: { OS: 'web' },
    authIdentityRef: { current: null }, authGenerationRef: { current: 0 }, refreshAuthRef: { current: noop },
    setData: next => { state.data = typeof next === 'function' ? next(state.data) : next; },
    setAuthLoading: value => { state.authLoading = value; }, setAuthError: value => { state.authError = value; },
    setWorkspaceError: value => { state.workspaceError = value; }, setWorkspaceLoading: value => { state.workspaceLoading = value; }, setSessionChecked: value => { state.sessionChecked = value; },
    setProfileSetup: noop, setScreen: noop, setHistory: noop, setWelcomeError: noop, setIntroSeen: noop,
    bootstrapSession: async () => { state.bootstrapCalls++; return options.bootstrap ? options.bootstrap() : { status: 'authenticated', user: { id: 'auth-7' } }; },
    profileOnboardingService: { load: (signal, validatedUser) => { state.profileCalls++; state.signals.push(signal); state.validatedUsers.push(validatedUser); return options.profile ? options.profile(signal, state.profileCalls) : Promise.resolve(profile(7)); } },
    loadRemoteWorkspace: async () => { state.workspaceCalls++; return options.workspace ? options.workspace() : { profile: { id: '7' } }; },
    hydrateRemoteData: (remote, current) => ({ ...current, workspace: remote }),
    subscribeToAuthRedirects: () => noop,
    supabase: { auth: { onAuthStateChange: handler => { callback = handler; return { data: { subscription: { unsubscribe: noop } } }; } } },
    withRequestDeadline: deadlines.withRequestDeadline, setTimeout,
    console: { warn: noop },
  };
  const cleanup = new Function(...Object.keys(dep), compile(`const effect = ${effect}; return effect();`))(...Object.values(dep));
  const runTimers = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  return { state, dep, cleanup, timers, runTimers, event: (event, id = 'auth-7') => callback(event, event === 'SIGNED_OUT' ? null : { user: { id } }) };
}

const normal = harness(); await flush();
assert.equal(normal.state.profileCalls, 1); assert.equal(normal.state.workspaceCalls, 1);
assert.equal(normal.state.validatedUsers[0]?.id, 'auth-7', 'App passes its server-validated bootstrap identity into profile loading');
for (let i = 0; i < 5; i++) { normal.event('SIGNED_IN'); normal.runTimers(0); await flush(); }
assert.equal(normal.state.profileCalls, 1, 'Same identity confirmations/refocus never repeat account bootstrap');
assert.equal(normal.state.authLoading, false);
normal.cleanup();

const stalledProfile = deferred();
const timeout = harness({ profile: (_, count) => count === 1 ? stalledProfile.promise : Promise.resolve(profile(7)) }); await flush();
assert.equal(timeout.state.authLoading, true);
timeout.runTimers(30_000); await flush();
assert.match(timeout.state.authError, /profile took too long/);
assert.equal(timeout.state.authLoading, false);
assert.equal(timeout.state.signals[0].aborted, true, 'Abort signal reaches profile network reads');
timeout.event('SIGNED_IN'); timeout.runTimers(0); await flush();
assert.equal(timeout.state.profileCalls, 1, 'Failed bootstrap does not become an automatic refocus retry storm');
await timeout.dep.refreshAuthRef.current(); await flush();
assert.equal(timeout.state.profileCalls, 2); assert.equal(timeout.state.data.mode, 'authenticated');
stalledProfile.resolve(profile(99)); await flush();
assert.equal(timeout.state.data.userId, '7', 'Timed-out completion cannot replace a successful retry');
timeout.cleanup();

const stalledWorkspace = deferred(); let workspaceAttempt = 0;
const feed = harness({ workspace: () => ++workspaceAttempt === 1 ? stalledWorkspace.promise : { profile: { id: '7' } } }); await flush();
assert.equal(feed.state.authLoading, false, 'Completed profile enables the app while discovery loads');
assert.equal(feed.state.workspaceLoading, true, 'Feed renders loading, not false empty data, until workspace completes');
feed.runTimers(30_000); await flush();
assert.match(feed.state.workspaceError, /Feed took too long/);
assert.equal(feed.state.authError, ''); assert.equal(feed.state.data.mode, 'authenticated');
assert.equal(feed.state.workspaceLoading, false);
await feed.dep.refreshAuthRef.current(); await flush();
assert.equal(feed.state.workspaceError, ''); assert.equal(feed.state.workspaceCalls, 2);
stalledWorkspace.resolve({ profile: { id: '99' } }); await flush();
assert.equal(feed.state.data.workspace.profile.id, '7');
feed.cleanup();

const oldProfile = deferred(), newProfile = deferred();
const switching = harness({ profile: (_, count) => count === 1 ? oldProfile.promise : newProfile.promise }); await flush();
switching.event('SIGNED_IN', 'auth-8'); switching.runTimers(0); await flush();
assert.equal(switching.state.signals[0].aborted, true);
oldProfile.resolve(profile(7)); await flush();
assert.equal(switching.state.authLoading, true, 'Old request finalizer cannot clear new-account loading');
newProfile.resolve(profile(8)); await flush();
assert.equal(switching.state.data.userId, '8');
switching.event('SIGNED_OUT'); await flush();
assert.equal(switching.state.data.mode, 'unauthenticated');
switching.cleanup();

let bootstrapAttempt = 0;
const restore = harness({ bootstrap: () => ++bootstrapAttempt === 1 ? new Promise(() => {}) : { status: 'authenticated', user: { id: 'auth-7' } } }); await flush();
restore.runTimers(30_000); await flush();
assert.match(restore.state.authError, /session took too long/);
assert.equal(restore.state.sessionChecked, true);
await restore.dep.refreshAuthRef.current(); await flush();
assert.equal(restore.state.data.mode, 'authenticated');
restore.cleanup();

assert.match(source, /accessibilityLabel="Retry loading Feed"/);
console.log('PASS: actual App auth effect suppresses same-session refocus reloads; profile/bootstrap deadlines recover; DB signals abort; discovery failure retains authenticated navigation; explicit retry, stale completion, identity change and sign-out are guarded. Offline only.');
