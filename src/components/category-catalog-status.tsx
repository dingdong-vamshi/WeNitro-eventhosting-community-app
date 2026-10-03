import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePalette } from './reconstruction/ui';

type CatalogState = { names: string[]; error: string; loading: boolean; retry: () => void };

/** Shared loading, empty and retry feedback for every live category selector. */
export function CategoryCatalogStatus({ catalog }: { catalog: CatalogState }) {
  const c = usePalette();
  if (!catalog.error && !catalog.loading && catalog.names.length) return null;
  return <View style={{ padding: 10, gap: 8 }}>
    <Text accessibilityRole={catalog.error ? 'alert' : undefined} style={{ color: catalog.error ? c.danger : c.muted, fontSize: 13, lineHeight: 19 }}>
      {catalog.error || (catalog.loading ? 'Loading categories…' : 'No active categories are available yet.')}
    </Text>
    {!catalog.loading ? <Pressable accessibilityRole="button" accessibilityLabel="Retry categories" onPress={catalog.retry} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
      <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>Retry categories</Text>
    </Pressable> : null}
  </View>;
}
