import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
let checks = 0;
const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
const compile = (source,deps={}) => {
 const exports={};
 new Function('exports',...Object.keys(deps),ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(exports,...Object.values(deps));
 return exports;
};
const declaration = (path,name,deps) => {
 const ast=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 const visit=n=>{if((ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(ast)===name)node=n;ts.forEachChild(n,visit)};visit(ast);assert(node,name);
 return compile(`${ts.isFunctionDeclaration(node)?node.getText(ast):'const '+node.getText(ast)+';'}\nexports.run=${name};`,deps).run;
};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const share=compile(fs.readFileSync('src/services/internal-share.ts','utf8'),{require:()=>({Platform:{OS:'web'},Share:{}})});
const invite='https://wenitro-app.vercel.app/#/activity-invite/11111111-1111-4111-8111-111111111111';
const entity={kind:'activity',id:'300',title:'Private owner Activity',inviteUrl:invite};
eq(share.captureShareScope()(),false);
share.setShareIdentity('owner');const current=share.captureShareScope();share.setShareIdentity('owner');eq(current(),true);
share.setShareIdentity(null);share.setShareIdentity('owner');eq(current(),false);
const requests=[];share.subscribeToInternalShareRequests(value=>requests.push(value));
share.setShareIdentity(null);share.requestInternalShare(entity);eq(requests.length,0);
share.setShareIdentity('owner');share.requestInternalShare(entity);eq(requests.length,1);
for(const switched of [false,true]) {
 share.setShareIdentity('owner');const pending=deferred(),opened=[],alerts=[];
 const run=declaration('App.tsx','shareActivity',{activity:{id:'300',title:'Private',visibility:'private'},canHost:true,captureShareScope:share.captureShareScope,createActivityInvite:()=>pending.promise,requestInternalShare:x=>opened.push(x),Alert:{alert:(...x)=>alerts.push(x)}});
 const task=run();if(switched)share.setShareIdentity('other');pending.resolve(invite);await task;
 eq(opened.length,switched?0:1);eq(alerts.length,0);
}
for(const stage of ['resolve-room','private-send','public-send','send-error','delayed-close']) {
 share.setShareIdentity('owner');const pending=deferred(),feedback=[],delivered=[],sent=[],timers=[],closed=[],cache={current:new Map()};
 const privateEntity=stage==='public-send'?{...entity,inviteUrl:undefined}:entity;
 const run=declaration('src/components/ShareToChatModal.tsx','send',{
  entity:privateEntity,selected:['a','b'],sending:false,beginOperation:share.captureShareScope,setSending:()=>{},setFeedback:x=>feedback.push(x),
  allTargets:[{key:'a',roomId:stage==='resolve-room'?undefined:'10',personId:'70',name:'A'},{key:'b',roomId:'11',name:'B'}],
  withTimeout:x=>x,sentInvites:cache,shareEntityUrl:share.shareEntityUrl,
  chatService:{createDirect:()=>pending.promise,sendMessage:async(id)=>{sent.push(id);if(stage==='delayed-close')return{id};return pending.promise;},share:()=>pending.promise},
  onSent:(...x)=>delivered.push(x),setSelected:()=>{},setTimeout:fn=>timers.push(fn),onClose:()=>closed.push(true)
 });
 const task=run();await new Promise(r=>setImmediate(r));
 if(stage==='delayed-close'){await task;eq(delivered.length,1);share.setShareIdentity('other');timers[0]();eq(closed.length,0);}
 else {share.setShareIdentity('other');if(stage==='send-error')pending.reject(Error('Old actor failure'));else pending.resolve(stage==='resolve-room'?'10':stage==='public-send'?[{id:1}]:{id:1});await task;eq(delivered.length,0);eq(feedback,[null]);eq(cache.current.size,0);eq(sent.length,stage==='resolve-room'||stage==='public-send'?0:1);}
}
for(const action of ['copyLink','shareExternally']) {
 share.setShareIdentity('owner');const pending=deferred(),feedback=[],records=[];
 const run=declaration('src/components/ShareToChatModal.tsx',action,{entity,beginOperation:share.captureShareScope,Clipboard:{setStringAsync:()=>pending.promise},shareEntityUrl:share.shareEntityUrl,shareEntityExternally:()=>pending.promise,setFeedback:x=>feedback.push(x),recordActivityShare:x=>records.push(x)});
 const task=run();share.setShareIdentity('other');pending.resolve(true);await task;eq(feedback,[]);eq(records,[]);
}
share.setShareIdentity('owner');const generation={current:0};const begin=declaration('src/components/ShareToChatModal.tsx','beginOperation',{operationGeneration:generation,captureShareScope:share.captureShareScope});const valid=begin();eq(valid(),true);generation.current++;eq(valid(),false);
for(const switched of [false,true]) {
 share.setShareIdentity('owner');const pending=deferred(),opened=[];
 const run=declaration('App.tsx','redeemChatInvitation',{captureShareScope:share.captureShareScope,activityInviteTokenFromUrl:url=>url===invite?'token':null,redeemActivityInviteUrl:()=>pending.promise,openSharedContent:x=>opened.push(x)});
 const task=run('Invitation '+invite);if(switched)share.setShareIdentity('other');pending.resolve('300');await task;eq(opened.length,switched?0:1);
}
const rpcCalls=[],stored=[];
const invites=compile(fs.readFileSync('src/services/activity-invites.ts','utf8'),{require:name=>name.includes('async-storage')?{getItem:()=>stored.push('get'),setItem:()=>stored.push('set'),removeItem:()=>stored.push('remove')}:name==='react-native'?{Platform:{OS:'web'}}:{supabase:{rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:{event_id:300},error:null}}}}});
eq(await invites.redeemActivityInviteUrl(invite),'300');eq(stored,[]);eq(rpcCalls[0].name,'redeem_activity_invite');
const app=fs.readFileSync('App.tsx','utf8');assert.match(app,/authIdentityRef.current = id;\s+setShareIdentity\(id\);\s+setShareEntity\(null\);/);checks++;
assert.match(app,/key=\{`share:\$\{data.userId/);checks++;
assert.match(app,/current.mode !== "authenticated" \|\| current.userId !== data.userId\) return current/);checks++;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual share scope, delayed private invite creation, recipient resolution, private/public send and failure, delayed dismissal, clipboard/external callback, modal invalidation and direct chat redemption race; no anonymous invite persistence.'}));
