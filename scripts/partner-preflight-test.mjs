import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/components/partner-account-screen.tsx','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({accepted=false,status=null,receiptError=false}={}) {
 const values=[],refs=[],effects=[];let cursor=0,refCursor=0,effectCursor=0,pending=[],tree,submitted=0;
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment',useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){const i=effectCursor++;if(!effects[i]||deps.some((d,n)=>d!==effects[i][n])){effects[i]=deps;pending.push(fn);}}};
 const value={eligible:true,can_host_paid:status==='APPROVED',profile:status?{user_id:1,business_name:'Existing Partner',status,activity_types:[]}:null,payout_account:null};
 const service={get:async()=>value,termsAccepted:async()=>{if(receiptError)throw Error('Terms receipt unavailable');return accepted;},submit:async()=>{submitted++;return value;}};
 const exports={};new Function('exports','require',ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(exports,name=>{
 if(name==='react')return react;
 if(name==='react-native')return Object.fromEntries(['ActivityIndicator','Modal','Pressable','ScrollView','Text','TextInput','View'].map(x=>[x,x]).concat([['Linking',{openURL:async()=>{}}]]));
 if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:0,bottom:0})};
 if(name.includes('reference-screens'))return{WENITRO_LEGAL_URLS:{terms:'https://wenitro.com/terms'}};
 if(name.includes('partner-account'))return{partnerAccountService:service,validatePartnerAccount:()=>null};
 if(name.includes('production-theme'))return{createTheme:()=>({colors:{},typography:{}})};
 throw Error(name);
 });
 const render=()=>{cursor=0;refCursor=0;effectCursor=0;tree=exports.PartnerAccountScreen({onBack(){},onSaved(){}});const run=pending;pending=[];run.forEach(f=>f());return tree;};
 function nodes(node=tree){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n));if(node.type==='Modal'&&!node.props.visible)return[];return[node,...nodes(node.props?.children)];}
 const find=label=>nodes().find(n=>n.props.accessibilityLabel===label);
 return{render,find,nodes,get submitted(){return submitted;}};
}
const h=harness();h.render();assert(!h.find('Business name *'));await flush();h.render();assert(h.nodes().some(x=>x.type==='Modal'));assert(!h.find('Business name *'),'New application fields must not render before agreement');assert(h.find('Agree and continue to application').props.disabled);h.find('Not now').props.onPress();h.render();assert(!h.find('Business name *'),'Dismissing popup cannot bypass gate');h.find('Review Terms & Conditions').props.onPress();h.render();h.find('I agree to the Partner Terms and Conditions').props.onPress();h.render();assert.equal(h.find('Agree and continue to application').props.disabled,false);h.find('Agree and continue to application').props.onPress();h.render();assert(h.find('Business name *'));assert.equal(h.submitted,0,'Agreeing opens form without submitting or storing payout details');
const existing=harness({accepted:true,status:'APPROVED'});existing.render();await flush();existing.render();assert(existing.find('Business name *'));assert(!existing.nodes().some(x=>x.type==='Modal'),'Current accepted receipt prevents forced repeat agreement');
const failed=harness({receiptError:true});failed.render();await flush();failed.render();assert(!failed.find('Business name *'));assert(failed.find('Retry'),'Receipt failure fails closed with retry');
const suspended=harness({status:'SUSPENDED'});suspended.render();await flush();suspended.render();assert(!suspended.find('Business name *'));assert(!suspended.nodes().some(x=>x.type==='Modal'));
console.log('PASS: actual Partner screen requires unchecked Terms popup before form fields, cancellation cannot bypass, consent only opens form, persisted current receipt skips repeat agreement, receipt failure retries safely, and suspended accounts stay blocked.');

const {createClient}=await import('@supabase/supabase-js');let receipt={policy_version:'2026-10-01',accepted_at:new Date().toISOString()};let status=200;const requests=[];
const client=createClient('https://partner-test.invalid','offline-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{requests.push({url:String(url),method:init.method});return new Response(JSON.stringify(receipt),{status,headers:{'Content-Type':'application/json'}});}}});
const api={};new Function('exports','require',ts.transpile(fs.readFileSync('src/services/partner-account.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(api,()=>({supabase:client}));
assert.equal(await api.partnerAccountService.termsAccepted(),true);assert.equal(requests.at(-1).method,'GET');assert.match(requests.at(-1).url,/tbl_partner_terms_acceptances\?select=policy_version%2Caccepted_at&limit=1/);receipt={policy_version:'old-version',accepted_at:new Date().toISOString()};assert.equal(await api.partnerAccountService.termsAccepted(),false);receipt=null;assert.equal(await api.partnerAccountService.termsAccepted(),false);receipt={policy_version:'2026-10-01',accepted_at:null};assert.equal(await api.partnerAccountService.termsAccepted(),false);receipt={message:'Unavailable',code:'42501'};status=403;await assert.rejects(api.partnerAccountService.termsAccepted());
console.log('PASS: actual Supabase SDK reads only the own RLS-protected current-version receipt; absent/old/unrecorded receipts require agreement and API failures fail closed.');
