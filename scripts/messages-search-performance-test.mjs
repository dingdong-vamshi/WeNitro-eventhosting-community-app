import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the real component's effects with an in-memory hook scheduler. This
// verifies request counts/races without browser sessions or production writes.
const hooks = [], timers = new Map(), inboxCalls = [], discoveries = [];
let cursor = 0, dirty = true, effects = [], tree, nextTimer = 1, foreground;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const react = {
  createElement(type, props, ...children) { return { type, props: props || {}, children }; },
  useState(initial) {
    const index = cursor++;
    hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [hooks[index].value, next => { const value = typeof next === 'function' ? next(hooks[index].value) : next; if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; } }];
  },
  useEffect(callback, dependencies) {
    const index = cursor++, previous = hooks[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      effects.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: callback() }; });
    }
  },
};
const backend = {
  rpc(name) {
    assert.equal(name, 'list_chat_inbox');
    const request = { ...deferred(), signal: null }; inboxCalls.push(request);
    return { abortSignal(signal) { request.signal = signal; return request.promise; } };
  },
  storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: path } }) }) },
};
const noop = () => null;
const palette = new Proxy({}, { get: () => '#fff' });
const ui = new Proxy({ usePalette: () => palette, ui: {}, purple: '#6650f5' }, { get: (target, key) => key in target ? target[key] : noop });
const dependencies = {
  react: { __esModule: true, default: react, ...react },
  'react-native': new Proxy({}, { get: (_, key) => key }),
  'expo-image-picker': {}, '../verified-badge': { VerifiedBadge: noop }, '../user-avatar': { UserAvatar: noop },
  '../../services/communities-production': { communitiesProductionService: { discover(input) { const request = { ...deferred(), input }; discoveries.push(request); return request.promise; } } },
  '../../lib/supabase': { isSupabaseConfigured: true, supabase: backend },
  '../../services/realtime-chat': {}, '../../services/stories-production': {},
  '../../services/app-freshness': { subscribeToAppForeground(callback) { foreground = callback; return () => { foreground = undefined; }; } },
  './ui': ui,
};
const exported = {};
new Function('exports', 'require', 'setTimeout', 'clearTimeout', ts.transpile(fs.readFileSync('src/components/reconstruction/messages.tsx', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(exported, name => {
  assert.ok(name in dependencies, name); return dependencies[name];
}, callback => { const id = nextTimer++; timers.set(id, callback); return id; }, id => timers.delete(id));
const props = {
  data: { userId: '44', people: [], conversations: [], communities: [], stories: [] }, tab: 'Communities', filter: 'All',
  setFilter(value) { if (props.filter !== value) { props.filter = value; dirty = true; } },
  setTab(value) { props.tab = value; dirty = true; }, setData: noop, openProfile: noop, openConversation: noop, startConversation: noop, openCommunity: noop, createCommunity: noop,
};
const flush = async () => {
  for (let step = 0; step < 20; step++) {
    if (dirty) { dirty = false; cursor = 0; effects = []; tree = exported.ReferenceMessages(props); for (const effect of effects) effect(); }
    await Promise.resolve();
  }
};
const runTimers = async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); await flush(); };
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (!Array.isArray(node) && predicate(node)) return node;
  for (const child of Array.isArray(node) ? node : node.children || []) { const found = find(child, predicate); if (found) return found; }
  return null;
};
const changeSearch = async value => { find(tree, node => node.props.accessibilityLabel === 'Search communities').props.onChangeText(value); await flush(); await runTimers(); };
await flush(); await runTimers();
assert.equal(inboxCalls.length, 1);
assert.equal(discoveries.length, 1);
await changeSearch('week');
await changeSearch('weekend');
assert.equal(discoveries.length, 3);
assert.equal(inboxCalls.length, 1, 'Community search never refetches the whole chat inbox');
discoveries[2].resolve({ items: [{ id: '9', name: 'Weekend group' }], hasMore: true }); await flush();
discoveries[0].resolve({ items: [{ id: '1', name: 'Stale initial community' }], hasMore: false }); await flush();
assert.equal(hooks[1].value[0].id, '9', 'Stale searches cannot replace current results');
find(tree, node => node.props.label === 'Load more').props.onPress(); await flush(); await runTimers();
assert.equal(discoveries.at(-1).input.page, 2);
discoveries.at(-1).resolve({ items: [{ id: '9', name: 'Weekend group' }, { id: '10', name: 'Next community' }], hasMore: false }); await flush();
assert.equal(hooks[1].value.length, 2, 'Page overlap is deduplicated');
assert.equal(inboxCalls.length, 1, 'Paging does not reload unrelated inbox data');
foreground(); await flush(); await runTimers();
assert.equal(inboxCalls.length, 2, 'Foreground refresh still updates message previews');
assert.equal(discoveries.at(-1).input.page, 1, 'Foreground restarts discovery at page one');
assert.equal(inboxCalls[0].signal.aborted, true);
inboxCalls[0].resolve({ data: [{ id: 1, last_message: { content: 'stale' } }], error: null }); await flush();
assert.equal(hooks[8].value['1'], undefined, 'Aborted inbox response is ignored');
inboxCalls[1].resolve({ data: [{ id: 9, last_message: { content: 'fresh' } }], error: null }); await flush();
assert.equal(hooks[8].value['9'].last_message.content, 'fresh');
props.data = { ...props.data, userId: '55' }; dirty = true; await flush();
assert.deepEqual(hooks[8].value, {}, 'Private previews are cleared across account changes');
assert.equal(inboxCalls.length, 3);
console.log('PASS: typing/pagination make zero extra inbox reads; foreground refresh, stale-response guards, abort cleanup, page deduplication and account isolation are preserved. No remote writes.');
