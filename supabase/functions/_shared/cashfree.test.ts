import assert from 'node:assert/strict';
import { amountToPaisa, safeProviderMetadata, verifiedCheckoutPhone, verifyWebhookSignature } from './cashfree.ts';

Deno.test('checkout requires an Auth-confirmed phone before a seat reservation', () => {
  assert.throws(() => verifiedCheckoutPhone({}), /verified phone/);
  assert.throws(() => verifiedCheckoutPhone({ phone: '+919999999999' }), /verified phone/);
  assert.throws(() => verifiedCheckoutPhone({ phone: ' ', phone_confirmed_at: '2026-10-03' }), /verified phone/);
  assert.equal(verifiedCheckoutPhone({ phone: ' +919999999999 ', phone_confirmed_at: '2026-10-03' }), '+919999999999');
});
Deno.test('provider amounts are exact safe minor units and metadata excludes payer details', () => {
  assert.equal(amountToPaisa('12.34'),1234);
  for(const amount of [0,-1,'bad',Infinity,1e308,1e15,1.001]) assert.throws(()=>amountToPaisa(amount),/invalid payment amount|decimal places/);
  assert.deepEqual(safeProviderMetadata({payment_status:'SUCCESS',customer_email:'private@example.test',customer_phone:'private',payment_message:'Paid',card_number:'private'}),{payment_status:'SUCCESS',payment_message:'Paid'});
});
Deno.test('Cashfree HMAC verifies raw bytes and rejects altered or malformed signatures', async () => {
  // These are test-only strings; no network or provider credentials are used.
  Deno.env.set('CASHFREE_ENV','test');Deno.env.set('CASHFREE_APP_ID','unit-test');Deno.env.set('CASHFREE_SECRET_KEY','unit-test-not-a-real-secret');
  try {
    const body='{"data":{"payment":{"payment_status":"SUCCESS"}}}', timestamp='1700000000000';
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('unit-test-not-a-real-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+body)))));
    assert.equal(await verifyWebhookSignature(body,signature,timestamp),true);
    assert.equal(await verifyWebhookSignature(body+' ',signature,timestamp),false);
    assert.equal(await verifyWebhookSignature(body,signature,'1700000000001'),false);
    assert.equal(await verifyWebhookSignature(body,'???',timestamp),false);
    assert.equal(await verifyWebhookSignature(body,null,timestamp),false);
  } finally {for(const name of ['CASHFREE_ENV','CASHFREE_APP_ID','CASHFREE_SECRET_KEY'])Deno.env.delete(name);}
});
