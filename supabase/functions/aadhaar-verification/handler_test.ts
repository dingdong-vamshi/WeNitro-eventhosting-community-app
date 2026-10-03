import assert from 'node:assert/strict';
import {createAadhaarHandler} from './handler.ts';
import {CONSENT_VERSION,digilockerConfiguration,parseSessionStatus,hasIssuedAadhaar,safeAuthorizationUrl} from '../_shared/digilocker.ts';
const providerId='11111111-1111-4111-8111-111111111111',localId='22222222-2222-4222-8222-222222222222',transactionId='33333333-3333-4333-8333-333333333333';
const authorizationUrl='https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize?state=mock-only';
const settings:Record<string,string>={AADHAAR_DIGILOCKER_ENABLED:'true',SANDBOX_ENVIRONMENT:'production',AADHAAR_DIGILOCKER_PRODUCTION_APPROVED:'true',SANDBOX_API_KEY:'mock-key',SANDBOX_API_SECRET:'mock-secret',AADHAAR_DIGILOCKER_REDIRECT_URL:'https://wenitro-app.vercel.app/#/verification'};
function fixture(options:{env?:Record<string,string>;allowed?:boolean;session?:Record<string,unknown>|null;providerStatus?:string;consented?:boolean;issuer?:string;wrongSession?:boolean;providerError?:boolean;ledgerError?:boolean}={}) {
 const calls:{url:string;method:string;body:unknown;headers:Headers}[]=[],writes:Record<string,unknown>[]=[],sync:string[]=[];
 let session=options.session===undefined?{id:localId,environment:options.env?.SANDBOX_ENVIRONMENT??'production',provider_session_id:providerId,status:'created',expires_at:new Date(Date.now()+3600000).toISOString(),verified_at:null}:options.session;
 const handler=createAadhaarHandler({env:name=>(options.env??settings)[name],authenticate:async()=>({authId:'owner-from-validated-auth',allowed:options.allowed!==false,syncVerified:async()=>{sync.push('sync');}}),
 ledger:async(authId,args)=>{writes.push({authId,...args});if(options.ledgerError)return{data:null,error:{message:'Private database detail'}};
  if(args.p_action==='begin')session={id:localId,environment:args.p_environment,provider_session_id:null,status:'initializing',expires_at:new Date(Date.now()+3600000).toISOString(),verified_at:null};
  if(args.p_action==='update')session={...session,provider_session_id:args.p_provider_session_id,status:args.p_status,verified_at:args.p_verified?'mock-production-proof-time':null};
  return{data:session,error:null};},
 fetcher:async(input,init)=>{const url=String(input);calls.push({url,method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null,headers:new Headers(init?.headers)});
  if(options.providerError)return new Response('AADHAAR_RAW_PRIVATE_SENTINEL',{status:500});
  let data:unknown;
  if(url.endsWith('/authenticate'))data={access_token:'mock-access-token'};
  else if(url.endsWith('/sessions/init'))data={'@entity':'in.co.sandbox.kyc.digilocker.session.response',session_id:providerId,authorization_url:authorizationUrl};
  else if(url.endsWith('/status'))data={'@entity':'in.co.sandbox.kyc.digilocker.session',id:options.wrongSession?localId:providerId,status:options.providerStatus??'succeeded',documents_consented:options.consented===false?['pan']:['aadhaar']};
  else if(url.endsWith('/documents/aadhaar'))data={files:[{'@entity':'org.quicko.drive.file',url:'https://provider.example/private-document?number=RAW_SENTINEL',size:500,metadata:{ContentType:'application/xml',issuer_id:options.issuer??'in.gov.uidai'},name:'RAW_PERSON',aadhaar_number:'RAW_NUMBER'}]};
  else throw Error('Unexpected outbound request in mock');
  return new Response(JSON.stringify({code:200,data,transaction_id:transactionId}),{headers:{'Content-Type':'application/json'}});
 }});
 const run=async(body:unknown)=>{const response=await handler(new Request('https://local.test',{method:'POST',body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
 return{handler,run,calls,writes,sync};
}
Deno.test('disabled, incomplete config, and unapproved production perform no provider calls',async()=>{
 for(const env of [{},{...settings,SANDBOX_API_KEY:''},{...settings,AADHAAR_DIGILOCKER_PRODUCTION_APPROVED:'false'}]){
  const f=fixture({env});const r=await f.run({action:'begin',consent:true});assert.equal(r.body.available,false);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
 }
 assert.equal(digilockerConfiguration(name=>({...settings,SANDBOX_ENVIRONMENT:'unknown'})[name]),null);
});
Deno.test('unavailable accounts are rejected before configuration or provider access',async()=>{const f=fixture({allowed:false});assert.equal((await f.run({action:'begin'})).status,403);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);});
Deno.test('explicit versioned consent is mandatory, and clients cannot select actor or provider session',async()=>{
 const f=fixture({session:null});assert.equal((await f.run({action:'begin',consent:false})).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.run({action:'begin',consent:true,consentVersion:'old'})).status,400);
 const r=await f.run({action:'begin',consent:true,consentVersion:CONSENT_VERSION,authId:'attacker-chosen',sessionId:'other-session'});
 assert.equal(r.body.authorizationUrl,authorizationUrl);assert.equal(r.body.verified,false);
 assert(f.writes.every(w=>w.authId==='owner-from-validated-auth'));assert.equal(f.writes.filter(w=>w.p_action==='update')[0].p_provider_session_id,providerId);
 assert.deepEqual(f.calls[1].body,{'@entity':'in.co.sandbox.kyc.digilocker.session.request',flow:'signin',redirect_url:settings.AADHAAR_DIGILOCKER_REDIRECT_URL,doc_types:['aadhaar']});
 assert.equal(f.calls[0].headers.get('x-api-secret'),'mock-secret');assert.equal(f.calls[1].headers.get('x-api-secret'),null);assert.equal(f.calls[1].headers.get('Authorization'),'mock-access-token');
});
Deno.test('verified production consent plus UIDAI-issued document records only safe outcome',async()=>{
 const f=fixture();const r=await f.run({action:'refresh',verified:true,providerSessionId:'forged'});assert.equal(r.body.verified,true);assert.equal(f.sync.length,1);
 const update=f.writes.find(w=>w.p_action==='update')!;assert.equal(update.p_verified,true);assert.equal(update.p_provider_session_id,providerId);
 assert(!JSON.stringify([f.writes,r.body]).includes('RAW_'));assert(!JSON.stringify([f.writes,r.body]).includes('private-document'));
 assert(f.calls.every(c=>c.url.startsWith('https://api.sandbox.co.in/')));assert.equal(f.writes[1].p_action,'claim_refresh');
});
Deno.test('test provider success never grants real identity verification or Trust',async()=>{
 const f=fixture({env:{...settings,SANDBOX_ENVIRONMENT:'test'}});const r=await f.run({action:'refresh'});assert.equal(r.body.verified,false);assert.equal(r.body.testMode,true);assert.equal(f.writes.find(w=>w.p_action==='update')?.p_verified,false);assert.equal(f.sync.length,0);assert(f.calls.every(c=>c.url.startsWith('https://test-api.sandbox.co.in/')));
});
for(const status of ['created','failed','expired'])Deno.test(`provider ${status} cannot grant verification`,async()=>{const f=fixture({providerStatus:status});const r=await f.run({action:'refresh'});assert.equal(r.body.verified,false);assert.equal(f.calls.length,2);assert.equal(f.sync.length,0);});
Deno.test('missing Aadhaar consent or wrong issuer cannot grant verification',async()=>{
 for(const config of [{consented:false},{issuer:'uploaded-document'}]){const f=fixture(config);const r=await f.run({action:'refresh'});assert.equal(r.body.verified,false);assert.equal(f.sync.length,0);assert.equal(f.writes.find(w=>w.p_action==='update')?.p_verified,false);}
});
Deno.test('wrong provider session and inaccessible ledger fail closed',async()=>{for(const options of [{wrongSession:true},{ledgerError:true}]){const f=fixture(options);assert.equal((await f.run({action:'refresh'})).status,400);assert.equal(f.writes.filter(w=>w.p_action==='update').length,0);assert.equal(f.sync.length,0);}});
Deno.test('provider errors never expose raw data',async()=>{const f=fixture({providerError:true});const r=await f.run({action:'refresh'});assert.equal(r.status,400);assert(!JSON.stringify(r.body).includes('SENTINEL'));});
Deno.test('completed session retry avoids provider calls and does not repeat trusted update',async()=>{const f=fixture({session:{id:localId,status:'succeeded',verified_at:'mock-time',environment:'production'}});assert.equal((await f.run({action:'refresh'})).body.verified,true);assert.equal(f.calls.length,0);assert.equal(f.writes.length,1);});
Deno.test('configuration/link/issuer parsers reject unsafe or incomplete values',()=>{
 for(const url of ['http://digilocker.gov.in','https://evil.test','https://digilocker.gov.in.evil.test','https://user:secret@digilocker.gov.in','not a url'])assert.throws(()=>safeAuthorizationUrl(url));
 assert.equal(hasIssuedAadhaar({code:200,data:{files:[{metadata:{issuer_id:'in.gov.uidai'}}]}}),false);
 assert.throws(()=>parseSessionStatus({code:200,data:{id:providerId,'@entity':'in.co.sandbox.kyc.digilocker.session',status:'unknown'},transaction_id:transactionId},providerId));
});
Deno.test('invalid JSON and methods return generic errors',async()=>{const f=fixture();const r=await f.handler(new Request('https://local.test',{method:'POST',body:'SECRET_INVALID_JSON'}));assert.equal(r.status,400);assert(!(await r.text()).includes('SECRET'));assert.equal((await f.handler(new Request('https://local.test',{method:'GET'}))).status,405);});
