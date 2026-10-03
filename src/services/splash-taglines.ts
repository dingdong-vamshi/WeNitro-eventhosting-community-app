import AsyncStorage from '@react-native-async-storage/async-storage';

/** Original client PDF, page 2; stored rotation avoids consecutive launch repeats. */
export const SPLASH_TAGLINES = [
  'Find your perfect partner for every\npassion',
  'Anything is possible with a\npartner',
  "Don't go solo. Find your\npartner",
  'Adventures are better together',
  'From 5 AM runs to late-night\nstudy sessions',
] as const;
const storageKey = 'wenitro:splash-tagline:v1';
let previousIndex = -1;
let initialized = false;
let selection = Promise.resolve();

export function nextSplashTagline(): Promise<string> {
  const next = selection.then(async () => {
    if (!initialized) try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored !== null && /^\d+$/.test(stored)) {
        const index = Number(stored);
        if (index < SPLASH_TAGLINES.length) previousIndex = index;
      }
    } catch { /* In-memory rotation still works when local storage is unavailable. */ }
    initialized = true;
    previousIndex = (previousIndex + 1) % SPLASH_TAGLINES.length;
    const tagline = SPLASH_TAGLINES[previousIndex];
    try { await AsyncStorage.setItem(storageKey, String(previousIndex)); } catch { /* Nonessential preference. */ }
    return tagline;
  });
  selection = next.then(() => undefined);
  return next;
}
