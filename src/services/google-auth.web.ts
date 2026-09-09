import type { Session } from '@supabase/supabase-js';
import { exchangeGoogleIdentity, getGoogleWebClientId, GoogleSignInError, requireGoogleBackend } from './google-auth.shared';
import type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';
export { googleSignInErrorMessage } from './google-auth.shared';
export type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';

type GoogleIdentitySdk = {
  initialize(options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean; ux_mode: 'popup'; use_fedcm_for_button: boolean; button_auto_select: boolean }): void;
  renderButton(container: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with'; shape: 'pill'; width: number; logo_alignment: 'left'; click_listener: () => void }): void;
  cancel(): void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleIdentitySdk } } };
let scriptPromise: Promise<GoogleIdentitySdk> | undefined;

function loadGoogleIdentitySdk(): Promise<GoogleIdentitySdk> {
  const existing = (window as GoogleWindow).google?.accounts?.id;
  if (existing) return Promise.resolve(existing);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<GoogleIdentitySdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      scriptPromise = undefined;
      reject(new GoogleSignInError('google_script_failed', 'Google could not load. Check your connection or browser content blocker and try again.'));
    };
    const timeout = setTimeout(fail, 15000);
    script.onload = () => {
      clearTimeout(timeout);
      const sdk = (window as GoogleWindow).google?.accounts?.id;
      if (sdk) resolve(sdk); else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type GoogleButtonCallbacks = {
  onSuccess: (session: Session) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (error: unknown) => void;
};

/** Google's actual rendered button opens its account chooser. No custom/fake chooser or secret is used. */
export async function mountGoogleIdentityButton(container: HTMLElement, callbacks: GoogleButtonCallbacks, signal: AbortSignal): Promise<() => void> {
  requireGoogleBackend();
  const clientId = getGoogleWebClientId();
  if (!window.isSecureContext || !window.crypto?.subtle) {
    throw new GoogleSignInError('insecure_origin', 'Google sign-in requires HTTPS or localhost.');
  }
  const sdk = await loadGoogleIdentitySdk();
  if (signal.aborted) return () => undefined;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (signal.aborted) return () => undefined;
  let exchanging = false;
  let authenticated = false;
  let active = true;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  const clearBusy = () => {
    if (!active || exchanging || authenticated) return;
    callbacks.onBusyChange(false);
    if (pendingTimer) clearTimeout(pendingTimer);
  };
  // GIS does not expose popup-close callbacks. Returning focus restores the button
  // if the chooser was dismissed; credential exchange keeps the loading state.
  const onFocus = () => { focusTimer = setTimeout(clearBusy, 1500); };
  window.addEventListener('focus', onFocus);
  sdk.initialize({
    client_id: clientId, nonce: hashedNonce, auto_select: false,
    ux_mode: 'popup', use_fedcm_for_button: true, button_auto_select: false,
    callback: (response) => {
      if (!active || signal.aborted || exchanging || authenticated) return;
      exchanging = true;
      if (pendingTimer) clearTimeout(pendingTimer);
      callbacks.onBusyChange(true);
      void exchangeGoogleIdentity(response.credential, nonce, signal).then((result) => {
        if (active && !signal.aborted && result.status === 'authenticated') {
          authenticated = true;
          callbacks.onSuccess(result.session);
        }
      }).catch((error: unknown) => {
        if (active && !signal.aborted) callbacks.onError(error);
      }).finally(() => {
        exchanging = false;
        if (active && !signal.aborted && !authenticated) callbacks.onBusyChange(false);
      });
    },
  });
  sdk.renderButton(container, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
    shape: 'pill', width: Math.max(200, Math.min(400, Math.round(container.getBoundingClientRect().width))),
    logo_alignment: 'left',
    click_listener: () => {
      if (!active || signal.aborted || exchanging || authenticated) return;
      callbacks.onBusyChange(true);
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(clearBusy, 60000);
    },
  });
  return () => {
    active = false;
    if (pendingTimer) clearTimeout(pendingTimer);
    if (focusTimer) clearTimeout(focusTimer);
    window.removeEventListener('focus', onFocus);
    container.replaceChildren();
  };
}

export async function signInWithGoogleIdentity(_options: GoogleIdentityOptions = {}): Promise<GoogleIdentityResult> {
  // Web must be started by Google's genuine button to preserve browser user activation.
  throw new GoogleSignInError('use_google_button', 'Use the Continue with Google button to open Google sign-in.');
}
