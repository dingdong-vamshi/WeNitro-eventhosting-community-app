import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const qa=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8')),fixture=JSON.parse(fs.readFileSync('tmp/chat001-checkout.json','utf8'));
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');assert.equal(fixture.eventId,280);
const make=()=>createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=make(),target=make(),other=make();const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};const checks=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 await ok(admin.auth.signInWithPassword({email:qa.QA_EMAIL_ADMIN,password:qa.QA_PASSWORD_ADMIN}));await ok(target.auth.signInWithPassword({email:fixture.email,password:fixture.password}));await ok(other.auth.signInWithPassword({email:qa.QA_EMAIL_1,password:qa.QA_PASSWORD_1}));
 const event=await ok(admin.from('tbl_events').select('id,is_admin_pinned,visibility_type').eq('id',280).single());assert.equal(event.is_admin_pinned,false);assert.equal(event.visibility_type,'private');
 const category=await ok(admin.from('tbl_categories').select('id').eq('name','Social').single());const links=await ok(admin.from('tbl_event_categories').select('category_id').eq('event_id',280));assert.deepEqual(links,[{category_id:category.id}]);pass('Admin pin removed and original Social category persisted after UI restoration');
 assert((await target.rpc('admin_set_activity_pinned',{p_event_id:280,p_pinned:true})).error);assert((await target.rpc('admin_correct_activity_category',{p_event_id:280,p_category_id:category.id})).error);pass('Ordinary participant cannot invoke Admin pin or category correction');
 assert.equal((await ok(target.from('tbl_events').select('id').eq('id',280))).length,1);assert.equal((await ok(other.from('tbl_events').select('id').eq('id',280))).length,0);pass('Private activity readable by joined participant but hidden from unrelated member');
 const receipt=await ok(target.from('tbl_activity_payments').select('id,status,financial_status').eq('event_id',280));assert.equal(receipt.length,1);assert.equal(receipt[0].status,'paid');assert.equal(receipt[0].financial_status,'ON_HOLD');assert.equal((await ok(other.from('tbl_activity_payments').select('id').eq('event_id',280))).length,0);pass('Own payment readable; another member cannot read it; Sandbox funds ON_HOLD');
 const denied=await admin.rpc('admin_list_partner_finance');assert(denied.error);assert.match(denied.error.message,/Finance admin access required/);pass('Ordinary Admin cannot access finance-only data');
 fs.writeFileSync('docs/chat001-admin-controls-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',event:280,checks,screenshots:['qa-evidence/chat001/production-admin-pinned-category-corrected.png','qa-evidence/chat001/production-admin-category-member-reflection.png','qa-evidence/chat001/production-admin-corrected-stats-restored-controls.png']},null,2)+'\n');
}finally{for(const c of [admin,target,other])await c.auth.signOut({scope:'local'});}
