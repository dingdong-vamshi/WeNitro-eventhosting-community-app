import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const service = fs.readFileSync('src/services/partner-account.ts', 'utf8');
const screen = fs.readFileSync('src/components/partner-account-screen.tsx', 'utf8');
const dashboardService = fs.readFileSync('src/services/partner-production.ts', 'utf8');
const dashboard = fs.readFileSync('src/components/partner-dashboard.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');

assert.match(service, /"UNDER_REVIEW"/);
assert.match(service, /"APPROVED"/);
assert.match(service, /submit_partner_application/);
assert.doesNotMatch(service, /save_my_partner_profile/);
for (const field of ['activity_types', 'activity_location', 'age_category', 'account_number', 'ifsc', 'upi_id']) {
  assert.equal(service.includes(field), true, `Partner application must include ${field}`);
}
assert.match(screen, /Settlement destination/);
assert.match(screen, /Re-enter the full destination/);
assert.match(dashboardService, /expected_net_paisa/);
assert.match(dashboardService, /settlement_status/);
assert.match(dashboardService, /financial_status/);
assert.match(dashboard, /Approve for payment/);
assert.match(dashboard, /A settlement is paid only when a payout reference is recorded/);
assert.match(app, /accountType: result\.can_host_paid \? "partner" : "individual"/);
assert.match(app, /isPartner=\{data\.accountType === "partner"\}/);
assert.match(app, /"Become a Partner"/);
assert.match(profile, /partnerAccount=\{\{ label: partnerLabel/);
assert.match(profile, /'Become a Partner'/);

const compiled = ts.transpile(service, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const serviceModule = { exports: {} };
new Function('exports', 'require', compiled)(serviceModule.exports, name => {
  assert.equal(name, '../lib/supabase');
  return { supabase: {} };
});
const valid = {
  business_name: 'Trail Club', description: '', city: 'Pune', activity_types: ['Outdoors'],
  activity_location: 'Pune district', age_category: '18+', bank_name: 'Example Bank',
  account_holder_name: 'Sample Partner', account_number: '1234567890', ifsc: 'ABCD0123456', upi_id: '',
};
assert.equal(serviceModule.exports.validatePartnerAccount(valid), null);
assert.equal(serviceModule.exports.validatePartnerAccount({ ...valid, activity_types: [] }), 'Choose between 1 and 20 activity types.');
assert.equal(serviceModule.exports.validatePartnerAccount({ ...valid, account_number: '', bank_name: '', account_holder_name: '', ifsc: '', upi_id: 'partner@upi' }), null);
assert.match(serviceModule.exports.validatePartnerAccount({ ...valid, account_number: '', upi_id: '' }), /bank account or UPI/);

const paymentSource = fs.readFileSync('src/services/payments.ts', 'utf8');
const paymentCompiled = ts.transpile(paymentSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const paymentModule = { exports: {} };
const environment = { env: {} };
new Function('exports', 'require', 'process', '__DEV__', paymentCompiled)(paymentModule.exports, name => {
  if (name === 'react-native') return { Platform: { OS: 'ios' } };
  if (name === '../lib/supabase') return { supabase: {} };
  throw new Error(`Unexpected dependency: ${name}`);
}, environment, false);
assert.equal(paymentModule.exports.cashfreeCheckoutAvailability().available, false);
assert.throws(() => paymentModule.exports.cashfreeMode(), /required for production/);
environment.env.EXPO_PUBLIC_CASHFREE_MODE = 'production';
assert.equal(paymentModule.exports.cashfreeMode(), 'production');

console.log('PASS: reviewed Partner application, protected payout UX, approved capability, and settlement dashboard contract verified.');
