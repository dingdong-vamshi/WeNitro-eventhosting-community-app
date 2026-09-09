import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { googleSignInErrorMessage, mountGoogleIdentityButton } from '../../services/google-auth.web';
import type { GoogleSignInButtonProps } from './GoogleSignInButton';

export default function GoogleSignInButton(props: GoogleSignInButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    setReady(false);
    setErrorMessage(null);
    void mountGoogleIdentityButton(element, {
      onSuccess: (session) => callbacks.current.onSuccess(session),
      onBusyChange: (value) => { setBusy(value); callbacks.current.onBusyChange?.(value); },
      onError: (error) => callbacks.current.onError(googleSignInErrorMessage(error)),
    }, controller.signal).then((cleanup) => {
      if (controller.signal.aborted) cleanup();
      else { dispose = cleanup; setReady(true); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setErrorMessage(googleSignInErrorMessage(error));
    });
    return () => { controller.abort(); dispose?.(); };
  }, [retry]);
  return <div style={{ position: 'relative', width: '100%', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-busy={busy}>
    <div ref={container} style={{ width: '100%', pointerEvents: busy ? 'none' : 'auto', visibility: busy || !ready ? 'hidden' : 'visible' }} />
    {(!ready || busy) && <button type="button" disabled={busy || (!ready && !errorMessage)} onClick={() => { if (errorMessage) { callbacks.current.onError(errorMessage); setRetry((value) => value + 1); } }} aria-label="Continue with Google" style={{ position: 'absolute', inset: 0, border: 0, borderRadius: 14, background: 'white', color: '#000', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: errorMessage ? 'pointer' : 'default' }}>
      {busy || !errorMessage ? <ActivityIndicator color="#374151" /> : <><Image source={require('../../../assets/google-g-logo.png')} style={{ width: 20, height: 20 }} accessible={false} />Continue with Google</>}
    </button>}
  </div>;
}
