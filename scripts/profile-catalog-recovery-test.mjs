import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=(path,deps)=>{const exports={};new Function('exports','require',ts.transpile(fs.readFileSync(path,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}))(exports,name=>{assert.ok(name in deps,`Unexpected dependency ${name}`);return deps[name];});return exports;};
const pendingProfile=[],pendingCatalog=[],pendingEdit=[],state=[],refs=[],effects=[];
let cursor=0,refCursor=0,effectCursor=0,dirty=false,tree,currentId='1';
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;dirty=true;}];},
 useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},
 useEffect(fn,deps){const i=effectCursor++,old=effects[i];if(!old||deps.some((v,n)=>old.deps[n]!==v)){old?.cleanup?.();effects[i]={deps,run:fn};}},
};
const component=load('src/components/reconstruction/edit-profile.tsx',{
 react:{__esModule:true,default:React,...React},'react-native':{Platform:{OS:'web'},...Object.fromEntries(['Image','KeyboardAvoidingView','Pressable','ScrollView','Text','View'].map(v=>[v,v]))},
 'expo-image-picker':{},'@react-native-community/datetimepicker':{},'../../lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:`auth-${currentId}`,email:`user${currentId}@example.com`}}}})}}},
 '../../services/profile-production':{profileProductionService:{editProfile:()=>new Promise(resolve=>pendingEdit.push({resolve})),loadProfile:()=>new Promise((resolve,reject)=>pendingProfile.push({resolve,reject})),listAvailableInterests:()=>new Promise((resolve,reject)=>pendingCatalog.push({resolve,reject}))}},
 '../../services/profile-onboarding':{profileOnboardingService:{}},'../../services/reference-delta':{referenceDeltaService:{listProfilePhotos:async()=>[]}},
 '../../utils/onboarding':{ONBOARDING_GENDERS:[]},'../../domain/countries':{COUNTRIES:[],countryLabel:()=>''},
 './ui':{...Object.fromEntries(['Button','ErrorLine','Field','Header','Icon','Page','SearchField','Sheet','Skeleton'].map(v=>[v,v])),usePalette:()=>({}),purple:'#00f'},
 './responsible-upload':{useResponsibleUpload:()=>({})},
}).ReferenceEditProfile;
const render=()=>{cursor=0;refCursor=0;effectCursor=0;dirty=false;tree=component({data:{userId:currentId},setData:()=>{},back:()=>{},onSaved:()=>{}});for(const e of effects)if(e.run){const fn=e.run;e.run=null;e.cleanup=fn();}if(dirty)render();};
const settle=async()=>{await new Promise(r=>setImmediate(r));if(dirty)render();};
const details=(id)=>({profile:{id:Number(id),username:`user${id}`,full_name:`User ${id}`},interests:[{id:99,name:'Archived'}]});
render();pendingProfile[0].resolve(details('1'));await settle();assert.equal(state[0].full_name,'User 1','Hanging optional categories cannot block profile fields');
currentId='2';render();assert.equal(state[0],null,'Account switch clears old editable fields');
currentId='3';render();pendingProfile[2].resolve(details('3'));pendingCatalog[2].resolve([{id:3,name:'Current'}]);await settle();
pendingProfile[1].resolve(details('2'));pendingCatalog[0].resolve([{id:1,name:'Old'}]);pendingCatalog[1].reject(new Error('Old user failure'));await settle();assert.equal(state[0].full_name,'User 3');assert.deepEqual(state[3],[{id:3,name:'Current'}]);
assert.equal(state[5],'','Old catalog error must not reach new account');
const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of node.props?.children?.flat(Infinity)||[]){const found=find(child,predicate);if(found)return found;}return null;};
find(tree,node=>node.type==='Field'&&node.props.accessibilityLabel==='Full Name').props.onChangeText('Updated User 3');render();
find(tree,node=>node.type==='Button'&&node.props.label==='Save Changes').props.onPress();await settle();assert.equal(pendingEdit.length,1);
currentId='4';render();pendingProfile[3].resolve(details('4'));pendingCatalog[3].resolve([]);await settle();pendingEdit[0].resolve({});await settle();
assert.equal(pendingProfile.length,4,'An old save must stop before querying or mutating the newly signed-in account');assert.equal(state[0].full_name,'User 4');
effects.forEach(e=>e.cleanup?.());
let calls=[],rpcError=null,rpcData=[{id:9,name:'Retained archive'},{id:2,name:'New'}];
const service=load('src/services/profile-production.ts',{'../lib/supabase':{isSupabaseConfigured:true,supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'subject'}}}})},rpc:async(name,args)=>{calls.push({name,args});return{data:rpcData,error:rpcError};},from:()=>{throw new Error('Interest mutation must use one transaction');}}},'./category-catalog':{}}).profileProductionService;
assert.deepEqual((await service.setInterests([9,'2',9])).map(i=>i.id),[2,9]);assert.deepEqual(calls,[{name:'set_my_interests',args:{p_category_ids:[9,2]}}]);
rpcError=new Error('Category disabled');await assert.rejects(service.setInterests([4]),/Category disabled/);
await assert.rejects(service.setInterests([0]),/Invalid interest/);await assert.rejects(service.setInterests(Array.from({length:51},(_,i)=>i+1)),/50 interests/);
console.log('PASS: actual component profile loads before optional catalog; switched accounts clear fields and reject old profile/catalog/error responses. Actual interest service uses one atomic RPC, deduplicates IDs, validates bounds, maps results, and propagates rollback errors. No remote writes.');
