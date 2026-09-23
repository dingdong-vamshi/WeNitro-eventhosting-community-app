import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const host = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
const domain = fs.readFileSync('src/domain/host-activity.ts', 'utf8');
const payments = fs.readFileSync('src/services/payments.ts', 'utf8');
const stateMigration = fs.readFileSync('supabase/migrations/20260922192635_partner_paid_registration_state.sql', 'utf8');
const detail = app.slice(app.indexOf('export function ActivityDetailScreen'), app.indexOf('function ChatMessageVideo'));

assert.equal((host.match(/label="Paid Activity"/g) || []).length, 1);
assert.match(host, /isPartner \? <View[\s\S]*label="Paid Activity"/);
assert.match(host, /priceInr: isPartner && draft\.isPaid/);
assert.match(host, /secure Cashfree checkout/i);
assert.doesNotMatch(host, /payable to the organizer at the activity/i);
assert.match(domain, /d\.isPaid && !isPartner/);

for (const required of ['createActivityPayment', 'launchCashfreeCheckout', 'verifyActivityPayment', 'payment_required', 'Required registration questions']) {
  assert.equal(detail.includes(required), true, `Activity details must contain ${required}`);
}
assert.match(payments, /EXPO_PUBLIC_CASHFREE_MODE/);
assert.match(payments, /Platform\.OS === "web"/);
assert.match(stateMigration, /when event_row\.is_paid then 'payment_required'/);
assert.match(stateMigration, /when p_status='approved' and event_row\.is_paid then 'payment_required'/);

console.log('PASS: Partner-only paid hosting, Cashfree web checkout, provider verification, and payment-required registration states verified.');
