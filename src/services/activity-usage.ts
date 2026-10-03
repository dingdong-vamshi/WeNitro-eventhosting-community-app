import { supabase } from '../lib/supabase';

/** Daily unique successful shares; observation failure must not undo a share. */
export async function recordActivityShare(id: string): Promise<void> {
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return;
  try {
    await supabase.rpc('record_activity_share', { p_event_id: eventId });
  } catch {
    // Analytics is deliberately non-blocking; the authenticated RPC owns access checks.
  }
}
