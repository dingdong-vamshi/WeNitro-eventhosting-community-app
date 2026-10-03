// Read-only retest against the pre-existing harmless QA post 36 in room 244.
// Never prints paths, bearer URLs, tokens or identity values.
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const expired = new URL(link); expired.searchParams.set('token', `36.${Math.floor(Date.now()/1000)-1}.${'0'.repeat(64)}`);
  assert.equal((await fetch(expired)).status, 403);
  const head = await fetch(link, { method: 'HEAD' }); assert.equal(head.status, 200);
  assert.equal(head.headers.get('location'), null);
  assert.equal(head.headers.get('cache-control'), 'private, no-store');
  const range = await fetch(link, { headers: { Range: 'bytes=0-7' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 8);
  const invalidRange = await fetch(link, { headers: { Range: 'bytes=0-1,3-4' } }); assert.equal(invalidRange.status, 416);
  const listing = await ok(viewer.storage.from('communities').list(`${auth[0].id}/post`, { search: 'qa-anonymous-media-acceptance-20261003.png' }));
  assert.equal(listing.length, 0);
  const download = await viewer.storage.from('communities').download(fixturePath); assert(download.error);
  const owner = await clients[0].storage.from('communities').createSignedUrl(fixturePath, 60); assert.ifError(owner.error);
  const otherRoom = await ok(viewer.functions.invoke('community-media', { body: { roomId: 244, postIds: [34] } }));
  assert.deepEqual(otherRoom.urls, {});
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    await ok(admin.auth.signInWithPassword({email:process.env.QA_EMAIL_ADMIN,password:process.env.QA_PASSWORD_ADMIN}));
    const audit = await ok(admin.rpc('admin_list_anonymous_community_posts', {p_limit:100}));
    assert.equal(audit.find(p=>p.id===36)?.user_id,70);
    const adminPage = await admin.rpc('community_list_posts', {p_room_id:244});
    assert(adminPage.error, 'Nonmember Admin uses the audit endpoint, not member feed access');
    const deniedAudit = await viewer.rpc('admin_list_anonymous_community_posts', {p_limit:100}); assert(deniedAudit.error);
  } finally { await admin.auth.signOut({scope:'local'}); }
  const unauthenticated = await fetch(`${url}/functions/v1/community-media`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ roomId: 244, postIds: [36] }) });
  assert.equal(unauthenticated.status, 401);
  console.log(JSON.stringify({ anonymousImageRenders: true, noAuthorInUrl: true, tamperedLinkDenied: true, unauthenticatedMintDenied: true, productionPrivacy: 'PASS' }));
  const proof={checkedAt:new Date().toISOString(),target:new URL(url).hostname,post:36,room:244,checks:{authorRedacted:redacted,pathHidden,rawColumnDenied:true,directSigningDenied:true,directDownloadDenied:true,storageListingHidden:true,ownerAccess:true,adminAttribution:true,memberAuditDenied:true,opaqueImageRenders:true,tamperingDenied:true,expiredTimestampDenied:true,head:true,rangePlayback:true,multipleRangesDenied:true,unauthenticatedMintDenied:true,namedPostNotProxied:true},scope:'Expired timestamp rejected in production; authentic token expiry and deleted-post revocation also tested with controlled clock/fixtures in local handler tests.'};
  fs.writeFileSync('docs/chat001-anonymous-media-live-proof.json',JSON.stringify(proof,null,2)+'\n');
} finally { await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' }))); }
