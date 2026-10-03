// Coordinator readiness required by the parent runner. Observe the real cron;
// never invoke the privileged dispatcher or alter clocks/schedules to force PASS.
export async function runSafetyReminderChecks({host,a,b,service,ok,rpc,pass,manifest,persist,proof,runId}) {
 const start=new Date(Date.now()+10*60000+30000),due=new Date(+start-10*60000);
 const create=async label=>{const event=await ok(service.from('tbl_events').insert({created_by:host.userId,title:`[QA] ${runId} ${label}`,visibility_type:'public',join_type:'approval',status:'published',event_start_time:start.toISOString(),event_end_time:new Date(+start+3600000).toISOString(),registration_close_time:start.toISOString(),is_paid:false,price:0,max_participants:5}).select('id').single());manifest.events.push(event.id);persist();return event;};
 const event=await create('safety-reminder'),cancelled=await create('cancelled-safety-reminder');
 await rpc(a.client,'request_join_activity',{p_event_id:event.id,p_status:'going'});
 await rpc(host.client,'respond_activity_join',{p_event_id:event.id,p_user_id:a.userId,p_status:'approved'});
 await rpc(b.client,'request_join_activity',{p_event_id:event.id,p_status:'going'});
 await ok(service.from('tbl_events').update({is_cancelled:true}).eq('id',cancelled.id));
 const notices=who=>ok(who.client.from('tbl_notifications').select('id,user_id,type,body,data,created_at').eq('type','activity_safety_reminder').eq('reference_id',String(event.id)));
 if(Date.now()<+due){pass('No safety reminder before ten-minute boundary',(await notices(a)).length,0);}else throw Error('Fixture setup exceeded the pre-due window; retry with fresh future time');
 console.log(JSON.stringify({phase:'waiting_for_real_safety_cron',dueAt:due.toISOString(),eventId:event.id}));
 let received=[];const deadline=+due+125000;
 while(Date.now()<deadline){received=await notices(a);if(received.length)break;await new Promise(resolve=>setTimeout(resolve,5000));}
 pass('Actual cron delivers one reminder to confirmed attendee',received.length,1);
 pass('Reminder contains exact requested safety message',received[0].body,'Make sure to share your activity details and live location with someone you trust.');
 pass('Reminder is not early and arrives before Activity start',Date.parse(received[0].created_at)>=+due&&Date.parse(received[0].created_at)<+start,true);
 pass('Reminder opens the correct Activity',Number(received[0].data.event_id),event.id);
 pass('Original Host receives one reminder',(await notices(host)).length,1);
 pass('Pending attendee receives no reminder',(await notices(b)).length,0);
 pass('Cancelled Activity produces no reminder',(await ok(service.from('tbl_notifications').select('id').eq('type','activity_safety_reminder').eq('reference_id',String(cancelled.id)))).length,0);
 pass('Other attendee cannot read confirmed attendee reminder',await ok(b.client.from('tbl_notifications').select('id').eq('id',received[0].id)),[]);
 // Allow another actual minute scheduler execution; test persisted idempotency.
 const observeUntil=Date.now()+65000;while(Date.now()<observeUntil)await new Promise(resolve=>setTimeout(resolve,Math.min(5000,observeUntil-Date.now())));
 pass('Subsequent cron execution creates no duplicate',(await notices(a)).length,1);
 proof.safetyReminders={eventId:event.id,cancelledEventId:cancelled.id,startAt:start.toISOString(),dueAt:due.toISOString(),notification:received[0],nativePushEvidence:false,liveTrackingEvidence:false,dispatch:'Observed real named minute cron; no direct dispatch RPC or clock changes'};
}
