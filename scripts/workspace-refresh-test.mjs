import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpile(fs.readFileSync('src/domain/workspace-refresh.ts', 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}))(exports);
const { foregroundWorkspaceSections, mergeWorkspaceRefresh } = exports;
assert.deepEqual(foregroundWorkspaceSections('partnerDashboard'), [], 'Dashboard owns foreground refresh');
assert.deepEqual(foregroundWorkspaceSections('partnerRegistrationForm'), []);
assert.deepEqual(foregroundWorkspaceSections('feed'), ['activities', 'vibes', 'stories']);
assert.deepEqual(foregroundWorkspaceSections('chat'), ['conversations', 'stories', 'people']);
const current = {
  name: 'Actual profile', accountType: 'partner', activities: ['a'], communities: ['c'], people: ['p'],
  vibes: ['v'], stories: ['s'], conversations: ['loaded history'],
  likedIds: ['activity:1', 'vibe:2'], savedIds: ['activity:3'], theme: 'dark',
};
const refreshed = {
  name: 'Updated profile', accountType: 'individual', activities: ['new-a'], communities: [], people: [],
  vibes: ['new-v'], stories: [], conversations: [],
  likedIds: ['activity:4', 'vibe:5'], savedIds: [], theme: 'dark',
};
const activities = mergeWorkspaceRefresh(current, refreshed, ['activities']);
assert.deepEqual(activities.activities, ['new-a']);
assert.deepEqual(activities.likedIds, ['vibe:2', 'activity:4']);
assert.deepEqual(activities.savedIds, []);
assert.equal(activities.conversations, current.conversations);
assert.equal(activities.name, current.name);
assert.equal(activities.accountType, current.accountType);
const vibes = mergeWorkspaceRefresh(current, refreshed, ['vibes']);
assert.deepEqual(vibes.likedIds, ['activity:1', 'vibe:5']);
assert.equal(vibes.savedIds, current.savedIds);
const profile = mergeWorkspaceRefresh(current, refreshed, ['profile']);
assert.equal(profile.name, refreshed.name);
assert.equal(profile.activities, current.activities);
assert.equal(profile.conversations, current.conversations);
assert.deepEqual(profile.likedIds, current.likedIds);
assert.deepEqual(current.activities, ['a'], 'No mutation');

const app = fs.readFileSync('App.tsx', 'utf8');
assert.match(app, /loadRemoteWorkspace\(undefined, \{ sections, viewer: \{ authUserId, appUserId \} \}\)/);
assert.match(app, /generation !== authGenerationRef\.current/);
assert.match(app, /remote\.profile\.id !== appUserId/);
assert.match(app, /screen === "chat" && !selectedConversationId && !legacyMessages && messagesTab === "Communities"/);
assert.match(app, /inboxViewRef\.current\.selectedConversationId/);
assert.doesNotMatch(app, /\[data\.mode, data\.userId, selectedConversationId\]/, 'Selecting a chat does not resubscribe inbox');
console.log('PASS: screen-specific foreground policy, dashboard exclusion, isolated merges, reaction preservation, auth guards and stable inbox subscription wiring.');
