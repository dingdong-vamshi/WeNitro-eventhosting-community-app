import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/reconstruction/messages.tsx','utf8');
const ast=ts.createSourceFile('messages.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='markAllChatsSeen')handler=n.initializer.getText(ast);ts.forEachChild(n,walk);}walk(ast);
let state,errors,calls,marking,failRoom,refetchError,freshUnread;
const run=()=>new Function('ctx',`with(ctx){${ts.transpile('const fn='+handler,{target:ts.ScriptTarget.ES2022})};return fn;}`)({
 markingChats:false,conversations:[{id:'1',unread:2},{id:'2',unread:1}],data:{userId:'119'},isBackendId:s=>/^\d+$/.test(s),
 setMarkingChats:v=>marking=v,setError:e=>errors.push(e),setData:fn=>state=fn(state),
 realtimeChatService:{markConversationRead:async(id,at)=>{calls.push({id,at});if(id===failRoom)throw Error('offline');}},
 supabase:{rpc:async()=>({data:[{id:1,unread_count:freshUnread},{id:2,unread_count:0}],error:refetchError})},
 })();
const reset=()=>{state={userId:'119',conversations:[{id:'1',unread:2},{id:'2',unread:1},{id:'3',unread:7}]};errors=[];calls=[];marking=false;failRoom=0;refetchError=null;freshUnread=0;};
reset();await run();assert.deepEqual(state.conversations.map(r=>r.unread),[0,0,7]);assert.equal(calls[0].at,calls[1].at);assert.equal(marking,false);
reset();freshUnread=1;await run();assert.equal(state.conversations[0].unread,1,'new message after the cutoff remains unread');
reset();failRoom=2;await run();assert.deepEqual(state.conversations.map(r=>r.unread),[0,1,7]);assert.match(errors.at(-1),/Some conversations/);
reset();refetchError=Error('refresh failed');await run();assert.deepEqual(state.conversations.map(r=>r.unread),[2,1,7]);assert.match(errors.at(-1),/refresh failed/);
const profile=fs.readFileSync('src/components/reconstruction/profile.tsx','utf8');
for(const field of ['bio','occupation']){assert.ok(profile.includes(`${field}: details.profile.${field}`));assert.ok(profile.includes(`${field}: person.${field}`));assert.ok(profile.includes(`summary.${field}.trim()`));}
assert.ok(source.includes('Mark stories seen'));assert.ok(source.includes('Mark all chats seen'));
console.log('PASS: chat backend acknowledgements/refetch, partial errors, post-cutoff arrivals, excluded rooms, and shared own/public Bio/Occupation rendering.');
