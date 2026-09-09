import { createClient, type Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type GoogleIdentityResult =
  | { status: 'authenticated'; session: Session }
  | { status: 'cancelled' };

export type GoogleIdentityOptions = { signal?: AbortSignal };

export class GoogleSignInError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GoogleSignInError';
  }
}

export function getGoogleWebClientId() {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!clientId || !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new GoogleSignInError('missing_client_id', 'Google sign-in is not configured for this build. Add the Google Web client ID (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  }
  return clientId;
}

export function requireGoogleBackend() {
  if (!isSupabaseConfigured || process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== 'https://klyjzbisgycegkkacbjw.supabase.co') {
    throw new GoogleSignInError('incorrect_backend', 'Google sign-in requires the configured WeNitro authentication service.');
  }
}

let exchangeSequence = 0;

/** The cancellable exchange cannot publish a late session to the application's auth client. */
export async function exchangeGoogleIdentity(token: string, nonce?: string, signal?: AbortSignal): Promise<GoogleIdentityResult> {
  requireGoogleBackend();
  if (signal?.aborted) return { status: 'cancelled' };
  if (!token) throw new GoogleSignInError('missing_id_token', 'Google did not return an identity token. Check the Google Web client ID.');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  const isolatedClient = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `wenitro-google-exchange-${++exchangeSequence}` },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }) },
    },
  );
  let exchange;
  try {
    exchange = await isolatedClient.auth.signInWithIdToken({ provider: 'google', token, ...(nonce ? { nonce } : {}) });
  } catch {
    if (signal?.aborted) return { status: 'cancelled' };
    throw new GoogleSignInError(timedOut ? 'timeout' : 'session_failed', timedOut ? 'Google sign-in took too long. Check your connection and try again.' : 'Google sign-in could not be completed. Please check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    await isolatedClient.auth.stopAutoRefresh();
  }
  if (signal?.aborted) return { status: 'cancelled' };
  if (timedOut) throw new GoogleSignInError('timeout', 'Google sign-in took too long. Check your connection and try again.');
  const { data, error } = exchange;
  if (error) {
    // Do not forward provider payloads, tokens, or session details to logs/UI.
    if (error.code === 'provider_disabled' || /provider.*(disabled|not enabled)|unsupported provider/i.test(error.message)) {
      throw new GoogleSignInError('provider_disabled', 'Google sign-in is not enabled for WeNitro yet. Enable the Google provider and register the client IDs in Supabase.');
    }
    if (/audience|unacceptable audience|client.?id/i.test(error.message)) {
      throw new GoogleSignInError('invalid_audience', 'This Google client ID is not registered with WeNitro authentication.');
    }
    throw new GoogleSignInError('session_failed', 'Google sign-in could not be completed. Please check your connection and try again.');
  }
  if (!data.session) throw new GoogleSignInError('missing_session', 'Google sign-in did not create a session. Please try again.');
  if (signal?.aborted) return { status: 'cancelled' };
  // Commit boundary: from here the normal Supabase client validates, stores, and
  // emits the authenticated session. The SDK's public setSession API has no
  // cancellation option; do not race it and permit a late hidden session write.
  const committed = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (committed.error || !committed.data.session) throw new GoogleSignInError('session_commit_failed', 'WeNitro could not save your sign-in. Please try again.');
  return { status: 'authenticated', session: committed.data.session };
}

export function googleSignInErrorMessage(error: unknown) {
  return error instanceof GoogleSignInError
    ? error.message
    : 'Google sign-in could not be completed. Please check your connection and try again.';
}
