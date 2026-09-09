import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export const MOBILE_APP_MAX_WIDTH = 430;

export function MobileAppShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.viewport}>
      <View testID="mobile-app-shell" style={styles.shell}>
        {children}
      </View>
    </View>
  );
}

export function MobileOverlayFrame({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View testID="mobile-overlay-frame" style={[styles.overlay, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    backgroundColor: "#080F1D",
    overflow: "hidden",
  },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: MOBILE_APP_MAX_WIDTH,
    alignSelf: "center",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  overlay: {
    flex: 1,
    width: "100%",
    maxWidth: MOBILE_APP_MAX_WIDTH,
    alignSelf: "center",
  },
});
