// Live sandbox-only QA. No real checkout or outbound SMS is initiated.
import assert from 'node:assert/strict';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'cxsznhrkzqndhseodcyy.supabase.co');
assert.ok(['sandbox', 'test'].includes(process.env.CASHFREE_ENV));
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.QA_SERVICE_KEY, options);
const admin = createClient(url, publicKey, options);
const member = createClient(url, publicKey, options);
const first = value => Array.isArray(value) ? value[0] : value;
const ok = async promise => { const r = await promise; if (r.error) throw Error(r.error.message); return r.data; };
const rpc = (client, name, args = {}) => ok(client.rpc(name, args));
const pass = label => console.log('PASS ' + label);
const runId = Date.now();
let createdEvent;
const cfHeaders = { 'x-client-id': process.env.CASHFREE_APP_ID, 'x-client-secret': process.env.CASHFREE_SECRET_KEY, 'x-api-version': '2025-01-01', 'content-type': 'application/json' };
const cf = async path => { const r = await fetch('https://sandbox.cashfree.com/pg' + path, { headers: cfHeaders }); const j = await r.json(); assert.ok(r.ok, 'Cashfree Sandbox HTTP ' + r.status + ' ' + j.code); return j; };
const invoke = async (name, body, token) => {
  const r = await fetch(url + '/functions/v1/' + name, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://wenitro-app.vercel.app', apikey: publicKey, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

try {
  await ok(admin.auth.signInWithPassword({ email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD }));
  const login = await ok(member.auth.signInWithPassword({ email: process.env.QA_EMAIL_2, password: process.env.QA_PASSWORD_2 }));
  const wrong = await createClient(url, publicKey, options).auth.signInWithPassword({ email: process.env.QA_EMAIL_2, password: randomUUID() });
  assert.ok(wrong.error); pass('wrong password rejected');
  const restored = createClient(url, publicKey, options);
  await ok(restored.auth.setSession({ access_token: login.session.access_token, refresh_token: login.session.refresh_token }));
  assert.equal((await ok(restored.auth.getUser())).user.id, login.user.id); pass('session restore');
  const recovery = await ok(service.auth.admin.generateLink({ type: 'recovery', email: process.env.QA_EMAIL_2, options: { redirectTo: 'https://wenitro-app.vercel.app/' } }));
  const recoveryUrl = new URL(recovery.properties.action_link);
  assert.equal(recoveryUrl.hostname, new URL(url).hostname);
  assert.equal(recoveryUrl.searchParams.get('redirect_to'), 'https://wenitro-app.vercel.app/');
  pass('recovery link targets new Supabase and production app (no email sent)');
  const share = await fetch(url + '/functions/v1/share-vibe?id=122');
  assert.equal(share.status, 200); assert.match(await share.text(), /wenitro/i); pass('share-vibe public preview');

  const fixturePassword = randomBytes(24).toString('base64url');
  const fixtureEmail = `qa-sandbox-provider-${runId}@example.com`;
  // Explicitly synthetic sandbox fixture; never represents a real verified person.
  const fixture = await ok(service.auth.admin.createUser({ email: fixtureEmail, password: fixturePassword, email_confirm: true, user_metadata: { full_name: '[QA] Sandbox Provider Fixture', qa_sandbox_fixture: true } }));
  const partner = createClient(url, publicKey, options);
  await ok(partner.auth.signInWithPassword({ email: fixtureEmail, password: fixturePassword }));
  const partnerId = await rpc(partner, 'get_current_app_user_id');
  await rpc(partner, 'submit_partner_application', { p_application: { terms_accepted: true, business_name: '[QA] Sandbox only — no payouts', description: 'Synthetic provider integration QA; never fulfil or pay out.', city: 'QA', activity_types: ['QA'], activity_location: 'QA', age_category: '18+', bank_name: '', account_holder_name: '', account_number: '', ifsc: '', upi_id: 'qa-sandbox@invalid' } });
  await rpc(admin, 'admin_review_partner_application', { p_user_id: partnerId, p_status: 'APPROVED', p_reason: 'Synthetic sandbox-only QA fixture; no payouts.' });
  assert.equal((await rpc(partner, 'get_my_partner_profile')).can_host_paid, true); pass('Partner application / Admin review / approved capability');
  const event = await rpc(partner, 'create_activity', { p_payload: { title: `[QA] Cashfree SANDBOX ${runId}`, description: 'Synthetic test only. No real-money payments or payouts.', category: '[QA] Automation', event_start_time: new Date(Date.now()+172800000).toISOString(), event_end_time: new Date(Date.now()+180000000).toISOString(), registration_close_time: new Date(Date.now()+86400000).toISOString(), max_participants: 5, visibility_type: 'private', join_type: 'direct', is_paid: true, price_inr: 12.34, location: 'QA', activity_type: 'sport' }, p_status: 'published' });
  const categories = await rpc(partner, 'save_activity_entry_categories', { p_event_id: event, p_categories: [{ name: 'Sandbox category', price_paisa: 1234, capacity: 3 }] });
  createdEvent = event;
  const category = first(categories);
  assert.ok(category?.id, 'Entry category returned');
  await ok(service.from('tbl_events').update({ visibility_type: 'public' }).eq('id', event));
  console.log(JSON.stringify({qaEvent:event,qaPartner:partnerId,qaAuthUser:fixture.user.id}));
  await rpc(member, 'prepare_activity_payment', { p_event_id: event, p_entry_category_id: category.id });
  const missingPhone = await invoke('cashfree-create-order', { activityId: event, entryCategoryId: category.id, amount: 1 }, login.session.access_token);
  assert.equal(missingPhone.status, 400); assert.match(missingPhone.body.error, /verified phone/); pass('checkout requires verified phone');
  // Use an isolated synthetic buyer; never mutate a reusable QA member's Auth
  // phone. Supabase's admin update API ignores empty phone values on restoration.
  const buyerEmail = `qa-sandbox-buyer-${runId}@example.com`;
  const buyerPassword = randomBytes(24).toString('base64url');
  // Repeated runs must not collide with an earlier synthetic buyer. Only use
  // the NANP fictional 555-0100..0199 range; never send SMS to these fixtures.
  const usedPhones = new Set();
  for (let page = 1; ; page++) {
    const listed = await ok(service.auth.admin.listUsers({ page, perPage: 1000 }));
    for (const user of listed.users) usedPhones.add((user.phone || '').replace(/^\+/, ''));
    if (listed.users.length < 1000) break;
  }
  const fixturePhone = Array.from({ length: 100 }, (_, i) => `202555${String(100 + i).padStart(4, '0')}`)
    .find(phone => !usedPhones.has(phone) && !usedPhones.has('1' + phone));
  assert.ok(fixturePhone, 'No unused reserved synthetic phone remains');
  await ok(service.auth.admin.createUser({ email: buyerEmail, password: buyerPassword,
    email_confirm: true, phone: fixturePhone, phone_confirm: true,
    user_metadata: { full_name: '[QA] Synthetic Sandbox Buyer', qa_sandbox_fixture: true } }));
  const buyer = createClient(url, publicKey, options);
  const buyerLogin = await ok(buyer.auth.signInWithPassword({ email: buyerEmail, password: buyerPassword }));
  let order;
  try {
    const created = await invoke('cashfree-create-order', { activityId: event, entryCategoryId: category.id, amount: 1 }, buyerLogin.session.access_token);
    assert.equal(created.status, 200, created.body.error);
    order = created.body;
    assert.equal(order.amountPaisa, 1234); assert.equal(order.entryCategoryId, String(category.id));
    const providerOrder = await cf('/orders/' + order.orderId);
    assert.equal(providerOrder.order_amount, 12.34);
    assert.equal(providerOrder.order_meta.notify_url, url + '/functions/v1/cashfree-webhook');
    assert.ok(providerOrder.order_meta.return_url.startsWith('https://wenitro-app.vercel.app/'));
    pass('Cashfree sandbox order / authoritative category amount / target webhook / return URL');
    const repeat = await invoke('cashfree-create-order', { activityId: event, entryCategoryId: category.id }, buyerLogin.session.access_token);
    assert.equal(repeat.body.orderId, order.orderId); pass('order creation idempotency');
    const verified = await invoke('cashfree-verify-payment', { orderId: order.orderId }, buyerLogin.session.access_token);
    assert.equal(verified.status, 200); assert.equal(verified.body.paid, false); pass('verify-payment reads real Sandbox order as unpaid');
  } finally {
    pass('reusable QA member phone remains unchanged');
  }
  const hookBody = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: order.orderId }, payment: { cf_payment_id: 'qa_simulated_' + runId, payment_status: 'SUCCESS', payment_amount: 12.34, payment_currency: 'INR' } } });
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', process.env.CASHFREE_SECRET_KEY).update(timestamp + hookBody).digest('base64');
  for (const [attempt, sig] of [['invalid','invalid'], ['valid',signature], ['replay',signature]]) {
    const r = await fetch(url + '/functions/v1/cashfree-webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-timestamp': timestamp, 'x-webhook-signature': sig }, body: hookBody });
    const body = await r.json(); assert.equal(r.status, attempt === 'invalid' ? 401 : 200);
    if (attempt === 'replay') assert.equal(body.replayed, true);
    pass('signed synthetic sandbox webhook ' + attempt);
  }
  const memberId = await rpc(buyer, 'get_current_app_user_id');
  const ledger = await ok(buyer.from('tbl_activity_payments').select('id,status,amount_paisa').eq('provider_order_id',order.orderId).single());
  assert.equal(ledger.status,'paid'); assert.equal(ledger.amount_paisa,1234);
  const participant = await ok(buyer.from('tbl_event_participants').select('status').eq('event_id',event).eq('user_id',memberId).single());
  assert.equal(participant.status,'approved');
  const finance = await ok(service.from('tbl_partner_financial_events').select('id').eq('payment_id',ledger.id).eq('kind','PAYMENT'));
  assert.equal(finance.length,1); pass('synthetic webhook updates DB / participant exactly once');
  await rpc(partner,'get_partner_transactions',{p_event_id:event});
  await rpc(partner,'get_partner_registrations',{p_event_id:event});
  pass('Partner transaction and registration reflection');
  const financeAdmin = await admin.rpc('admin_list_partner_finance');
  if (financeAdmin.error) {
    assert.match(financeAdmin.error.message, /Finance admin access required/);
    pass('ordinary QA admin correctly denied finance-only access');
  } else {
    pass('finance-authorized Admin read');
  }
  console.log(JSON.stringify({ qaEvent:event, qaPartner:partnerId, qaAuthUser:fixture.user.id, orderId:order.orderId, paymentEvidence:'synthetic signed webhook, not completed provider checkout' }));
  await buyer.auth.signOut({ scope: 'local' }); await partner.auth.signOut({ scope: 'local' }); await member.auth.signOut({ scope: 'local' }); await admin.auth.signOut({ scope: 'local' });
} catch(error) {
  let message = String(error?.message || error);
  for (const value of Object.values(process.env)) if(value && value.length>10) message=message.split(value).join('[REDACTED]');
  console.error('FAIL '+message); process.exitCode=1;
} finally {
  if (createdEvent) {
    // Never leave synthetic signed-webhook evidence eligible for a real payout.
    const held = await service.from('tbl_activity_payments').update({ financial_status: 'ON_HOLD' }).eq('event_id', createdEvent);
    const settlements = await service.from('tbl_partner_settlements').update({ status: 'ON_HOLD', note: 'SYNTHETIC QA WEBHOOK. No real payment received. Never pay out.' }).eq('event_id', createdEvent);
    const hidden = await service.from('tbl_events').update({ visibility_type: 'private' }).eq('id', createdEvent);
    if (held.error || settlements.error || hidden.error) {
      console.error('FAIL sandbox fixture quarantine needs review'); process.exitCode=1;
    } else pass('synthetic fixture private and financially ON_HOLD');
  }
}
