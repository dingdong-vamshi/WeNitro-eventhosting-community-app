import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const signed = [], batches = [], removed = [];
let failMedia = false;
const query = { select() { return this; }, in() { return this; }, is() { return this; }, then(resolve) { resolve({ data: [], error: null }); } };
const backend = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'test-author' } } } }) },
  from: () => query,
  rpc: async name => ({ error: null, data: name === 'get_current_legacy_user_id' ? 70 : name === 'community_create_post_v2' ? { id: 3, is_anonymous: true } : { items: [
    { id: 1, room_id: 244, is_anonymous: true, media_url: 'anonymous-media:1', author_id: null },
    // Covers legacy response during coordinated migration: never sign its path.
    { id: 2, room_id: 244, is_anonymous: true, media_url: 'test-author/post/legacy.png', author_id: null },
    { id: 4, room_id: 244, is_anonymous: false, media_url: 'named-author/post/image.png', author_id: 71 },
  ], total: 3 } }),
  functions: { invoke: async (name, input) => {
    assert.equal(name, 'community-media'); batches.push(input.body);
    return failMedia ? { error: Error('private error') } : { data: { urls: Object.fromEntries(input.body.postIds.map(id => [id, `https://proxy.invalid/?token=${id}`])) }, error: null };
  } },
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async paths => { removed.push(...paths); return { error: null }; } }) },
};
const api = {};
new Function('exports', 'require', ts.transpile(fs.readFileSync('src/services/communities-production.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(api, name => {
  if (name === '../lib/supabase') return { isSupabaseConfigured: true, supabase: backend };
  assert.equal(name, './storage-signed-urls');
  return { signedUrlMap: async (_bucket, paths) => { signed.push(paths); return new Map(paths.map(path => [path, `https://storage.invalid/${path}`])); }, signedUrl: async () => { throw Error('unexpected per-item signing'); } };
});
const page = await api.getCommunityFeed('244');
assert.deepEqual(batches, [{ roomId: 244, postIds: [1, 2] }]);
assert.deepEqual(signed, [['named-author/post/image.png']]);
assert.equal(page.items[0].mediaUrl, 'https://proxy.invalid/?token=1');
assert.equal(page.items[1].mediaUrl, 'https://proxy.invalid/?token=2');
assert.equal(page.items[2].mediaUrl, 'https://storage.invalid/named-author/post/image.png');
failMedia = true;
await assert.rejects(api.getCommunityFeed('244'), /Could not load community media/);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('qa image', { headers: { 'content-type': 'image/png' } });
  const saved = await api.createCommunityPost({ communityId: '244', title: 'QA', anonymous: true, image: 'data:image/png,qa' });
  assert.equal(saved.id, '3'); assert.equal(saved.mediaUrl, null);
  assert.deepEqual(removed, [], 'A preview failure cannot delete successfully committed post media');
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: one anonymous media batch, no anonymous Storage signing, normal media batch, safe error, committed upload preserved.');
