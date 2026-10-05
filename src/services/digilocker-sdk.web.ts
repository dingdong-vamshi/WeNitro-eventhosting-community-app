export type DigiLockerClientEvent = 'completed' | 'closed';

type ProviderEvent = { type?: unknown };
type ProviderSdk = {
  setAPIKey: (key: string) => void;
  setEventListener: (listener: unknown) => void;
  open: (options: {
    session_id: string;
    brand: { name: string; logo_url: string };
    theme: { mode: 'dark'; seed: string };
  }) => void;
  EventListener: new () => { onEvent(event: ProviderEvent): void };
};

declare global {
  interface Window {
    DigilockerSDK?: ProviderSdk;
  }
}

const SCRIPT_URL = 'https://sdk.sandbox.co.in/kyc/digilocker/sdk.js';
const COMPLETED = 'in.co.sandbox.kyc.digilocker_sdk.session.completed';
const CLOSED = 'in.co.sandbox.kyc.digilocker_sdk.session.closed';
let loader: Promise<ProviderSdk> | null = null;

const loadSdk = () => {
  if (window.DigilockerSDK) return Promise.resolve(window.DigilockerSDK);
  if (loader) return loader;
  loader = new Promise<ProviderSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    const ready = () => window.DigilockerSDK
      ? resolve(window.DigilockerSDK)
      : reject(new Error('Sandbox DigiLocker SDK did not initialize.'));
    const failed = () => reject(new Error('Sandbox DigiLocker SDK could not be loaded.'));
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch(error => {
    loader = null;
    throw error;
  });
  return loader;
};

export async function launchDigiLockerSession(
  sessionId: string,
  publicApiKey: string,
  onEvent: (event: DigiLockerClientEvent) => void,
) {
  const sdk = await loadSdk();
  const listener = new (class extends sdk.EventListener {
    override onEvent(event: ProviderEvent) {
      if (event?.type === COMPLETED) onEvent('completed');
      if (event?.type === CLOSED) onEvent('closed');
    }
  })();
  sdk.setAPIKey(publicApiKey);
  sdk.setEventListener(listener);
  sdk.open({
    session_id: sessionId,
    brand: {
      name: 'WeNitro',
      logo_url: `${window.location.origin}/wenitro-digilocker-logo.png`,
    },
    theme: { mode: 'dark', seed: '#6750F5' },
  });
}
