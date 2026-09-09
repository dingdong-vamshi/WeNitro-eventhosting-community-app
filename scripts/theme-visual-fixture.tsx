// Isolated development-only theme fixture. It is never imported by the application entry.
// The fixture uses local sample records and replaces notification/community reads before rendering.
import { registerRootComponent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ActivityDetailScreen,
  ChatScreen,
  CommunitiesScreen,
  CommunityDetailScreen,
  NotificationsScreen,
  ThemeContext,
  type AppData,
  type Screen,
} from '../App';
import { ShareToChatModal } from '../src/components/ShareToChatModal';
import { CommunityConversation, CreateCommunitySheet, VibeEntryState } from '../src/components/community/reference-community';
import { HostActivityScreen, HostLanding } from '../src/components/hosting/host-activity-screen';
import { MobileAppShell } from '../src/components/mobile-app-shell';
import { WelcomeScreen, ProfileCompletionScreen } from '../src/components/onboarding/reference-screens';
import { ReferenceFeed } from '../src/components/reconstruction/feed-search';
import { ReferenceMessages } from '../src/components/reconstruction/messages';
import { ReferenceProfile } from '../src/components/reconstruction/profile';
import { ReferenceSettings } from '../src/components/reconstruction/settings';
import { ReferenceNavigation, ReferenceTheme, usePalette } from '../src/components/reconstruction/ui';
import { communitiesProductionService } from '../src/services/communities-production';
import { notificationService, type ProductionNotification } from '../src/services/notifications-production';
import { realtimeChatService } from '../src/services/realtime-chat';

const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);
const image = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="540"%3E%3Crect width="960" height="540" fill="%23F18A45"/%3E%3Ccircle cx="480" cy="240" r="115" fill="%23FFD9A8"/%3E%3Ctext x="480" y="420" text-anchor="middle" font-family="sans-serif" font-size="42" fill="%23182033"%3EWeNitro QA%3C/text%3E%3C/svg%3E';
const avatar = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160"%3E%3Crect width="160" height="160" rx="80" fill="%236252E8"/%3E%3Ctext x="80" y="102" text-anchor="middle" font-family="sans-serif" font-size="64" fill="white"%3EV%3C/text%3E%3C/svg%3E';

const sampleActivity = {
  id: 'qa-activity', title: 'Weekend Badminton Meetup', category: 'Sports', when: now.toLocaleString(), where: 'Indiranagar, Bengaluru', price: 'Free', seats: 12, joined: 4,
  image, host: 'Vamshi', hostAvatar: avatar, description: 'A friendly evening game for intermediate players. Bring your racquet and water.', startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 7_200_000).toISOString(),
  registrationClosesAt: new Date(now.getTime() + 3_600_000).toISOString(), visibility: 'public', status: 'published', activityType: 'sport', joinType: 'direct', viewerStatus: null, likeCount: 8,
};

const sampleData: AppData = {
  mode: 'unauthenticated', userId: 'qa-user', name: 'Vamshi Pendyala', username: '@vamshi', email: 'qa@example.invalid', bio: 'Building real local connections.', location: 'Bengaluru', trustScore: 82,
  interests: ['Sports', 'Startups', 'Travel'], badges: [], activities: [sampleActivity as any], vibes: [],
  communities: [{ id: 'qa-community', name: 'Bengaluru Weekend Crew', tagline: 'Meet people and make plans around the city.', category: 'Social', tags: ['Social', 'Local', 'Weekend'], memberCount: 128, onlineCount: 14, visibility: 'Public', membership: 'joined', verified: true, image, cover: image, rules: [], posts: [{ id: 'qa-post', author: 'Priya Nair', createdAt: yesterday.toISOString(), title: 'Sunday plan ideas', body: 'Share your favorite outdoor activity for this weekend.', category: 'Discussion', reactions: 14, comments: 3, liked: false }] }],
  conversations: [
    { id: 'chat-local', name: 'Priya Nair', type: 'People', roomType: 'personal', avatar, memberCount: 2, online: true, unread: 2, userId: 'qa-priya', lastMessageAt: now.toISOString(), messages: [
      { id: 'm1', sender: 'Priya', text: 'Are we still on for badminton?', time: '6:20 PM', mine: false, createdAt: yesterday.toISOString(), messageType: 'text' },
      { id: 'm2', sender: 'You', text: 'Yes, see you at the court!', time: '6:24 PM', mine: true, createdAt: now.toISOString(), messageType: 'text' },
    ] },
    { id: 'group-local', name: 'Weekend Players', type: 'Groups', roomType: 'group', avatar: image, memberCount: 8, online: false, unread: 0, lastMessageAt: yesterday.toISOString(), messages: [] },
  ],
  stories: [], people: [], savedIds: [], likedIds: [], nitro: 240, onboarded: true, avatarUri: avatar, theme: 'light', themePreference: 'light', friendCount: 18,
};

const notifications: ProductionNotification[] = [
  { id: 1, user_id: 1, sender_id: 2, type: 'profile_interaction', notification_type: 'profile_interaction', reference_id: '2', title: 'Priya Nair', body: 'interacted with you', data: {}, is_read: false, read_at: null, created_at: now.toISOString() },
  { id: 2, user_id: 1, sender_id: 3, type: 'activity_join', notification_type: 'activity_join', reference_id: 'qa-activity', title: 'Suchit Pradhan', body: 'joined your activity', data: { activity_id: 'qa-activity' }, is_read: true, read_at: yesterday.toISOString(), created_at: yesterday.toISOString() },
];

notificationService.list = async () => notifications;
notificationService.subscribe = async () => undefined as any;
notificationService.markRead = async () => undefined;
notificationService.markAllRead = async () => undefined;
communitiesProductionService.getCommunity = async () => ({ id: '77', name: 'Bengaluru Weekend Crew', imageUrl: null, adminsOnly: false, membershipRole: 'member' } as any);
realtimeChatService.loadMessagesPage = async () => ({ items: [
  { id: 1, sender_id: 2, body: 'Welcome to the community!', created_at: yesterday.toISOString(), message_type: 'text', deleted_at: null, poll_id: null, media_type: null, media_signed_url: null, share_payload: null, profiles: { full_name: 'Priya Nair', username: 'priya' } },
  { id: 2, sender_id: 1, body: 'Happy to be here.', created_at: now.toISOString(), message_type: 'text', deleted_at: null, poll_id: null, media_type: null, media_signed_url: null, share_payload: null, profiles: { full_name: 'Vamshi', username: 'vamshi' } },
] as any, nextCursor: null });
realtimeChatService.subscribeToConversation = async () => ({ cleanup: async () => undefined } as any);
realtimeChatService.markConversationRead = async () => ({ conversationId: 77, userId: 1, readAt: now.toISOString() });

function GoogleButton() {
  const c = usePalette();
  return <View style={{ minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 }}><Text style={{ color: c.text, fontWeight: '700' }}>G</Text><Text style={{ color: c.text, fontWeight: '600' }}>Continue with Google</Text></View>;
}

function Preview() {
  if (!__DEV__) throw new Error('Theme fixture is development-only.');
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requested = params.get('theme') || 'light';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = requested === 'system' ? (systemDark ? 'dark' : 'light') : requested === 'dark' ? 'dark' : 'light';
  const [data, setData] = useState<AppData>({ ...sampleData, theme: initialTheme, themePreference: requested === 'system' ? 'system' : initialTheme });
  const screen = params.get('screen') || 'host';
  const go = (_screen: Screen) => undefined;
  let content: React.ReactNode;
  if (screen === 'welcome') content = <WelcomeScreen googleButton={<GoogleButton />} onFallback={() => undefined} onLegal={() => undefined} />;
  else if (screen === 'profileCompletion') content = <ProfileCompletionScreen initial={{ fullName: 'Vamshi Pendyala', username: 'vamshi', dateOfBirth: '1998-09-09', gender: 'male' }} checkUsername={async username => ({ available: true, username })} onSubmit={async () => undefined} />;
  else if (screen === 'hostActivity') content = <HostActivityScreen userId={`theme-${data.theme}`} isPartner={false} onBack={() => undefined} onCreated={() => undefined} />;
  else if (screen === 'feed') content = <ReferenceFeed data={data} setData={setData} go={go} openActivity={() => undefined} refreshOnMount={false} />;
  else if (screen === 'messages') content = <ReferenceMessages data={data} tab="Chats" setTab={() => undefined} filter="All" setFilter={() => undefined} openProfile={() => undefined} openConversation={() => undefined} startConversation={async () => undefined} openCommunity={() => undefined} createCommunity={() => undefined} openLegacy={() => undefined} />;
  else if (screen === 'chat') content = <ChatScreen data={data} setData={setData} initialConversationId="chat-local" onConversationChange={() => undefined} />;
  else if (screen === 'notifications') content = <NotificationsScreen back={() => undefined} mode="authenticated" openActivity={() => undefined} openCommunity={() => undefined} openProfile={() => undefined} openConversation={() => undefined} openVibe={() => undefined} go={go} />;
  else if (screen === 'communities') content = <CommunitiesScreen data={data} setData={setData} go={go} openCommunity={() => undefined} />;
  else if (screen === 'communityChat') content = <CommunityConversation id="77" userId="1" name="Bengaluru Weekend Crew" success={false} onDismissSuccess={() => undefined} onBack={() => undefined} onInfo={() => undefined} onMessage={() => undefined} />;
  else if (screen === 'communityPosts') content = <CommunityDetailScreen community={data.communities[0]} authorName={data.name} setData={setData} back={() => undefined} onConversation={() => undefined} />;
  else if (screen === 'createCommunity') content = <><HostLanding onActivity={() => undefined} onVibe={() => undefined} onCommunity={() => undefined} /><CreateCommunitySheet onClose={() => undefined} onCreated={() => undefined} /></>;
  else if (screen === 'activity') content = <ActivityDetailScreen activity={data.activities[0]} data={data} setData={setData} back={() => undefined} go={go} openActivity={() => undefined} openProfile={() => undefined} onOpenVibe={() => undefined} onMessageHost={async () => undefined} onOpenGroupChat={async () => undefined} onManagePartner={() => undefined} />;
  else if (screen === 'settings') content = <ReferenceSettings data={data} setData={setData} back={() => undefined} go={go} />;
  else if (screen === 'profile') content = <ReferenceProfile data={data} setData={setData} go={go} openActivity={() => undefined} openDraft={() => undefined} openVibe={() => undefined} openSquad={() => undefined} />;
  else if (screen === 'share') content = <><View style={{ flex: 1 }} /><ShareToChatModal entity={{ kind: 'activity', id: 'qa-activity', title: sampleActivity.title, preview: `${sampleActivity.when} · ${sampleActivity.where}` }} conversations={data.conversations} people={data.people} onClose={() => undefined} onSent={() => undefined} /></>;
  else if (screen === 'vibeEmpty') content = <VibeEntryState loading={false} onBack={() => undefined} onRetry={() => undefined} />;
  else content = <HostLanding onActivity={() => undefined} onVibe={() => undefined} onCommunity={() => undefined} />;
  const nav = ['host', 'feed', 'messages', 'communities'].includes(screen);
  return <SafeAreaProvider><ReferenceTheme.Provider value={data.theme}><ThemeContext.Provider value={data.theme}><MobileAppShell><View style={{ flex: 1 }}>{content}{nav ? <ReferenceNavigation active={screen === 'messages' || screen === 'communities' ? 'chat' : screen} go={() => undefined} /> : null}</View></MobileAppShell></ThemeContext.Provider></ReferenceTheme.Provider></SafeAreaProvider>;
}

registerRootComponent(Preview);
