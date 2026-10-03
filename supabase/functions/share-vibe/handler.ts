const APP_URL = 'https://wenitro-app.vercel.app';
type Row = Record<string, unknown>;
type Result = { data: Row | null; error?: unknown };
type Dependencies = {
  loadVibe: (id: number) => Promise<Result>;
  loadAuthor: (id: number) => Promise<Result>;
  loadAuthUser: (id: string) => Promise<Result>;
  signImage: (path: string) => Promise<string | null>;
  now?: () => number;
};
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const notFound = () => new Response('Vibe not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
function isVideo(value: string) {
  try { return /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|m3u8)$/i.test(decodeURIComponent(new URL(value, APP_URL).pathname)); }
  catch { return true; }
}
export function createShareVibeHandler(deps: Dependencies) {
  return async (request: Request) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get('id') || url.pathname.split('/').filter(Boolean).at(-1) || '';
    const vibeId = Number(rawId);
    if (!Number.isSafeInteger(vibeId) || vibeId < 1) return notFound();
    try {
      const { data: vibe, error } = await deps.loadVibe(vibeId);
      // This anonymous, service-backed endpoint must independently enforce the
      // audience. Never expose Activity media, even if a legacy row says public.
      if (error || !vibe || Number(vibe.id) !== vibeId || vibe.visibility !== 'public' || vibe.event_id != null) return notFound();
      const authorId = Number(vibe.user_id);
      if (!Number.isSafeInteger(authorId) || authorId < 1) return notFound();
      const { data: author, error: authorError } = await deps.loadAuthor(authorId);
      if (authorError || !author || Number(author.id) !== authorId || author.is_active !== 1 ||
        (author.is_delete != null && author.is_delete !== 0) || author.deactivated_at != null ||
        typeof author.auth_user_id !== 'string' || !author.auth_user_id) return notFound();
      const { data: authUser, error: authError } = await deps.loadAuthUser(author.auth_user_id);
      if (authError || !authUser || authUser.id !== author.auth_user_id || authUser.deleted_at != null) return notFound();
      const bannedUntil = authUser.banned_until;
      if (bannedUntil != null && (typeof bannedUntil !== 'string' || !Number.isFinite(Date.parse(bannedUntil)) || Date.parse(bannedUntil) > (deps.now?.() ?? Date.now()))) return notFound();

      // Author/lifecycle gates finish before signing. Never sign the source video
      // as an image or expose a private Activity's metadata through this endpoint.
      const poster = typeof vibe.thumbnail_url === 'string' ? vibe.thumbnail_url : '';
      const media = typeof vibe.media_url === 'string' ? vibe.media_url : '';
      const candidate = poster || (vibe.media_type === 'video' ? '' : media);
      let image = `${APP_URL}/wenitro-share.png`;
      if (candidate && !isVideo(candidate)) {
        if (/^https:\/\//i.test(candidate)) image = candidate;
        else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !candidate.startsWith('//')) image = await deps.signImage(candidate) || image;
      }
      const authorName = author.fullname || author.username || 'a WeNitro member';
      const title = 'WeNitro Vibe';
      const description = vibe.caption || `See this activity moment from ${authorName} on WeNitro.`;
      const canonical = `${APP_URL}/share/vibe/${vibeId}`;
      const destination = `${APP_URL}/#/vibe/${vibeId}`;
      const imageMeta = `<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(image)}">`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="canonical" href="${canonical}"><meta property="og:type" content="video.other"><meta property="og:site_name" content="WeNitro"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}">${imageMeta}<meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"></head><body style="font-family:system-ui;background:#0b1020;color:white;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:32px;text-align:center"><div style="font-weight:900;font-size:30px;color:#9c8aff">WeNitro</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><a style="display:inline-block;background:#6654da;color:white;padding:12px 20px;border-radius:12px;text-decoration:none" href="${destination}">Open in WeNitro</a></main><script>setTimeout(()=>location.replace(${JSON.stringify(destination)}),800)</script></body></html>`;
      // Do not retain a public HTML capability after an author's access changes.
      // Third-party services may independently cache previews outside our control.
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    } catch { return notFound(); }
  };
}
