import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const host = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
const cards = fs.readFileSync('src/components/reconstruction/feed-search.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260911112102_activity_price_onsite_information.sql', 'utf8');
const detail = app.slice(app.indexOf('export function ActivityDetailScreen'), app.indexOf('function ChatMessageVideo'));

assert.equal((host.match(/label="Paid Activity"/g) || []).length, 1);
assert.doesNotMatch(host, /label: 'Free', paid: false/);
assert.doesNotMatch(host, /label: 'Paid', paid: true/);
assert.match(host, /label="Activity Price"/);
assert.match(host, /priceInr: draft\.isPaid \? Number\(draft\.price\) : 0/);
assert.match(host, /costsMayApply: draft\.isPaid/);
assert.match(host, /entryFeeRequired: draft\.isPaid/);
assert.match(cards, /a\.price/);

for (const forbidden of ['Pay & Join', 'Opening Cashfree', 'Continue to payment', 'createActivityPayment', 'launchCashfreeCheckout', 'verifyActivityPayment']) {
  assert.equal(detail.includes(forbidden), false, `Activity details must not contain ${forbidden}`);
}

assert.match(migration, /drop trigger if exists enforce_partner_paid_hosting/);
assert.match(migration, /when event_row\.join_type = 'direct'[\s\S]*then 'approved'/);
assert.doesNotMatch(migration, /then 'payment_required'/);
assert.match(migration, /respond_activity_join/);
assert.match(migration, /Informational participation price in INR/);

console.log('PASS: single Paid Activity control, onsite-only price payload, card price data, direct/approval SQL, and Cashfree isolation verified.');
