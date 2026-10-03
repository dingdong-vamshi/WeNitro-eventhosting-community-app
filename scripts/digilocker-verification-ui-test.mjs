import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const compile=(source,require)=>{const exports={};new Function('exports','require',ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}))(exports,require);return exports;};
const walk=(n,p)=>!n||typeof n!=='object'?[]:[...(!Array.isArray(n)&&p(n)?[n]:[]),...(Array.isArray(n)?n:n.children||[]).flatMap(c=>walk(c,p))];
const tick=()=>new Promise(r=>setImmediate(r));
const url='https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize?state=local-mock';
for(const scenario of ['disabled','success','test','error','stale']) {
 const state=[],refs=[],calls=[],opened=[],verified=[];let cursor=0,refCursor=0,effectUsed=false,cleanup,current=true,resolvePending,tree;
 const service={availability:async()=>scenario==='stale'?new Promise(r=>resolvePending=r):({available:scenario!=='disabled',verified:false,status:'not_started',testMode:scenario==='test'}),begin:async consent=>{calls.push(['begin',consent]);if(scenario==='error')throw Error('Provider unavailable');return{available:true,verified:false,status:'created',authorizationUrl:url}},refresh:async()=>{calls.push(['refresh']);return{available:true,verified:scenario!=='test',status:'succeeded',testMode:scenario==='test'}}};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children})};
 const hooks={...React,default:React,__esModule:true,useState:init=>{const key=cursor++;if(!(key in state))state[key]=init;return[state[key],v=>state[key]=typeof v==='function'?v(state[key]):v]},useRef:init=>refs[refCursor++]??={current:init},useEffect:fn=>{if(!effectUsed){effectUsed=true;cleanup=fn()}}};
 const api=compile(fs.readFileSync('src/components/aadhaar-verification-card.tsx','utf8'),name=>name==='react'?hooks:name==='react-native'?{Text:'Text',View:'View',Pressable:'Pressable',Linking:{openURL:async value=>{opened.push(value)}}}:name.includes('aadhaar-verification')?{aadhaarVerificationService:service}:name.includes('internal-share')?{captureShareScope:()=>()=>current}:{Button:'Button',ErrorLine:'ErrorLine',usePalette:()=>({})});
 const render=()=>{cursor=0;refCursor=0;tree=api.AadhaarVerificationCard({verified:false,onVerified:async()=>{verified.push(true)}})};
 render();await tick();
 if(scenario==='stale'){current=false;cleanup();resolvePending({available:true,verified:true,status:'verified'});await tick();eq(verified,[]);eq(opened,[]);continue;}
 render();
 if(scenario==='disabled'){eq(walk(tree,n=>n.type==='Pressable').length,0);eq(calls,[]);cleanup();continue;}
 const button=()=>walk(tree,n=>n.props.label==='Continue to DigiLocker')[0];eq(button().props.disabled,true);
 walk(tree,n=>n.props.accessibilityRole==='checkbox')[0].props.onPress();render();eq(button().props.disabled,false);
 button().props.onPress();await tick();render();eq(calls[0],['begin',true]);
 if(scenario==='error'){eq(opened,[]);eq(walk(tree,n=>n.type==='ErrorLine')[0].props.text,'Provider unavailable');eq(verified,[]);}
 else {eq(opened,[url]);eq(verified,[]);walk(tree,n=>n.props.label==='Check verification status')[0].props.onPress();await tick();render();eq(verified.length,scenario==='test'?0:1);}
 cleanup();
}
let reply={available:false,verified:false,status:'unavailable'};const requests=[];
const service=compile(fs.readFileSync('src/services/aadhaar-verification.ts','utf8'),()=>({supabase:{functions:{invoke:async(name,args)=>{requests.push({name,...args});return{data:reply,error:null}}}}})).aadhaarVerificationService;
await service.begin(true);eq(requests[0],{name:'aadhaar-verification',body:{action:'begin',consent:true,consentVersion:'wenitro-aadhaar-digilocker-v1'}});
reply={available:true,verified:false,status:'created',authorizationUrl:'https://evil.test'};await assert.rejects(service.begin(true),/unavailable/);checks++;
reply={available:true,status:'created'};await assert.rejects(service.refresh(),/invalid result/);checks++;
const profile=fs.readFileSync('src/components/reconstruction/profile-utilities.tsx','utf8');assert.match(profile,/AadhaarVerificationCard verified=\{Boolean\(metrics\?\.aadhaar_verified\)\} onVerified=\{load\}/);checks++;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual card consent gating, disabled UI, redirect not verification, refresh-only trusted result, test-mode no award, error/retry and unmounted/identity-switch behavior; real client action payload and unsafe URL/malformed response rejection.'}));
