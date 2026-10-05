import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const queries = [], signing = [];
let fail = false;
const backend = { from(table) {
  assert.equal(table, 'tbl_chat_rooms');
  const query = { select: '', type: '', ids: [] }; queries.push(query);
  return {
    select(columns) { query.select = columns; return this; },
    eq(column, value) { assert.equal(column, 'room_type'); query.type = value; return this; },
    async in(column, ids) {
      assert.equal(column, 'id'); query.ids = ids;
      return { error: fail ? new Error('denied') : null, data: ids.filter(id => id !== 4).map(id => ({ id, image_url: id === 1 ? 'https://cdn.invalid/community.png' : id === 2 ? 'media/communities/2/avatar.png' : null })) };
    },
  };
} };
const api = {};
const code = ts.transpile(fs.readFileSync('src/services/communities-production.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
new Function('exports', 'require', code)(api, name => {
  if (name === '../lib/supabase') return { isSupabaseConfigured: true, supabase: backend };
  if (name === './content-moderation') return { ContentModerationError: class extends Error {}, moderatePublicContent: async () => ({ status: 'safe' }), moderationArrayValue: values => (values ?? []).join('\n') };
  assert.equal(name, './storage-signed-urls');
  return { signedUrlMap: async (bucket, paths, ttl) => { signing.push({ bucket, paths, ttl }); return new Map(paths.map(path => [path, `https://signed.invalid/${path}`])); } };
});
assert.equal((await api.communityAvatarUrls([])).size, 0);
assert.equal(queries.length, 0, 'empty lists do not query');
const urls = await api.communityAvatarUrls(['1', '2', '2', '3', '4', 'bad', '-1', '0']);
assert.deepEqual(queries[0], { select: 'id,image_url', type: 'community', ids: [1, 2, 3, 4] });
assert.equal(urls.get('1'), 'https://cdn.invalid/community.png');
assert.equal(urls.get('2'), 'https://signed.invalid/2/avatar.png');
assert.equal(urls.has('3'), false, 'no-image community uses UI fallback');
assert.equal(urls.has('4'), false, 'RLS-filtered row is never reconstructed');
assert.deepEqual(signing, [{ bucket: 'communities', paths: ['2/avatar.png'], ttl: 3600 }]);
await api.communityAvatarUrls(Array.from({ length: 101 }, (_, i) => String(i + 10)));
assert.deepEqual(queries.slice(1).map(query => query.ids.length), [50, 50, 1], 'bounded batched reads, not one per picture');
assert.equal(signing.length, 1, 'no signing request for empty image sets');
fail = true;
await assert.rejects(api.communityAvatarUrls(['1']), /denied/);
const profile = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
assert.match(profile, /if \(tab === 'Communities'\) return <ProfileCommunities/);
assert.match(profile, /name: room.name, image: room.image/);
assert.match(profile, /<UserAvatar uri=\{community.image \|\| avatars.get/);
assert.match(profile, /Retry community pictures/);
assert.match(profile, /return \(\) => \{ active = false; \}/);
const detail = fs.readFileSync('src/components/community/community-info.tsx', 'utf8');
assert.match(detail, /<UserAvatar uri=\{community.imageUrl\}/);
assert.equal((detail.match(/<UserAvatar uri=\{member.profiles\?\.avatar_url\}/g) || []).length, 2, 'Member stack and member list both render real avatars with fallbacks');
assert.match(detail, /requestInternalShare\(\{ kind: 'community', id,/);
assert.doesNotMatch(detail, /wenitro:\/\/community/);
const shareApi = {}, shares = [];
new Function('exports', 'require', ts.transpile(fs.readFileSync('src/services/internal-share.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(shareApi, name => {
  assert.equal(name, 'react-native');
  return { Platform: { OS: 'web' }, Share: { sharedAction: 'sharedAction', share: async payload => { shares.push(payload); return { action: 'sharedAction' }; } } };
});
await shareApi.shareEntityExternally({ kind: 'community', id: '123', title: 'QA Community', preview: 'QA preview' });
assert.equal(shares[0].url, 'https://wenitro-app.vercel.app/#/community/123');
assert.match(shares[0].message, /Shared from WeNitro/);
const shareModal = fs.readFileSync('src/components/ShareToChatModal.tsx', 'utf8');
assert.match(shareModal, /<UserAvatar uri=\{target.avatar\} name=\{target.name\}/);
assert.doesNotMatch(shareModal, /<Image source=\{\{ uri: target.avatar \}\}/);
const app = fs.readFileSync('App.tsx', 'utf8');
assert.match(app, /<UserAvatar uri=\{post.authorAvatar\} name=\{post.author\} size=\{34\}/);
assert.match(app, /!postsLoading && !postsError && !visible.length/);
assert.match(app, /accessibilityLabel="Retry community posts"/);
assert.match(app, /\[community.id, postsRetry\]/);
console.log('PASS: community avatar batching, RLS result isolation, URL signing, fallback, lazy rendering and failure retry contracts. No remote writes.');
