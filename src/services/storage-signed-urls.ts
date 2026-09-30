import { supabase } from "../lib/supabase";

type CachedSignedUrl = {
  expiresAt: number;
  url: string;
};

const cache = new Map<string, CachedSignedUrl>();
const pending = new Map<string, Promise<Map<string, string>>>();
const EXPIRY_SAFETY_SECONDS = 5 * 60;
const MAX_CACHE_ENTRIES = 1_000;

const keyFor = (scope: string, bucket: string, path: string) =>
  `${scope}:${bucket}:${path}`;

const usableCachedUrl = (
  scope: string,
  bucket: string,
  path: string,
  now: number,
) => {
  const key = keyFor(scope, bucket, path);
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return cached.url;
};

const trimCache = (now: number) => {
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
};

/**
 * Sign private object paths once per bucket, then reuse the URL while it is
 * safely inside its validity window. A failed or missing object is omitted so
 * one stale media reference cannot break an entire feed.
 */
export async function signedUrlMap(
  bucket: string,
  values: readonly string[],
  expiresIn = 3_600,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const paths = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!paths.length) return result;

  const auth = await supabase.auth.getSession();
  if (auth.error) throw auth.error;
  const scope = auth.data.session?.user.id ?? "anonymous";
  const now = Date.now();
  const missing: string[] = [];
  for (const path of paths) {
    if (/^https?:\/\//i.test(path)) {
      result.set(path, path);
      continue;
    }
    const cached = usableCachedUrl(scope, bucket, path, now);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }
  if (!missing.length) return result;

  const requestKey = `${scope}:${bucket}:${expiresIn}:${[...missing].sort().join("\n")}`;
  let request = pending.get(requestKey);
  if (!request) {
    request = (async () => {
      const signed = new Map<string, string>();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(missing, expiresIn);
      if (error) throw error;
      const expiresAt =
        Date.now() +
        Math.max(30, expiresIn - EXPIRY_SAFETY_SECONDS) * 1_000;
      for (const item of data ?? []) {
        if (!item.path || !item.signedUrl || item.error) continue;
        signed.set(item.path, item.signedUrl);
        cache.set(keyFor(scope, bucket, item.path), {
          expiresAt,
          url: item.signedUrl,
        });
      }
      trimCache(Date.now());
      return signed;
    })().finally(() => pending.delete(requestKey));
    pending.set(requestKey, request);
  }

  for (const [path, url] of await request) result.set(path, url);
  return result;
}

export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = 3_600,
): Promise<string> {
  if (/^https?:\/\//i.test(path)) return path;
  const urls = await signedUrlMap(bucket, [path], expiresIn);
  const url = urls.get(path);
  if (!url) throw new Error("This media is unavailable.");
  return url;
}
