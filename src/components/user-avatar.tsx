import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { usePalette } from './reconstruction/ui';

export function UserAvatar({ uri, name, size = 48 }: { uri?: string | null; name: string; size?: number }) {
  const c = usePalette();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const style = { width: size, height: size, borderRadius: size / 2, backgroundColor: c.inset, borderWidth: 1, borderColor: c.border };
  if (uri && failedUri !== uri && /^(https?:|data:|blob:|file:)/i.test(uri)) {
    return <Image accessibilityLabel={`${name}'s avatar`} source={{ uri }} onError={() => setFailedUri(uri)} style={style} />;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
  return <View accessibilityLabel={`${name}'s initials`} style={[style, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: c.accent, fontSize: size * .3, fontWeight: '700' }}>{initials}</Text></View>;
}
