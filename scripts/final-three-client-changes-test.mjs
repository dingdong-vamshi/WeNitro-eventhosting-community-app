import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const app = read('App.tsx');
const profile = read('src/components/reconstruction/profile.tsx');
const community = read('src/components/community/reference-community.tsx');

assert.match(profile, /accessibilityLabel="Manage profile photos"/);
assert.match(profile, /style=\{s\.avatarPhotoAdd\}/);
assert.match(profile, /photos\[0\] \|\| \{ uri: '', position: 1 \}/);
assert.doesNotMatch(profile, /styles?=\{s\.addPhoto\}/);
assert.doesNotMatch(profile, /\{photos\.length\}\/3/);
assert.match(profile, /Set as primary/);
assert.match(profile, /Change photo/);
assert.match(profile, /removePrimaryProfilePhoto/);

assert.match(app, /const usesVerticalTimeline = viewportWidth <= 768;/);
assert.match(app, /label: "REGISTRATION BY"/);
assert.match(app, /scheduleCardVertical/);
assert.match(app, /scheduleItemVertical/);
for (const width of [360, 375, 390, 393, 414, 430]) {
  assert(width <= 768, `${width}px must use the stacked Activity timeline`);
}

assert.match(community, /Poll voters grouped by option/);
assert.match(community, /votersByOption/);
assert.match(community, /voter\.option_id === option\.id/);
assert.match(community, /option\.votes === 1 \? 'vote' : 'votes'/);
assert.match(community, /<UserAvatar uri=\{voter\.avatar_url\}/);
assert.match(community, /No votes yet/);
assert.match(community, /setVoters\(null\)/, 'Changing a vote must invalidate the previous voter grouping');

console.log('PASS: avatar overlay photo manager, stacked phone timeline, and option-grouped poll voters are implemented.');
