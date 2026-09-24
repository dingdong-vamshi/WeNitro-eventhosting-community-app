import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const app = fs.readFileSync('App.tsx', 'utf8');
const host = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
const domain = fs.readFileSync('src/domain/host-activity.ts', 'utf8');
const payments = fs.readFileSync('src/services/payments.ts', 'utf8');
const stateMigration = fs.readFileSync('supabase/migrations/20260922192635_partner_paid_registration_state.sql', 'utf8');
const detail = app.slice(app.indexOf('export function ActivityDetailScreen'), app.indexOf('function ChatMessageVideo'));

assert.equal((host.match(/label="Paid Activity"/g) || []).length, 1);
assert.doesNotMatch(host, /isPartner \? <View[\s\S]*label="Paid Activity"/);
assert.match(host, /priceInr: draft\.isPaid/);
assert.match(host, /secure Cashfree checkout/i);
assert.match(host, /Participants pay the host directly at the venue/);
assert.doesNotMatch(domain, /d\.isPaid && !isPartner/);
assert.match(detail, /requiresPlatformPayment = isPaidActivity && activity.paymentCollectionMode === "cashfree"/);
assert.match(detail, /Payment handled directly with the host at the venue/);

for (const required of ['createActivityPayment', 'launchCashfreeCheckout', 'verifyActivityPayment', 'payment_required', 'Required registration questions']) {
  assert.equal(detail.includes(required), true, `Activity details must contain ${required}`);
}
assert.match(payments, /EXPO_PUBLIC_CASHFREE_MODE/);
assert.match(payments, /Platform\.OS === "web"/);
assert.match(stateMigration, /when event_row\.is_paid then 'payment_required'/);
assert.match(stateMigration, /when p_status='approved' and event_row\.is_paid then 'payment_required'/);

const feedFile = 'src/components/reconstruction/feed-search.tsx';
const feed = fs.readFileSync(feedFile, 'utf8');
const feedAst = ts.createSourceFile(feedFile, feed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const labelDeclaration = feedAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'activityPriceLabel');
assert.ok(labelDeclaration);
const priceLabel = new Function(`${ts.transpile(labelDeclaration.getText(feedAst))}; return activityPriceLabel;`)();
assert.equal(priceLabel({ isPaid: true, price: '₹25' }), 'PAID · ₹25');
assert.equal(priceLabel({ isPaid: false, price: 'Free' }), 'FREE');
assert.equal(priceLabel({ isPaid: false, price: 'Costs may apply' }), 'Costs may apply');
assert.equal((feed.match(/\{activityPriceLabel\(a\)\}/g) || []).length, 2, 'Home and search cards show explicit payment classification');

console.log('PASS: dual paid hosting UI contract, on-site joining, and gated Cashfree checkout wiring verified. Live database behavior is verified separately.');
