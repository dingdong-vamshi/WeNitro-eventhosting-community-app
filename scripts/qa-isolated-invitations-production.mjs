// No provider calls. Host-issued invitations convey approval; payment-required
// participants are admitted only through the service finalizer in this fixture.
export async function runInvitationChecks({host,a,b,service,ok,rpc,pass,deny,row,manifest,persist,proof,runId}){
 const activity=async(label,patch={})=>{
  const start=new Date(Date.now()+172800000);
  const e=await ok(service.from('tbl_events').insert({created_by:host.userId,title:`[QA] ${runId} ${label}`,visibility_type:'private',join_type:'approval',status:'published',event_start_time:start.toISOString(),event_end_time:new Date(+start+3600000).toISOString(),registration_close_time:start.toISOString(),is_paid:false,price:0,max_participants:5,...patch}).select('id,registration_close_time').single());manifest.events.push(e.id);persist();return e;
 };
 const invite=(e,uses=null)=>rpc(host.client,'create_activity_invite',{p_event_id:e.id,p_expires_at:new Date(Date.now()+86400000).toISOString(),p_max_uses:uses});
 const redeem=(who,i)=>rpc(who.client,'redeem_activity_invite',{p_token:i.token});
 const free=await activity('fresh-invitation'),first=await invite(free);
 pass('Explicit Host invitation approves free private activity',(await redeem(a,first)).status,'approved');
 await rpc(a.client,'request_join_activity',{p_event_id:free.id,p_status:'left'});
 await deny('Private former participant cannot self-rejoin without invitation',a.client.rpc('request_join_activity',{p_event_id:free.id,p_status:'going'}),/Activity access required/);
 const fresh=await invite(free);pass('Fresh Host invitation restores private participation',(await redeem(a,fresh)).status,'approved');
 pass('Fresh invitation reuses one participant row',(await ok(service.from('tbl_event_participants').select('id').eq('event_id',free.id).eq('user_id',a.userId))).length,1);
 const closed=await activity('registration-deadline',{registration_close_time:new Date(Date.now()+15000).toISOString()}),closingToken=await invite(closed);
 // Let a genuine server deadline expire. No backdating or disabled triggers.
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(closed.registration_close_time).getTime()-Date.now()+1500)));
 await deny('Closed registration cannot issue a new invitation',host.client.rpc('create_activity_invite',{p_event_id:closed.id}),/Registration is closed/);
 await deny('Previously valid invitation fails after actual deadline',a.client.rpc('redeem_activity_invite',{p_token:closingToken.token}),/Registration is closed/);
 pass('Failed deadline redemption consumes no invitation use',(await ok(service.from('tbl_activity_invites').select('uses_count').eq('id',closingToken.id).single())).uses_count,0);
 for(const [label,patch] of [['completed',{status:'completed'}],['cancelled',{is_cancelled:true}]]){
  const e=await activity(label),token=await invite(e);await ok(service.from('tbl_events').update(patch).eq('id',e.id));
  await deny(`${label} Activity cannot issue invitation`,host.client.rpc('create_activity_invite',{p_event_id:e.id}),/ended|unavailable/);
  await deny(`${label} Activity rejects existing invitation`,a.client.rpc('redeem_activity_invite',{p_token:token.token}),/ended|unavailable/);
 }
 await ok(service.from('tbl_partner_profiles').upsert({user_id:host.userId,status:'APPROVED',business_name:`QA ${runId}`,decision_reason:'Synthetic invitation/paid replay fixture, not real Partner review'}));
 const paid=await activity('paid-invitation',{is_paid:true,price:0.01}),paidToken=await invite(paid,1);
 pass('Paid Host invitation never bypasses payment',(await redeem(a,paidToken)).status,'payment_required');
 const payment=row(await rpc(a.client,'prepare_activity_payment',{p_event_id:paid.id,p_entry_category_id:null}));
 const paidRecord=row(await rpc(service,'finalize_activity_payment',{p_order_id:payment.provider_order_id,p_provider_payment_id:`SYNTHETIC_INVITE_${runId}`,p_amount_paisa:1,p_currency:'INR',p_provider_status:'SUCCESS',p_provider_metadata:{qa_fixture:true,qa_run:runId,provider_transaction_exists:false}}));
 pass('Synthetic service payment admits one qualifying participant',paidRecord.financial_status,'PAYABLE');
 pass('Paid invitation replay keeps approved seat despite exhausted one-use token',(await redeem(a,paidToken)).status,'approved');
 pass('Paid invitation replay consumes no additional use',(await ok(service.from('tbl_activity_invites').select('uses_count').eq('id',paidToken.id).single())).uses_count,1);
 pass('Paid replay preserves actual approved participation',(await ok(service.from('tbl_event_participants').select('status').eq('event_id',paid.id).eq('user_id',a.userId).single())).status,'approved');
 await deny('Exhausted invitation still denies a different buyer',b.client.rpc('redeem_activity_invite',{p_token:paidToken.token}),/invalid or expired/);
 const receipt=await ok(a.client.functions.invoke('cashfree-verify-payment',{body:{orderId:payment.provider_order_id}}));pass('Edge receipt still confirms seat after invitation replay',receipt.registrationConfirmed,true);
 proof.invitations={freeEvent:free.id,closedEvent:closed.id,paidEvent:paid.id,providerPaymentEvidence:false,clockExpiry:'Real 15-second registration deadline expired naturally; lifecycle completed/cancelled tested separately. Past event-end timestamp boundary verified in real local PostgreSQL.'};
}
