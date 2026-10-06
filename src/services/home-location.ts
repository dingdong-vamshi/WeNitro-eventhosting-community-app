import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { googlePlacesEnabled, reverseGeocodeGoogle, type GoogleLocationBias } from './google-places';

const CACHE_PREFIX = 'wenitro:web-home-locality:v1:';
const CACHE_MS = 24 * 60 * 60 * 1000;
type CachedHomeLocation = GoogleLocationBias & { locality: string; resolvedAt: number };
export type ResolvedHomeLocation =
  | (CachedHomeLocation & { source: 'live' | 'cache' })
  | { locality: string; source: 'activity' };
const currentAttempts = new Map<string, Promise<ResolvedHomeLocation | null>>();
const memoryCache = new Map<string, CachedHomeLocation>();

function validCache(value: unknown): value is CachedHomeLocation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<CachedHomeLocation>;
  return typeof row.locality === 'string' && Boolean(row.locality.trim()) && row.locality.length <= 80 &&
    typeof row.resolvedAt === 'number' && Date.now() - row.resolvedAt < CACHE_MS &&
    typeof row.latitude === 'number' && Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90 &&
    typeof row.longitude === 'number' && Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180;
}
function cacheKey(userId: string) { return `${CACHE_PREFIX}${encodeURIComponent(userId)}`; }
async function readCache(userId: string) {
  const key = cacheKey(userId);
  const memory = memoryCache.get(key);
  if (validCache(memory)) return memory;
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (validCache(parsed)) { memoryCache.set(key, parsed); return parsed; }
    if (raw) await AsyncStorage.removeItem(key);
  } catch { /* A storage failure must not block Home. */ }
  return null;
}
async function currentCoordinates() {
  const existing = await Location.getForegroundPermissionsAsync();
  const permission = existing.granted ? existing : existing.status === 'undetermined' && existing.canAskAgain !== false ? await Location.requestForegroundPermissionsAsync() : existing;
  if (!permission.granted) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out.')), 12000); }),
    ]);
  } catch {
    return await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1500 });
  } finally { clearTimeout(timer); }
}

function distanceKm(first: GoogleLocationBias, second: GoogleLocationBias) {
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const latitudeA = first.latitude * radians;
  const latitudeB = second.latitude * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function recentActivityLocality(signal: AbortSignal) {
  try {
    const { data, error } = await supabase.rpc('home_location_fallback').abortSignal(signal);
    if (error || signal.aborted || !data || typeof data !== 'object') return null;
    const locality = String((data as { locality?: unknown }).locality || '').trim();
    return locality && locality.length <= 80 ? { locality, source: 'activity' as const } : null;
  } catch {
    return null;
  }
}

export async function resolveHomeLocality(userId: string, signal = new AbortController().signal): Promise<ResolvedHomeLocation | null> {
  if (!userId.trim()) return null;
  const pending = currentAttempts.get(userId);
  if (pending) return pending;
  const currentAttempt = (async () => {
    try {
      const cached = await readCache(userId);
      if (Platform.OS === 'web' && googlePlacesEnabled) {
        const position = await currentCoordinates();
        if (position && !signal.aborted) {
          const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          if (cached && distanceKm(current, cached) <= 2) return { ...cached, source: 'live' as const };
          const result = await reverseGeocodeGoogle(current.latitude, current.longitude, signal);
          if (result.locality && !signal.aborted) {
            const value: CachedHomeLocation = { locality: result.locality, ...current, resolvedAt: Date.now() };
            const key = cacheKey(userId);
            memoryCache.set(key, value);
            await AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
            return { ...value, source: 'live' as const };
          }
        }
      }
      if (cached && !signal.aborted) return { ...cached, source: 'cache' as const };
      return await recentActivityLocality(signal);
    } catch {
      return signal.aborted ? null : recentActivityLocality(signal);
    }
  })().finally(() => { currentAttempts.delete(userId); });
  currentAttempts.set(userId, currentAttempt);
  return currentAttempt;
}

export async function getCachedHomeLocationBias(userId: string): Promise<GoogleLocationBias | undefined> {
  const cached = await readCache(userId);
  return cached ? { latitude: cached.latitude, longitude: cached.longitude } : undefined;
}

export function resetHomeLocationMemoryForTests() {
  memoryCache.clear();
  currentAttempts.clear();
}
