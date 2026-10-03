import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateRelease,target,requiredMigrations} from './qa-isolated-backend-production.mjs';
const valid={projectId:target,readyForProductionQA:true,appDeploymentId:'app-release',adminDeploymentId:'admin-release',cashfreeVerifyVersion:'version-1',appliedMigrations:requiredMigrations};
const url=`https://${target}.supabase.co`;let checks=0;
validateRelease(valid,url);checks++;
for(const mutate of [x=>x.readyForProductionQA=false,x=>x.projectId='another-project',x=>x.appDeploymentId='',x=>x.adminDeploymentId='',x=>x.cashfreeVerifyVersion='',x=>x.appliedMigrations=requiredMigrations.slice(1)]){
 const bad=structuredClone(valid);mutate(bad);assert.throws(()=>validateRelease(bad,url));checks++;
}
assert.throws(()=>validateRelease(valid,'https://another-project.supabase.co'));checks++;
// A no-argument process has no credentials or Supabase URL and still succeeds
// without importing Supabase or attempting any network/database operation.
const dry=spawnSync(process.execPath,['scripts/qa-isolated-backend-production.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8'});
assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).status,'PLAN_ONLY');checks+=2;
const blocked=spawnSync(process.execPath,['scripts/qa-isolated-backend-production.mjs','--execute'],{env:{PATH:process.env.PATH},encoding:'utf8'});
assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/Missing --release/);checks+=2;
console.log(JSON.stringify({status:'PASS',checks,scope:'Production execution gating and credential-free dry-run only; not a deployed API test'}));
