import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { usePalette } from './reconstruction/ui';
import { avatarFallbackColor, avatarInitials } from '../lib/avatar-fallback';

export function UserAvatar({ uri, name, size = 48, identity }: { uri?: string | null; name: string; size?: number; identity?: string }) {
  const c = usePalette();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const style = { width: size, height: size, borderRadius: size / 2, backgroundColor: c.inset, borderWidth: 1, borderColor: c.border };
  if (uri && failedUri !== uri && /^(https?:|data:|blob:|file:)/i.test(uri)) {
    return <Image accessibilityLabel={`${name}'s avatar`} source={{ uri }} onError={() => setFailedUri(uri)} style={style} />;
  }
  const initials = avatarInitials(name);
  return <View accessibilityLabel={`${name}'s initials`} style={[style, { backgroundColor: avatarFallbackColor(identity || name), alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#FFFFFF', fontSize: size * .3, fontWeight: '700' }}>{initials}</Text></View>;
}
