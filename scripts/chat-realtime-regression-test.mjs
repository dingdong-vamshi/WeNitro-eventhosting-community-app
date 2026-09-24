import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/services/realtime-chat.ts', 'utf8');
function ast(source, name) { return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function find(root, predicate) {
  if (predicate(root)) return root;
  return ts.forEachChild(root, child => find(child, predicate));
}
function evaluate(source, sandbox = {}) {
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox;
}
const serviceAst = ast(service, 'realtime-chat.ts');
const hydrator = find(serviceAst, n => ts.isFunctionDeclaration(n) && n.name?.text === 'createRealtimeSenderHydrator');
const hydrationScope = evaluate(`${hydrator.getText(serviceAst)}\nexports.factory=createRealtimeSenderHydrator;`, { exports: {} });
let loads = 0;
const hydrate = hydrationScope.exports.factory(async id => { loads++; return { id, full_name: 'QA Sender', username: 'qa_sender', avatar_url: null }; });
const [first, simultaneous] = await Promise.all([hydrate({sender_id: 2, profiles: null}), hydrate({sender_id: 2, profiles: null})]);
assert.equal(loads, 1, 'concurrent same-sender messages share one lookup');
assert.equal(first.profiles.full_name, 'QA Sender');
assert.equal(simultaneous.profiles.full_name, 'QA Sender');
await hydrate({sender_id: 2, profiles: { full_name: 'Fresh joined profile' }});
assert.equal(loads, 1, 'already-hydrated rows must not refetch');
let attempts = 0;
const retry = hydrationScope.exports.factory(async () => { if (++attempts === 1) throw Error('temporary read failure'); return {full_name:'QA Sender'}; });
assert.equal((await retry({sender_id: 2, profiles:null})).profiles, null, 'profile errors must not suppress message');
assert.equal((await retry({sender_id: 2, profiles:null})).profiles.full_name, 'QA Sender', 'failed profile lookups retry');

const appAst = ast(app, 'App.tsx');
const mapper = find(appAst, n => ts.isVariableDeclaration(n) && n.name.getText(appAst) === 'chatMessageFromRemote');
const callback = find(appAst, n => ts.isPropertyAssignment(n) && n.name.getText(appAst) === 'onMessageChange');
let conversation = { messages: [] };
let reads = 0, pollRefreshes = 0;
const scope = evaluate(`const chatMessageFromRemote=${mapper.initializer.getText(appAst)}; exports.onMessageChange=${callback.initializer.getText(appAst)};`, {
  exports: {}, cancelled: false, viewerId: '1', chatViewerRef: {current:'1'}, selectedConversationId: '209',
  updateConversation: (id, transform) => { assert.equal(id,'209'); conversation=transform(conversation); },
  setPollRevision: transform => { pollRefreshes=transform(pollRefreshes); },
  persistConversationRead: async () => { reads++; },
});
const message = {id:10,sender_id:2,body:'QA poll',created_at:'2026-09-24T10:00:00Z',message_type:'poll',poll_id:77,profiles:{full_name:'QA Member Two'}};
await scope.exports.onMessageChange({eventType:'INSERT',message,old:{}});
assert.equal(conversation.messages[0].sender,'QA Member Two');
assert.equal(conversation.messages[0].senderId,'2');
assert.equal(conversation.messages[0].pollId,77, 'live poll insertion preserves the poll identifier');
assert.equal(reads,1);
await scope.exports.onMessageChange({eventType:'UPDATE',message:{...message,body:'QA updated',edited_at:'2026-09-24T10:01:00Z'},old:{id:10}});
assert.equal(conversation.messages.length,1, 'UPDATE must merge, not duplicate or discard');
assert.equal(conversation.messages[0].text,'QA updated');
assert.equal(pollRefreshes,1, 'message UPDATE from server vote RPC refreshes other viewers totals');
assert.equal(reads,1, 'votes do not repeatedly mark chat read');
await scope.exports.onMessageChange({eventType:'INSERT',message:{...message,id:11,sender_id:1},old:{}});
assert.equal(conversation.messages[1].sender,'You');
scope.chatViewerRef.current='3';
await scope.exports.onMessageChange({eventType:'INSERT',message:{...message,id:12},old:{}});
assert.equal(conversation.messages.length,2, 'previous-account subscription cannot update current account');
scope.chatViewerRef.current='1'; scope.cancelled=true;
await scope.exports.onMessageChange({eventType:'DELETE',message:null,old:{id:10}});
assert.equal(conversation.messages.length,2, 'closed subscription must ignore late events');
scope.cancelled=false;
await scope.exports.onMessageChange({eventType:'DELETE',message:null,old:{id:10}});
assert.equal(conversation.messages.length,1);

assert.ok(app.includes('[selected?.id, selectedPollKey, pollRevision]'), 'poll fetching must depend on poll IDs/revisions, not every ordinary message');
const sql=fs.readFileSync('supabase/migrations/20260922184236_community_chat_contract_recovery.sql','utf8');
assert.match(sql,/update public\.tbl_messages m set edited_at = now\(\) where m\.poll_id = v_poll_id/);
assert.doesNotMatch(callback.initializer.getText(appAst),/supabase\.auth\.getUser|from\("tbl_users"\)/);
const workspace = fs.readFileSync('src/services/wenitro.ts', 'utf8');
assert.match(workspace,/poll_id: message\.poll_id \?\? null/, 'bootstrap message rows retain poll identity');
assert.match(workspace,/pollId: message\.poll_id \?\? undefined/, 'history pages retain poll identity after opening/reloading a chat');
const inboxSource = fs.readFileSync('src/components/reconstruction/messages.tsx', 'utf8');
const inboxAst = ast(inboxSource, 'messages.tsx');
const prefixMatcher = find(inboxAst, n => ts.isFunctionDeclaration(n) && n.name?.text === 'startsWithQuery');
const peopleFilter = find(inboxAst, n => ts.isVariableDeclaration(n) && n.name.getText(inboxAst) === 'searchPeople');
const filtered = evaluate(`${prefixMatcher.getText(inboxAst)}\nexports.people=${peopleFilter.initializer.getText(inboxAst)};`, {
  exports: {}, query: 'Pri', conversations: [], people: [{id:1,fullname:'Atharv',username:'atharv'}, {id:2,fullname:'Priya Nair',username:'qa_two'}],
}).exports.people;
assert.equal(filtered.length, 1, 'stale/group-picker people must filter immediately while remote search is pending');
assert.equal(filtered[0].id, 2);
console.log('PASS: realtime sender hydration/cache/retry; sender and poll mapping; UPDATE merge/vote refresh; session/cleanup guards; no per-message identity reads.');
