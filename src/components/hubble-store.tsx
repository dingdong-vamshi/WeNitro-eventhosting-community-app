import React from 'react';
import { Text, View } from 'react-native';
import { Icon, usePalette } from './reconstruction/ui';

export function HubbleStore() {
  const c = usePalette();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
    <Icon name="globe-outline" size={46} color={c.accent} />
    <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Hubble rewards are available on WeNitro Web</Text>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>Open the browser version to access the rewards catalogue.</Text>
  </View>;
}
