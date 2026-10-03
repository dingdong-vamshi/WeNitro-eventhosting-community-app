import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const videoExtension = /\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|m3u8)$/i;
/** Classify the supplied authorized URL without fetching or changing its capability. */
export function isSharedVideoUrl(uri?: string | null) {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    const pathname = decodeURIComponent(url.pathname);
    return videoExtension.test(pathname) || ['content-type', 'contentType', 'response-content-type'].some(key => /^video\//i.test(url.searchParams.get(key) || ''));
  } catch {
    return videoExtension.test(uri.split(/[?#]/, 1)[0]);
  }
}

export function SharedMediaPreview({ uri, kind, height = 148 }: { uri?: string | null; kind?: string; height?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const video = isSharedVideoUrl(uri);
  if (uri && !video && failedUri !== uri) {
    return <Image source={{ uri }} resizeMode="cover" accessibilityLabel="Shared content preview" onError={() => setFailedUri(uri)} style={[styles.frame, { height }]} />;
  }
  const label = video ? 'Video preview' : uri ? 'Preview unavailable' : kind === 'vibe' ? 'Vibe preview' : 'Shared content';
  return <View accessibilityRole="image" accessibilityLabel={label} style={[styles.frame, styles.fallback, { height }]}>
    <Text accessible={false} style={styles.mark}>{video ? '▶' : 'W'}</Text>
    <Text accessible={false} style={styles.label}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: '#1B2434' },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  mark: { color: '#9CB8FF', fontSize: 28, fontWeight: '800' },
  label: { color: '#CFD8E4', fontSize: 12, fontWeight: '600' },
});
