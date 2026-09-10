import { supabase } from '../lib/supabase';

// One public badge source, shared by every surface. Only mounted IDs are queried.
const cache = new Map<string, { verified: boolean; expires: number }>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Set<string>();
let scheduled = false;
export const verifiedUserSnapshot = (id: string) => cache.get(id)?.verified === true;
function queue(id: string) {
  if (!/^[1-9]\d*$/.test(id) || (cache.get(id)?.expires ?? 0) > Date.now()) return;
  pending.add(id);
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    const ids = [...pending]; pending.clear();
    void (async () => {
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { data, error } = await supabase.from('tbl_users').select('id,isverified').in('id', batch.map(Number));
        if (error) continue; // Fail closed; do not invent a badge from profile text.
        const verified = new Set((data ?? []).filter(row => Number(row.isverified) === 1).map(row => String(row.id)));
        for (const key of batch) {
          cache.set(key, { verified: verified.has(key), expires: Date.now() + 60000 });
          listeners.get(key)?.forEach(notify => notify());
        }
      }
    })().catch(() => undefined);
  }, 20);
}
export function subscribeVerifiedUser(id: string, notify: () => void) {
  const subscriptions = listeners.get(id) ?? new Set();
  subscriptions.add(notify); listeners.set(id, subscriptions); queue(id);
  return () => { subscriptions.delete(notify); if (!subscriptions.size) listeners.delete(id); };
}
export function refreshVerifiedUsers() {
  for (const id of listeners.keys()) { cache.delete(id); queue(id); }
}
