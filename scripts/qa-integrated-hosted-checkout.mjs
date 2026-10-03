// Actual hosted Sandbox acceptance. No synthetic webhook/provider-success mutation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const mode = process.argv[2];
assert(['--setup', '--verify', '--hold'].includes(mode), 'Use --setup, --verify or --hold');
const release = JSON.parse(fs.readFileSync('docs/chat001-integrated-release.json', 'utf8'));
assert.equal(release.readyForProductionQA, true);
assert.equal(release.projectId, 'cxsznhrkzqndhseodcyy');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, release.projectId + '.supabase.co');
assert(['sandbox', 'test'].includes(process.env.CASHFREE_ENV), 'Sandbox only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const buyer = createClient(url, key, options);
const host = createClient(url, key, options);
const service = createClient(url, fs.readFileSync('tmp/chat001-server-key', 'utf8').trim(), options);
const originalBuyer = JSON.parse(fs.readFileSync('tmp/chat001-checkout.json', 'utf8'));
assert.equal(originalBuyer.userId, 116, 'Only existing isolated Sandbox buyer');
const qa = JSON.parse(fs.readFileSync('tmp/chat001-qa.json', 'utf8'));
const manifestPath = 'tmp/chat001-integrated-checkout.json';
const ok = async promise => { const r = await promise; assert.ifError(r.error); return r.data; };
const rpc = (client, name, args = {}) => ok(client.rpc(name, args));
const save = value => fs.writeFileSync(manifestPath, JSON.stringify(value, null, 2), { mode: 0o600 });
try {
  const auth = await ok(buyer.auth.signInWithPassword({ email: originalBuyer.email, password: originalBuyer.password }));
  assert.equal(await rpc(buyer, 'get_current_app_user_id'), 116);
  if (mode === '--setup') {
    assert(!fs.existsSync(manifestPath), 'Existing fixture retained; do not silently create another');
    await ok(host.auth.signInWithPassword({ email: qa.QA_EMAIL_2, password: qa.QA_PASSWORD_2 }));
    assert.equal((await rpc(host, 'get_my_partner_profile')).can_host_paid, true);
    const start = new Date(Date.now() + 172800000), end = new Date(start.getTime() + 3600000);
    const created = await rpc(host, 'create_activity', { p_status: 'published', p_payload: {
      title: '[QA] Integrated hosted Sandbox acceptance', description: 'Private synthetic Sandbox checkout. No real event, attendance, money or payout.',
      category: 'Social', event_start_time: start.toISOString(), event_end_time: end.toISOString(), registration_close_time: start.toISOString(),
      max_participants: 5, visibility_type: 'private', join_type: 'direct', is_paid: true, price_inr: 12.34,
      location: 'QA Sandbox venue', activity_type: 'meetup',
    } });
    const fixture = { eventId: Number(created.id ?? created), userId: 116, hostId: 71, environment: 'sandbox', createdAt: new Date().toISOString(), release };
    assert(fixture.eventId > 0); save(fixture);
    fixture.categories = await rpc(host, 'save_activity_entry_categories', { p_event_id: fixture.eventId, p_categories: [
      { name: 'Sandbox Standard', price_paisa: 1234, capacity: 3 }, { name: 'Sandbox Plus', price_paisa: 1800, capacity: 2 },
    ] }); save(fixture);
    fixture.questions = await rpc(host, 'save_activity_registration_questions', { p_event_id: fixture.eventId, p_questions: [
      { label: 'Entry name for this Sandbox test', type: 'short_text', required: true, display_order: 0, options: [] },
    ] }); save(fixture);
    const invite = await rpc(host, 'create_activity_invite', { p_event_id: fixture.eventId });
    const participation = await rpc(buyer, 'redeem_activity_invite', { p_token: invite.token });
    assert.equal(participation.status, 'payment_required');
    fixture.invitationState = participation.status; save(fixture);
    console.log(JSON.stringify({ status: 'FIXTURE_READY', eventId: fixture.eventId, userId: 116, categories: fixture.categories.map(x => ({ id: x.id, name: x.name, price_paisa: x.price_paisa })), requiredQuestion: true, private: true, url: release.appUrl + '/#/activity/' + fixture.eventId }));
  } else {
    const fixture = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(fixture.userId, 116); assert.equal(fixture.environment, 'sandbox');
    const event = await ok(service.from('tbl_events').select('title,created_by,visibility_type').eq('id', fixture.eventId).single());
    assert.equal(event.title, '[QA] Integrated hosted Sandbox acceptance'); assert.equal(event.created_by, 71); assert.equal(event.visibility_type, 'private');
    if (mode === '--hold') {
      await ok(service.from('tbl_activity_payments').update({ financial_status: 'ON_HOLD' }).eq('event_id', fixture.eventId).eq('status', 'paid'));
      await ok(service.from('tbl_partner_settlements').update({ status: 'ON_HOLD', note: 'Actual hosted SANDBOX provider transaction, no real money. Never pay out.' }).eq('event_id', fixture.eventId));
      fixture.quarantine = 'Private Activity; Sandbox payment and settlement held; no real payout/refund.'; save(fixture);
      console.log(JSON.stringify({ status: 'HELD', eventId: fixture.eventId }));
    } else {
      const checks = []; const pass = (name, data) => checks.push({ name, status: 'PASS', data });
      const payment = await ok(buyer.from('tbl_activity_payments').select('id,provider_order_id,amount_paisa,status,entry_category_id').eq('event_id', fixture.eventId).eq('user_id', 116).single());
      const cf = async suffix => { const response = await fetch('https://sandbox.cashfree.com/pg/orders/' + payment.provider_order_id + suffix, { headers: {
        'x-api-version': '2025-01-01', 'x-client-id': process.env.CASHFREE_APP_ID, 'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      } }); assert.equal(response.status, 200); return response.json(); };
      const order = await cf(''); assert.equal(order.order_status, 'PAID'); assert.equal(order.order_amount, 12.34); assert.equal(order.order_currency, 'INR');
      pass('Actual Cashfree Sandbox order PAID at chosen server price', { orderId: payment.provider_order_id, amount: order.order_amount, currency: order.order_currency });
      const attempts = await cf('/payments'); const successful = attempts.filter(x => x.payment_status === 'SUCCESS');
      assert.equal(successful.length, 1); assert.equal(successful[0].payment_amount, 12.34);
      pass('Hosted simulator returned real provider SUCCESS', { paymentId: successful[0].cf_payment_id });
      for (let i = 0; i < 2; i++) {
        const response = await fetch(url + '/functions/v1/cashfree-verify-payment', { method: 'POST', headers: { apikey: key, authorization: 'Bearer ' + auth.session.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ orderId: payment.provider_order_id }) });
        const receipt = await response.json(); assert.equal(response.status, 200); assert.equal(receipt.paid, true); assert.equal(receipt.registrationConfirmed, true); assert.equal(receipt.refundRequired, false);
      }
      pass('Deployed Edge receipt confirms payment and seat on both replays');
      assert.equal(payment.amount_paisa, 1234); assert.equal(payment.entry_category_id, fixture.categories[0].id);
      const participants = await ok(buyer.from('tbl_event_participants').select('status').eq('event_id', fixture.eventId).eq('user_id', 116));
      assert.equal(participants.length, 1); assert.equal(participants[0].status, 'approved'); pass('Exactly one approved participation');
      const form = await rpc(buyer, 'get_activity_registration_form', { p_event_id: fixture.eventId });
      assert.equal(form.answers.length, 1); assert.equal(form.answers[0].question_id, fixture.questions[0].id); assert.equal(form.answers[0].value, 'Sandbox Acceptance');
      pass('Required registration answer persisted before paid admission');
      const financial = await ok(service.from('tbl_partner_financial_events').select('id').eq('payment_id', payment.id).eq('kind', 'PAYMENT'));
      assert.equal(financial.length, 1); pass('One PAYMENT ledger event after repeated verification');
      fs.writeFileSync('docs/chat001-integrated-hosted-checkout-proof.json', JSON.stringify({ status: 'PASS', recordedAt: new Date().toISOString(), release, eventId: fixture.eventId, userId: 116, paymentId: payment.id, environment: 'sandbox', scope: 'Actual hosted provider Sandbox; no real money or physical phone OTP proof.', checks, screenshots: [] }, null, 2) + '\n');
      console.log(JSON.stringify({ status: 'PASS', checks: checks.length, eventId: fixture.eventId, paymentId: payment.id }));
    }
  }
} finally { await Promise.allSettled([buyer.auth.signOut({ scope: 'local' }), host.auth.signOut({ scope: 'local' })]); }
