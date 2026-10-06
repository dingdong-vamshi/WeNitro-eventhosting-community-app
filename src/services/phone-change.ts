import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { phoneOtpErrorMessage } from './auth-production';
import { withRequestDeadline } from './request-deadline';

type AuthUserSnapshot = {
  id: string;
  phone?: string | null;
  phone_confirmed_at?: string | null;
};

type AuthVerifyResponse = {
  user?: AuthUserSnapshot | null;
  session?: {
    access_token?: string;
    refresh_token?: string;
    user?: AuthUserSnapshot | null;
  } | null;
  access_token?: string;
  refresh_token?: string;
};

class PhoneChangeRequestError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'PhoneChangeRequestError';
    this.code = code;
    this.status = status;
  }
}

const publicUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const authUrl = () => new URL('/auth/v1', publicUrl).href.replace(/\/$/, '');
const restUrl = () => new URL('/rest/v1', publicUrl).href.replace(/\/$/, '');

const correlationId = () => {
  try { return crypto.randomUUID(); }
  catch { return `phone-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
};

const logOperation = (
  level: 'info' | 'warn',
  input: { requestId: string; userId: string; operation: string; result: string; startedAt: number; code?: string },
) => {
  const entry = {
    scope: 'phone_verification',
    requestId: input.requestId,
    userId: input.userId,
    operation: input.operation,
    provider: 'supabase_auth',
    result: input.result,
    code: input.code,
    durationMs: Date.now() - input.startedAt,
  };
  if (level === 'warn') console.warn('[verification]', entry);
  else console.info('[verification]', entry);
};

const responseBody = async (response: Response) =>
  response.json().catch(() => ({})) as Promise<Record<string, unknown>>;

const request = async <T>(
  path: string,
  input: { method?: string; token?: string; body?: Record<string, unknown>; timeoutMessage: string },
): Promise<T> => {
  if (!publicUrl || !publicKey) throw new Error('Supabase is not configured for this build.');
  return withRequestDeadline(async signal => {
    const response = await fetch(`${path.startsWith('/rpc/') ? restUrl() : authUrl()}${path}`, {
      method: input.method ?? 'GET',
      headers: {
        apikey: publicKey,
        'x-client-info': 'wenitro-expo/1.0.0',
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
        ...(input.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
      signal,
    });
    const body = await responseBody(response);
    if (!response.ok) {
      throw new PhoneChangeRequestError(
        String(body.msg ?? body.message ?? body.error_description ?? body.error ?? 'Phone verification request failed.'),
        typeof body.code === 'string' ? body.code : undefined,
        response.status,
      );
    }
    return body as T;
  }, 15_000, input.timeoutMessage);
};

const currentSession = async (): Promise<Session> => {
  const result = await withRequestDeadline(
    () => supabase.auth.getSession(),
    8_000,
    'Your session took too long to respond. Please retry.',
  );
  if (result.error) throw result.error;
  if (!result.data.session) throw new Error('Authentication required.');
  return result.data.session;
};

const directUser = async (accessToken: string) =>
  request<AuthUserSnapshot>('/user', {
    token: accessToken,
    timeoutMessage: 'We could not confirm your account state. Please retry.',
  });

const preflight = async (accessToken: string, phone: string) => {
  try {
    await request<Record<string, unknown>>('/rpc/prepare_my_phone_change', {
      method: 'POST',
      token: accessToken,
      body: { p_phone: phone },
      timeoutMessage: 'The phone ownership check took too long. Please retry.',
    });
  } catch (error) {
    // The RPC is an additional pending-phone collision guard. Confirmed-phone
    // uniqueness remains enforced by GoTrue itself. Keep the client compatible
    // during a backend-first rollout, but never suppress an actual conflict or
    // authorization failure returned by a deployed RPC.
    const source = error as PhoneChangeRequestError;
    if (source.status === 404 || source.code === 'PGRST202') return;
    throw error;
  }
};

const syncProjection = async (accessToken: string) => {
  const outcomes = await Promise.allSettled([
    request('/rpc/sync_my_phone_verification', {
      method: 'POST', token: accessToken, body: {},
      timeoutMessage: 'Phone verification was confirmed; profile synchronization will retry shortly.',
    }),
    request('/rpc/sync_my_verification', {
      method: 'POST', token: accessToken, body: {},
      timeoutMessage: 'Phone verification was confirmed; Trust Score synchronization will retry shortly.',
    }),
  ]);
  return outcomes.every(outcome => outcome.status === 'fulfilled');
};

const confirmedFor = (user: AuthUserSnapshot | null | undefined, userId: string, phone: string) =>
  user?.id === userId && user.phone === phone && Boolean(user.phone_confirmed_at);

const authError = (error: unknown) => new Error(phoneOtpErrorMessage(error, true));

export const phoneChangeService = {
  async request(phone: string) {
    const session = await currentSession();
    const requestId = correlationId();
    const startedAt = Date.now();
    try {
      await preflight(session.access_token, phone);
      const body = await request<Record<string, unknown>>('/user', {
        method: 'PUT',
        token: session.access_token,
        body: { phone },
        timeoutMessage: 'The OTP request took too long. Your phone was not verified. Please try again.',
      });
      const user = (body.user ?? body) as AuthUserSnapshot;
      if (user.id && user.id !== session.user.id) throw new Error('The phone update returned a different account. Sign out and contact support.');
      logOperation('info', { requestId, userId: session.user.id, operation: 'send_phone_change_otp', result: 'accepted', startedAt });
      return phone;
    } catch (error) {
      logOperation('warn', { requestId, userId: session.user.id, operation: 'send_phone_change_otp', result: 'failed', startedAt, code: (error as { code?: string })?.code });
      throw authError(error);
    }
  },

  async resend(phone: string) {
    const session = await currentSession();
    const requestId = correlationId();
    const startedAt = Date.now();
    try {
      await preflight(session.access_token, phone);
      await request('/resend', {
        method: 'POST',
        token: session.access_token,
        body: { phone, type: 'phone_change', gotrue_meta_security: {} },
        timeoutMessage: 'The OTP resend took too long. Please try again.',
      });
      logOperation('info', { requestId, userId: session.user.id, operation: 'resend_phone_change_otp', result: 'accepted', startedAt });
      return phone;
    } catch (error) {
      logOperation('warn', { requestId, userId: session.user.id, operation: 'resend_phone_change_otp', result: 'failed', startedAt, code: (error as { code?: string })?.code });
      throw authError(error);
    }
  },

  async verify(phone: string, token: string) {
    const session = await currentSession();
    const requestId = correlationId();
    const startedAt = Date.now();
    const before = await directUser(session.access_token);
    if (before.id !== session.user.id) throw new Error('Your authenticated account changed. Sign in again.');

    if (confirmedFor(before, session.user.id, phone)) {
      await syncProjection(session.access_token);
      logOperation('info', { requestId, userId: session.user.id, operation: 'verify_phone_change_otp', result: 'already_confirmed_reconciled', startedAt });
      return phone;
    }

    let verifyResponse: AuthVerifyResponse | null = null;
    let verificationError: unknown = null;
    try {
      verifyResponse = await request<AuthVerifyResponse>('/verify', {
        method: 'POST',
        token: session.access_token,
        body: { phone, token, type: 'phone_change', gotrue_meta_security: {} },
        timeoutMessage: 'Phone verification took too long. Checking the confirmed server state…',
      });
      const returnedUser = verifyResponse.user ?? verifyResponse.session?.user;
      if (returnedUser?.id && returnedUser.id !== session.user.id) {
        throw new Error('Phone verification returned a different account. Your session was not changed. Contact support.');
      }
    } catch (error) {
      verificationError = error;
    }

    const nextAccessToken = verifyResponse?.access_token ?? verifyResponse?.session?.access_token ?? session.access_token;
    let authoritative: AuthUserSnapshot | null = null;
    try { authoritative = await directUser(nextAccessToken); }
    catch {
      if (nextAccessToken !== session.access_token) authoritative = await directUser(session.access_token).catch(() => null);
    }
    if (!confirmedFor(authoritative, session.user.id, phone)) {
      logOperation('warn', { requestId, userId: session.user.id, operation: 'verify_phone_change_otp', result: 'rejected', startedAt, code: (verificationError as { code?: string })?.code });
      if (verificationError) throw authError(verificationError);
      throw new Error('Phone verification was not confirmed. Enter the newest OTP and try again.');
    }

    const refreshToken = verifyResponse?.refresh_token ?? verifyResponse?.session?.refresh_token;
    if (nextAccessToken !== session.access_token && refreshToken) {
      await withRequestDeadline(
        () => supabase.auth.setSession({ access_token: nextAccessToken, refresh_token: refreshToken }),
        4_000,
        'The phone was verified; your session will refresh automatically.',
      ).catch(() => null);
    }
    const projectionSynced = await syncProjection(nextAccessToken);
    logOperation('info', {
      requestId,
      userId: session.user.id,
      operation: 'verify_phone_change_otp',
      result: projectionSynced ? 'confirmed' : 'confirmed_projection_pending',
      startedAt,
    });
    return phone;
  },
};
