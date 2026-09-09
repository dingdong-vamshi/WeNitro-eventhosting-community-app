import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PENDING_REFERRAL_KEY = 'wenitro:pending-referral:v1';
export type PendingReferral = { referrerId: number; receivedAt: string };
/** Existing public profile ID identifies the inviter. It is never an authorization token. */
export function referralLink(userId: string): string {
 if (!/^[1-9]\d*$/.test(userId)) throw new Error('Sign in to get your invitation link.');
 return Platform.OS === 'web' && typeof window !== 'undefined'
  ? `${window.location.origin}${window.location.pathname}#/invite/${userId}`
  : `wenitro://invite/${userId}`;
}
export function referralIdFromUrl(url: string): number | null {
 const match = url.match(/^wenitro:\/\/invite\/([1-9]\d*)\/?$/) || url.match(/^https?:\/\/[^#]+#\/invite\/([1-9]\d*)\/?$/);
 const id = match ? Number(match[1]) : NaN;
 return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
/** Preserve the first invitation across onboarding. No points or reward claim is written. */
export async function captureReferral(url: string): Promise<void> {
 const referrerId = referralIdFromUrl(url);
 if (!referrerId) return;
 if (!(await readPendingReferral())) await AsyncStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify({ referrerId, receivedAt: new Date().toISOString() } satisfies PendingReferral));
}
export async function readPendingReferral(): Promise<PendingReferral | null> {
 try {
  const raw = await AsyncStorage.getItem(PENDING_REFERRAL_KEY); if (!raw) return null;
  const value = JSON.parse(raw) as PendingReferral;
  if (!Number.isInteger(value.referrerId) || value.referrerId < 1 || value.referrerId > 2147483647 || !Number.isFinite(Date.parse(value.receivedAt)) || Date.now() - Date.parse(value.receivedAt) > 30 * 86400000) { await AsyncStorage.removeItem(PENDING_REFERRAL_KEY); return null; }
  return value;
 } catch { return null; }
}
