import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const qa=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8')),fixture=JSON.parse(fs.readFileSync('tmp/chat001-checkout.json','utf8'));
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const make=()=>createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=make(),target=make(),other=make();const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
const checks=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 await ok(admin.auth.signInWithPassword({email:qa.QA_EMAIL_ADMIN,password:qa.QA_PASSWORD_ADMIN}));
 await ok(target.auth.signInWithPassword({email:fixture.email,password:fixture.password}));
 await ok(other.auth.signInWithPassword({email:qa.QA_EMAIL_1,password:qa.QA_PASSWORD_1}));
 const row=await ok(admin.from('tbl_login_announcements').select('id,title,target_user_ids,active').eq('title','[QA] CHAT001 targeted acceptance').single());assert.deepEqual(row.target_user_ids,[116]);pass('Admin publication persisted with only QA user 116 as audience');
 const otherRows=await ok(other.rpc('my_login_announcements'));assert(!otherRows.some(r=>r.id===row.id));pass('Non-recipient cannot receive targeted announcement');
 assert((await other.rpc('acknowledge_login_announcement',{p_id:row.id})).error);pass('Non-recipient acknowledgement denied');
 assert.equal((await ok(other.from('tbl_login_announcements').select('id').eq('id',row.id))).length,0);pass('Raw announcement table hidden from member');
 const denied=await other.rpc('admin_create_login_announcement',{p_title:'[QA] denied',p_body:'Must never be inserted',p_starts_at:new Date().toISOString(),p_expires_at:new Date(Date.now()+60000).toISOString(),p_target_user_ids:[116]});assert(denied.error);pass('Member cannot publish announcements');
 const visible=await ok(target.rpc('my_login_announcements'));
 if(process.argv.includes('--after-ui-ack')){
  assert(!visible.some(r=>r.id===row.id));
  const before=await ok(target.from('tbl_login_announcement_receipts').select('read_at').eq('announcement_id',row.id));assert.equal(before.length,1);
  await ok(target.rpc('acknowledge_login_announcement',{p_id:row.id}));
  const after=await ok(target.from('tbl_login_announcement_receipts').select('read_at').eq('announcement_id',row.id));assert.deepEqual(after,before);
  pass('UI acknowledgement persisted once; retry preserves original receipt and hides announcement');
 }else{assert(visible.some(r=>r.id===row.id));pass('Targeted QA recipient can load unacknowledged announcement');}
 fs.writeFileSync('docs/chat001-announcement-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',announcementId:row.id,recipient:116,phase:process.argv.includes('--after-ui-ack')?'AFTER_UI_ACK':'BEFORE_UI_ACK',checks},null,2)+'\n');
}finally{for(const c of [admin,target,other])await c.auth.signOut({scope:'local'});}
