import assert from 'node:assert/strict';
import fs from 'node:fs';

const feed = fs.readFileSync('src/components/reconstruction/feed-search.tsx', 'utf8');
for (const id of ['activities', 'communities', 'friends', 'store']) assert.match(feed, new RegExp(`id: '${id}'`));
for (const asset of ['hero-activities.jpeg', 'hero-communities.jpeg', 'hero-friends.jpeg', 'hero-store.jpeg']) assert.ok(feed.includes(`assets/hero/${asset}`));
for (const label of ['Explore activities', 'Explore communities', 'Invite friends', 'Visit Nitro Store']) assert.ok(feed.includes(label));
assert.match(feed, /setInterval/);
assert.match(feed, /HERO_AUTO_ADVANCE_MS = 4500/);
assert.match(feed, /pagingEnabled/);
assert.match(feed, /onMomentumScrollEnd/);
assert.match(feed, /AppState\.addEventListener\('change'/);
assert.match(feed, /onScrollBeginDrag/);
assert.match(feed, /onPressIn/);
assert.match(feed, /onPressOut/);
assert.match(feed, /hero-reward-claim-top-mask/);
assert.match(feed, /hero-reward-claim-edge-mask/);
assert.match(feed, /go\(slide\.screen\)/);
assert.match(feed, /home-notification-unread:/);
assert.match(feed, /notificationCount=\{notificationCount\}/);

const settings = fs.readFileSync('src/components/reconstruction/settings.tsx', 'utf8');
const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
const utilities = fs.readFileSync('src/components/reconstruction/profile-utilities.tsx', 'utf8');
for (const source of [feed, settings, profile, utilities]) assert.doesNotMatch(source, /V-Nitro|V Nitro/);
for (const label of ['About', 'Interests', 'Communities']) assert.ok(profile.includes(label));
assert.match(profile, /my_trust_score/);
assert.match(profile, /profile_trust_score/);
assert.match(utilities, /activities_joined: Number\(metrics\?\.activities_joined \?\? 0\)/);
assert.doesNotMatch(utilities, /activities_joined: Number\(metrics\?\.activities \?\? 0\)/);
assert.match(settings, /list_my_blocked_users/);
assert.match(settings, /unblock_chat_user/);
assert.match(settings, /p_user_id: user\.id/);

console.log('PASS: native Home hero behavior, live notification badge, Nitro naming, profile summary/Trust wiring, and reversible blocked-chat UI.');
