import * as Location from 'expo-location';
import type { HostLocation } from '../domain/host-activity';
// Photon permits light demo use. Configure an owned endpoint before a public release.
const endpoint = process.env.EXPO_PUBLIC_PHOTON_URL?.trim() || 'https://photon.komoot.io';
const cache = new Map<string, HostLocation[]>();
async function query(path: string, signal?: AbortSignal): Promise<HostLocation[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 10000);
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error('Location search is unavailable. Please try again.');
    const body = await res.json();
    return (Array.isArray(body.features) ? body.features : []).flatMap((f: any) => {
      const [longitude, latitude] = f.geometry?.coordinates ?? [];
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const p = f.properties ?? {};
      const label = [...new Set([p.name, p.street, p.city, p.state, p.country].filter((v): v is string => typeof v === 'string' && !!v))].join(', ');
      return label ? [{ label, latitude, longitude }] : [];
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (controller.signal.aborted) throw new Error('Location search timed out. Please try again.');
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export const activityLocationService = {
  async search(text: string, signal?: AbortSignal) {
    const key = text.trim().toLowerCase(); if (key.length < 3) return [];
    if (cache.has(key)) return cache.get(key)!;
    const rows = await query(`/api/?q=${encodeURIComponent(text.trim())}&limit=6&lang=en`, signal);
    if (cache.size >= 30) cache.delete(cache.keys().next().value!);
    cache.set(key, rows); return rows;
  },
  async current(signal?: AbortSignal): Promise<HostLocation> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const position = await Promise.race([
      (async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (expired || signal?.aborted) throw new Error('Location request cancelled.');
        if (!permission.granted) throw new Error('Location permission was denied. Search for your venue instead.');
        return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('Current location timed out. Check location permission or search for your venue.')); }, 15000); }),
    ]).finally(() => clearTimeout(timer));
    if (signal?.aborted) throw new Error('Location request cancelled.');
    const { latitude, longitude } = position.coords;
    const rows = await query(`/reverse?lat=${latitude}&lon=${longitude}&limit=1&lang=en`, signal);
    return { label: rows[0]?.label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude };
  },
};
