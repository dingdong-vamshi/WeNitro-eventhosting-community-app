// Isolated deployed semantic proof. Synthetic ledger confirmations are not
// Cashfree transactions; all retained finances are held by parent cleanup.
export async function runParticipantManagementChecks({host,a,b,guard,service,ok,rpc,pass,deny,row,manifest,persist,proof,runId}){
 const create=async(label,paid=false)=>{const start=new Date(Date.now()+172800000);const event=await ok(service.from('tbl_events').insert({created_by:host.userId,title:`[QA] ${runId} ${label}`,visibility_type:'public',join_type:'approval',status:'published',event_start_time:start.toISOString(),event_end_time:new Date(+start+3600000).toISOString(),registration_close_time:start.toISOString(),is_paid:paid,price:paid?0.01:0,max_participants:5}).select('id').single());manifest.events.push(event.id);persist();return event;};
 const event=await create('participant-management');
 const join=(who,e=event)=>rpc(who.client,'request_join_activity',{p_event_id:e.id,p_status:'going'});
 const respond=(who,target,status,e=event)=>rpc(who.client,'respond_activity_join',{p_event_id:e.id,p_user_id:target.userId,p_status:status});
 const forbidden=(name,who,target,status,pattern,e=event)=>deny(name,who.client.rpc('respond_activity_join',{p_event_id:e.id,p_user_id:target.userId,p_status:status}),pattern);
 const role=(target,cohost)=>rpc(host.client,'set_activity_cohost',{p_event_id:event.id,p_user_id:target.userId,p_cohost:cohost});
 for(const who of [a,b,guard])await join(who);
 await respond(host,a,'approved');await respond(host,b,'approved');
 pass('Original Host promotes eligible Co-host',row(await role(a,true)).role,'cohost');await role(b,true);
 pass('Active Co-host self-join retry preserves approved status',row(await join(a)).status,'approved');
 await forbidden('Co-host cannot remove another Co-host',a,b,'rejected',/Co-host role/);
 await forbidden('Host must demote Co-host before removal',host,b,'rejected',/Co-host role/);
 await forbidden('Co-host cannot manage own participation',a,a,'rejected',/own participation/);
 await forbidden('Original Host protected from participant management',a,host,'rejected',/original Host/);
 await role(b,false);
 pass('Co-host removes eligible ordinary participant',row(await respond(a,b,'rejected')).status,'rejected');
 pass('Removed participant rejoin requires approval',row(await join(b)).status,'pending');
 pass('Co-host approves pending participant',row(await respond(a,b,'approved')).status,'approved');
 pass('Approved ordinary participant self-join retry stays approved',row(await join(b)).status,'approved');
 pass('Co-host rejects pending request',row(await respond(a,guard,'rejected')).status,'rejected');
 await join(guard);
 await rpc(a.client,'update_activity',{p_event_id:event.id,p_patch:{description:'QA Co-host permitted edit'}});
 pass('Co-host edit retains original creator',(await ok(service.from('tbl_events').select('created_by').eq('id',event.id).single())).created_by,host.userId);
 await role(a,false);await forbidden('Demoted Co-host immediately loses request approval',a,guard,'approved',/host or co-host/);await role(a,true);
 await ok(service.from('tbl_events').update({status:'completed'}).eq('id',event.id));
 await forbidden('Ended Activity denies Host participant removal',host,b,'rejected',/ended/);
 await forbidden('Ended Activity denies Co-host participant removal',a,b,'rejected',/ended/);
 await forbidden('Ended Activity denies pending request approval',a,guard,'approved',/ended/);
 pass('Denied ended removal preserves approved member',(await ok(service.from('tbl_event_participants').select('status').eq('event_id',event.id).eq('user_id',b.userId).single())).status,'approved');
 await ok(service.from('tbl_partner_profiles').upsert({user_id:host.userId,status:'APPROVED',business_name:`QA ${runId}`,decision_reason:'Synthetic participant management QA; not real Partner validation'}));
 const paid=await create('paid-response-replay',true);await join(b,paid);await respond(host,b,'approved',paid);
 const prepare=e=>rpc(b.client,'prepare_activity_payment',{p_event_id:e.id,p_entry_category_id:null}).then(row);
 const finalize=p=>rpc(service,'finalize_activity_payment',{p_order_id:p.provider_order_id,p_provider_payment_id:`SYNTHETIC_MANAGEMENT_${runId}_${p.id}`,p_amount_paisa:1,p_currency:'INR',p_provider_status:'SUCCESS',p_provider_metadata:{qa_fixture:true,qa_run:runId,provider_transaction_exists:false}}).then(row);
 const payment=await prepare(paid);await finalize(payment);
 pass('Paid approval retry preserves admitted participant',row(await respond(host,b,'approved',paid)).status,'approved');
 pass('Paid attendee self-join retry preserves confirmed seat',row(await join(b,paid)).status,'approved');
 await forbidden('Paid removal requires financial review',host,b,'rejected',/payment review/,paid);
 const declined=await create('late-host-rejection',true);await join(b,declined);await respond(host,b,'approved',declined);const pending=await prepare(declined);
 await respond(host,b,'rejected',declined);
 const cancelled=await ok(service.from('tbl_activity_payments').select('status,provider_status').eq('id',pending.id).single());pass('Host rejection cancels unpaid reservation',cancelled,{status:'cancelled',provider_status:'HOST_REJECTED'});
 pass('Late synthetic provider success after rejection requires refund',(await finalize(pending)).financial_status,'REFUND_REQUIRED');
 pass('Late payment never readmits rejected participant',(await ok(service.from('tbl_event_participants').select('status').eq('event_id',declined.id).eq('user_id',b.userId).single())).status,'left');
 const receipt=await ok(b.client.functions.invoke('cashfree-verify-payment',{body:{orderId:pending.provider_order_id}}));pass('Deployed Edge never confirms rejected paid seat',receipt.registrationConfirmed,false);
 proof.participantManagement={eventId:event.id,paidEventId:paid.id,declinedEventId:declined.id,providerPaymentEvidence:false,endedScope:'Actual completed state; natural timestamp expiry tested in real local PostgreSQL without backdating production schedules.'};
}
