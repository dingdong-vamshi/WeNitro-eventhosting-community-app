export type MediaPost = { id: number; room_id: number; media_url: string; is_anonymous: boolean; deleted_at: string | null };
export type MediaDependencies = {
  secret: string;
  baseUrl: string;
  now?: () => number;
  authorizeRoom: (authorization: string, roomId: number) => Promise<boolean>;
  posts: (ids: number[], roomId?: number) => Promise<MediaPost[]>;
  media: (path: string, range: string | null) => Promise<Response>;
};

const origins = new Set(['https://wenitro-app.vercel.app', 'http://localhost:8081', 'http://127.0.0.1:8081']);
const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
// Match existing community signed-media lifetime so a long-lived feed or video
// does not expire earlier merely because the author chose Anonymous.
const ttl = 3600;
const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const encoder = new TextEncoder();

export function createMediaHandler(deps: MediaDependencies) {
  const key = crypto.subtle.importKey('raw', encoder.encode(`wenitro-anonymous-media-v1:${deps.secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const sign = async (value: string) => {
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(value)));
    return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  };
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = new Headers({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'vary': 'Origin' });
    if (origin && origins.has(origin)) headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, range');
    headers.set('access-control-allow-methods', 'POST, GET, HEAD, OPTIONS');
    headers.set('access-control-expose-headers', 'content-range, accept-ranges, content-length');
    const json = (status: number, body: unknown) => Response.json(body, { status, headers });
    if (origin && !origins.has(origin)) return json(403, { error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!deps.secret) return json(503, { error: 'Media temporarily unavailable' });
    const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
    try {
      if (request.method === 'POST') {
        const authorization = request.headers.get('authorization') || '';
        if (!/^Bearer \S+$/.test(authorization)) return json(401, { error: 'Authentication required' });
        const raw = await request.text();
        if (raw.length > 2048) return json(400, { error: 'Invalid media request' });
        let input: { roomId?: unknown; postIds?: unknown };
        try { input = JSON.parse(raw); } catch { return json(400, { error: 'Invalid media request' }); }
        if (!input || !positiveId(input.roomId) || !Array.isArray(input.postIds) || !input.postIds.length || input.postIds.length > 50 || !input.postIds.every(positiveId)) return json(400, { error: 'Invalid media request' });
        if (!await deps.authorizeRoom(authorization, input.roomId)) return json(403, { error: 'Community access required' });
        const ids = [...new Set(input.postIds as number[])];
        const rows = await deps.posts(ids, input.roomId);
        const urls: Record<string, string> = {};
        for (const row of rows) {
          if (!ids.includes(row.id) || row.room_id !== input.roomId || !row.is_anonymous || row.deleted_at || !row.media_url) continue;
          const payload = `${row.id}.${now + ttl}`;
          urls[String(row.id)] = `${deps.baseUrl}?token=${payload}.${await sign(payload)}`;
        }
        return json(200, { urls, expiresIn: ttl });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'Method not allowed' });
      const token = new URL(request.url).searchParams.get('token') || '';
      const match = /^(\d+)\.(\d+)\.([a-f0-9]{64})$/.exec(token);
      if (!match) return json(403, { error: 'Invalid media link' });
      const id = Number(match[1]), expires = Number(match[2]);
      if (!positiveId(id) || !Number.isSafeInteger(expires) || expires <= now || expires > now + ttl) return json(403, { error: 'Expired media link' });
      const signature = Uint8Array.from(match[3].match(/../g)!, pair => parseInt(pair, 16));
      if (!await crypto.subtle.verify('HMAC', await key, signature, encoder.encode(`${id}.${expires}`))) return json(403, { error: 'Invalid media link' });
      const row = (await deps.posts([id])).find(p => p.id === id && p.is_anonymous && !p.deleted_at);
      if (!row?.media_url) return json(404, { error: 'Media not found' });
      const range = request.headers.get('range');
      if (range && !/^bytes=\d*-\d*$/.test(range)) return json(416, { error: 'Invalid range' });
      const upstream = await deps.media(row.media_url, range);
      if (![200, 206].includes(upstream.status)) { await upstream.body?.cancel(); return json(404, { error: 'Media not found' }); }
      const mime = upstream.headers.get('content-type')?.split(';')[0].trim() || '';
      if (!mimeTypes.has(mime)) { await upstream.body?.cancel(); return json(415, { error: 'Unsupported media' }); }
      headers.set('content-type', mime);
      for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name); if (value) headers.set(name, value);
      }
      // Do not forward Storage URLs, metadata, owner IDs, redirects or errors.
      if (request.method === 'HEAD') await upstream.body?.cancel();
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
    } catch {
      return json(503, { error: 'Media temporarily unavailable' });
    }
  };
}
