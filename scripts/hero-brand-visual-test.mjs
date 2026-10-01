import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const sha256 = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const pngInfo = path => {
  const bytes = fs.readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} must be a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
};

const feed = read('src/components/reconstruction/feed-search.tsx');
const ui = read('src/components/reconstruction/ui.tsx');
const onboarding = read('src/components/onboarding/reference-screens.tsx');
const vibeIntro = read('src/components/onboarding/vibe-intro-slide.tsx');
const appConfig = JSON.parse(read('app.json')).expo;

const slides = [
  ['activities', 'client-activities.png', 'activities'],
  ['communities', 'client-communities.png', 'communities'],
  ['friends', 'client-friends.png', 'inviteSquad'],
  ['store', 'client-store.png', 'shop'],
];
let previous = -1;
for (const [id, asset, route] of slides) {
  const index = feed.indexOf(`id: '${id}'`);
  assert.ok(index > previous, `${id} must remain in the required carousel order`);
  previous = index;
  const block = feed.slice(index, feed.indexOf('\n  },', index) + 5);
  assert.ok(block.includes(`assets/hero/${asset}`), `${id} must use ${asset}`);
  assert.ok(block.includes(`screen: '${route}'`), `${id} must route to ${route}`);
}

const hero = feed.slice(feed.indexOf('{HERO_SLIDES.map(slide'), feed.indexOf('<View style={{ paddingHorizontal: 14 }}>'));
assert.doesNotMatch(hero, /<Text|<LinearGradient|slide\.(title|description|eyebrow|artwork)/,
  'The artwork must be the only visible copy, with no duplicate UI text or image overlays');
assert.match(hero, /source=\{slide.image\}/);
assert.match(hero, /resizeMode="contain"/);
assert.match(hero, /\.\.\.slide.ctaRegion, backgroundColor: 'transparent'/);
assert.match(feed, /HERO_ASPECT_RATIO = 1600 \/ 666/);
assert.match(feed, /carouselCardHeight = carouselCardWidth \/ HERO_ASPECT_RATIO/);

const heroHashes = {
  'assets/hero/client-activities.png': '6b8023bc7f098b7bef718477d9154d59b6aac248334324b62441ebe27e87f432',
  'assets/hero/client-communities.png': 'c23bd0b3ab0a2ca89a0ef20de6571080dee704176d042560ac85d985a13bd6d8',
  'assets/hero/client-friends.png': 'ee984d43c6d620d103d59855e461cdfd908f07de067c505c65ce87c2f3125420',
  'assets/hero/client-store.png': '1b4e7a0bd608a74c4a07707b73b72adf7a908ff8e0bc8bdf87e0dac01e742439',
};
for (const [path, expected] of Object.entries(heroHashes)) assert.equal(sha256(path), expected, `${path} must remain the exact supplied artwork`);

for (const behavior of [
  'HERO_AUTO_ADVANCE_MS = 4500',
  'AppState.addEventListener',
  'AccessibilityInfo.isReduceMotionEnabled',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'onPressIn',
  'onPressOut',
  'clearInterval(timer)',
  'go(slide.screen)',
]) assert.ok(feed.includes(behavior), `Missing hero behavior: ${behavior}`);
assert.match(feed, /carouselDragging \|\| carouselPressed \|\| !appActive \|\| reduceMotion/);
assert.ok(!feed.includes('hero-reward-claim-top-mask'));
assert.ok(!feed.includes('hero-reward-claim-edge-mask'));

const blue = 'assets/brand/wenitro-mark-blue.png';
const white = 'assets/brand/wenitro-mark-white.png';
const icon = 'assets/brand/wenitro-app-icon.png';
assert.equal(sha256(blue), 'a35ffee4b22123be59ddbaba51d3e4ffcc56e2aa51319a5086a152f25bf1612b', 'Blue mark must be the exact supplied transparent logo');
for (const path of [blue, white]) {
  const info = pngInfo(path);
  assert.deepEqual([info.width, info.height], [1439, 1117]);
  assert.ok(info.colorType === 4 || info.colorType === 6, `${path} must retain an alpha channel`);
}
assert.deepEqual(pngInfo(icon), { width: 1024, height: 1024, colorType: 2 });
for (const source of [ui, onboarding, vibeIntro]) assert.doesNotMatch(source, /wenitro-logo-transparent\.png|vibes-brand-mark\.png/);
assert.ok(ui.includes('assets/brand/wenitro-mark-blue.png'));
for (const asset of ['wenitro-mark-blue.png', 'wenitro-mark-white.png']) assert.ok(onboarding.includes(asset));
assert.ok(onboarding.includes('c.isDark ? logoWhite : logoBlue'));
assert.ok(vibeIntro.includes('assets/brand/wenitro-mark-white.png'));
assert.equal(appConfig.icon, './assets/brand/wenitro-app-icon.png');
assert.equal(appConfig.android.adaptiveIcon.backgroundColor, '#FFFFFF');
assert.equal(appConfig.android.adaptiveIcon.foregroundImage, './assets/brand/wenitro-app-icon.png');
const splash = appConfig.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')?.[1];
assert.equal(splash?.backgroundColor, '#6860F2');
assert.equal(splash?.image, './assets/brand/wenitro-mark-white.png');

console.log('PASS: exact supplied hero art without masking patches, lifecycle-aware carousel behavior, and official contrast-aware brand assets.');
