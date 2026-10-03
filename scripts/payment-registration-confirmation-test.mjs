import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const shared={exports:{}};new Function('exports','require','Deno',compile(fs.readFileSync('supabase/functions/_shared/cashfree.ts','utf8')))(shared.exports,()=>({}),{env:{get:()=>undefined}});
const edge=compile(fs.readFileSync('supabase/functions/cashfree-verify-payment/index.ts','utf8'));
const app=fs.readFileSync('App.tsx','utf8');
const verifyStart=app.indexOf('  const verifyPayment = async (orderId: string) => {');
const verifyEnd=app.indexOf('  const startPayment = async () => {',verifyStart);
const verifyUI=compile(app.slice(verifyStart,verifyEnd)+'\nverifyPayment("wn_40_test");');
let checks=0;
const scenarios=[
 {name:'confirmed',financial:'PAYABLE',participation:'approved',paid:true,confirmed:true},
 {name:'refund-required',financial:'REFUND_REQUIRED',participation:'left',paid:true,confirmed:false},
 {name:'refund-replay',financial:'REFUND_REQUIRED',participation:'left',paid:true,confirmed:false,replay:true},
 {name:'refunded-replay',financial:'REFUNDED',participation:'left',paid:true,confirmed:false,replay:true},
 {name:'reversed-replay',financial:'REVERSED',participation:'left',paid:true,confirmed:false,replay:true},
 {name:'disputed-replay',financial:'DISPUTED',participation:'approved',paid:true,confirmed:false,replay:true},
 {name:'settlement-hold-admitted',financial:'ON_HOLD',participation:'approved',paid:true,confirmed:true,replay:true},
 {name:'paid-no-seat',financial:'PAYABLE',participation:null,paid:true,confirmed:false},
 {name:'pending',financial:'OPEN',participation:'payment_required',paid:false,confirmed:false},
];
for(const scenario of scenarios){
 let handler;let providerCalls=0;let finalized=0;
 const ledger={id:40,event_id:280,user_id:116,provider_order_id:'wn_40_test',amount_paisa:1234,currency:'INR',status:scenario.paid?'paid':'pending',financial_status:scenario.financial};
 const client={from:table=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:{...ledger,status:scenario.replay?'paid':'pending'},error:null}),maybeSingle:async()=>({data:scenario.participation?{status:scenario.participation}:null,error:null})};assert(['tbl_activity_payments','tbl_event_participants'].includes(table));return query;}};
 const mocked={...shared.exports,
  authenticatedContext:async()=>({client}),adminClient:()=>({rpc:async name=>{if(name==='finalize_activity_payment')finalized++;return {data:ledger,error:null};}}),
  cashfreeRequest:async path=>{providerCalls++;return path.endsWith('/payments')?[{payment_status:'SUCCESS',payment_amount:12.34,payment_currency:'INR',cf_payment_id:'provider40'}]:{order_id:'wn_40_test',order_status:scenario.paid?'PAID':'ACTIVE',order_amount:12.34,order_currency:'INR'};},
  errorResponse:error=>Response.json({error:error.message},{status:400}),
 };
 new Function('exports','require','Deno',edge)({},()=>mocked,{serve:fn=>{handler=fn;}});
 const response=await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({orderId:'wn_40_test'})}));
 assert.equal(response.status,200,scenario.name);checks++;
 const result=await response.json();assert.equal(result.paid,scenario.paid);assert.equal(result.registrationConfirmed,scenario.confirmed);assert.equal(result.refundRequired,scenario.financial==='REFUND_REQUIRED');checks+=3;
 if(scenario.replay){assert.equal(providerCalls,0,'Paid retry should read terminal ledger');assert.equal(finalized,0);checks+=2;}
 // Execute the real App handler with a failed details refresh. A paid receipt
 // cannot claim admission based only on provider PAID or a later fetch.
 const state={messages:[],joined:[],viewer:[],review:[],cleared:0,activities:[{id:'280',viewerStatus:null}]};
 const ref={current:null};
 await vm.runInNewContext(verifyUI,{
  exports:{},activity:{id:'280'},paymentRegistrationRef:ref,
  setPaymentOrderId:()=>{},setPaymentBusy:()=>{},setJoinError:()=>{},setPaymentMessage:x=>state.messages.push(x),
  setViewerStatus:x=>state.viewer.push(x),setJoined:x=>state.joined.push(x),setPaymentNeedsReview:x=>state.review.push(x),
  setData:fn=>Object.assign(state,fn(state)),verifyActivityPayment:async()=>result,clearCashfreeReturnOrderId:()=>state.cleared++,
  refreshDetails:async()=>{throw Error('Simulated details outage');},
 });
 if(scenario.paid){
  assert.equal(state.joined.at(-1),scenario.confirmed);assert.equal(ref.current,scenario.confirmed);checks+=2;
  if(!scenario.confirmed){assert(!state.joined.includes(true));assert.doesNotMatch(state.messages.at(-1),/place is secured|Payment confirmed/);assert.equal(state.activities[0].viewerStatus,null);checks+=3;}
  else{assert.match(state.messages.at(-1),/place is secured/);checks++;}
 }else{assert.equal(state.cleared,0,'Pending URL remains available for retry after reload');checks++;}
 console.log('PASS Edge → receipt → App '+scenario.name);
}
// A stale details response cannot turn a rejected paid registration into Joined.
const applyStart=app.indexOf('  const applyDetails = (details:');
const applyCode=compile(app.slice(applyStart,verifyStart)+'\napplyDetails(details);');
const refreshedState={activities:[{id:'280'}],likedIds:[],savedIds:[]};const refreshedJoined=[];const refreshedViewer=[];
const detail={activity:{id:'280'},participants:[],comments:[],viewerStatus:'approved'};
await vm.runInNewContext(applyCode,{exports:{},details:detail,activity:{id:'280'},reactionId:'a280',paymentRegistrationRef:{current:false},
 activityFromRemote:()=>({id:'280',viewerStatus:'approved'}),setParticipants:()=>{},setComments:()=>{},setIsHost:()=>{},setIsCohost:()=>{},setJoinType:()=>{},setViewerStatus:x=>refreshedViewer.push(x),setJoined:x=>refreshedJoined.push(x),setFeedback:()=>{},setActivityVibes:()=>{},setFeedbackSubmitted:()=>{},setData:fn=>Object.assign(refreshedState,fn(refreshedState))});
assert.equal(refreshedJoined.at(-1),false);assert.equal(refreshedViewer.at(-1),null);assert.equal(refreshedState.activities[0].viewerStatus,null);checks+=3;
// The actual client decoder rejects old or contradictory confirmation payloads.
let serviceResult;const service={exports:{}};
new Function('exports','require','process','__DEV__',compile(fs.readFileSync('src/services/payments.ts','utf8')))(service.exports,name=>name==='react-native'?{Platform:{OS:'web'}}:{supabase:{functions:{invoke:async()=>({data:serviceResult,error:null})}}},{env:{}},false);
for(const invalid of [
 {orderId:'wn_40_test',status:'paid',paid:true},
 {orderId:'wn_40_test',status:'paid',paid:true,registrationConfirmed:true,refundRequired:true,financialStatus:'REFUND_REQUIRED'},
 {orderId:'wn_40_test',status:'pending',paid:true,registrationConfirmed:false,refundRequired:false,financialStatus:'OPEN'},
]){serviceResult=invalid;await assert.rejects(()=>service.exports.verifyActivityPayment('wn_40_test'),/invalid response/);checks++;}
serviceResult={orderId:'wn_40_test',status:'paid',paid:true,registrationConfirmed:false,refundRequired:true,financialStatus:'REFUND_REQUIRED'};
assert.equal((await service.exports.verifyActivityPayment('wn_40_test')).registrationConfirmed,false);checks++;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual verification Edge handler, terminal paid retries, ledger financial/admission distinction, actual App handler despite refresh outage, client response validation; no remote calls'}));
