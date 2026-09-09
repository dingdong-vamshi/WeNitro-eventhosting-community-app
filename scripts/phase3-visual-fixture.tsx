// Isolated browser component fixture. Never imported by the app entry.
// All Community methods below are replaced before rendering; no social writes occur.
import { registerRootComponent } from 'expo';
import * as Font from 'expo-font';
import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CommunityConversation, VibeEntryState } from '../src/components/community/reference-community';
import { communitiesProductionService } from '../src/services/communities-production';
import { realtimeChatService } from '../src/services/realtime-chat';

communitiesProductionService.getCommunity = async () => ({ id: '1', name: 'Component preview', imageUrl: null } as any);
realtimeChatService.loadMessagesPage = async () => ({ items: [], nextCursor: null });
realtimeChatService.subscribeToConversation = async () => ({ cleanup: async () => undefined } as any);
realtimeChatService.markConversationRead = async () => ({ conversationId: 1, userId: 1, readAt: new Date().toISOString() });
realtimeChatService.sendMessage = async () => { throw new Error('This isolated preview cannot send messages.'); };
function Preview() {
  if (!__DEV__) throw new Error('Visual fixture is development-only.');
  const state = new URLSearchParams(window.location.search).get('state');
  const [success, setSuccess] = useState(true);
  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: '#101827' }}>{state === 'chat' ? <CommunityConversation id="1" userId="1" name="Component preview" success={success} onDismissSuccess={() => setSuccess(false)} onBack={() => undefined} onInfo={() => undefined} onMessage={() => undefined} /> : <VibeEntryState loading={state === 'loading'} onBack={() => undefined} onRetry={() => undefined} />}</View></SafeAreaProvider>;
}
void Font.loadAsync({ ionicons: { uri: 'http://127.0.0.1:8097/Ionicons.ttf' } }).then(() => registerRootComponent(Preview));
