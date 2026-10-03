import fs from 'node:fs';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const opts={auth:{persistSession:false,autoRefreshToken:false}},key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service=createClient(url,fs.readFileSync('tmp/chat001-server-key','utf8').trim(),opts);const make=()=>createClient(url,key,opts);
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
let fixture;const file='tmp/chat001-admin-access.json';
if(process.argv.includes('--setup')){assert(!fs.existsSync(file));fixture={createdAt:new Date().toISOString()};
 for(const [label,role] of [['master','super_admin'],['member','']]){const password=randomBytes(24).toString('base64url'),email=`qa.chat001.${label}.${Date.now()}@example.com`;const d=await ok(service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role,qa_fixture:true},user_metadata:{full_name:`[QA] CHAT001 ${label}`,qa_fixture:true}}));fixture[label]={email,password,id:d.user.id};}
 fs.writeFileSync(file,JSON.stringify(fixture),{mode:0o600});console.log('Isolated QA Master and member created; no existing account roles changed.');process.exit(0);
}
fixture=JSON.parse(fs.readFileSync(file,'utf8'));const master=make(),member=make(),ordinary=make();
const qa=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8'));const checks=[];
const pass=(name,result)=>{assert(result,name);checks.push({name,status:'PASS'});};
try{await ok(master.auth.signInWithPassword(fixture.master));await ok(member.auth.signInWithPassword(fixture.member));await ok(ordinary.auth.signInWithPassword({email:qa.QA_EMAIL_ADMIN,password:qa.QA_PASSWORD_ADMIN}));
 if(process.argv.includes('--cleanup')){
  for(const name of ['member','master']){await ok(service.auth.admin.updateUserById(fixture[name].id,{app_metadata:{role:'',admin_status:'inactive',qa_fixture:true}}));await ok(service.from('tbl_users').update({is_active:0}).eq('auth_user_id',fixture[name].id));}
  pass('QA Master and QA member access revoked',!!(await master.rpc('admin_accounts')).error&&!!(await member.rpc('admin_accounts')).error);
  const p='docs/chat001-admin-access-proof.json';const proof=JSON.parse(fs.readFileSync(p,'utf8'));proof.cleanup={at:new Date().toISOString(),checks};fs.writeFileSync(p,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof.cleanup));process.exit(0);
 }
 const set=(client,role,status='active')=>client.rpc('admin_set_account_access',{p_email:fixture.member.email,p_role:role,p_status:status,p_reason:'CHAT001 isolated access-control QA'});
 pass('Master reads actual administrator list',(await ok(master.rpc('admin_accounts'))).some(x=>x.id===fixture.master.id));
 pass('Ordinary Admin sees own account only',(await ok(ordinary.rpc('admin_accounts'))).length===1);
 pass('Member cannot list administrators',!!(await member.rpc('admin_accounts')).error);
 pass('Ordinary Admin cannot grant roles',!!(await set(ordinary,'super_admin')).error);
 await ok(member.auth.updateUser({data:{role:'super_admin',admin_status:'active'}}));pass('User-editable metadata cannot grant authority',!!(await set(member,'super_admin')).error);
 await ok(member.auth.updateUser({data:{role:null,admin_status:null}}));
 pass('Master cannot change own access',!!(await master.rpc('admin_set_account_access',{p_email:fixture.master.email,p_role:'admin',p_status:'inactive',p_reason:'QA self lockout denial'})).error);
 const before=await ok(master.rpc('admin_access_logs'));await ok(set(master,'admin'));pass('Role grant persisted', (await ok(member.rpc('admin_accounts')))[0]?.role==='admin');
 const again=await ok(set(master,'admin'));pass('Repeated assignment is idempotent',again.changed===false);
 const after=await ok(master.rpc('admin_access_logs'));pass('Exactly one audit entry for grant and retry',after.length===before.length+1);
 await ok(set(master,'admin','suspended'));pass('Revoked Admin denied without refreshing existing JWT',!!(await member.rpc('admin_accounts')).error);
 await ok(set(master,'finance_admin'));pass('Finance role reads its own account',(await ok(member.rpc('admin_accounts')))[0]?.role==='finance_admin');
 pass('Finance role cannot moderate',await ok(member.rpc('is_wenitro_admin'))===false);
 pass('Finance role cannot grant administrator access',!!(await set(member,'admin')).error);
 await ok(set(master,'finance_admin','inactive'));pass('Inactive Finance denied with existing JWT',!!(await member.rpc('admin_accounts')).error);
 pass('Member cannot read administrator access audit',!!(await member.rpc('admin_access_logs')).error);
 const anon=make();pass('Unauthenticated administrator access denied',!!(await anon.rpc('admin_accounts')).error);
 const proof={at:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',status:'PASS',checks,fixtures:'Isolated synthetic accounts only; permanent Master owner assignment not performed',screenshots:[],cleanup:'Pending UI proof, then revoke both QA accounts'};fs.writeFileSync('docs/chat001-admin-access-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,checks:checks.length}));
}finally{await Promise.all([master,member,ordinary].map(c=>c.auth.signOut({scope:'local'})));}
