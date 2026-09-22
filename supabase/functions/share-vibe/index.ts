import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const APP_URL = "https://wenitro-app.vercel.app";
const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try { return JSON.parse(modern).default as string; } catch { /* legacy fallback below */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).at(-1) || "";
  const vibeId = Number(rawId);
  if (!Number.isSafeInteger(vibeId) || vibeId < 1) return new Response("Vibe not found", { status: 404 });

  const admin = createClient(Deno.env.get("SUPABASE_URL") || "", secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: vibe, error } = await admin.from("tbl_activity_vibes")
    .select("id,event_id,user_id,caption,media_url,thumbnail_url,media_type,visibility")
    .eq("id", vibeId).eq("visibility", "public").maybeSingle();
  if (error || !vibe) return new Response("Vibe not found", { status: 404 });

  const [{ data: author }, { data: activity }] = await Promise.all([
    admin.from("tbl_users").select("username,fullname").eq("id", vibe.user_id).maybeSingle(),
    vibe.event_id ? admin.from("tbl_events").select("title").eq("id", vibe.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mediaPath = String(vibe.thumbnail_url || vibe.media_url || "");
  let image = mediaPath;
  if (mediaPath && !/^https?:\/\//i.test(mediaPath)) {
    const signed = await admin.storage.from("vibes").createSignedUrl(mediaPath, 60 * 60 * 24);
    image = signed.data?.signedUrl || "";
  }
  if (!image || vibe.media_type === "video" && !vibe.thumbnail_url) image = `${APP_URL}/wenitro-share.png`;
  const authorName = author?.fullname || author?.username || "a WeNitro member";
  const title = activity?.title ? `${activity.title} · WeNitro Vibe` : "WeNitro Vibe";
  const description = vibe.caption || `See this activity moment from ${authorName} on WeNitro.`;
  const canonical = `${APP_URL}/share/vibe/${vibe.id}`;
  const destination = `${APP_URL}/#/vibe/${vibe.id}`;
  const imageMeta = image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(image)}">` : `<meta name="twitter:card" content="summary">`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="canonical" href="${canonical}"><meta property="og:type" content="video.other"><meta property="og:site_name" content="WeNitro"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}">${imageMeta}<meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"></head><body style="font-family:system-ui;background:#0b1020;color:white;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:32px;text-align:center"><div style="font-weight:900;font-size:30px;color:#9c8aff">WeNitro</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><a style="display:inline-block;background:#6654da;color:white;padding:12px 20px;border-radius:12px;text-decoration:none" href="${destination}">Open in WeNitro</a></main><script>setTimeout(()=>location.replace(${JSON.stringify(destination)}),800)</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300", "x-content-type-options": "nosniff" } });
});
