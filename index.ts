import { registerRootComponent } from 'expo';
import React from 'react';
import { Platform } from 'react-native';

import App from './App';
import { MobileAppShell } from './src/components/mobile-app-shell';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const root = document.getElementById('root');
  document.documentElement.style.width = '100%';
  document.documentElement.style.margin = '0';
  document.documentElement.style.padding = '0';
  document.body.style.width = '100%';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  if (root) {
    root.style.width = '100%';
    root.style.margin = '0';
    root.style.padding = '0';
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
function Root() {
  return React.createElement(MobileAppShell, null, React.createElement(App));
}

registerRootComponent(Root);
