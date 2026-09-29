import type { Session } from '@supabase/supabase-js';
import { exchangeGoogleIdentity, getGoogleWebClientId, GoogleSignInError, requireGoogleBackend } from './google-auth.shared';
import type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';
export { googleSignInErrorMessage } from './google-auth.shared';
export type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';

type GoogleIdentitySdk = {
  initialize(options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean; ux_mode: 'popup'; use_fedcm_for_button: boolean; button_auto_select: boolean }): void;
  renderButton(container: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with'; shape: 'pill'; width: number; logo_alignment: 'left' }): void;
  cancel(): void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GoogleIdentitySdk } } };
let scriptPromise: Promise<GoogleIdentitySdk> | undefined;
type ActiveGoogleMount = {
  callbacks: GoogleButtonCallbacks;
  signal: AbortSignal;
  active: boolean;
  exchanging: boolean;
  authenticated: boolean;
};
let activeMount: ActiveGoogleMount | undefined;
let initializedIdentity: Promise<{ sdk: GoogleIdentitySdk; nonce: string }> | undefined;

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

function initializeGoogleIdentity(clientId: string) {
  if (initializedIdentity) return initializedIdentity;
  initializedIdentity = loadGoogleIdentitySdk().then(async (sdk) => {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
    const hashedNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    sdk.initialize({
      client_id: clientId, nonce: hashedNonce, auto_select: false,
      // The in-app browser currently rejects the opt-in FedCM request before GIS can
      // return a credential or cancellation signal. Google's popup flow remains the
      // compatible default and keeps its own button usable when the chooser closes.
      ux_mode: 'popup', use_fedcm_for_button: false, button_auto_select: false,
      callback: (response) => {
        const mount = activeMount;
        if (!mount?.active || mount.signal.aborted || mount.exchanging || mount.authenticated) return;
        mount.exchanging = true;
        mount.callbacks.onBusyChange(true);
        void exchangeGoogleIdentity(response.credential, nonce, mount.signal).then((result) => {
          if (mount.active && !mount.signal.aborted && result.status === 'authenticated') {
            mount.authenticated = true;
            mount.callbacks.onSuccess(result.session);
          }
        }).catch((error: unknown) => {
          if (mount.active && !mount.signal.aborted) mount.callbacks.onError(error);
        }).finally(() => {
          mount.exchanging = false;
          if (mount.active && !mount.signal.aborted && !mount.authenticated) mount.callbacks.onBusyChange(false);
        });
      },
    });
    return { sdk, nonce };
  }).catch((error) => {
    initializedIdentity = undefined;
    throw error;
  });
  return initializedIdentity;
}

/** Google's actual rendered button opens its account chooser. No custom/fake chooser or secret is used. */
export async function mountGoogleIdentityButton(container: HTMLElement, callbacks: GoogleButtonCallbacks, signal: AbortSignal): Promise<() => void> {
  requireGoogleBackend();
  const clientId = getGoogleWebClientId();
  if (!window.isSecureContext || !window.crypto?.subtle) {
    throw new GoogleSignInError('insecure_origin', 'Google sign-in requires HTTPS or localhost.');
  }
  const { sdk } = await initializeGoogleIdentity(clientId);
  if (signal.aborted) return () => undefined;
  const mount: ActiveGoogleMount = { callbacks, signal, active: true, exchanging: false, authenticated: false };
  activeMount = mount;
  sdk.renderButton(container, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
    shape: 'pill', width: Math.max(200, Math.min(400, Math.round(container.getBoundingClientRect().width))),
    logo_alignment: 'left',
  });
  return () => {
    mount.active = false;
    if (activeMount === mount) activeMount = undefined;
    container.replaceChildren();
  };
}

export async function signInWithGoogleIdentity(_options: GoogleIdentityOptions = {}): Promise<GoogleIdentityResult> {
  // Web must be started by Google's genuine button to preserve browser user activation.
  throw new GoogleSignInError('use_google_button', 'Use the Continue with Google button to open Google sign-in.');
}
