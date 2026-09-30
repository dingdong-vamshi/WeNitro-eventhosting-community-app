import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

let authUserId = 'auth-a';
const calls = [];
const backend = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: authUserId } } }, error: null }),
  },
  storage: {
    from: bucket => ({
      createSignedUrls: async (paths, expiresIn) => {
        calls.push({ bucket, paths: [...paths], expiresIn, authUserId });
        return {
          data: paths.map(path => path === 'missing.jpg'
            ? { path, signedUrl: '', error: 'not found' }
            : { path, signedUrl: `https://signed.invalid/${authUserId}/${bucket}/${path}`, error: null }),
          error: null,
        };
      },
    }),
  },
};

const source = fs.readFileSync('src/services/storage-signed-urls.ts', 'utf8');
const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const api = {};
new Function('exports', 'require', code)(api, name => {
  assert.equal(name, '../lib/supabase');
  return { supabase: backend };
});

const first = await api.signedUrlMap('vibes', ['a.jpg', 'a.jpg', 'missing.jpg'], 3600);
assert.equal(calls.length, 1, 'duplicate object paths are signed in one batch');
assert.deepEqual(calls[0].paths, ['a.jpg', 'missing.jpg']);
assert.match(first.get('a.jpg'), /auth-a/);
assert.equal(first.has('missing.jpg'), false, 'one missing object is isolated from healthy media');

await api.signedUrlMap('vibes', ['a.jpg'], 3600);
assert.equal(calls.length, 1, 'a valid signed URL is reused within its TTL');

authUserId = 'auth-b';
const secondAccount = await api.signedUrlMap('vibes', ['a.jpg'], 3600);
assert.equal(calls.length, 2, 'signed URL caches are isolated by authenticated identity');
assert.match(secondAccount.get('a.jpg'), /auth-b/);

const remote = await api.signedUrlMap('vibes', ['https://cdn.invalid/public.jpg'], 3600);
assert.equal(calls.length, 2, 'already-served URLs do not call Storage signing');
assert.equal(remote.get('https://cdn.invalid/public.jpg'), 'https://cdn.invalid/public.jpg');

console.log('PASS: private media paths are deduplicated, batch-signed, TTL-cached, identity-scoped and failure-isolated.');
