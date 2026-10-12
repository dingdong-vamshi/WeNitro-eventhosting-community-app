import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/services/activities-production.ts','utf8');
const ast=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='getDetails')method=node;ts.forEachChild(node,visit);}visit(ast);
assert.ok(method);
const compiled=ts.transpile('const service={'+method.getText(ast)+'};exports.getDetails=service.getDetails;', {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
let state='published',calls=[];const out={};
new Function('exports','requireBackend','parseId','getActivity','listComments','getViewerStates',compiled)(out,()=>{},Number,async()=>{if(state==='missing')throw Error('This Activity is no longer available.');return{id:'1',status:state};},async()=>{calls.push('comments');return[];},async()=>{calls.push('states');return{'1':{}};});
for(const s of ['missing','cancelled']){state=s;calls=[];await assert.rejects(()=>out.getDetails('1'),/no longer available/);assert.deepEqual(calls,[]);}
for(const s of ['published','completed']){state=s;calls=[];assert.equal((await out.getDetails('1')).activity.status,s);assert.deepEqual(calls,['comments','states']);}
console.log('PASS: actual detail service rejects deleted/cancelled Activities before dependent RPCs, preserves published and completed detail history.');
