// Availability-only acceptance. Never initiates or refreshes provider sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const target='cxsznhrkzqndhseodcyy';
export function validateDigiLockerRelease(release,url,expectedDeployment){
 assert.equal(new URL(url).hostname,`${target}.supabase.co`);
 assert.equal(release.projectId,target);assert.equal(release.readyForProductionQA,true);
 assert(expectedDeployment?.startsWith('dpl_'),'Explicit coordinator deployment required');
 assert.equal(release.appDeploymentId,expectedDeployment);
 assert(release.appliedMigrations?.includes('20261003205431'),'DigiLocker migration not recorded');
 assert(Number.isInteger(release.aadhaarVerificationVersion)&&release.aadhaarVerificationVersion>0,'DigiLocker Edge version not recorded');
}
export async function checkDisabledDigiLocker({request,rpc,authId}){
 const checks=[];const pass=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks.push({name,status:'PASS',actual});};
 const before=await rpc('my_trust_score');assert(!before.error,'Owner Trust baseline unavailable');
 const anonymous=await request(false,{action:'availability'});pass('Anonymous availability denied',anonymous.status,401);
 const authenticated=await request(true,{action:'availability'});pass('Authenticated availability response',authenticated.status,200);
 pass('Provider disabled',authenticated.body.available,false);pass('Disabled endpoint grants no verification',authenticated.body.verified,false);pass('Disabled state explicit',authenticated.body.status,'unavailable');
 pass('No provider references, authorization links or identity payload returned',Object.keys(authenticated.body).sort(),['available','message','status','verified']);
 for(const actor of [authId,'ffffffff-ffff-4fff-8fff-ffffffffffff']){
  const denied=await rpc('aadhaar_session_service',{p_auth_id:actor,p_action:'read'});
  pass(actor===authId?'Ordinary owner cannot directly read service ledger':'Ordinary user cannot choose another ledger owner',denied.error?.code,'42501');
 }
 const after=await rpc('my_trust_score');assert(!after.error,'Owner Trust after unavailable');pass('Availability check leaves owner Trust unchanged',after.data,before.data);
 return checks;
}
async function main(){
 if(!process.argv.includes('--execute')){console.log(JSON.stringify({status:'PLAN_ONLY',target,scope:'Only anonymous/authenticated availability, denied service-ledger reads and unchanged Trust. No begin, refresh, provider, identity data or fixture writes.',requires:['coordinator deployment signal','--release FILE','--expected-deployment dpl_ID','--secrets-root DIR','--output FILE','release aadhaarVerificationVersion and migration20261003205431']}));return;}
 const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'),`Missing ${name}`);return process.argv[i+1];};
 const release=JSON.parse(fs.readFileSync(arg('--release'),'utf8'));const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
 validateDigiLockerRelease(release,url,arg('--expected-deployment'));
 const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;assert(key,'Missing public Supabase key');
 const fixture=JSON.parse(fs.readFileSync(path.join(arg('--secrets-root'),'tmp/chat001-admin-integrated-fixtures.json'),'utf8')).recipient;
 const {createClient}=await import('@supabase/supabase-js');const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const proof={at:new Date().toISOString(),target,release:{appDeploymentId:release.appDeploymentId,adminDeploymentId:release.adminDeploymentId,aadhaarVerificationVersion:release.aadhaarVerificationVersion},status:'RUNNING',checks:[],scope:'Deployed disabled-path API only. No provider or real identity acceptance. Existing QA account is not edited.',providerActionsInvoked:[],fixtureWrites:0};
 try{
  const signed=await client.auth.signInWithPassword({email:fixture.email,password:fixture.password});assert(!signed.error&&signed.data.session,'QA login failed');assert.equal(signed.data.user.id,fixture.authId);
  const token=signed.data.session.access_token;
  proof.checks=await checkDisabledDigiLocker({authId:fixture.authId,rpc:(name,args)=>client.rpc(name,args),request:async(auth,body)=>{
   assert.equal(body.action,'availability'); // No provider action is permitted in this verifier.
   const response=await fetch(`${url}/functions/v1/aadhaar-verification`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});
   return{status:response.status,body:await response.json()};
  }});proof.status='PASS';
 }catch{proof.status='FAIL';proof.reason='A disabled-path assertion failed. Investigate locally without exposing response bodies or credentials.';process.exitCode=1;}
 finally{await client.auth.signOut({scope:'local'});client.realtime.disconnect();proof.finishedAt=new Date().toISOString();fs.writeFileSync(arg('--output'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,output:arg('--output')}));}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
