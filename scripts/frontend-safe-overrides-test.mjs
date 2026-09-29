import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const communityChat = fs.readFileSync('src/components/community/reference-community.tsx', 'utf8');
const host = fs.readFileSync('src/components/hosting/host-activity-screen.tsx', 'utf8');
const feed = fs.readFileSync('src/components/reconstruction/feed-search.tsx', 'utf8');
const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
const squad = fs.readFileSync('src/components/reconstruction/squad.tsx', 'utf8');

const chat = app.slice(app.indexOf('export function ChatScreen'), app.indexOf('function GroupImageCropper'));
assert.match(chat, /Share Photo/);
assert.match(chat, /Create Poll/);
assert.doesNotMatch(chat, /Share Video/);
assert.match(communityChat, /Share Photo/);
assert.match(communityChat, /Create Poll/);
assert.doesNotMatch(communityChat, /Share Video/);

// Video remains available in the two explicitly supported publishing surfaces.
assert.match(app, /mediaTypes: \["images", "videos"\]/);
assert.match(app, /mediaType === "video" \? \["videos"\] : \["images"\]/);

assert.match(host, /label="Paid Activity"/);
assert.match(host, /draft\.isPaid && platformPayment \? <View[\s\S]*Entry Categories/);
assert.match(host, /No price or Pay Now flow is shown/);
assert.match(app, /HOST · ORIGINAL CREATOR/);

assert.equal((feed.match(/colors=\{\['#3420B8', '#6847F5'\]\}/g) || []).length, 2);
assert.doesNotMatch(feed, /#167C83/);
assert.match(profile, /\[tab, setTab\] = useState<Tab>\('My Vibes'\)/);
assert.match(profile, /\{tabError \? <View/);
assert.doesNotMatch(profile, /\{tabError && <View/);
assert.match(squad, /new Map\(profiles\.map\(profile => \[profile\.id, profile\]\)\)/);

for (const source of [app, communityChat, host]) assert.match(source, /Upload Responsibly/);

console.log('PASS: latest frontend-only client overrides are guarded without backend calls.');
