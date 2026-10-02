// Read-only retest against the pre-existing harmless QA post 36 in room 244.
// Never prints paths, bearer URLs, tokens or identity values.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'cxsznhrkzqndhseodcyy.supabase.co');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const clients = [1, 2].map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const ok = async promise => { const result = await promise; assert.ifError(result.error); return result.data; };
try {
  const auth = [];
  for (let i = 0; i < 2; i++) {
    auth.push((await ok(clients[i].auth.signInWithPassword({ email: process.env[`QA_EMAIL_${i+1}`], password: process.env[`QA_PASSWORD_${i+1}`] }))).user);
    assert.equal(Number(await ok(clients[i].rpc('get_current_app_user_id'))), 70 + i);
  }
  const viewer = clients[1];
  const page = await ok(viewer.rpc('community_list_posts', { p_room_id: 244 }));
  const post = page.items.find(p => p.id === 36); assert(post?.is_anonymous);
  const redacted = post.author_id === null && post.author?.id === null && post.author?.username === 'anonymous';
  const pathHidden = post.media_url === 'anonymous-media:36';
  const rawColumn = await viewer.from('tbl_community_posts').select('media_url').eq('id', 36);
  const fixturePath = `${auth[0].id}/post/qa-anonymous-media-acceptance-20261003.png`;
  const direct = await viewer.storage.from('communities').createSignedUrl(fixturePath, 60);
  console.log(JSON.stringify({ post: 36, room: 244, authorFieldsRedacted: redacted, mediaPathHidden: pathHidden, rawMediaColumnDenied: Boolean(rawColumn.error), directStorageSigningDenied: Boolean(direct.error) }));
  assert(redacted && pathHidden && rawColumn.error && direct.error, 'Anonymous media privacy repair is not fully deployed');
  const media = await ok(viewer.functions.invoke('community-media', { body: { roomId: 244, postIds: [36] } }));
  const link = media.urls?.['36']; assert.equal(typeof link, 'string');
  assert(!link.includes(auth[0].id)); assert(!link.includes('storage/v1'));
  const binary = await fetch(link); assert.equal(binary.status, 200); assert.match(binary.headers.get('content-type'), /image\/png/);
  assert((await binary.arrayBuffer()).byteLength > 0);
  const tampered = new URL(link); tampered.searchParams.set('token', tampered.searchParams.get('token').replace(/^36\./, '35.'));
  assert.equal((await fetch(tampered)).status, 403);
  const unauthenticated = await fetch(`${url}/functions/v1/community-media`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ roomId: 244, postIds: [36] }) });
  assert.equal(unauthenticated.status, 401);
  console.log(JSON.stringify({ anonymousImageRenders: true, noAuthorInUrl: true, tamperedLinkDenied: true, unauthenticatedMintDenied: true, productionPrivacy: 'PASS' }));
} finally { await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' }))); }
