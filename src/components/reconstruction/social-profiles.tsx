import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { normalizeSocialUrl, SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from '../../domain/social-profiles';
import { Icon, Page, Skeleton, usePalette } from './ui';

export function SocialPlatformIcon({ platform, size = 18, color }: { platform: SocialPlatform; size?: number; color?: string }) {
  const config = SOCIAL_PLATFORMS.find(item => item.key === platform)!;
  return platform === 'twitter'
    ? <Text style={{ color: color || config.color, fontSize: size, fontWeight: '600', lineHeight: size + 3 }}>𝕏</Text>
    : <Icon name={config.icon} size={size} color={color || config.color} />;
}

export function SocialProfilesScreen({ userId, back, onSaved }: { userId: string; back: () => void; onSaved: () => void }) {
  const c = usePalette();
  const [values, setValues] = useState<SocialLinks>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [focused, setFocused] = useState<SocialPlatform | null>(null);
  const lock = useRef(false), identity = useRef('');
  useEffect(() => {
    let active = true;
    void (async () => {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error('Please sign in to update your social profiles.');
      const [me, links] = await Promise.all([supabase.rpc('get_current_app_user_id'), supabase.rpc('my_social_links')]);
      if (me.error || String(me.data) !== userId) throw new Error('Your account changed. Reopen Social Profiles.');
      if (links.error) throw links.error;
      if (active) {
        identity.current = auth.data.user.id;
        setValues(Object.fromEntries(SOCIAL_PLATFORMS.map(({ key }) => [key, typeof links.data?.[key] === 'string' ? links.data[key] : ''])) as SocialLinks);
      }
    })().catch(e => active && setError(e.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId]);
  const save = async () => {
    if (lock.current || !identity.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const normalized = Object.fromEntries(SOCIAL_PLATFORMS.map(({ key }) => [key, normalizeSocialUrl(key, values[key] || '')]));
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data.user?.id !== identity.current) throw new Error('Your account changed. Reopen Social Profiles.');
      const result = await supabase.rpc('my_social_links', { p_patch: normalized });
      if (result.error) throw result.error;
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update your social profiles. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Page>
    <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" disabled={busy} onPress={back} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-back" size={21} /></Pressable>
      <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>Social Profiles</Text>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 21 }}>
        <View style={{ flexDirection: 'row', gap: 8, padding: 13, borderRadius: 11, backgroundColor: c.isDark ? '#111F33' : '#EEF4FF', borderWidth: 1, borderColor: c.isDark ? '#21334F' : '#DCE6FB' }}>
          <Icon name="information-circle-outline" size={16} color="#3979DA" />
          <Text style={{ flex: 1, color: c.muted, fontSize: 11, lineHeight: 17 }}>You can enter either your full profile URL or just your username/handle. We’ll handle the rest!</Text>
        </View>
        {loading ? <Skeleton /> : SOCIAL_PLATFORMS.map(item => <View key={item.key} style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{item.label}</Text>
          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: focused === item.key ? c.accent : c.border, borderRadius: 11, backgroundColor: c.isDark ? c.input : '#FFF', paddingHorizontal: 12 }}>
            <TextInput accessibilityLabel={item.label} placeholder={item.placeholder} placeholderTextColor={c.iconMuted} value={values[item.key] || ''} onChangeText={value => setValues(current => ({ ...current, [item.key]: value }))} onFocus={() => setFocused(item.key)} onBlur={() => setFocused(null)} editable={!busy} maxLength={250} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ flex: 1, minHeight: 46, color: c.text, fontSize: 13, paddingRight: 10, outlineStyle: 'none' } as any} />
            <SocialPlatformIcon platform={item.key} color={item.key === 'twitter' ? c.text : item.color} />
          </View>
        </View>)}
        {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, lineHeight: 18 }}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={loading || busy || !identity.current} onPress={() => void save()} style={{ minHeight: 50, borderRadius: 13, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: loading || busy ? .6 : 1 }}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>Update Social Links</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </Page>;
}
