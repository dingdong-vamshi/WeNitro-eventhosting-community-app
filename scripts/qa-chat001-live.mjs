import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const clients=[1,2].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
const rpc=(c,n,a={})=>ok(c.rpc(n,a));
const evidence={target:new URL(url).hostname,at:new Date().toISOString(),checks:[]};
let messageId;
try {
 for(let i=0;i<2;i++)await ok(clients[i].auth.signInWithPassword({email:process.env[`QA_EMAIL_${i+1}`],password:process.env[`QA_PASSWORD_${i+1}`]}));
 const [author,viewer]=clients;
 const badges=await rpc(viewer,'profile_achievements',{p_user_id:71});
 assert.equal(badges.length,22);
 const repeat=await rpc(viewer,'profile_achievements',{p_user_id:71});
 assert.deepEqual(repeat,badges);
 assert.equal(badges.find(b=>b.slug==='popular-partner').description,'Welcome 100 qualifying participants.');
 const other=await rpc(author,'profile_achievements',{p_user_id:71});
 assert(other.every(b=>b.progress===null&&!('criteria_snapshot' in b)));
 evidence.badges=badges.map(({slug,threshold,progress,earned_at,description})=>({slug,threshold,progress,earned:!!earned_at,description}));
 evidence.checks.push('22 live badge rules','Repeated reads preserve award timestamps','Other profile progress and audit snapshot private','Correct Popular Partner criterion');
 const room=Number(await rpc(author,'create_direct_chat_room',{p_other_user_id:71}));
 assert.equal(room,194);
 const clientId=randomUUID();
 let deliver;
 const delivery=new Promise(resolve=>{deliver=resolve;});
 await viewer.realtime.setAuth();
 const channel=viewer.channel('chat001-'+clientId).on('postgres_changes',{event:'INSERT',schema:'public',table:'tbl_messages',filter:`room_id=eq.${room}`},p=>{console.log('Realtime payload',JSON.stringify({id:p.new.id,clientMatch:p.new.client_id===clientId,errors:p.errors}));if(p.new.client_id===clientId)deliver(p.new);});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Subscription timeout')),12000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(Error(status));}});});
 const sent=await rpc(author,'send_chat_message',{p_room_id:room,p_client_id:clientId,p_content:'[QA] CHAT 001 realtime delivery verification',p_message_type:'text',p_media_url:null});
 messageId=Number(sent.id??sent);
 let timer;
 const received=await Promise.race([delivery,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Message delivery timeout')),12000);})]).finally(()=>clearTimeout(timer));
 assert.equal(Number(received.id),messageId);
 const retry=await rpc(author,'send_chat_message',{p_room_id:room,p_client_id:clientId,p_content:'[QA] CHAT 001 realtime delivery verification',p_message_type:'text',p_media_url:null});
 assert.equal(Number(retry.id??retry),messageId);
 evidence.checks.push('Authenticated cross-user Realtime INSERT actually delivered','Retry keeps single message ID');
 evidence.realtime={room,messageId,received:true};
 await rpc(author,'delete_own_chat_message',{p_message_id:messageId});
 evidence.realtime.fixtureSoftDeleted=true;messageId=null;
 console.log(JSON.stringify(evidence,null,2));
 fs.writeFileSync('docs/chat001-live-regression.json',JSON.stringify(evidence,null,2)+'\n');
}finally{
 if(messageId)await clients[0].rpc('delete_own_chat_message',{p_message_id:messageId});
 for(const c of clients){await c.removeAllChannels();await c.auth.signOut({scope:'local'});}
}
