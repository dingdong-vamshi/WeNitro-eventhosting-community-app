import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { googlePlaceIdUrl, resolveGooglePlace, type GooglePlace } from '../services/google-places';
import { usePalette } from './reconstruction/ui';

/** Provider content never leaves this disposable view or enters Activity/AppData/draft persistence. */
export function GoogleVenue({ placeId, compact = false }: { placeId: string; compact?: boolean }) {
  const c = usePalette();
  const [place, setPlace] = useState<GooglePlace | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setPlace(null); setError('');
    void resolveGooglePlace(placeId, controller.signal).then(value => { if (!controller.signal.aborted) setPlace(value); }).catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Venue details unavailable.'); });
    return () => controller.abort();
  }, [placeId, retry]);
  return <View style={{ gap: 4 }}>
    <Text numberOfLines={compact ? 1 : undefined} style={{ color: c.text, fontSize: compact ? 13 : 15, fontWeight: '600' }}>{place?.title || 'Google Maps venue'}</Text>
    {place && !compact ? <Text style={{ color: c.muted, fontSize: 12 }}>{place.address}</Text> : null}
    <Text style={{ color: c.isDark ? '#FFFFFF' : '#1F1F1F', fontSize: 12, fontWeight: '400' }} {...(Platform.OS === 'web' ? { translate: 'no' } : {})}>Google Maps</Text>
    {place?.attributions.map((item, i) => <Text key={i} style={{ color: c.muted, fontSize: 12 }} onPress={item.uri ? () => { void Linking.openURL(item.uri!); } : undefined}>{item.provider}</Text>)}
    {error && !compact ? <><Text accessibilityRole="alert" style={{ color: c.muted, fontSize: 12 }}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry Google venue" onPress={() => setRetry(value => value + 1)}><Text style={{ color: c.accent }}>Retry venue details</Text></Pressable></> : null}
    {!compact ? <Pressable accessibilityRole="link" accessibilityLabel="Open venue in Google Maps" onPress={() => { void Linking.openURL(googlePlaceIdUrl(placeId)).catch(() => setError('Could not open Google Maps.')); }}><Text style={{ color: c.accent, fontSize: 12 }}>Open in Google Maps</Text></Pressable> : null}
  </View>;
}
