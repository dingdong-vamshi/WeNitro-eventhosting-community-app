import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const domain={};new Function('exports',compile(fs.readFileSync('src/domain/registration-questions.ts','utf8')))(domain);
const app=fs.readFileSync('App.tsx','utf8'),start=app.indexOf('  const startPayment = async () => {');
const ui=compile(app.slice(start,app.indexOf('\n  useEffect(',start))+'\nstartPayment();');let checks=0;
for(const scenario of ['invited-missing','saved-answer','no-questions','lookup-failure']){
 const q={id:134,type:'short_text',label:'Entry name',required:true,options:[],display_order:0};
 const form={questions:scenario==='no-questions'?[]:[q],answers:scenario==='saved-answer'?[{question_id:134,value:'Buyer'}]:[],locked:true};
 let orders=0,opened=0,scrolled=0;const forms=[],errors=[],busy=[];
 await vm.runInNewContext(ui,{Error,exports:{},paymentBusy:false,paymentNeedsReview:false,activity:{id:'297'},selectedEntryCategoryId:'29',window:undefined,
 cashfreeCheckoutAvailability:()=>({available:true}),registrationQuestionService:{getForm:async()=>{if(scenario==='lookup-failure')throw Error('Registration unavailable');return form;}},validateRegistrationAnswers:domain.validateRegistrationAnswers,
 setPaymentBusy:v=>busy.push(v),setJoinError:v=>errors.push(v),setPaymentMessage:()=>{},setRegistrationForm:v=>forms.push(v),detailScrollRef:{current:{scrollTo:()=>scrolled++}},setPaymentOrderId:()=>{},setViewerStatus:()=>{},
 createActivityPayment:async()=>{orders++;return {orderId:'order',paymentSessionId:'session'};},launchCashfreeCheckout:async()=>{opened++;return {completed:false};},verifyPayment:async()=>{},refreshDetails:async()=>{},Alert:{alert:()=>{}}});
 const mayPay=['saved-answer','no-questions'].includes(scenario);assert.equal(orders,mayPay?1:0);assert.equal(opened,mayPay?1:0);assert.equal(forms.length,scenario==='invited-missing'?1:0);assert.equal(scrolled,scenario==='invited-missing'?1:0);assert.equal(busy.at(-1),false);checks+=5;
 if(scenario==='lookup-failure'){assert.equal(errors.at(-1),'Registration unavailable');checks++;}
 if(forms.length){assert.equal(forms[0],form);checks++;}
}
// Actual form submit handler must save successfully before starting checkout.
const submitStart=app.indexOf('  const submitRegistration = async (answers: RegistrationAnswer[]) => {');
const submitUI=compile(app.slice(submitStart,app.indexOf('  const toggleLike = async',submitStart))+'\nsubmitRegistration([{question_id:134,value:"Buyer"}]);');
for(const failed of [false,true]){
 const sequence=[],forms=[],joined=[],errors=[];
 await vm.runInNewContext(submitUI,{Error,exports:{},activity:{id:'297'},requiresPlatformPayment:true,
  setJoining:()=>{},setJoinError:v=>errors.push(v),setViewerStatus:()=>{},setJoined:v=>joined.push(v),setRegistrationForm:v=>forms.push(v),
  registrationQuestionService:{submit:async()=>{sequence.push('save');if(failed)throw Error('Answer was not saved');return {status:'payment_required'};}},
  startPayment:async()=>sequence.push('checkout'),refreshDetails:async()=>{},Alert:{alert:()=>{}}});
 assert.deepEqual(sequence,failed?['save']:['save','checkout']);assert.equal(forms.length,failed?0:1);assert(!joined.includes(true));checks+=3;
 if(failed){assert.equal(errors.at(-1),'Answer was not saved');checks++;}
}
// Real create-order handler and real errorResponse: plain PostgREST validation
// must retain its actionable message without reaching Cashfree or writing orders.
const shared={};new Function('exports','require','Deno',compile(fs.readFileSync('supabase/functions/_shared/cashfree.ts','utf8')))(shared,()=>({}),{env:{get:()=>undefined}});
let handler,providerCalls=0;const mocked={...shared,authenticatedContext:async()=>({client:{rpc:async()=>({error:{code:'P0001',message:'Complete the required registration questions first'},data:null})},user:{}}),verifiedCheckoutPhone:()=>'+919876543210',cashfreeRequest:async()=>{providerCalls++;throw Error('Must not call provider');}};
new Function('exports','require','Deno',compile(fs.readFileSync('supabase/functions/cashfree-create-order/index.ts','utf8')))({},()=>mocked,{serve:fn=>handler=fn});
const response=await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({activityId:297,entryCategoryId:29})}));
assert.equal(response.status,400);assert.equal((await response.json()).error,'Complete the required registration questions first');assert.equal(providerCalls,0);checks+=3;
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual App checkout preflight, persisted required answers, lookup failure, actual create-order handler returns actionable validation error before provider; no remote writes'}));
