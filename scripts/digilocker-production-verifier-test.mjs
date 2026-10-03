import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{checkDisabledDigiLocker,validateDigiLockerRelease,target}from'./qa-digilocker-disabled-production.mjs';
let checks=0;const release={projectId:target,readyForProductionQA:true,appDeploymentId:'dpl_expected',aadhaarVerificationVersion:1,appliedMigrations:['20261003205431']};
validateDigiLockerRelease(release,`https://${target}.supabase.co`,'dpl_expected');checks++;
for(const mutate of [r=>r.projectId='wrong',r=>r.readyForProductionQA=false,r=>r.appDeploymentId='dpl_old',r=>r.aadhaarVerificationVersion=0,r=>r.appliedMigrations=[]]){const bad=structuredClone(release);mutate(bad);assert.throws(()=>validateDigiLockerRelease(bad,`https://${target}.supabase.co`,'dpl_expected'));checks++;}
assert.throws(()=>validateDigiLockerRelease(release,'https://wrong.supabase.co','dpl_expected'));checks++;
const actions=[];const request=async(auth,body)=>{actions.push(body.action);return{status:auth?200:401,body:auth?{available:false,verified:false,status:'unavailable',message:'Disabled'}:{}}};
const rpc=async(name,args)=>name==='my_trust_score'?{data:{total:20,aadhaar_verified:false}}:{error:{code:'42501'}};
const results=await checkDisabledDigiLocker({request,rpc,authId:'owner'});assert.equal(results.length,9);checks++;assert.deepEqual(actions,['availability','availability']);checks++;
await assert.rejects(checkDisabledDigiLocker({request:async(auth,body)=>auth?{status:200,body:{available:true,verified:false,status:'not_started'}}:request(auth,body),rpc,authId:'owner'}));checks++;
await assert.rejects(checkDisabledDigiLocker({request,rpc:async name=>name==='aadhaar_session_service'?{error:{code:'PGRST202'}}:rpc(name),authId:'owner'}));checks++;
const dry=spawnSync(process.execPath,['scripts/qa-digilocker-disabled-production.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).status,'PLAN_ONLY');checks+=2;
const bad=spawnSync(process.execPath,['scripts/qa-digilocker-disabled-production.mjs','--execute'],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.notEqual(bad.status,0);assert.match(bad.stderr,/Missing --release/);checks+=2;
console.log(JSON.stringify({status:'PASS',checks,scope:'Offline release gates, availability-only action restriction, valid permission denial, unchanged Trust assertion and no-credential dry run. No production/provider request.'}));
