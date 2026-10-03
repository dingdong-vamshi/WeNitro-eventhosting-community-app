import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
const spaced=fs.mkdtempSync(path.join(os.tmpdir(),'qa runner spaces '));
try {
 const copied=path.join(spaced,'production runner.mjs');fs.copyFileSync('scripts/qa-isolated-backend-production.mjs',copied);
 const result=spawnSync(process.execPath,[copied],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'PLAN_ONLY');checks+=2;
 const linked=path.join(spaced,'linked runner.mjs');fs.symlinkSync(copied,linked);const symlink=spawnSync(process.execPath,[linked],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(symlink.status,0,symlink.stderr);assert.equal(JSON.parse(symlink.stdout).status,'PLAN_ONLY');checks+=2;
} finally {fs.rmSync(spaced,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',checks,scope:'Production execution gating and credential-free dry-run only; not a deployed API test'}));
