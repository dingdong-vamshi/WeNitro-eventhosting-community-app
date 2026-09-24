import { VerifiedBadge } from '../verified-badge';
import { UserAvatar } from '../user-avatar';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { AppData } from '../../../App';
import { communitiesProductionService, type CommunitySummary } from '../../services/communities-production';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { realtimeChatService } from '../../services/realtime-chat';
import { storiesProductionService } from '../../services/stories-production';
import { subscribeToAppForeground } from '../../services/app-freshness';
import { Action, Button, ErrorLine, Icon, Page, Sheet, Skeleton, ui, usePalette, purple } from './ui';

const isBackendId = (value: string) => /^[1-9]\d*$/.test(value);

function mediaUri(value?: string | null) {
  const path = String(value || '').trim();
  if (!path || path.includes('dicebear') || path.includes('placeholder')) return undefined;
  if (/^(https?:|data:|blob:|file:)/i.test(path)) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

function inboxDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  });
}

function startsWithQuery(haystack: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay = haystack.trim().toLowerCase();
  return hay.startsWith(needle) || hay.split(/[\s@._-]+/).filter(Boolean).some((part) => part.startsWith(needle));
}

export function ReferenceMessages({ data, tab, setTab, filter, setFilter, openConversation, startConversation, openCommunity, createCommunity, setData }: { data: AppData; tab: string; setTab: (tab: string) => void; filter: string; setFilter: (filter: string) => void; openProfile: (id: string) => void; openConversation: (id: string) => void; startConversation: (person: { id: number; username: string; fullname: string; profile_image: string }) => Promise<void>; openCommunity: (c: CommunitySummary) => void; createCommunity: () => void; setData: React.Dispatch<React.SetStateAction<AppData>>; openLegacy?: () => void }) {
  const c = usePalette();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CommunitySummary[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [people, setPeople] = useState<{ id: number; username: string; fullname: string; profile_image: string }[]>([]);
  const [inbox, setInbox] = useState<Record<string, any>>({});
  const [inboxError, setInboxError] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [storyPreview, setStoryPreview] = useState<AppData['stories'][number] | null>(null);
  const [markingStories, setMarkingStories] = useState(false);

  useEffect(() => {
    if (!creatingGroup || data.people.length || people.length) return;
    void (async () => {
      try {
        const { data: result } = await supabase.rpc('list_discoverable_people', { p_limit: 50 });
        if (Array.isArray(result)) setPeople(result.filter((p: any) => String(p.id) !== data.userId).map((p: any) => ({ id: Number(p.id), username: String(p.username || ''), fullname: String(p.fullname || p.username || ''), profile_image: String(p.profile_image || '') })));
      } catch { /* The empty member picker remains a safe fallback. */ }
    })();
  }, [creatingGroup]);

  useEffect(() => { setQuery(''); setPage(1); setFilter('All'); }, [tab]);
  useEffect(() => { setPage(1); }, [query, filter, version, data.userId]);
  useEffect(() => subscribeToAppForeground(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    const missing = data.conversations
      .filter((conversation) => conversation.type === 'People' && conversation.userId && isBackendId(conversation.userId) && !mediaUri(conversation.avatar) && !avatars[conversation.userId])
      .map((conversation) => Number(conversation.userId));
    if (!missing.length) return;
    let active = true;
    void supabase.from('tbl_users').select('id,profile_image').in('id', [...new Set(missing)]).then(({ data: rows }) => {
      if (!active || !rows?.length) return;
      setAvatars((current) => {
        const next = { ...current };
        for (const row of rows) {
          const uri = mediaUri(row.profile_image);
          if (uri) next[String(row.id)] = uri;
        }
        return next;
      });
    });
    return () => { active = false; };
  }, [data.conversations]);

  useEffect(() => {
    if (tab !== 'Communities') return;
    let active = true;
    const controller = new AbortController();
    // Last-message previews are stable while a user searches or pages communities.
    // Refresh on tab entry/foreground/account change, not on every search keystroke.
    void Promise.resolve(supabase.rpc('list_chat_inbox', { p_message_limit: 1 }).abortSignal(controller.signal)).then(result => {
      if (!active) return;
      if (result.error) throw result.error;
      setInbox(Object.fromEntries((result.data || []).map((row: any) => [String(row.id || row.room_id), row])));
      setInboxError('');
    }).catch(caught => { if (active && !controller.signal.aborted) setInboxError(caught.message || 'Could not refresh message previews.'); });
    return () => { active = false; controller.abort(); };
  }, [tab, version, data.userId]);

  useEffect(() => {
    // Clear private preview state when the authenticated account changes.
    setInbox({}); setInboxError(''); setRows([]); setAvatars({});
  }, [data.userId]);

  useEffect(() => {
    if (tab !== 'Communities') return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void communitiesProductionService.discover({ query, membership: filter.toLowerCase() as 'all' | 'joined' | 'created', page, pageSize: 25 }).then(communities => {
        if (!active) return;
        setRows((current) => page === 1 ? communities.items : [...new Map([...current, ...communities.items].map(room => [room.id, room])).values()]);
        setMore(communities.hasMore);
        setError('');
      }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    }, query ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, query, filter, page, version, data.userId]);

  useEffect(() => {
    let active = true;
    if (tab !== 'Chats' || !query.trim()) { setPeople([]); return; }
    const timer = setTimeout(() => {
      const safe = query.trim().replace(/[%_,()."\\]/g, ' ').slice(0, 80);
      void supabase.from('tbl_users').select('id,username,fullname,profile_image')
        .or(`username.ilike.${safe}%,fullname.ilike.${safe}%,fullname.ilike.% ${safe}%`)
        .limit(20)
        .then(({ data: result, error }) => {
          if (!active) return;
          if (error) setError(error.message);
          else setPeople((result || []).filter((p) => String(p.id) !== data.userId && startsWithQuery(`${p.fullname || ''} ${p.username || ''}`, query)));
        });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, query]);

  const conversations = data.conversations.filter((r) =>
    r.roomType !== 'community'
    && !data.communities.some((cm) => cm.id === r.id)
    && (tab === 'Chats' ? r.type === 'People' : r.type === 'Groups')
    && startsWithQuery(r.name, query)
    && (tab !== 'Groups' || filter !== 'Unread' || r.unread > 0),
  );
  const searchPeople = people.filter((person) => startsWithQuery(`${person.fullname || ''} ${person.username || ''}`, query) && !conversations.some((conversation) => conversation.userId === String(person.id)));
  const visibleTab = tab === 'Groups' ? 'Activities' : tab;
  const tabCounts = {
    Chats: data.conversations.filter((item) => item.type === 'People').length,
    Activities: data.conversations.filter((item) => item.type === 'Groups' && item.roomType !== 'community' && !data.communities.some((community) => community.id === item.id)).length,
    Communities: new Set([...data.communities.map((item) => item.id), ...rows.map((item) => item.id)]).size,
  };
  const groupPeople = data.people.length
    ? data.people.map((person) => ({ id: person.id, name: person.name, username: person.username, avatar: person.avatar }))
    : people.map((person) => ({ id: String(person.id), name: person.fullname || person.username, username: person.username, avatar: person.profile_image }));

  const createGroup = async () => {
    if (!groupPhoto) return Alert.alert('Add a group photo', 'Choose a profile picture so this group is easy to recognize.');
    if (groupName.trim().length < 3 || groupMembers.length < 2) return Alert.alert('Add group details', 'Enter a group name and select at least two people.');
    const memberIds = groupPeople.filter((person) => groupMembers.includes(person.id) && isBackendId(person.id)).map((person) => Number(person.id));
    if (isSupabaseConfigured && memberIds.length < 2) return Alert.alert('Real members required', 'Select at least two WeNitro members.');
    setGroupBusy(true);
    try {
      let avatar = groupPhoto;
      let groupId = `group-${Date.now()}`;
      if (isSupabaseConfigured) {
        const imagePath = await realtimeChatService.uploadGroupPhoto(groupPhoto);
        groupId = String(await realtimeChatService.createGroupConversation(groupName.trim(), memberIds, imagePath));
        avatar = (await realtimeChatService.signedRoomImage(imagePath)) || groupPhoto;
      }
      setData((current) => ({
        ...current,
        conversations: current.conversations.some((item) => item.id === groupId)
          ? current.conversations
          : [{ id: groupId, name: groupName.trim(), type: 'Groups', roomType: 'group', avatar, memberCount: groupMembers.length + 1, online: true, unread: 0, memberIds: groupMembers, messages: [] }, ...current.conversations],
      }));
      setCreatingGroup(false); setGroupName(''); setGroupPhoto(null); setGroupMembers([]); openConversation(groupId);
    } catch (caught) {
      Alert.alert('Could not create group', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setGroupBusy(false);
    }
  };

  const conversationAvatar = (conv: AppData['conversations'][number]) =>
    mediaUri(conv.avatar)
    || (conv.userId ? avatars[conv.userId] : undefined)
    || mediaUri(data.people.find((person) => person.id === conv.userId)?.avatar);
  const markStorySeen = async (story: AppData['stories'][number]) => {
    setStoryPreview(story);
    if (story.viewed) return;
    try {
      if (isBackendId(story.id)) await storiesProductionService.markViewed(story.id);
      setData((current) => ({ ...current, stories: current.stories.map((item) => item.id === story.id ? { ...item, viewed: true } : item) }));
    } catch (caught) {
      Alert.alert('Story view not saved', caught instanceof Error ? caught.message : 'Please try again.');
    }
  };
  const markAllStoriesSeen = async () => {
    if (markingStories) return;
    const unseen = data.stories.filter((story) => !story.viewed);
    if (!unseen.length) return;
    setMarkingStories(true);
    const results = await Promise.allSettled(unseen.map((story) => isBackendId(story.id) ? storiesProductionService.markViewed(story.id) : Promise.resolve()));
    const failed = new Set(unseen.filter((_, index) => results[index].status === 'rejected').map((story) => story.id));
    setData((current) => ({ ...current, stories: current.stories.map((story) => failed.has(story.id) ? story : { ...story, viewed: true }) }));
    if (failed.size) Alert.alert('Some stories could not be marked seen', 'Please check your connection and try again.');
    setMarkingStories(false);
  };

  return (
    <Page>
      <View style={{ height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: c.text, fontSize: 21, fontWeight: '700' }}>Messages</Text>
        {tab !== 'Communities' && <Action name="add-circle-outline" label="Create a group" onPress={() => setCreatingGroup(true)} />}
      </View>
      <View style={{ height: 42, flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border, paddingHorizontal: 14 }}>
        {['Chats', 'Activities', 'Communities'].map((value) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: visibleTab === value }} onPress={() => setTab(value === 'Activities' ? 'Groups' : value)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: visibleTab === value ? c.accent : 'transparent' }}>
            <Text style={{ color: visibleTab === value ? c.accent : c.muted, fontSize: 12, fontWeight: '600' }}>{value} {tabCounts[value as keyof typeof tabCounts]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginHorizontal: 14, marginVertical: 8, height: 42, backgroundColor: c.input, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="search-outline" size={18} color={c.muted} />
        <TextInput
          accessibilityLabel={tab === 'Chats' ? 'Search chats or users' : tab === 'Groups' ? 'Search activity chats' : 'Search communities'}
          placeholder={tab === 'Chats' ? 'Search chats or users...' : tab === 'Groups' ? 'Search activity chats...' : 'Search communities...'}
          placeholderTextColor={c.iconMuted}
          value={query}
          autoCorrect={false}
          autoCapitalize="none"
          onChangeText={setQuery}
          style={{ flex: 1, color: c.text, fontSize: 12, height: 40 } as any}
        />
      </View>
      {tab === 'Communities' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 6, gap: 7 }}>
          {['All', 'Joined', 'Created'].map((value) => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={{ minHeight: 32, paddingHorizontal: 16, borderRadius: 16, backgroundColor: filter === value ? c.accent : c.inset, justifyContent: 'center' }}>
              <Text style={{ color: filter === value ? '#FFF' : c.muted, fontSize: 11, fontWeight: '600' }}>{value}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {tab === 'Groups' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 6, gap: 7 }}>
          {['All', 'Unread'].map((value) => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={{ minHeight: 32, paddingHorizontal: 16, borderRadius: 16, backgroundColor: filter === value ? c.accent : c.inset, justifyContent: 'center' }}>
              <Text style={{ color: filter === value ? '#FFF' : c.muted, fontSize: 11, fontWeight: '600' }}>{value}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {data.stories.length ? <View style={{ paddingHorizontal: 14, paddingBottom: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: '700' }}>Stories</Text><Pressable accessibilityRole="button" disabled={markingStories || !data.stories.some((story) => !story.viewed)} onPress={() => void markAllStoriesSeen()}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', opacity: data.stories.some((story) => !story.viewed) ? 1 : .5 }}>{markingStories ? 'Saving…' : 'Mark all seen'}</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {data.stories.map((story) => <Pressable key={story.id} accessibilityRole="button" accessibilityLabel={`Open ${story.name} story`} onPress={() => void markStorySeen(story)} style={{ alignItems: 'center', gap: 4, width: 58 }}><View style={{ padding: 2, borderWidth: story.viewed ? 1 : 2, borderColor: story.viewed ? c.border : c.accent, borderRadius: 27 }}><UserAvatar uri={story.authorAvatar || story.image} name={story.name} size={46} /></View><Text numberOfLines={1} style={{ color: c.muted, fontSize: 9, width: 58, textAlign: 'center' }}>{story.name}</Text></Pressable>)}
        </ScrollView>
      </View> : null}
      <ErrorLine text={error} />
      {tab === 'Communities' && inboxError ? <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}><ErrorLine text={inboxError} /><Pressable accessibilityRole="button" onPress={() => setVersion(value => value + 1)}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Retry message previews</Text></Pressable></View> : null}
      {tab === 'Communities' && loading && page === 1 ? <Skeleton count={5} /> : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}>
          {tab === 'Communities' ? rows.map((room) => {
            const conv = data.conversations.find((v) => v.id === room.id);
            const remote = inbox[room.id];
            const message = conv?.messages[conv.messages.length - 1];
            const latest = remote?.last_message;
            const text = message?.text || latest?.content || latest?.body || '';
            const kind = message?.messageType || latest?.message_type;
            const preview = kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : kind === 'poll' ? 'Poll' : text;
            const mine = message ? message.mine : String(latest?.sender_id) === data.userId;
            const at = conv?.lastMessageAt || latest?.created_at || remote?.last_message_at;
            const senderImage = mediaUri(latest?.sender?.profile_image || latest?.profiles?.avatar_url || latest?.sender?.avatar_url);
            return (
              <Pressable accessibilityRole="button" key={room.id} onPress={() => openCommunity(room)} style={[ui.row, { paddingHorizontal: 0, minHeight: 76, borderBottomWidth: 1, borderColor: c.border }]}>
                <UserAvatar uri={mediaUri(room.imageUrl) || mediaUri(room.coverUrl) || senderImage} name={room.name} size={48} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{room.name}</Text>
                  <Text style={{ color: '#9C90F4', fontSize: 10 }}>{room.category}</Text>
                  {preview ? <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11 }}>{mine ? 'You: ' : ''}{preview}</Text> : null}
                </View>
                {at ? <Text style={{ color: c.muted, fontSize: 9 }}>{inboxDate(at)}</Text> : null}
              </Pressable>
            );
          }) : (
            <>
              {conversations.length ? <Text style={[ui.section, { color: c.muted, marginTop: 6, marginBottom: 4, fontSize: 10 }]}>ACTIVE CONVERSATIONS</Text> : null}
              {conversations.map((conv) => {
                const last = conv.messages[conv.messages.length - 1];
                const at = conv.lastMessageAt || last?.createdAt;
                return (
                  <Pressable accessibilityRole="button" key={conv.id} onPress={() => openConversation(conv.id)} style={[ui.row, { paddingHorizontal: 0, borderBottomWidth: 1, borderColor: c.border, minHeight: 72 }]}>
                    <UserAvatar uri={conversationAvatar(conv)} name={conv.name} size={48} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{conv.name} {conv.type === 'People' && <VerifiedBadge userId={conv.userId} />}</Text>
                      <Text style={{ color: c.muted, fontSize: 11 }} numberOfLines={1}>{last ? `${last.mine ? 'You: ' : ''}${last.text || (last.messageType === 'video' ? 'Video' : 'Photo')}` : 'No messages yet'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 7 }}>
                      {at ? <Text style={{ color: c.muted, fontSize: 9 }}>{inboxDate(at)}</Text> : null}
                      {conv.unread > 0 && <Text style={{ color: 'white', backgroundColor: purple, borderRadius: 11, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9 }}>{conv.unread}</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          {tab === 'Chats' && searchPeople.length ? <Text style={[ui.section, { color: c.muted, marginTop: 16 }]}>PEOPLE</Text> : null}
          {tab === 'Chats' && searchPeople.map((p) => (
            <Pressable accessibilityRole="button" key={'person:' + p.id} onPress={() => void startConversation(p)} style={[ui.row, { paddingHorizontal: 0 }]}>
              <UserAvatar uri={mediaUri(p.profile_image)} name={p.fullname || p.username} size={48} />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: c.text, fontSize: 13 }}>{p.fullname || p.username} <VerifiedBadge userId={p.id} /></Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>@{p.username}</Text>
              </View>
              <Icon name="chatbubble-outline" color={purple} size={20} />
            </Pressable>
          ))}
          {!loading && !(tab === 'Communities' ? rows.length : conversations.length + searchPeople.length) && (
            <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center', marginTop: 38 }}>
              {query.trim()
                ? `No names starting with “${query.trim()}”.`
                : tab === 'Chats' ? 'No personal chats yet.' : tab === 'Groups' ? 'No activity conversations yet.' : 'No communities found.'}
            </Text>
          )}
          {tab === 'Communities' && more && <Button label="Load more" busy={loading} onPress={() => setPage((p) => p + 1)} />}
        </ScrollView>
      )}
      {tab === 'Communities' && (
        <Pressable accessibilityRole="button" accessibilityLabel="Create Community" onPress={createCommunity} style={{ position: 'absolute', bottom: 21, right: 20, width: 50, height: 50, borderRadius: 27, backgroundColor: purple, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="add" color="#FFF" size={28} />
        </Pressable>
      )}
      {creatingGroup ? (
        <Sheet title="Create a group" close={() => { if (!groupBusy) { setCreatingGroup(false); setGroupPhoto(null); } }}>
          <Text style={{ color: c.muted, fontSize: 12 }}>Add a photo, a name, and at least two people</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add group photo"
            disabled={groupBusy}
            onPress={() => {
              void (async () => {
                const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!permission.granted) return Alert.alert('Photo access needed', 'Allow photos to set a group profile picture.');
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
                if (!result.canceled && result.assets[0]?.uri) setGroupPhoto(result.assets[0].uri);
              })();
            }}
            style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }}
          >
            {groupPhoto ? <Image source={{ uri: groupPhoto }} style={{ width: 84, height: 84, borderRadius: 42 }} /> : (
              <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
                <Icon name="camera-outline" color={c.accent} size={28} />
              </View>
            )}
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{groupPhoto ? 'Change photo' : 'Add group photo'}</Text>
          </Pressable>
          <TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} placeholder="Group name" placeholderTextColor={c.muted} style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, color: c.text, paddingHorizontal: 14 }} />
          <ScrollView style={{ maxHeight: 360 }}>
            {groupPeople.map((person) => {
              const selected = groupMembers.includes(person.id);
              return (
                <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setGroupMembers((current) => selected ? current.filter((id) => id !== person.id) : [...current, person.id])} style={[ui.row, { paddingHorizontal: 0, minHeight: 64 }]}>
                  <UserAvatar uri={mediaUri(person.avatar)} name={person.name} size={48} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{person.name} <VerifiedBadge userId={person.id} /></Text>
                    <Text style={{ color: c.muted, fontSize: 11 }}>{person.username}</Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? purple : c.border, backgroundColor: selected ? purple : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {selected ? <Icon name="checkmark" color="#FFF" size={14} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {!groupPeople.length ? <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', padding: 18 }}>No people to add yet. Search chats for members first.</Text> : null}
          </ScrollView>
          <Button label={`Create Group · ${groupMembers.length} selected`} busy={groupBusy} disabled={groupBusy} onPress={() => void createGroup()} />
        </Sheet>
      ) : null}
      {storyPreview ? <Sheet title={storyPreview.name} close={() => setStoryPreview(null)} centered>
        <Image source={{ uri: storyPreview.image }} style={{ width: '100%', height: 420, borderRadius: 16, backgroundColor: c.inset }} resizeMode="cover" />
        {storyPreview.text ? <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{storyPreview.text}</Text> : null}
      </Sheet> : null}
    </Page>
  );
}
