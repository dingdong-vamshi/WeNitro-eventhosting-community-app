import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getCurrentSignInMethods, requestCurrentUserPasswordReset, type SignInMethodSummary } from '../services/auth-production';
import { Icon, usePalette } from './reconstruction/ui';

export function accountSecurityCopy(methods: SignInMethodSummary) {
  if (methods.kind === 'google-only') return {
    title: 'Google Sign-In',
    description: 'This account signs in with Google. Your Google password is managed by Google, so WeNitro will not send a password-reset email.',
  };
  if (methods.kind === 'linked') return {
    title: 'Google + email/password',
    description: 'Both sign-in methods are linked to this account. You can keep using Google or reset your WeNitro email/password.',
  };
  if (methods.kind === 'password-only') return {
    title: 'Email & password',
    description: 'This account has a WeNitro email/password. A secure reset link can be sent to the confirmed account email.',
  };
  if (methods.kind === 'phone-only') return {
    title: 'Phone OTP',
    description: 'This account signs in with a phone OTP and does not have a WeNitro password.',
  };
  return { title: 'Account sign-in', description: 'No email/password sign-in method is linked to this account.' };
}

export function AccountSecurityCard() {
  const c = usePalette();
  const [methods, setMethods] = useState<SignInMethodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getCurrentSignInMethods().then(value => { if (active) setMethods(value); })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load sign-in methods.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const reset = async () => {
    if (busy || !methods?.hasPassword) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await requestCurrentUserPasswordReset();
      setMessage('Password reset email sent through Supabase Auth.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not request a password reset.'); }
    finally { setBusy(false); }
  };
  const copy = methods ? accountSecurityCopy(methods) : null;
  return <View accessibilityLabel="Account sign-in methods" style={{ padding: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, gap: 12 }}>
    {loading ? <ActivityIndicator color={c.accent} /> : copy ? <>
      <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}><View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center' }}><Icon name={methods?.hasGoogle ? 'logo-google' : methods?.hasPhone ? 'phone-portrait-outline' : 'key-outline'} size={20} color={c.accent} /></View><View style={{ flex: 1, gap: 3 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{copy.title}</Text>{methods?.email ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{methods.email}</Text> : null}</View></View>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>{copy.description}</Text>
      {methods?.hasPassword ? <Pressable accessibilityRole="button" accessibilityLabel="Reset WeNitro password" disabled={busy} onPress={() => void reset()} style={{ minHeight: 45, borderWidth: 1, borderColor: c.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: busy ? .55 : 1 }}><Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{busy ? 'Sending…' : 'Reset WeNitro password'}</Text></Pressable> : null}
    </> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: '#16A34A', fontSize: 12, lineHeight: 18 }}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, lineHeight: 18 }}>{error}</Text> : null}
  </View>;
}
