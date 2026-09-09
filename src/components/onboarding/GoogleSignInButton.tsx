import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { googleSignInErrorMessage, signInWithGoogleIdentity } from '../../services/google-auth';

export type GoogleSignInButtonProps = {
  onSuccess: (session: Session) => void;
  onBusyChange?: (busy: boolean) => void;
  onError: (message: string) => void;
};

export default function GoogleSignInButton({ onSuccess, onBusyChange, onError }: GoogleSignInButtonProps) {
  const [busy, setBusy] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);
  const signIn = async () => {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    setBusy(true);
    onBusyChange?.(true);
    let authenticated = false;
    try {
      const result = await signInWithGoogleIdentity({ signal: controller.signal });
      if (!controller.signal.aborted && result.status === 'authenticated') {
        authenticated = true;
        onSuccess(result.session);
      }
    } catch (error) {
      if (!controller.signal.aborted) onError(googleSignInErrorMessage(error));
    } finally {
      // Keep the successful button disabled until the parent replaces Welcome
      // with profile/Feed loading. This avoids a brief enabled-button flash.
      if (!authenticated) attempt.current = null;
      if (!controller.signal.aborted && !authenticated) { setBusy(false); onBusyChange?.(false); }
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void signIn()} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
    {busy ? <ActivityIndicator color="#374151" /> : <><Image source={require('../../../assets/google-g-logo.png')} style={styles.logo} accessible={false} /><Text style={styles.label}>Continue with Google</Text></>}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { height: 54, width: '100%', borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  logo: { width: 20, height: 20 },
  label: { color: '#000', fontSize: 16, fontWeight: '600' },
});
