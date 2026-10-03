import fs from 'node:fs';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const opts={auth:{persistSession:false,autoRefreshToken:false}},qa=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8'));
const admin=createClient(url,key,opts),host=createClient(url,key,opts),viewer=createClient(url,key,opts);
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};const rpc=(c,n,a={})=>ok(c.rpc(n,a));const checks=[];const pass=(name,result)=>{assert(result,name);checks.push({name,status:'PASS'});};let hostId,eventId;
try{
 await ok(admin.auth.signInWithPassword({email:qa.QA_EMAIL_ADMIN,password:qa.QA_PASSWORD_ADMIN}));
 await ok(host.auth.signInWithPassword({email:qa.QA_EMAIL_1,password:qa.QA_PASSWORD_1}));
 await ok(viewer.auth.signInWithPassword({email:qa.QA_EMAIL_2,password:qa.QA_PASSWORD_2}));
 hostId=Number(await rpc(host,'get_current_app_user_id'));assert.equal(hostId,70);
 const moderate=(id,action)=>rpc(admin,'admin_moderate_activity',{p_event_id:id,p_action:action,p_reason:'CHAT001 QA moderation only. No real event or money.'});
 const restriction=duration=>rpc(admin,'admin_moderate_user',{p_user_id:hostId,p_duration:duration,p_reason:'CHAT001 QA temporary suspension; restore immediately.'});
 pass('Member cannot suspend another account',!!(await host.rpc('admin_moderate_user',{p_user_id:71,p_duration:'30d',p_reason:'QA unauthorized action must fail'})).error);
 await restriction('30d');pass('Suspension rejects existing-session application identity',!!(await host.rpc('get_current_app_user_id')).error);
 const rows=await ok(host.from('tbl_events').select('id').limit(1));pass('Suspension hides direct table access for issued token',rows.length===0);
 pass('Suspension persists in Admin users list',(await rpc(admin,'admin_list_users')).find(u=>u.id===70)?.is_admin_restricted===true);
 await restriction('restore');pass('Restore re-enables original issued session',await rpc(host,'get_current_app_user_id')===70);
 const start=new Date(Date.now()+3*86400000),end=new Date(start.getTime()+3600000);
 const existingId=Number(process.env.QA_ADMIN_EVENT_ID||0);if(existingId){const old=await ok(admin.from('tbl_events').select('id,title,created_by').eq('id',existingId).single());assert.equal(old.title,'[QA] CHAT001 Admin moderation acceptance');assert.equal(old.created_by,70);await moderate(existingId,'restore_event');}
 const e=existingId?{id:existingId}:await rpc(host,'create_activity',{p_payload:{title:'[QA] CHAT001 Admin moderation acceptance',description:'Temporary moderation QA fixture. No real activity or money.',category:'Social',event_start_time:start.toISOString(),event_end_time:end.toISOString(),registration_close_time:start.toISOString(),max_participants:null,visibility_type:'public',join_type:'direct',location:'QA moderation venue',is_paid:false,price_inr:0,payment_collection_mode:'none'},p_status:'published'});eventId=Number(e.id??e);
 await rpc(viewer,'request_join_activity',{p_event_id:eventId,p_status:'going'});
 // Restrict the populated fixture after joining; no unrelated recipients.
 await rpc(host,'update_activity',{p_event_id:eventId,p_patch:{visibility_type:'private'}});
 const room=await rpc(viewer,'ensure_activity_chat',{p_event_id:eventId});const roomId=Number(room.id??room);
 pass('Member cannot invoke Admin activity moderation',!!(await viewer.rpc('admin_moderate_activity',{p_event_id:eventId,p_action:'delete_event',p_reason:'QA unauthorized action must fail'})).error);
 const notice=await moderate(eventId,'notify_participants');pass('In-app activity notice delivered to two QA recipients',notice.notifications===2);
 const notifications=await ok(viewer.from('tbl_notifications').select('id,title,body').eq('reference_id',String(eventId)).eq('type','system'));pass('QA participant can read delivered Admin notice',notifications.some(n=>n.title==='Activity update'));
 const cancelled=await moderate(eventId,'cancel_event');pass('Cancel persisted',(await ok(admin.from('tbl_events').select('is_cancelled').eq('id',eventId).single())).is_cancelled===true);
 pass('Cancellation retry does not duplicate notifications',(await moderate(eventId,'cancel_event')).notifications===0);
 const write=await viewer.rpc('send_chat_message',{p_room_id:roomId,p_client_id:crypto.randomUUID(),p_content:'QA must not send into cancelled activity',p_message_type:'text',p_media_url:null});pass('Cancelled activity chat write rejected',write.error?.code==='42501' && /cancel|closed|removed|ended|no longer available/i.test(write.error.message));
 await moderate(eventId,'restore_event');pass('Unpaid cancellation can be restored',(await ok(admin.from('tbl_events').select('is_cancelled,is_deleted').eq('id',eventId).single())).is_cancelled===false);
 await moderate(eventId,'delete_event');pass('Removed activity hidden from participant',(await ok(viewer.from('tbl_events').select('id').eq('id',eventId))).length===0);
 await moderate(eventId,'restore_event');pass('Removed unpaid activity restored',(await ok(viewer.from('tbl_events').select('id').eq('id',eventId))).length===1);
 const logs=await rpc(admin,'admin_operation_logs');pass('Moderation audit records actor, target, reason and prior state',logs.some(l=>l.target_id===eventId&&l.action==='delete_event'&&l.reason&&l.actor_id&&l.previous_state));
 pass('Member cannot read moderation audit',!!(await viewer.rpc('admin_operation_logs')).error);
 fs.writeFileSync('tmp/chat001-admin-operations.json',JSON.stringify({eventId,roomId,hostId,viewerId:71}),{mode:0o600});
 fs.writeFileSync('docs/chat001-admin-operations-proof.json',JSON.stringify({at:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',status:'PASS',checks,fixture:{eventId,roomId,visibility:'private',host:70,participant:71},restoration:'Temporary host restriction lifted; private unpaid activity retained for UI moderation and uncapped-capacity proof.'},null,2)+'\n');console.log(JSON.stringify({status:'PASS',checks:checks.length,eventId,roomId}));
}finally{if(hostId)await rpc(admin,'admin_moderate_user',{p_user_id:hostId,p_duration:'restore',p_reason:'CHAT001 QA guaranteed final restoration.'});await Promise.all([admin,host,viewer].map(c=>c.auth.signOut({scope:'local'})));}
