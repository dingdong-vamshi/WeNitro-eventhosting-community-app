import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the real component's effects with an in-memory hook scheduler. This
// verifies request counts/races without browser sessions or production writes.
const hooks = [], timers = new Map(), inboxCalls = [], discoveries = [], seenRequests = [];
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
  'react-native': new Proxy({ Alert: { alert() {} } }, { get: (target, key) => target[key] || key }),
  'expo-image-picker': {}, '../verified-badge': { VerifiedBadge: noop }, '../user-avatar': { UserAvatar: noop },
  'expo-video': { VideoView: noop, useVideoPlayer: noop },
  '../../services/communities-production': { communitiesProductionService: { discover(input) { const request = { ...deferred(), input }; discoveries.push(request); return request.promise; } } },
  '../../lib/supabase': { isSupabaseConfigured: true, supabase: backend },
  '../../services/realtime-chat': {}, '../../services/stories-production': { storiesProductionService: { markViewed(id) { const request = { ...deferred(), id }; seenRequests.push(request); return request.promise; } } },
  '../../services/app-freshness': { subscribeToAppForeground(callback) { foreground = callback; return () => { foreground = undefined; }; } },
  './ui': ui,
  './responsible-upload': { useResponsibleUpload: () => ({ confirmUpload: async () => false, uploadNotice: null }) },
};
const exported = {};
new Function('exports', 'require', 'setTimeout', 'clearTimeout', ts.transpile(fs.readFileSync('src/components/reconstruction/messages.tsx', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(exported, name => {
  assert.ok(name in dependencies, name); return dependencies[name];
}, callback => { const id = nextTimer++; timers.set(id, callback); return id; }, id => timers.delete(id));
const props = {
  data: { userId: '44', people: [], conversations: [], communities: [], stories: [] }, tab: 'Communities', filter: 'All',
  setFilter(value) { if (props.filter !== value) { props.filter = value; dirty = true; } },
  setTab(value) { props.tab = value; dirty = true; }, setData(update) { props.data = typeof update === 'function' ? update(props.data) : update; dirty = true; }, openProfile: noop, openConversation: noop, startConversation: noop, openCommunity: noop, createCommunity: noop,
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
props.data = { ...props.data, stories: [
  { id: '1', authorId: '55', name: 'Your Story', mine: true, viewed: true, mediaType: 'video', image: 'qa.mp4', createdAt: '2026-09-30T10:00:00Z' },
  { id: '2', authorId: '55', name: 'Your Story', mine: true, viewed: true, mediaType: 'image', image: 'qa.png', createdAt: '2026-09-30T11:00:00Z' },
] }; dirty = true; await flush();
const grouped = find(tree, node => node.props.accessibilityLabel === 'Open Your Story stories (2)');
assert.ok(grouped, 'Stories are grouped by author');
await grouped.props.onPress(); await flush();
assert.ok(find(tree, node => node.type?.name === 'StoryVideoPreview'), 'Video story uses the video player');
await find(tree, node => node.props.label === 'Next Story').props.onPress(); await flush();
assert.ok(find(tree, node => node.props.source?.uri === 'qa.png'), 'Next selects the second story');
assert.ok(find(tree, node => node.props.label === 'Delete my story'), 'Owner has a delete control');
props.data = { ...props.data, userId: '56', stories: [] }; dirty = true; await flush();
assert.equal(find(tree, node => node.props.label === 'Delete my story'), null, 'Story preview is cleared across account changes');
await find(tree, node => node.props.accessibilityLabel === 'Add story').props.onPress(); await flush();
assert.ok(find(tree, node => node.props.title === 'Upload Responsibly'), 'Story upload shows responsibility warning before the gallery');
// Exercise the actual reachable Chats component, not the legacy All-count source.
const chatRow = (id, name, type, roomType, unread = 0) => ({ id, name, type, roomType, unread, avatar: 'https://example.com/avatar.png', userId: type === 'People' ? '70' : undefined, messages: [] });
props.data = { ...props.data, conversations: [
  chatRow('1', 'Arjun', 'People', 'personal'),
  chatRow('2', 'Alpha group', 'Groups', 'group', 2),
  chatRow('3', 'Activity room', 'Groups', 'activity'),
  chatRow('4', 'Community excluded', 'Groups', 'community'),
  chatRow('5', 'Known community excluded', 'Groups', 'group'),
  chatRow('2', 'Alpha group', 'Groups', 'group', 2),
], communities: [{ id: '5' }] };
props.tab = 'Chats'; dirty = true; await flush();
const hasChat = name => !!find(tree, node => node.type === 'Text' && node.children.includes(name));
assert.ok(find(tree, node => node.props.accessibilityLabel === 'All chats (3)'));
assert.ok(find(tree, node => node.props.accessibilityLabel === 'People chats (1)'));
assert.ok(find(tree, node => node.props.accessibilityLabel === 'Groups chats (2)'));
assert.ok(hasChat('Arjun') && hasChat('Alpha group') && hasChat('Activity room'), 'All includes direct, group and Activity chats');
assert.ok(!hasChat('Community excluded') && !hasChat('Known community excluded'), 'Community rooms stay in Communities');
find(tree, node => node.props.accessibilityLabel === 'People chats (1)').props.onPress(); await flush();
assert.ok(hasChat('Arjun') && !hasChat('Alpha group'), 'People filter changes actual rows');
find(tree, node => node.props.accessibilityLabel === 'Groups chats (2)').props.onPress(); await flush();
assert.ok(!hasChat('Arjun') && hasChat('Alpha group') && hasChat('Activity room'), 'Groups filter changes actual rows');
find(tree, node => node.props.accessibilityLabel === 'Search chats or users').props.onChangeText('aLpH'); await flush();
assert.ok(find(tree, node => node.props.accessibilityLabel === 'All chats (1)'));
assert.ok(find(tree, node => node.props.accessibilityLabel === 'People chats (0)'));
assert.ok(find(tree, node => node.props.accessibilityLabel === 'Groups chats (1)'));
assert.ok(hasChat('Alpha group') && !hasChat('Activity room'), 'Mixed-case search and displayed counts share the same matching set');
props.tab = 'Groups'; dirty = true; await flush(); props.filter = 'Unread'; dirty = true; await flush();
assert.ok(hasChat('Alpha group') && !hasChat('Activity room'), 'Existing Activities unread filter remains intact');
console.log('PASS: actual Chats All=People+Groups filters/counts, duplicate/community exclusions, case-insensitive search and Activities unread; typing/pagination request bounds, stale responses, foreground refresh, account isolation and Story behavior. No remote writes.');

// A mark-all request may race another incoming story or an account change.
props.tab = 'Chats'; props.data = { ...props.data, stories: [{ id: '81', authorId: '70', name: 'Alpha', viewed: false }, { id: '82', authorId: '71', name: 'Beta', viewed: false }] }; dirty = true; await flush();
const markAll = () => find(tree, node => node.type === 'Pressable' && find(node, child => child.type === 'Text' && child.children.includes('Mark all seen')));
markAll().props.onPress(); await flush();
assert.deepEqual(seenRequests.map(request => request.id), ['81', '82']);
props.data = { ...props.data, stories: [...props.data.stories, { id: '83', authorId: '71', name: 'New arrival', viewed: false }] }; dirty = true; await flush();
seenRequests[0].resolve(); seenRequests[1].reject(new Error('Offline')); await flush();
assert.deepEqual(props.data.stories.map(story => story.viewed), [true, false, false], 'Only successfully saved IDs are seen; failed and newly arrived Stories stay unseen');
markAll().props.onPress(); await flush();
props.data = { ...props.data, userId: '999', stories: [{ id: '82', authorId: '71', name: 'Other viewer', viewed: false }] }; dirty = true; await flush();
seenRequests[2].resolve(); seenRequests[3].resolve(); await flush();
assert.equal(props.data.stories[0].viewed, false, 'Old account mark-all cannot update new account state');
console.log('PASS actual Mark all seen: persisted successes only, failure retry, incoming-story race and account isolation.');
