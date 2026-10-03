import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const app=fs.readFileSync('App.tsx','utf8');
const start=app.indexOf('  const startPayment = async () => {');
const end=app.indexOf('\n  useEffect(',start);
assert(start>0&&end>start);
const source=ts.transpileModule(app.slice(start,end)+'\nstartPayment();',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
for(const scenario of ['completed','cancelled','redirected','error','busy','review']){
 const messages=[],verified=[],busy=[],errors=[];
 const context={paymentBusy:scenario==='busy',paymentNeedsReview:scenario==='review',setPaymentOrderId:()=>{},activity:{id:'279'},selectedEntryCategoryId:'25',window:undefined,
 cashfreeCheckoutAvailability:()=>({available:true}),setPaymentBusy:v=>busy.push(v),setJoinError:v=>errors.push(v),setPaymentMessage:v=>messages.push(v),setViewerStatus:()=>{},
 createActivityPayment:async()=>({paymentSessionId:'sandbox-session',orderId:'wn_279_test'}),
 launchCashfreeCheckout:async()=>({completed:scenario==='completed',redirected:scenario==='redirected',...(scenario==='error'?{errorMessage:'provider failed'}:{})}),
 verifyPayment:async id=>{verified.push(id);messages.push('verified by backend');},refreshDetails:async()=>{},Alert:{alert:()=>{}}};
 await vm.runInNewContext(source,context);
 assert.deepEqual(verified,scenario==='completed'?['wn_279_test']:[]);
 if(scenario==='completed')assert.equal(messages.at(-1),'verified by backend');
 if(scenario==='cancelled')assert.match(messages.at(-1),/closed/);
 if(scenario==='redirected')assert.match(messages.at(-1),/Return here/);
 if(scenario==='error')assert.equal(errors.at(-1),'provider failed');
 if(scenario==='review')assert.match(errors.at(-1),/previous payment needs review/);
 if(['busy','review'].includes(scenario))assert.equal(busy.length,0);else assert.equal(busy.at(-1),false);
 console.log('PASS modal '+scenario);
}
