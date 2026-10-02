import assert from 'node:assert/strict';
import { createMediaHandler, type MediaPost } from './handler.ts';

Deno.test('anonymous media capabilities enforce membership, expiry, privacy and range playback', async () => {
  let now = 1700000000000;
  let reads = 0;
  let lastRange: string | null = null;
  let mime = 'image/png';
  const rows: MediaPost[] = [
    { id: 1, room_id: 244, media_url: 'private-author-uuid/post/photo.png', is_anonymous: true, deleted_at: null },
    { id: 2, room_id: 245, media_url: 'other-author/post/photo.png', is_anonymous: true, deleted_at: null },
    { id: 3, room_id: 244, media_url: 'named-author/post/photo.png', is_anonymous: false, deleted_at: null },
  ];
  const handler = createMediaHandler({
    secret: 'test-only-secret-not-a-credential', baseUrl: 'https://example.test/community-media', now: () => now,
    authorizeRoom: async (auth, id) => auth === 'Bearer member' && id === 244,
    posts: async ids => rows.filter(row => ids.includes(row.id)),
    media: async (_path, range) => { reads++; lastRange = range; return new Response('binary fixture', { status: range ? 206 : 200, headers: { 'content-type': mime, 'content-range': 'bytes 0-13/14', 'x-owner': 'must-not-escape' } }); },
  });
  const post = (body: unknown, token = 'member', origin = 'https://wenitro-app.vercel.app') => handler(new Request('https://example.test/community-media', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, origin }, body: JSON.stringify(body),
  }));
  assert.equal((await post({ roomId: 244, postIds: [1] }, 'outsider')).status, 403);
  assert.equal((await post({ roomId: 245, postIds: [2] })).status, 403);
  assert.equal((await post({ roomId: 244, postIds: [1] }, 'member', 'https://evil.test')).status, 403);
  for (const bad of [null, {}, { roomId: 244, postIds: [0] }, { roomId: 244, postIds: Array(51).fill(1) }]) assert.equal((await post(bad)).status, 400);
  const response = await post({ roomId: 244, postIds: [1, 2, 3] });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.urls), ['1']);
  assert(!JSON.stringify(body).includes('author'));
  const url = body.urls['1'];
  const result = await handler(new Request(url));
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'binary fixture');
  assert.equal(result.headers.get('x-owner'), null);
  assert.equal(result.headers.get('location'), null);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  const before = reads;
  assert.equal((await handler(new Request(url.replace('token=1.', 'token=2.')))).status, 403);
  assert.equal(reads, before);
  mime = 'video/mp4';
  const range = await handler(new Request(url, { headers: { range: 'bytes=0-13' } }));
  assert.equal(range.status, 206); assert.equal(lastRange, 'bytes=0-13'); await range.text();
  assert.equal((await handler(new Request(url, { headers: { range: 'bytes=0-1,3-4' } }))).status, 416);
  mime = 'text/html';
  assert.equal((await handler(new Request(url))).status, 415);
  rows[0].deleted_at = '2026-10-03';
  assert.equal((await handler(new Request(url))).status, 404);
  rows[0].deleted_at = null;
  now += 3601000;
  assert.equal((await handler(new Request(url))).status, 403);
  assert.equal((await handler(new Request('https://example.test/community-media'))).status, 403);
  assert.equal((await handler(new Request('https://example.test/community-media', { method: 'POST' }))).status, 401);
});

Deno.test('upstream private errors are not returned to the client', async () => {
  const handler = createMediaHandler({ secret: 'test', baseUrl: 'https://example.test',
    authorizeRoom: async () => { throw new Error('private-author-uuid credential data'); },
    posts: async () => [], media: async () => new Response(),
  });
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify({ roomId: 244, postIds: [1] }) }));
  assert.equal(response.status, 503);
  assert(!((await response.text()).includes('private-author')));
});
