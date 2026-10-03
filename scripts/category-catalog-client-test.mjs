import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = (path, dependencies) => {
  const exports = {};
  const js = ts.transpile(fs.readFileSync(path, 'utf8'), {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022});
  new Function('exports', 'require', js)(exports, name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; });
  return exports;
};
const calls = [];
let response = {data: [{id: 1, name: ' Career ', icon: 'book', display_order: 2}, {id: 2, name: '[QA] Test'}, {id: 3, name: 'Contest preparation'}], error: null};
const query = Object.fromEntries(['select','eq','is','order'].map(name => [name, (...args) => {calls.push([name,...args]); return query;}]));
query.then = resolve => Promise.resolve(response).then(resolve);
const catalog = load('src/services/category-catalog.ts', {'../lib/supabase': {isSupabaseConfigured:true, supabase:{from:name=>{assert.equal(name,'tbl_categories');return query;}}}});
assert.deepEqual((await catalog.listActiveCategories()).map(row=>row.name), ['Career','Contest preparation']);
assert.ok(calls.some(call=>JSON.stringify(call) === JSON.stringify(['eq','is_enabled',true])));
assert.ok(calls.some(call=>JSON.stringify(call) === JSON.stringify(['is','archived_at',null])));
assert.deepEqual(calls.filter(call=>call[0]==='order').map(call=>call[1]), ['display_order','name']);
response = {data:null,error:{message:'network offline'}};
await assert.rejects(catalog.listActiveCategories(), /network offline/);

// Exercise hook state transitions with controllable promises: failures, retry,
// stale request replacement, and unmount cannot erase successful cached content.
const states = [], effects = [], pending = [];
let cursor = 0, effectCursor = 0, dirty = false;
const react = {
  useState(initial) {const id=cursor++; if(!(id in states)) states[id]=initial; return [states[id], value=>{states[id]=typeof value==='function'?value(states[id]):value;dirty=true;}];},
  useCallback(fn) {return fn;},
  useEffect(fn,deps) {const id=effectCursor++; const old=effects[id]; if(!old || deps.some((v,i)=>v!==old.deps[i])) {old?.cleanup?.();effects[id]={deps,run:fn};}},
};
const {useActivityCategories} = load('src/hooks/use-activity-categories.ts', {react,'../services/category-catalog':{listActiveCategories:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}});
let result;
const render = () => {cursor=0;effectCursor=0;dirty=false;result=useActivityCategories();for(const effect of effects) if(effect.run){const fn=effect.run;effect.run=null;effect.cleanup=fn();} if(dirty) render();};
const settle = async () => {await new Promise(resolve=>setImmediate(resolve));if(dirty)render();};
render(); assert.equal(result.loading,true); assert.equal(result.error,'');
pending[0].reject(new Error('offline'));await settle();assert.equal(result.loading,false);assert.match(result.error,/offline/);
result.retry();render();assert.equal(result.loading,true);assert.equal(result.error,'');
pending[1].resolve([{name:'Sports'}]);await settle();assert.deepEqual(result.names,['Sports']);assert.equal(result.loading,false);
result.retry();render();pending[2].reject(new Error('refresh failed'));await settle();assert.deepEqual(result.names,['Sports']);assert.match(result.error,/refresh failed/);
result.retry();render();result.retry();render();pending[4].resolve([{name:'Social'}]);await settle();pending[3].resolve([{name:'Stale'}]);await settle();assert.deepEqual(result.names,['Social']);
result.retry();render();effects.forEach(effect=>effect.cleanup?.());pending[5].resolve([{name:'After unmount'}]);await settle();assert.deepEqual(result.names,['Social']);
console.log('PASS: active/unarchived ordered catalog, exact QA prefix filtering, propagated failure; hook initial loading, retry, cached content on refresh failure, superseded request and unmount guards. In-memory behavioral tests; no remote writes.');
