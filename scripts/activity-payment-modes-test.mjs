import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual pure production functions, without loading Expo or Supabase.
function loadFunction(file, name, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} must exist in ${file}`);
  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, ...globals };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports[name];
}
const map = loadFunction('src/components/reconstruction/feed-search.tsx', 'productionActivity', {
  activityTime: () => 'Later',
});
for (const [name, isPaid, paymentCollectionMode, priceInr] of [
  ['ordinary free', false, 'onsite', 0],
  ['ordinary paid onsite', true, 'onsite', 250],
  ['Partner free', false, 'onsite', 0],
  ['Partner paid platform', true, 'cashfree', 250],
]) {
  const activity = map({ id: name, title: name, isPaid, paymentCollectionMode, priceInr, coverUrl: 'https://example.test/cover.jpg' });
  assert.equal(activity.isPaid, isPaid, `${name}: paid state must survive list-to-detail mapping`);
  assert.equal(activity.paymentCollectionMode, paymentCollectionMode, `${name}: collection mode must survive mapping`);
  assert.equal(activity.price, isPaid ? '₹250' : 'Free', `${name}: price label`);
}

const mode = loadFunction('src/components/hosting/host-activity-screen.tsx', 'hostPaymentCollectionMode');
assert.equal(mode(undefined, false), 'onsite', 'ordinary new paid hosting is onsite');
assert.equal(mode(undefined, true), 'cashfree', 'approved Partner new paid hosting uses Cashfree');
assert.equal(mode({ isPaid: true, paymentCollectionMode: 'onsite', price: '₹250' }, true), 'onsite', 'Partner approval must not relabel an existing onsite activity');
assert.equal(mode({ isPaid: true, paymentCollectionMode: 'cashfree', price: '₹250' }, false), 'cashfree', 'suspension must not relabel an existing platform activity');
assert.equal(mode({ paymentCollectionMode: 'onsite', price: '₹250' }, true), 'onsite', 'legacy paid price fallback retains mode');
assert.equal(mode({ isPaid: false, paymentCollectionMode: 'onsite', price: 'Free' }, true), 'cashfree', 'making a free activity paid uses current server-approved capability');

// These are migration SOURCE checks, not claims of running SQL or checkout.
const sql = fs.readFileSync('supabase/migrations/20260924083715_activity_dual_payment_modes.sql', 'utf8');
assert.match(sql, /case when private\.has_active_partner\(new.created_by\) then 'cashfree' else 'onsite' end/,
  'server must choose mode, ignoring a client-requested platform mode');
assert.match(sql, /new\.payment_collection_mode := old\.payment_collection_mode/,
  'existing paid collection mode is preserved');
for (const rpc of ['request_join_activity(integer,text)', 'respond_activity_join(integer,integer,text)', 'redeem_activity_invite(text)']) {
  assert.ok(sql.includes(rpc), `${rpc} must receive the dual-mode join gate`);
}
assert.ok(sql.includes("event_row.is_paid and event_row.payment_collection_mode=''cashfree'' then"),
  'onsite joining must not require platform payment');
const checkout = fs.readFileSync('supabase/migrations/20260922201451_partner_release_integrity.sql', 'utf8');
assert.match(checkout, /if event_row\.payment_collection_mode<>'cashfree' then\s+raise exception 'Online checkout is unavailable'/,
  'server-side checkout must reject onsite activities');

console.log('PASS: four activity mode mappings, six host mode cases, and dual-mode SQL source guards. No database writes, checkout, or SMS executed.');
