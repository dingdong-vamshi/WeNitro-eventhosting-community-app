// Verifies an actually completed hosted Sandbox checkout. Never simulates a webhook.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const f=JSON.parse(fs.readFileSync('tmp/chat001-checkout.json','utf8'));
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
assert(['test','sandbox'].includes(process.env.CASHFREE_ENV));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const c=createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
const s=createClient(url,fs.readFileSync('tmp/chat001-server-key','utf8').trim(),options);
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
const checks=[];const pass=(name,data)=>{checks.push({name,status:'PASS',data});console.log('PASS '+name);};
try{
 const login=await ok(c.auth.signInWithPassword({email:f.email,password:f.password}));
 const p=await ok(c.from('tbl_activity_payments').select('id,provider_order_id,amount_paisa,status').eq('event_id',f.eventId).eq('user_id',f.userId).single());
 const cf=async suffix=>{const r=await fetch('https://sandbox.cashfree.com/pg/orders/'+p.provider_order_id+suffix,{headers:{'x-api-version':'2023-08-01','x-client-id':process.env.CASHFREE_APP_ID,'x-client-secret':process.env.CASHFREE_SECRET_KEY}});assert.equal(r.status,200);return r.json();};
 const order=await cf('');assert.equal(order.order_status,'PAID');assert.equal(order.order_amount,12.34);assert.equal(order.order_currency,'INR');
 pass('Cashfree Sandbox provider order is PAID',{orderId:p.provider_order_id,amount:order.order_amount,currency:order.order_currency});
 const attempts=await cf('/payments');const successful=attempts.filter(a=>a.payment_status==='SUCCESS');assert.equal(successful.length,1);assert.equal(successful[0].payment_amount,12.34);
 pass('Hosted bank simulator generated actual provider SUCCESS',{paymentId:successful[0].cf_payment_id,status:'SUCCESS'});
 for(let i=0;i<2;i++){
  const r=await fetch(url+'/functions/v1/cashfree-verify-payment',{method:'POST',headers:{'content-type':'application/json',apikey:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+login.session.access_token},body:JSON.stringify({orderId:p.provider_order_id})});
  const b=await r.json();assert.equal(r.status,200);assert.equal(b.paid,true);
 }
 pass('Deployed verification returns paid and safely repeats');
 const persisted=await ok(c.from('tbl_activity_payments').select('status,amount_paisa').eq('id',p.id).single());assert.equal(persisted.status,'paid');assert.equal(persisted.amount_paisa,1234);
 const participants=await ok(c.from('tbl_event_participants').select('status').eq('event_id',f.eventId).eq('user_id',f.userId));assert.equal(participants.length,1);assert.equal(participants[0].status,'approved');
 pass('One approved registration persisted after verified payment');
 const financial=await ok(s.from('tbl_partner_financial_events').select('id').eq('payment_id',p.id).eq('kind','PAYMENT'));assert.equal(financial.length,1);
 pass('One financial PAYMENT event after repeated verification');
 fs.writeFileSync('docs/chat001-hosted-checkout-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),target:'cxsznhrkzqndhseodcyy',app:'https://wenitro-app.vercel.app',environment:'sandbox',eventId:f.eventId,userId:f.userId,paymentId:p.id,checks,screenshots:['qa-evidence/chat001/production-cashfree-hosted-checkout.png','qa-evidence/chat001/production-cashfree-second-simulator.png','qa-evidence/chat001/production-cashfree-confirmed-registration.png'],scope:'Hosted interactive Sandbox; no real money. Synthetic phone is not evidence of OTP delivery.'},null,2)+'\n');
}finally{await c.auth.signOut({scope:'local'});}
