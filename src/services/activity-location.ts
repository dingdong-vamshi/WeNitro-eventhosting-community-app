import * as Location from 'expo-location';
import type { HostLocation } from '../domain/host-activity';

const photon = process.env.EXPO_PUBLIC_PHOTON_URL?.trim() || 'https://photon.komoot.io';
const nominatim = process.env.EXPO_PUBLIC_NOMINATIM_URL?.trim() || 'https://nominatim.openstreetmap.org';
const cache = new Map<string, HostLocation[]>();

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return parts.filter((part): part is string => {
    const value = String(part || '').trim();
    if (!value) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function photonLabel(properties: Record<string, unknown>) {
  const type = String(properties.osm_value || properties.type || '').replace(/_/g, ' ');
  const street = uniqueParts([properties.housenumber, properties.street]).join(' ');
  const locality = uniqueParts([
    properties.name,
    street,
    properties.district,
    properties.locality,
    properties.city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ]);
  const label = locality.join(', ');
  if (type && type !== 'yes' && !label.toLowerCase().includes(type.toLowerCase())) return `${label} · ${type}`;
  return label;
}

function nominatimLabel(row: Record<string, unknown>) {
  const address = (row.address && typeof row.address === 'object' ? row.address : {}) as Record<string, unknown>;
  const type = String(row.type || row.addresstype || row.class || '').replace(/_/g, ' ');
  const street = uniqueParts([address.house_number, address.road || address.pedestrian]).join(' ');
  const locality = uniqueParts([
    row.name || address.amenity || address.building || address.shop,
    street,
    address.suburb || address.neighbourhood || address.quarter,
    address.city || address.town || address.village || address.municipality,
    address.state,
    address.postcode,
    address.country,
  ]);
  const label = locality.join(', ') || String(row.display_name || '');
  if (type && type !== 'yes' && label && !label.toLowerCase().includes(type.toLowerCase())) return `${label} · ${type}`;
  return label;
}

function keyFor(place: HostLocation) {
  return `${place.label.toLowerCase()}@${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`;
}

function mergePlaces(groups: HostLocation[][]) {
  const seen = new Set<string>();
  const rows: HostLocation[] = [];
  for (const group of groups) {
    for (const place of group) {
      const key = keyFor(place);
      if (seen.has(key) || !place.label) continue;
      seen.add(key);
      rows.push(place);
    }
  }
  return rows.slice(0, 30);
}

async function readJson(url: string, signal: AbortSignal, headers?: Record<string, string>) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error('Location search is unavailable. Please try again.');
    return await res.json();
  } catch (error) {
    if (signal.aborted) throw error;
    if (controller.signal.aborted) throw new Error('Location search timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

async function searchPhoton(text: string, signal: AbortSignal, bias?: { latitude: number; longitude: number }) {
  const params = new URLSearchParams({ q: text, limit: '30', lang: 'en' });
  if (bias) {
    params.set('lat', String(bias.latitude));
    params.set('lon', String(bias.longitude));
  }
  const body = await readJson(`${photon.replace(/\/$/, '')}/api/?${params.toString()}`, signal);
  return (Array.isArray(body.features) ? body.features : []).flatMap((feature: any) => {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const label = photonLabel(feature.properties ?? {});
    return label ? [{ label, latitude, longitude }] : [];
  });
}

async function searchNominatim(text: string, signal: AbortSignal) {
  const params = new URLSearchParams({
    q: text,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    limit: '20',
  });
  const body = await readJson(`${nominatim.replace(/\/$/, '')}/search?${params.toString()}`, signal, {
    Accept: 'application/json',
    'User-Agent': 'WeNitro/1.0 (activity venue search)',
  });
  return (Array.isArray(body) ? body : []).flatMap((row: any) => {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const label = nominatimLabel(row);
    return label ? [{ label, latitude, longitude }] : [];
  });
}

async function reversePhoton(latitude: number, longitude: number, signal: AbortSignal) {
  const body = await readJson(`${photon.replace(/\/$/, '')}/reverse?lat=${latitude}&lon=${longitude}&limit=8&lang=en`, signal);
  return (Array.isArray(body.features) ? body.features : []).flatMap((feature: any) => {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const label = photonLabel(feature.properties ?? {});
    return label ? [{ label, latitude: lat, longitude: lon }] : [];
  });
}

let lastBias: { latitude: number; longitude: number } | undefined;

export const activityLocationService = {
  async search(text: string, signal?: AbortSignal) {
    const key = text.trim().toLowerCase();
    if (key.length < 2) return [];
    if (cache.has(key)) return cache.get(key)!;
    const controller = signal ?? new AbortController().signal;
    const [photonRows, nominatimRows] = await Promise.allSettled([
      searchPhoton(text.trim(), controller, lastBias),
      searchNominatim(text.trim(), controller),
    ]);
    const rows = mergePlaces([
      photonRows.status === 'fulfilled' ? photonRows.value : [],
      nominatimRows.status === 'fulfilled' ? nominatimRows.value : [],
    ]);
    if (!rows.length) {
      const failed = [photonRows, nominatimRows].find(result => result.status === 'rejected') as PromiseRejectedResult | undefined;
      if (failed) throw failed.reason;
    }
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(key, rows);
    return rows;
  },
  async current(signal?: AbortSignal): Promise<HostLocation> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const position = await Promise.race([
      (async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (expired || signal?.aborted) throw new Error('Location request cancelled.');
        if (!permission.granted) throw new Error('Location permission was denied. Search for your venue instead.');
        return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('Current location timed out. Check location permission or search for your venue.')); }, 15000); }),
    ]).finally(() => clearTimeout(timer));
    if (signal?.aborted) throw new Error('Location request cancelled.');
    const { latitude, longitude } = position.coords;
    lastBias = { latitude, longitude };
    const rows = await reversePhoton(latitude, longitude, signal ?? new AbortController().signal);
    return { label: rows[0]?.label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude };
  },
};
