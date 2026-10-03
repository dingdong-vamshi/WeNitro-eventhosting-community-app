// Isolated synthetic buyer and Sandbox-only event. No real identity/OTP verification is claimed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');assert(['sandbox','test'].includes(process.env.CASHFREE_ENV));
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service=createClient(url,fs.readFileSync('tmp/chat001-server-key','utf8').trim(),{auth:{persistSession:false,autoRefreshToken:false}});
const host=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
const rpc=(c,n,a={})=>ok(c.rpc(n,a));
const qa=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8'));
try{
 await ok(host.auth.signInWithPassword({email:qa.QA_EMAIL_2,password:qa.QA_PASSWORD_2}));
 const profile=await rpc(host,'get_my_partner_profile');assert.equal(profile.can_host_paid,true);
 const used=new Set();for(let page=1;;page++){const u=await ok(service.auth.admin.listUsers({page,perPage:1000}));for(const x of u.users)used.add((x.phone||'').replace(/^\+/,''));if(u.users.length<1000)break;}
 const phone=Array.from({length:100},(_,i)=>'202555'+String(100+i).padStart(4,'0')).find(x=>!used.has(x)&&!used.has('1'+x));assert(phone);
 const id=Date.now();const email=`qa.chat001.sandbox.${id}@example.com`,password=randomBytes(24).toString('base64url');
 const created=await ok(service.auth.admin.createUser({email,password,email_confirm:true,phone,phone_confirm:true,user_metadata:{full_name:'[QA] CHAT001 Sandbox Buyer',qa_sandbox_fixture:true}}));
 const buyer=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 await ok(buyer.auth.signInWithPassword({email,password}));const userId=await rpc(buyer,'get_current_app_user_id');
 // This fixture bypasses onboarding only for payment QA; it is never evidence of real verification or policy acceptance.
 await ok(service.from('tbl_users').update({fullname:'[QA] CHAT001 Sandbox Buyer',onboarding_completed:true}).eq('id',userId));
 const start=new Date(Date.now()+172800000),end=new Date(start.getTime()+3600000);
 const event=await rpc(host,'create_activity',{p_payload:{title:`[QA] CHAT001 Cashfree SANDBOX ${id}`,description:'Sandbox payment acceptance only. No real event, attendance, money or payout.',category:'Social',event_start_time:start.toISOString(),event_end_time:end.toISOString(),registration_close_time:start.toISOString(),max_participants:5,visibility_type:'public',join_type:'direct',is_paid:true,price_inr:12.34,location:'QA Sandbox venue',activity_type:'meetup'},p_status:'published'});
 const eventId=Number(event.id??event);assert(eventId>0);
 const categories=await rpc(host,'save_activity_entry_categories',{p_event_id:eventId,p_categories:[{name:'Sandbox entry',price_paisa:1234,capacity:5}]});
 const fixture={eventId,userId,authUserId:created.user.id,email,password,categoryId:categories[0].id,environment:'sandbox',createdAt:new Date().toISOString()};
 fs.writeFileSync('tmp/chat001-checkout.json',JSON.stringify(fixture),{mode:0o600});
 console.log(JSON.stringify({created:true,eventId,userId,categoryId:fixture.categoryId,environment:'sandbox',syntheticPhone:true}));
 await buyer.auth.signOut({scope:'local'});
}finally{await host.auth.signOut({scope:'local'});}
