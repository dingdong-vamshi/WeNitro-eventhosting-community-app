import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const file=ts.createSourceFile('App.tsx',fs.readFileSync('App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const nodes=[];const visit=n=>{nodes.push(n);ts.forEachChild(n,visit);};visit(file);
const declaration=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(file)===name);
const handler=declaration('openConversationInfo'),label=declaration('conversationInfoLabel');
const info=nodes.find(n=>ts.isIfStatement(n)&&n.expression.getText(file)==='selected && groupInfoOpen');
const controls=nodes.filter(n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.text==='onPress'&&a.initializer?.expression?.getText(file)==='openConversationInfo'));
assert.equal(controls.length,3,'Avatar, title and info share the real navigation handler');
const jsx=(source,deps)=>{const out={};new Function('exports',...Object.keys(deps),ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(out,...Object.values(deps));return out;};
const flatten=(node,predicate)=>!node||typeof node!=='object'?[]:[...(!Array.isArray(node)&&predicate(node)?[node]:[]),...(Array.isArray(node)?node:node.children||[]).flatMap(child=>flatten(child,predicate))];
for(const selected of [{id:'254',name:'QA group',type:'Groups',memberCount:3,messages:[]},{id:'55',name:'QA Activity',type:'Groups',activityId:'99',messages:[]},{id:'253',name:'QA Peer',type:'People',userId:'120',messages:[]}]){
 const changes=[],profiles=[],activities=[];
 const deps={selected,onOpenProfile:id=>profiles.push(id),onOpenActivity:id=>activities.push(id),setGroupInfo:v=>changes.push(['info',v]),setGroupInfoQuery:v=>changes.push(['query',v]),setGroupInfoOpen:v=>changes.push(['open',v]),supabase:new Proxy({},{get(){throw Error('Header must not wait on backend lookup');}})};
 const output=jsx(`const openConversationInfo=${handler.initializer.getText(file)};const conversationInfoLabel=${label.initializer.getText(file)};exports.open=openConversationInfo;exports.label=conversationInfoLabel;`,deps);
 output.open();
 if(selected.type==='People')assert.deepEqual(profiles,['120']);
 else if(selected.activityId)assert.deepEqual(activities,['99']);
 else{assert.deepEqual(changes,[['info',null],['query',''],['open',true]]);assert.match(output.label,/group information/);assert.doesNotMatch(output.label,/activity/);}
}
const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'Fragment'};
const selected={id:'254',name:'QA group',type:'Groups',memberCount:3,avatar:'https://example.test/photo',messages:[]};
const members=[{user_id:120,role:'admin',profiles:{full_name:'Owner QA',username:'owner'}},{user_id:71,role:'member',profiles:{full_name:'Peer QA',username:'peer'}}];
const profileCalls=[];
const deps={React,selected,groupInfoOpen:true,groupInfoLoading:false,groupInfoError:'',groupInfoQuery:'',groupInfo:{eventId:null,date:'Flexible',location:'Flexible',members},palette:{},styles:{},maxWidth:430,onOpenProfile:id=>profileCalls.push(id),onOpenActivity:()=>{},setGroupInfoOpen:()=>{},setGroupInfoQuery:()=>{},...Object.fromEntries(['SafeAreaView','View','Text','Pressable','Icon','ActivityIndicator','ScrollView','UserAvatar','TextInput','VerifiedBadge','Button'].map(n=>[n,n]))};
const output=jsx(`exports.render=()=>{${info.getText(file)}};`,deps);const tree=output.render();
assert.equal(flatten(tree,n=>n.type==='Text'&&n.children.includes('DATE')).length,0,'Unlinked group has no invented Activity date');
assert.equal(flatten(tree,n=>n.type==='Button'&&n.props.label==='View Activity Page').length,0);
const peer=flatten(tree,n=>n.props.accessibilityLabel==='Open Peer QA profile')[0];assert.ok(peer);peer.props.onPress();assert.deepEqual(profileCalls,['71']);
assert.equal(flatten(tree,n=>n.type==='UserAvatar').length,3,'Group and member photos use shared identity fallback');
const activityTree=jsx(`exports.render=()=>{${info.getText(file)}};`,{...deps,groupInfo:{...deps.groupInfo,eventId:'99'}}).render();
assert.equal(flatten(activityTree,n=>n.type==='Button'&&n.props.label==='View Activity Page').length,1,'Legacy room lookup can still expose real linked Activity');
console.log('PASS actual chat info handlers and render: ordinary groups open immediately, title/avatar/info wired, correct direct/profile and Activity destinations, real member profiles, no fake event metadata.');
