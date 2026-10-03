import fs from 'node:fs';
export async function runActivityMediaChecks({host,a,b,guard,service,ok,rpc,pass,deny,manifest,persist,proof,runId}){
 const start=new Date(Date.now()+172800000);const event=await ok(service.from('tbl_events').insert({created_by:host.userId,title:`[QA] ${runId} Activity media choices`,visibility_type:'public',join_type:'approval',status:'published',event_start_time:start.toISOString(),event_end_time:new Date(+start+3600000).toISOString(),registration_close_time:start.toISOString(),is_paid:false,price:0,max_participants:5}).select('id').single());manifest.events.push(event.id);persist();
 for(const who of [a,b]){await rpc(who.client,'request_join_activity',{p_event_id:event.id,p_status:'going'});await rpc(host.client,'respond_activity_join',{p_event_id:event.id,p_user_id:who.userId,p_status:'approved'});}
 const mediaPath=`${a.id}/activity-media-choice/${runId}.png`;manifest.objects.push({bucket:'vibes',path:mediaPath});persist();await ok(a.client.storage.from('vibes').upload(mediaPath,fs.readFileSync('assets/brand/wenitro-mark-blue.png'),{contentType:'image/png'}));
 const create=async show=>{const row=await rpc(a.client,'vibe_create',{p_event_id:event.id,p_media_path:mediaPath,p_media_type:'image',p_caption:`[QA] ${runId} feed=${show}`,p_hashtags:[],p_visibility:'public',p_show_in_vibes:show});manifest.vibes??=[];manifest.vibes.push({id:row.id,userId:a.userId,eventId:event.id});persist();return row;};
 const hidden=await create(false),shown=await create(true);
 pass('Activity-only option persists false',hidden.show_in_vibes,false);pass('Show in Vibes option persists true',shown.show_in_vibes,true);
 pass('Forged public Activity media remains participant audience',[hidden.visibility,shown.visibility],['activity','activity']);
 const select=(who,feed=false)=>{let q=who.client.from('tbl_activity_vibes').select('id').eq('event_id',event.id).order('id');return ok(feed?q.eq('show_in_vibes',true):q);};
 pass('Activity members see both media choices',(await select(b)).map(x=>x.id),[hidden.id,shown.id]);
 pass('Participant global Vibes feed excludes Activity-only media',(await select(b,true)).map(x=>x.id),[shown.id]);
 pass('Original Host sees both media choices',(await select(host)).length,2);
 pass('Outsider sees neither choice even on public Activity',await select(guard),[]);
 pass('Outsider cannot directly read hidden media row',await ok(guard.client.from('tbl_activity_vibes').select('id').eq('id',hidden.id)),[]);
 const signed=await ok(b.client.storage.from('vibes').createSignedUrl(mediaPath,60));pass('Participant can sign associated media',Boolean(signed.signedUrl),true);
 const response=await fetch(signed.signedUrl);pass('Participant signed media returns actual bytes',response.ok&&(await response.arrayBuffer()).byteLength>0,true);
 await deny('Outsider cannot sign associated Activity media',guard.client.storage.from('vibes').createSignedUrl(mediaPath,60));
 await ok(b.client.from('tbl_activity_vibes').update({show_in_vibes:true}).eq('id',hidden.id));pass('Other participant cannot alter author feed choice',(await ok(a.client.from('tbl_activity_vibes').select('show_in_vibes').eq('id',hidden.id).single())).show_in_vibes,false);
 await rpc(b.client,'request_join_activity',{p_event_id:event.id,p_status:'left'});pass('Former nonauthor participant loses Activity media access',await select(b),[]);
 proof.activityMedia={eventId:event.id,hiddenVibeId:hidden.id,shownVibeId:shown.id,scope:'Actual RPC/RLS/Storage bytes and query predicates; UI toggle screenshots belong to App agent. No private media becomes globally public.'};
}
