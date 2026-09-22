import * as Location from 'expo-location';
import type { HostLocation } from '../domain/host-activity';

const photon = process.env.EXPO_PUBLIC_PHOTON_URL?.trim() || 'https://photon.komoot.io';
const nominatim = process.env.EXPO_PUBLIC_NOMINATIM_URL?.trim() || 'https://nominatim.openstreetmap.org';
const cache = new Map<string, HostLocation[]>();

function uniqueParts(parts: unknown[]) {
  const seen = new Set<string>();
  return parts.flatMap((part) => {
    const value = String(part || '').trim();
    if (!value) return [];
    const key = value.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [value];
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

function deviceLabel(row: Location.LocationGeocodedAddress) {
  const street = uniqueParts([row.streetNumber, row.street]).join(' ');
  return uniqueParts([
    row.name,
    street,
    row.district,
    row.subregion,
    row.city,
    row.region,
    row.postalCode,
    row.country,
  ]).join(', ');
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
    'accept-language': 'en',
    limit: '20',
  });
  const body = await readJson(`${nominatim.replace(/\/$/, '')}/search?${params.toString()}`, signal, {
    Accept: 'application/json',
    'Accept-Language': 'en',
  });
  return (Array.isArray(body) ? body : []).flatMap((row: any) => {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const label = nominatimLabel(row);
    return label ? [{ label, latitude, longitude }] : [];
  });
}

async function reverseNominatim(latitude: number, longitude: number, signal: AbortSignal) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'en',
  });
  const row = await readJson(`${nominatim.replace(/\/$/, '')}/reverse?${params.toString()}`, signal, {
    Accept: 'application/json',
    'Accept-Language': 'en',
  });
  if (!row || typeof row !== 'object') return [];
  const label = nominatimLabel(row as Record<string, unknown>);
  return label ? [{ label, latitude, longitude }] : [];
}

async function currentPosition(signal?: AbortSignal) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (signal?.aborted) throw new Error('Location request cancelled.');
  if (!permission.granted) throw new Error('Location permission was denied. Search for your venue instead.');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Current location timed out.')), 12000);
      }),
    ]);
  } catch (currentError) {
    if (signal?.aborted) throw new Error('Location request cancelled.');
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 });
    if (lastKnown) return lastKnown;
    throw currentError instanceof Error
      ? new Error(`${currentError.message} Check location permission or search for your venue.`)
      : new Error('Current location is unavailable. Search for your venue instead.');
  } finally {
    clearTimeout(timer);
  }
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
    const query = text.trim();
    if (query.length < 2) return [];
    if (signal?.aborted) throw new Error('Location search cancelled.');
    const biasKey = lastBias ? `@${lastBias.latitude.toFixed(2)},${lastBias.longitude.toFixed(2)}` : '';
    const key = `${query.toLowerCase()}${biasKey}`;
    if (cache.has(key)) return cache.get(key)!;
    const controller = signal ?? new AbortController().signal;
    const [photonRows, nominatimRows] = await Promise.allSettled([
      searchPhoton(query, controller, lastBias),
      searchNominatim(query, controller),
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
    const position = await currentPosition(signal);
    if (signal?.aborted) throw new Error('Location request cancelled.');
    const { latitude, longitude } = position.coords;
    lastBias = { latitude, longitude };
    const controller = signal ?? new AbortController().signal;
    const providers = await Promise.allSettled([
      reversePhoton(latitude, longitude, controller),
      reverseNominatim(latitude, longitude, controller),
    ]);
    const rows = mergePlaces(providers.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    if (rows[0]) return rows[0];
    try {
      const deviceRows = await Location.reverseGeocodeAsync({ latitude, longitude });
      const label = deviceRows[0] ? deviceLabel(deviceRows[0]) : '';
      if (label) return { label, latitude, longitude };
    } catch {
      // Coordinates remain a reliable selectable fallback when reverse geocoding is unavailable.
    }
    return { label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude };
  },
};
