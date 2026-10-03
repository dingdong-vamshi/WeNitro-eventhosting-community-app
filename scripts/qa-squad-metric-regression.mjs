// Read-only deployed RPC comparison for the coordinator-owned reciprocal/self fixture.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
const root=process.argv[2];assert(root,'Supply primary secrets root');
const recipient=JSON.parse(fs.readFileSync(`${root}/tmp/chat001-admin-integrated-fixtures.json`)).recipient;assert.equal(recipient.userId,120);
const qa=JSON.parse(fs.readFileSync(`${root}/tmp/chat001-qa.json`));
const release=JSON.parse(fs.readFileSync(`${root}/docs/chat001-integrated-release.json`));
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const make=()=>createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const clients=[];const checks=[];const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks.push({name,status:'PASS',actual});};
try{
 for(const user of [{id:120,email:recipient.email,password:recipient.password},{id:71,email:qa.QA_EMAIL_2,password:qa.QA_PASSWORD_2}]){
  const c=make();clients.push(c);await ok(c.auth.signInWithPassword({email:user.email,password:user.password}));check(`Bound identity ${user.id}`,await ok(c.rpc('get_current_app_user_id')),user.id);
  const list=await ok(c.rpc('list_my_squad')),metrics=await ok(c.rpc('my_profile_metrics'));check(`Identity ${user.id} count equals its own unique list`,metrics.squad,list.length);check(`Identity ${user.id} excludes self`,list.some(x=>x.id===user.id),false);
  if(user.id===120){check('Reciprocal duplicate and self fixture produces one peer',list.map(x=>x.id),[70]);check('Profile count is one',metrics.squad,1);}
 }
 const anon=make();for(const name of ['list_my_squad','my_profile_metrics']){const r=await anon.rpc(name);check(`Anonymous ${name} denied`,Boolean(r.error),true);check(`Anonymous ${name} permission code`,r.error.code,'42501');}
 const proof={at:new Date().toISOString(),status:'PASS',release:{appDeploymentId:release.appDeploymentId,adminDeploymentId:release.adminDeploymentId},migration:'20261003194203_squad_metric_excludes_self',source:'Actual deployed authenticated/anonymous RPC; no table/fixture writes',checks,fixtureRowsPreserved:[47,48,49],releaseNote:'SQL-only metric fix; App remains08b8bb8. Backend metric now uses the same eligible unique non-self Squad list; Nitro and referral history unchanged.'};
 fs.writeFileSync('docs/chat001-squad-metric-production-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:checks.length,proof:'docs/chat001-squad-metric-production-proof.json'}));
}finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
