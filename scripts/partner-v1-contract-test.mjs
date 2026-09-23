import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const schema = [
  'supabase/migrations/20260922192250_partner_ecosystem_v1.sql',
  'supabase/migrations/20260922192504_partner_ecosystem_v1_hardening.sql',
  'supabase/migrations/20260922192635_partner_paid_registration_state.sql',
  'supabase/migrations/20260922192930_partner_notifications_audit.sql',
  'supabase/migrations/20260922193123_partner_admin_auth_attribution.sql',
  'supabase/migrations/20260922193354_partner_payout_validation.sql',
  'supabase/migrations/20260922201451_partner_release_integrity.sql',
  'supabase/migrations/20260922202207_partner_payment_reservation_hardening.sql',
  'supabase/migrations/20260922202828_partner_profile_read_privacy.sql',
].map(read).join('\n');
const cashfree = read('supabase/functions/_shared/cashfree.ts');
const webhook = read('supabase/functions/cashfree-webhook/index.ts');

for (const status of ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
  assert.match(schema, new RegExp(`['\"]${status}['\"]`));
}
assert.match(schema, /Only an approved Partner can host paid activities/);
assert.match(schema, /platform_fee_bps integer not null default 1000/);
assert.match(schema, /gst_enabled boolean not null default false/);
assert.match(schema, /gst_basis text not null default 'disabled'/);
assert.doesNotMatch(schema, /gst_bps integer not null default 1800/);
assert.match(schema, /payment_collection_mode in \('cashfree','onsite'\)/);
assert.match(schema, /CAPACITY_UNAVAILABLE_AFTER_PAYMENT/);
assert.match(schema, /financial_status='REFUND_REQUIRED'/);
assert.match(schema, /status in \('PENDING','PROCESSING','PAID','FAILED','ON_HOLD'\)/);
assert.match(schema, /Settlement is not eligible until the activity has ended/);
assert.match(schema, /Approved payout details are required before settlement/);
assert.match(schema, /Settlement has an unresolved refund or dispute/);
assert.match(schema, /when event_row\.is_paid then 'payment_required'/);
assert.match(schema, /reviewed_by_auth_user_id/);
assert.match(schema, /partner_payout_destination_valid/);
assert.match(schema, /\^\[A-Z\]\{4\}0\[A-Z0-9\]\{6\}\$/);
assert.match(schema, /Exactly one complete payout method/);
assert.match(schema, /PAYOUT_ACCOUNT_CHANGED/);
assert.match(schema, /provider_payment_unique/);
assert.match(schema, /Conflicting paid-payment replay/);
assert.match(schema, /Paid settlements are terminal/);
assert.match(schema, /claim_cashfree_webhook_event/);
assert.match(schema, /alter function public\.submit_partner_application\(jsonb\) security definer/);
assert.match(schema, /me integer:=public\.current_app_user_id\(\)/);
assert.match(schema, /revoke select on table public\.tbl_partner_profiles from authenticated/);
assert.match(schema, /drop policy if exists partner_profile_owner_read on public\.tbl_partner_profiles/);

assert.match(cashfree, /https:\/\/sandbox\.cashfree\.com/);
assert.match(cashfree, /https:\/\/api\.cashfree\.com/);
assert.match(cashfree, /environment === "production" \|\| environment === "live"/);
assert.doesNotMatch(cashfree, /locked to TEST\/SANDBOX mode/);
assert.match(webhook, /claim_cashfree_webhook_event/);
assert.match(webhook, /replayed: true/);
assert.match(webhook, /retryable: true/);
assert.match(webhook, /claim\.data !== "CLAIMED"/);
assert.match(webhook, /status: "PROCESSED"/);

console.log('Partner V1 contract regression: PASS');
