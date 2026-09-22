import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const PENDING_ACTIVITY_INVITE_KEY = 'wenitro:pending-activity-invite:v1';
const TOKEN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

export function activityInviteTokenFromUrl(url: string): string | null {
 const native = url.match(new RegExp(`^wenitro://activity/invite/(${TOKEN})/?$`));
 const web = url.match(new RegExp(`^https?://[^#]+#/activity-invite/(${TOKEN})/?$`));
 return (native || web)?.[1]?.toLowerCase() || null;
}

export async function captureActivityInvite(url: string): Promise<boolean> {
 const token = activityInviteTokenFromUrl(url);
 if (!token) return false;
 await AsyncStorage.setItem(PENDING_ACTIVITY_INVITE_KEY, token);
 return true;
}

export async function createActivityInvite(activityId: string): Promise<string> {
 if (!/^[1-9]\d*$/.test(activityId)) throw new Error('This Activity is not connected yet.');
 const { data, error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>)('create_activity_invite', { p_event_id: Number(activityId) });
 if (error) throw error;
 const token = data && typeof data === 'object' ? String((data as Record<string, unknown>).token || '') : '';
 if (!activityInviteTokenFromUrl(`wenitro://activity/invite/${token}`)) throw new Error('The invite link could not be created.');
 return Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}${window.location.pathname}#/activity-invite/${token}`
  : `wenitro://activity/invite/${token}`;
}

export async function redeemPendingActivityInvite(): Promise<string | null> {
 const token = await AsyncStorage.getItem(PENDING_ACTIVITY_INVITE_KEY);
 if (!token || !activityInviteTokenFromUrl(`wenitro://activity/invite/${token}`)) {
  if (token) await AsyncStorage.removeItem(PENDING_ACTIVITY_INVITE_KEY);
  return null;
 }
 const { data, error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>)('redeem_activity_invite', { p_token: token });
 if (error) throw error;
 await AsyncStorage.removeItem(PENDING_ACTIVITY_INVITE_KEY);
 const eventId = data && typeof data === 'object' ? Number((data as Record<string, unknown>).event_id) : NaN;
 return Number.isSafeInteger(eventId) && eventId > 0 ? String(eventId) : null;
}
