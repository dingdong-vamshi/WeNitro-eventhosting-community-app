import { supabase } from '../lib/supabase';
import { withRequestDeadline } from './request-deadline';

export type HubbleSession = {
  status: 'SUCCESS';
  token: string;
  clientId: string;
  appSecret: string;
  sdkUrl: 'https://sdk.dev.myhubble.money/' | 'https://sdk.myhubble.money/';
  balance: number;
  eligible: boolean;
  eligibilityPoints: number;
  minimumDebitPoints: number;
  nitroToInr: number;
  paymentModel: 'coins_only' | 'mixed';
  environment: 'staging' | 'production';
};

export type HubbleReadiness = {
  balance: number;
  eligible: boolean;
  eligibilityPoints: number;
  phoneVerified: boolean;
};

export const HUBBLE_ELIGIBILITY_POINTS = 200;

const publicUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const validSession = (value: unknown): value is HubbleSession => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.status === 'SUCCESS' &&
    typeof row.token === 'string' && row.token.length > 20 &&
    typeof row.clientId === 'string' && Boolean(row.clientId) &&
    typeof row.appSecret === 'string' && Boolean(row.appSecret) &&
    ((row.environment === 'staging' && row.sdkUrl === 'https://sdk.dev.myhubble.money/') ||
      (row.environment === 'production' && row.sdkUrl === 'https://sdk.myhubble.money/')) &&
    Number.isFinite(Number(row.balance)) &&
    typeof row.eligible === 'boolean' &&
    Number.isFinite(Number(row.eligibilityPoints)) &&
    Number.isFinite(Number(row.nitroToInr)) &&
    (row.environment === 'staging' || row.environment === 'production');
};

export const hubbleSdkUrl = (session: HubbleSession) => {
  const url = new URL(session.sdkUrl);
  url.searchParams.set('clientId', session.clientId);
  url.searchParams.set('appSecret', session.appSecret);
  url.searchParams.set('token', session.token);
  return url.href;
};

export async function requestHubbleReadiness(): Promise<HubbleReadiness> {
  const [auth, ledger] = await Promise.all([
    withRequestDeadline(() => supabase.auth.getUser(), 8_000, 'Your account took too long to respond. Please retry.'),
    withRequestDeadline(async () => await supabase.rpc('list_my_nitro_history'), 8_000, 'Your Nitro balance took too long to respond. Please retry.'),
  ]);
  if (auth.error || !auth.data.user) throw new Error('Sign in to view your Nitro balance.');
  if (ledger.error) throw new Error('Your Nitro balance is temporarily unavailable.');
  const value = ledger.data && typeof ledger.data === 'object'
    ? ledger.data as Record<string, unknown>
    : {};
  const balance = Number(value.balance);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error('Your Nitro balance returned an invalid result.');
  }
  return {
    balance,
    eligible: balance >= HUBBLE_ELIGIBILITY_POINTS,
    eligibilityPoints: HUBBLE_ELIGIBILITY_POINTS,
    phoneVerified: Boolean(auth.data.user.phone && auth.data.user.phone_confirmed_at),
  };
}

export async function requestHubbleSession(): Promise<HubbleSession> {
  const current = await withRequestDeadline(
    () => supabase.auth.getSession(),
    8_000,
    'Your session took too long to respond. Please retry.',
  );
  const accessToken = current.data.session?.access_token;
  if (current.error || !accessToken) throw new Error('Sign in to open Hubble rewards.');
  if (!publicUrl || !publicKey) throw new Error('WeNitro rewards are not configured.');
  const response = await withRequestDeadline(signal => fetch(new URL('/functions/v1/hubble/token', publicUrl), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: publicKey,
        'x-client-info': 'wenitro-expo/1.0.0',
      },
      cache: 'no-store',
      signal,
    }), 15_000, 'Hubble sign-in took too long. Please retry.');
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || !validSession(data)) {
    throw new Error(typeof data.failureReason === 'string'
      ? data.failureReason
      : 'Hubble rewards are temporarily unavailable.');
  }
  return {
    ...data,
    balance: Number(data.balance),
    eligibilityPoints: Number(data.eligibilityPoints),
    minimumDebitPoints: Number(data.minimumDebitPoints),
    nitroToInr: Number(data.nitroToInr),
  } as HubbleSession;
}
