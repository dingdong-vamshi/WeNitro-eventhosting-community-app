import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { googlePlacesEnabled, reverseGeocodeGoogle, type GoogleLocationBias } from './google-places';

const CACHE_PREFIX = 'wenitro:web-home-locality:v1:';
const CACHE_MS = 24 * 60 * 60 * 1000;
type CachedHomeLocation = GoogleLocationBias & { locality: string; resolvedAt: number };
const currentAttempts = new Map<string, Promise<CachedHomeLocation | null>>();
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

export async function resolveHomeLocality(userId: string, signal = new AbortController().signal) {
  if (Platform.OS !== 'web' || !googlePlacesEnabled) return null;
  if (!userId.trim()) return null;
  const cached = await readCache(userId);
  if (cached) return cached;
  const pending = currentAttempts.get(userId);
  if (pending) return pending;
  const currentAttempt = (async () => {
    try {
      const position = await currentCoordinates();
      if (!position || signal.aborted) return null;
      const { latitude, longitude } = position.coords;
      const result = await reverseGeocodeGoogle(latitude, longitude, signal);
      if (!result.locality || signal.aborted) return null;
      const value = { locality: result.locality, latitude, longitude, resolvedAt: Date.now() };
      const key = cacheKey(userId);
      memoryCache.set(key, value);
      await AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
      return value;
    } catch { return null; }
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
