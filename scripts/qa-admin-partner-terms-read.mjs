// Read-only production acceptance; run only after the coordinator applies the receipt migration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const sourceRoot=process.env.QA_SOURCE_ROOT||process.cwd();
const adminRoot=process.env.QA_ADMIN_ROOT||path.resolve('../wenitro-admin-');
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const qa=JSON.parse(fs.readFileSync(path.join(sourceRoot,'tmp/chat001-qa.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(sourceRoot,'tmp/chat001-admin-integrated-fixtures.json'),'utf8'));
const clients=[];const checks=[];
const ok=async request=>{const result=await request;assert.ifError(result.error);return result.data;};
const pass=(name,details)=>checks.push({name,status:'PASS',...(details?{details}:{})});
const login=async(email,password)=>{const client=createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);await ok(client.auth.signInWithPassword({email,password}));return client;};
const adapter=client=>{const api={};new Function('require','exports',ts.transpile(fs.readFileSync(path.join(adminRoot,'src/lib/partner-admin.ts'),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(name=>{assert.equal(name,'@/lib/supabase');return{supabase:client};},api);return api;};
try{
 const admin=await login(qa.QA_EMAIL_ADMIN,qa.QA_PASSWORD_ADMIN);const api=adapter(admin);
 assert.equal(await api.getCurrentAdminRole(),'admin');pass('Actual current ordinary Admin session');
 const receipt=await api.getPartnerTermsAcceptance(108);assert.equal(receipt.policyVersion,'2026-10-01');assert(Number.isFinite(Date.parse(receipt.acceptedAt)));pass('Actual Admin adapter reads existing applicant108 receipt version and acceptance time',receipt);
 assert.equal(await api.getPartnerTermsAcceptance(71),null);pass('Actual Admin adapter correctly returns no receipt for legacy applicant71');
 const finance=await login(fixture.finance.email,fixture.finance.password);const financeApi=adapter(finance);assert.equal(await financeApi.getCurrentAdminRole(),'finance_admin');pass('Actual current Finance session');
 assert.deepEqual(await ok(finance.from('tbl_partner_terms_acceptances').select('policy_version,accepted_at').eq('user_id',108)),[]);pass('Finance session cannot read another applicant108 receipt: RLS returns no rows');
 const member=await login(fixture.recipient.email,fixture.recipient.password);assert.equal(await adapter(member).getCurrentAdminRole(),null);assert.deepEqual(await ok(member.from('tbl_partner_terms_acceptances').select('policy_version,accepted_at').eq('user_id',108)),[]);pass('Unrelated ordinary member120 cannot read applicant108 receipt: RLS returns no rows');
 const proof={at:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',status:'PASS',scope:'Live deployed SQL + actual Admin adapter, existing read-only receipts. No consent, role, approval, payout or award mutation. Admin visual receipt awaits UI deployment.',checks};
 fs.writeFileSync('docs/chat001-admin-partner-terms-production-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:checks.length,receipt108:receipt}));
}finally{await Promise.all(clients.map(client=>client.auth.signOut({scope:'local'})));}
