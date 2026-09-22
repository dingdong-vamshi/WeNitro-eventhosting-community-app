import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const app = read('App.tsx');
const messages = read('src/components/reconstruction/messages.tsx');
const profile = read('src/components/reconstruction/profile.tsx');
const settings = read('src/components/reconstruction/settings.tsx');
const share = read('src/services/internal-share.ts');
const security = read('supabase/migrations/20260922184242_client_pdf_security_completion.sql');
const community = read('supabase/migrations/20260922184236_community_chat_contract_recovery.sql');
const profileReviews = read('supabase/migrations/20260922184855_profile_reviews_contract.sql');
const profileSelfRepair = read('supabase/migrations/20260922185908_authenticated_profile_self_repair.sql');
const profileSelfRepairHardening = read('supabase/migrations/20260922190113_harden_authenticated_profile_self_repair.sql');
const profileOnboarding = read('src/services/profile-onboarding.ts');
const edge = read('supabase/functions/share-vibe/index.ts');
const vercel = read('vercel.json');
const legal = read('src/components/onboarding/reference-screens.tsx');

const includesAll = (source, values) => values.forEach(value => assert.ok(source.includes(value), `Missing ${value}`));

includesAll(legal, ['https://wenitro.com/terms-and-conditions.html', 'https://wenitro.com/privacy-policy.html']);
includesAll(app, ['errorText={name ? validateFullName(name).error : null}', 'errorText={email ? validateEmail(email).error : null}']);
includesAll(app, ['redeemPendingReferral', 'redeemPendingActivityInvite', 'createActivityInvite', "'ensure_activity_chat'"]);
includesAll(app, ['setReportOpen(true)', 'vibesProductionService.report', 'onEndReached', 'ListFooterComponent']);
assert.ok(!app.includes('Free activity - Free to join'));
assert.ok(!app.includes('V-Nitro Store'));
includesAll(messages, ['Mark all seen', 'markAllStoriesSeen', 'storiesProductionService.markViewed']);
includesAll(settings, ['BLOCKED CHATS', 'list_my_blocked_users', 'unblock_chat_user']);
includesAll(profile, ['Set as primary', 'Change photo', 'removePrimaryProfilePhoto', "setTab('Reviews')"]);
includesAll(profile, ['profile_reviews', 'rater_avatar', 'event_title']);
includesAll(share, ['https://wenitro-app.vercel.app', '/share/vibe/']);
includesAll(app, ['recordShare(vibe.id, "copy_link")', 'recordShare(vibe.id, "external")']);
includesAll(edge, ['og:title', 'og:description', 'og:image', '.eq("visibility", "public")']);
assert.match(vercel, /share\/vibe\/:id/);

includesAll(security, [
  'create_activity_invite', 'redeem_activity_invite', 'ensure_activity_chat',
  'sync_activity_chat_member', 'users_blocked', 'block_chat_user', 'unblock_chat_user',
  'list_my_blocked_users', 'list_chat_inbox', 'redeem_referral', 'my_trust_score',
  'profile_trust_score', 'save_my_profile_photo', 'promote_my_profile_photo',
  'delete_my_primary_profile_photo', 'report_vibe', 'private.profile_contact',
]);
includesAll(community, ['community_create_post', 'community_poll', 'create_group_chat_room', 'community_manage']);
includesAll(profileReviews, ['profile_reviews', 'private.can_read_profile', 'tbl_participant_ratings']);
includesAll(profileSelfRepair, ['bootstrap_my_profile', 'auth.uid()', 'Email matches multiple legacy accounts', 'Phone matches multiple legacy accounts']);
includesAll(profileSelfRepairHardening, ['set schema private', 'security invoker', 'grant usage on schema private to authenticated']);
includesAll(profileOnboarding, ['supabase.rpc("bootstrap_my_profile")']);
assert.match(security, /p\.status in \('pending','approved','waitlist','invited','payment_required','going','paid'\)/);
assert.match(security, /points_awarded\)\s+values\(p_referrer_id,me,10\)/);
assert.match(security, /least\(total_value,100\)/);

console.log('PASS: client-PDF auth, Activity security/chat, Vibes sharing/reporting, community/chat, blocking, profile gallery, Trust Score, legal-link and unread-state contracts are present.');
