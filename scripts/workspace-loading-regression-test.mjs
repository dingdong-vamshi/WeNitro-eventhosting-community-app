import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Offline service integration: preserve mapping/auth boundaries while proving
// inbox work starts before profile completion and media is signed in batches.
const calls = [];
let currentSession = { user: { id: 'auth-7', email: 'qa@example.invalid' }, access_token: 'session-seven' };
let resolveProfile;
const profileReady = new Promise(resolve => { resolveProfile = resolve; });
const activities = [1, 2, 3].map(id => ({
  id: String(id), ownerId: '7', title: `Activity ${id}`, coverUrl: id < 3 ? 'shared.jpg' : 'other.jpg',
  owner: null, viewerState: { participation: null, liked: id === 1, saved: id === 2 },
}));
const message = { id: 8, sender_id: 9, content: 'Latest message', media_url: 'latest.jpg', created_at: '2026-09-24T10:00:00Z' };
const rooms = [
  { id: 1, event_id: 1, room_type: 'activity', name: 'WeNitro Chat', unread_count: 19, chat_messages: [message], chat_members: [] },
  { id: 2, event_id: 2, room_type: 'activity', name: 'WeNitro Chat', chat_messages: [], chat_members: [] },
  { id: 3, event_id: 99, room_type: 'activity', name: 'WeNitro Chat', chat_messages: [], chat_members: [] },
  { id: 4, room_type: 'group', name: 'Group', image_url: 'group/one.jpg', chat_messages: [], chat_members: [] },
  { id: 5, room_type: 'group', name: 'Legacy group', image_url: 'legacy/two.jpg', chat_messages: [], chat_members: [] },
];
const backend = {
  auth: {
    getSession: async () => ({ data: { session: currentSession }, error: null }),
    getUser: async () => { throw new Error('Workspace must reuse the authenticated profile service identity'); },
  },
  rpc: async function(name, args) {
    assert.equal(this, backend, 'RPC receiver must remain bound');
    calls.push({ name, args });
    if (name === 'list_chat_inbox') return { data: rooms, error: null };
    if (name === 'list_discoverable_people') return { data: [], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  },
  from(table) {
    const query = {
      select: () => query,
      or: async filter => { calls.push({ name: table, filter }); return { data: null, count: 4, error: null }; },
      in: async (column, values) => {
        calls.push({ name: table, column, values });
        if (table === 'tbl_event_participants') return { data: [{ event_id: 1, user_id: 7, status: 'going' }], error: null };
        if (table === 'tbl_events') return { data: [{ id: 99, title: 'Older activity', media: { cover_url: 'old.jpg' } }], error: null };
        throw new Error(`Unexpected table ${table}`);
      },
    };
    return query;
  },
  storage: { from: bucket => ({
    getPublicUrl: path => ({ data: { publicUrl: `https://media.invalid/${bucket}/${path}` } }),
    createSignedUrl: async () => { throw new Error('Workspace signing must be batched'); },
    createSignedUrls: async paths => {
      calls.push({ name: 'sign', bucket, paths });
      return { error: null, data: paths.map(path => ({
        path,
        ...(bucket === 'community' && path.startsWith('legacy/')
          ? { error: 'not found', signedUrl: '' }
          : { signedUrl: `https://media.invalid/${bucket}/${path}` }),
      })) };
    },
  }) },
};
let controlWorkspaceDeadline = false;
let expireWorkspace;
const modules = {
  './request-deadline': { withRequestDeadline: (task, _timeout, message) => {
    const work = task(new AbortController().signal);
    return controlWorkspaceDeadline && message.startsWith('Your Feed')
      ? Promise.race([work, new Promise((_, reject) => { expireWorkspace = () => reject(new Error(message)); })]) : work;
  } },
  '../lib/supabase': { isSupabaseConfigured: true, supabase: backend },
  './activities-production': { activitiesProductionService: { discover: async () => { calls.push({ name: 'activities' }); return { items: activities }; } } },
  './communities-production': { communitiesProductionService: { discover: async () => { calls.push({ name: 'communities' }); return { items: [] }; } } },
  './profile-production': { profileProductionService: { loadProfile: () => { calls.push({ name: 'profile' }); return profileReady; } } },
  './partner-account': { partnerAccountService: { get: async () => { calls.push({ name: 'partner' }); return { profile: null, payout_account: null, eligible: true, can_host_paid: false }; } } },
  './vibes-production': { vibesProductionService: { listReels: async () => { calls.push({ name: 'vibes' }); return { reels: [] }; } } },
  './stories-production': { storiesProductionService: { listActive: async () => { calls.push({ name: 'stories' }); return []; } } },
  './registration-questions': {},
  './realtime-chat': { realtimeChatService: {} },
};
const exports = {};
new Function('exports', 'require', ts.transpile(fs.readFileSync('src/services/wenitro.ts', 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}))(exports, name => {
  assert.ok(name in modules, `Unexpected import ${name}`);
  return modules[name];
});

const loading = exports.loadRemoteWorkspace();
const concurrentLoading = exports.loadRemoteWorkspace();
await new Promise(resolve => setImmediate(resolve));
assert.ok(calls.some(call => call.name === 'list_chat_inbox'), 'Inbox must start before profile completes');
assert.ok(calls.some(call => call.name === 'activities'), 'Activities must start before profile completes');
assert.ok(!calls.some(call => call.name === 'tbl_friends'), 'Own-user dependent reads wait for the profile identity');
resolveProfile({ profile: { id: '7', full_name: 'QA User' }, interests: [], badges: [] });
const result = await loading;
assert.equal(await concurrentLoading, result, 'Concurrent callers receive the same completed workspace');
assert.equal(calls.filter(call => call.name === 'activities').length, 1, 'Concurrent auth/UI loads share all backend work');
assert.equal(result.profile.id, '7');
assert.equal(result.profile.account_type, 'individual');
assert.equal(result.friendCount, 4);
assert.deepEqual(result.likedIds, ['1'], 'Hydration receives actual activity reactions');
assert.deepEqual(result.savedIds, ['2']);
assert.equal(result.activities[0].participants[0].count, 1);
assert.equal(result.activities[0].cover_url, result.activities[1].cover_url);
assert.equal(result.conversations[0].name, 'Activity 1');
assert.equal(result.conversations[0].unread_count, 19, 'Unread count remains the server total, not the preview length');
assert.equal(result.conversations[0].last_message.body, 'Latest message');
assert.equal(result.conversations[0].last_message.media_url, 'https://media.invalid/messages/latest.jpg');
assert.equal(result.conversations[0].avatar_url, result.activities[0].cover_url);
assert.equal(result.conversations[2].name, 'Older activity');
assert.equal(result.conversations[3].avatar_url, 'https://media.invalid/community/group/one.jpg');
assert.equal(result.conversations[4].avatar_url, 'https://media.invalid/communities/legacy/two.jpg');
assert.deepEqual(calls.find(call => call.name === 'tbl_events').values, [99], 'Reuse discovered activity metadata');
assert.deepEqual(calls.find(call => call.name === 'list_chat_inbox').args, { p_message_limit: 1 });
assert.equal(calls.filter(call => call.name === 'list_chat_inbox').length, 1);
assert.equal(calls.find(call => call.name === 'tbl_friends').filter, 'user_id.eq.7,friend_id.eq.7');
assert.deepEqual(calls.filter(call => call.name === 'sign' && call.bucket === 'activity-media').map(call => call.paths), [
  ['shared.jpg', 'other.jpg'], ['old.jpg'],
]);
console.log('PASS: concurrent workspace reads, one-message inbox, full unread total, participant counts, reused titles/covers, deduplicated cover batches and legacy avatar fallback.');

// No settled cache: explicit refreshes must reflect writes immediately. A
// profile already read for this same authentication setup can be reused.
const profileCalls = () => calls.filter(call => call.name === 'profile').length;
const beforeProfileCalls = profileCalls();
await exports.loadRemoteWorkspace({ authUserId: 'auth-7', details: { profile: { id: '7', full_name: 'Already loaded' }, interests: [], badges: [] } });
assert.equal(profileCalls(), beforeProfileCalls, 'Reuse only the explicitly supplied same-identity profile');
assert.equal(calls.filter(call => call.name === 'activities').length, 2, 'A completed result is not cached');
await exports.loadRemoteWorkspace({ authUserId: 'different-user', details: { profile: { id: '999' }, interests: [], badges: [] } });
assert.equal(profileCalls(), beforeProfileCalls + 1, 'Ignore a supplied profile from another identity');

let releaseOldProfile;
modules['./profile-production'].profileProductionService.loadProfile = () => new Promise(resolve => { releaseOldProfile = resolve; });
const oldLoad = exports.loadRemoteWorkspace();
await new Promise(resolve => setImmediate(resolve));
currentSession = null;
assert.equal(await exports.loadRemoteWorkspace(), null);
releaseOldProfile({ profile: { id: '7' }, interests: [], badges: [] });
assert.equal(await oldLoad, null, 'Discard a request that finishes after sign-out');

currentSession = { user: { id: 'auth-8', email: 'second@example.invalid' }, access_token: 'session-eight' };
let releaseNewProfile;
modules['./profile-production'].profileProductionService.loadProfile = () => new Promise(resolve => { releaseNewProfile = resolve; });
const newLoad = exports.loadRemoteWorkspace();
await new Promise(resolve => setImmediate(resolve));
releaseNewProfile({ profile: { id: '8' }, interests: [], badges: [] });
assert.equal((await newLoad).profile.id, '8', 'A new identity starts its own request');

modules['./profile-production'].profileProductionService.loadProfile = async () => { throw new Error('Temporary profile error'); };
await assert.rejects(exports.loadRemoteWorkspace(), /Temporary profile error/);
modules['./profile-production'].profileProductionService.loadProfile = async () => ({ profile: { id: '8' }, interests: [], badges: [] });
assert.equal((await exports.loadRemoteWorkspace()).profile.id, '8', 'Rejected requests do not poison retries');
console.log('PASS: session-scoped in-flight deduplication, no settled cache, same-identity profile reuse, sign-out discard, new-account isolation and retry.');

const viewer = { authUserId: 'auth-8', appUserId: '8' };
let beforeScoped = calls.length;
await exports.loadRemoteWorkspace(undefined, { sections: ['activities', 'vibes', 'stories'], viewer });
assert.deepEqual(calls.slice(beforeScoped).filter(call => call.name !== 'sign').map(call => call.name).sort(), ['activities', 'stories', 'tbl_event_participants', 'vibes']);
beforeScoped = calls.length;
await exports.loadRemoteWorkspace(undefined, { sections: ['communities'], viewer });
assert.deepEqual(calls.slice(beforeScoped).map(call => call.name), ['communities'], 'Community foreground needs no profile, inbox, Partner, activity, people, story or Vibe queries');
beforeScoped = calls.length;
await exports.loadRemoteWorkspace(undefined, { sections: ['conversations'], viewer });
assert.ok(calls.slice(beforeScoped).some(call => call.name === 'list_chat_inbox'));
assert.ok(!calls.slice(beforeScoped).some(call => ['activities', 'communities', 'partner', 'vibes', 'stories', 'list_discoverable_people', 'tbl_friends'].includes(call.name)));
beforeScoped = calls.length;
await exports.loadRemoteWorkspace(undefined, { sections: ['profile'], viewer });
assert.deepEqual(calls.slice(beforeScoped).map(call => call.name).sort(), ['partner', 'tbl_friends'], 'Profile foreground avoids other discovery work');

let releaseScopedProfile;
modules['./profile-production'].profileProductionService.loadProfile = () => new Promise(resolve => { releaseScopedProfile = resolve; });
const fullWhileScoped = exports.loadRemoteWorkspace();
await new Promise(resolve => setImmediate(resolve));
const partialWhileFull = await exports.loadRemoteWorkspace(undefined, { sections: ['communities'], viewer });
assert.deepEqual(partialWhileFull.activities, [], 'Partial request is independent of a concurrent full workspace load');
releaseScopedProfile({ profile: { id: '8' }, interests: [], badges: [] });
assert.equal((await fullWhileScoped).activities.length, 3);

modules['./profile-production'].profileProductionService.loadProfile = async () => ({ profile: { id: '8' }, interests: [], badges: [] });
const mismatchedViewer = await exports.loadRemoteWorkspace(undefined, { sections: ['communities'], viewer: { authUserId: 'auth-7', appUserId: '7' } });
assert.equal(mismatchedViewer.profile.id, '8', 'A stale viewer hint cannot map results to the previous account');
console.log('PASS: foreground scoped service reads, no unnecessary profile/Partner fetch, full/partial request isolation and viewer identity validation.');

let releaseTimedOutProfile;
modules['./profile-production'].profileProductionService.loadProfile = () => new Promise(resolve => { releaseTimedOutProfile = resolve; });
controlWorkspaceDeadline = true;
const stalledLoad = exports.loadRemoteWorkspace();
await new Promise(resolve => setImmediate(resolve));
expireWorkspace();
await assert.rejects(stalledLoad, /Feed took too long/);
controlWorkspaceDeadline = false;
modules['./profile-production'].profileProductionService.loadProfile = async () => ({ profile: { id: '8' }, interests: [], badges: [] });
assert.equal((await exports.loadRemoteWorkspace()).profile.id, '8', 'Timeout clears the single-flight entry so retry starts real work');
releaseTimedOutProfile({ profile: { id: '8' }, interests: [], badges: [] });
await new Promise(resolve => setImmediate(resolve));
console.log('PASS: timed-out workspace entries are evicted and an explicit retry is not trapped behind the abandoned promise.');
