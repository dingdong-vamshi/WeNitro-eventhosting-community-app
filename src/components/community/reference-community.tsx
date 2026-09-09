import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { HOST_CATEGORIES } from '../../domain/host-activity';
import { supabase } from '../../lib/supabase';
import { communityService, uploadMedia } from '../../services/wenitro';
import { communitiesProductionService, editCommunity, communityPoll, type CommunityDetail, type CommunityPoll } from '../../services/communities-production';
import { createMessageClientId, realtimeChatService, type ChatMessage, type MessageCursor, type RealtimeChatSubscription } from '../../services/realtime-chat';
import { Sheet, Button, Field, ErrorLine, usePalette, type ReferencePalette } from '../reconstruction/ui';
import CoverEditor from '../hosting/cover-editor';
import { MOBILE_APP_MAX_WIDTH, MobileOverlayFrame } from '../mobile-app-shell';

const RULES = ['Be respectful to others', 'No spam or self-promotion', 'No hate speech or harassment', 'Keep content relevant to the community'];
export type CreatedCommunity = { id: string; name: string; description: string; category: string; image: string; rules: string[] };
const errorText = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Please try again.';
const Icon = ({ name, size = 22, color }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) => { const c = usePalette(); return <Ionicons name={name} size={size} color={color || c.icon} />; };
const useCommunityStyles = () => { const c = usePalette(); const s = React.useMemo(() => createStyles(c), [c]); return { c, s }; };

export function CreateCommunitySheet({ onClose, onCreated, initial }: { initial?: CommunityDetail; onClose: () => void; onCreated: (community: CreatedCommunity) => void }) {
  const { c, s } = useCommunityStyles();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initial?.name || ''), [description, setDescription] = useState(initial?.description || ''), [category, setCategory] = useState(initial?.category || '');
  const [avatar, setAvatar] = useState(initial?.imageUrl || ''), [crop, setCrop] = useState(''), [categoryOpen, setCategoryOpen] = useState(false), [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(false), [focused, setFocused] = useState('');
  const locked = useRef(false);
  useEffect(() => { if (error) { const timer = setTimeout(() => setError(''), 4500); return () => clearTimeout(timer); } }, [error]);
  const nameError = name.trim().length < 3 ? 'Community name must be at least 3 characters' : '';
  const descriptionError = description.trim().length < 10 ? 'Description must be at least 10 characters' : '';
  const pick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError('Allow photo access to choose a community avatar.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: .85 });
      if (!result.canceled && result.assets[0]?.uri) {
        if (Platform.OS === 'web') setCrop(result.assets[0].uri); else setAvatar(result.assets[0].uri);
      }
    } catch (e) { setError(errorText(e)); }
  };
  const create = async () => {
    if (locked.current) return;
    setSubmitted(true); setError('');
    if (nameError || descriptionError || !category) { setError('Please correct validation errors'); return; }
    locked.current = true; setCreating(true);
    try {
      const id = initial ? (await editCommunity(initial.id, { name: name.trim(), description: description.trim(), category, ...(avatar === initial.imageUrl || (!avatar && !initial.imageUrl) ? {} : { avatar }) }), initial.id) : await communityService.create({ name: name.trim(), description: description.trim(), tagline: description.trim().slice(0, 160), category, tags: [category, 'Local', 'New'], rules: RULES, visibility: 'public', imageUri: avatar });
      // Creation has committed. Navigation does not depend on a second network request.
      onCreated({ id, name: name.trim(), description: description.trim(), category, image: avatar, rules: RULES });
    } catch (e) { setError(errorText(e)); locked.current = false; setCreating(false); }
  };
  return <Modal transparent visible animationType="slide" onRequestClose={() => { if (!creating) onClose(); }}>
    <MobileOverlayFrame><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.overlay, { paddingTop: insets.top + 24 }]}>
      {error ? <View accessibilityRole="alert" style={[s.toast, { top: insets.top + 12, backgroundColor: c.danger }]}><Icon name="close-circle-outline" size={20} /><Text style={s.toastText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError("")} style={s.iconButton}><Icon name="close" size={18} /></Pressable></View> : null}
      <View style={[s.sheet, { paddingBottom: Math.max(18, insets.bottom), maxHeight: '96%' }]}>
        <View style={s.sheetHeader}><Text style={s.title}>{initial ? 'Edit Community Info' : 'Create Community'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close Create Community" disabled={creating} onPress={onClose} style={s.iconButton}><Icon name="close" /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={s.form}>
          <View><Text style={s.label}>Community Name</Text><TextInput accessibilityLabel="Community Name" placeholder="e.g. Hyderabad Tennis Squad" placeholderTextColor={c.muted} value={name} onChangeText={setName} maxLength={100} editable={!creating} onFocus={() => setFocused('name')} onBlur={() => setFocused('')} style={[s.input, focused === 'name' && s.focus]} />{submitted && nameError ? <Text style={s.fieldError}>{nameError}</Text> : null}</View>
          <View><Text style={s.label}>Description</Text><TextInput accessibilityLabel="Description" placeholder="Describe what this community discusses..." placeholderTextColor={c.muted} multiline textAlignVertical="top" value={description} onChangeText={setDescription} maxLength={500} editable={!creating} onFocus={() => setFocused('description')} onBlur={() => setFocused('')} style={[s.input, s.description, focused === 'description' && s.focus]} />{submitted && descriptionError ? <Text style={s.fieldError}>{descriptionError}</Text> : null}</View>
          <View><Text style={s.label}>Community Avatar</Text><View style={s.avatarCircle}><Pressable accessibilityRole="button" accessibilityLabel={avatar ? 'Change community avatar' : 'Upload community avatar'} disabled={creating} onPress={() => void pick()} style={s.avatarPick}>{avatar ? <Image source={{ uri: avatar }} style={s.avatarImage} /> : <><Icon name="camera-outline" size={28} color={c.iconMuted} /><Text style={s.avatarHint}>Upload Image</Text></>}</Pressable>{avatar ? <Pressable accessibilityRole="button" accessibilityLabel="Remove community avatar" disabled={creating} onPress={() => setAvatar('')} style={s.removeAvatar}><Icon name="trash-outline" size={16} /></Pressable> : null}</View></View>
          <View><Text style={s.label}>Interest Category</Text><Pressable accessibilityRole="button" accessibilityLabel="Interest Category" accessibilityState={{ expanded: categoryOpen }} disabled={creating} onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={[s.input, s.category]}><Text style={{ color: category ? c.text : c.muted, fontSize: 13 }}>{category || 'Select Category'}</Text><Icon name="chevron-down" size={18} color={c.iconMuted} /></Pressable>{submitted && !category ? <Text style={s.fieldError}>Select a category</Text> : null}</View>
          <Pressable accessibilityRole="button" disabled={creating} onPress={() => void create()} style={[s.create, creating && { opacity: .65 }]}>{creating ? <ActivityIndicator color="white" /> : <Text style={s.createText}>{initial ? 'Save Changes' : 'CREATE COMMUNITY'}</Text>}</Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView></MobileOverlayFrame>
    <Modal transparent visible={categoryOpen} animationType="fade" onRequestClose={() => setCategoryOpen(false)}><MobileOverlayFrame><View style={s.categoryOverlay}><View style={s.categoryMenu}><View style={s.sheetHeader}><Text style={s.title}>Interest Category</Text><Pressable accessibilityRole="button" accessibilityLabel="Close categories" onPress={() => setCategoryOpen(false)} style={s.iconButton}><Icon name="close" /></Pressable></View><TextInput accessibilityLabel="Search categories" placeholder="Search categories" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={[s.input, { margin: 14 }]} /><ScrollView keyboardShouldPersistTaps="handled">{HOST_CATEGORIES.filter(option => option.toLowerCase().includes(search.toLowerCase())).map(option => <Pressable accessibilityRole="button" key={option} onPress={() => { setCategory(option); setCategoryOpen(false); setSearch(''); }} style={[s.categoryOption, option === category && { backgroundColor: c.isDark ? '#5145B8' : '#EEEAFE' }]}><Text style={[s.body, option === category && !c.isDark && { color: c.accent }]}>{option}</Text>{option === category ? <Icon name="checkmark" color={c.accent} /> : null}</Pressable>)}{!HOST_CATEGORIES.some(option => option.toLowerCase().includes(search.toLowerCase())) ? <Text style={[s.muted, { padding: 18 }]}>No categories found</Text> : null}</ScrollView></View></View></MobileOverlayFrame></Modal>
    {crop ? <CoverEditor uri={crop} square onCancel={() => setCrop('')} onSave={uri => { setAvatar(uri); setCrop(''); }} /> : null}
  </Modal>;
}

export function CommunityConversation({ id, userId, name, avatar, success, onDismissSuccess, onBack, onInfo, onMessage }: { id: string; userId: string; name: string; avatar?: string; success: boolean; onDismissSuccess: () => void; onBack: () => void; onInfo: () => void; onMessage: (message: ChatMessage) => void }) {
  const { c, s } = useCommunityStyles();
  const [messages, setMessages] = useState<ChatMessage[]>([]), [cursor, setCursor] = useState<MessageCursor | null>(null);
  const [body, setBody] = useState(''), [attachment, setAttachment] = useState(''), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState('');
  const [metadata, setMetadata] = useState({ name, avatar }), [retry, setRetry] = useState(0), [historyLoading, setHistoryLoading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false), [pollOpen, setPollOpen] = useState(false), [polls, setPolls] = useState<Record<number, CommunityPoll>>({});
  const [postingAllowed, setPostingAllowed] = useState(true);
  const attachmentType = useRef<'image' | 'video'>('image');
  const attachmentMime = useRef('image/jpeg');
  const [playingVideo, setPlayingVideo] = useState('');
  const [readAt, setReadAt] = useState<Record<number, string>>({});
  const historyScrollHold = useRef(false);
  const scroll = useRef<ScrollView>(null), locked = useRef(false), callback = useRef(onMessage), dismiss = useRef(onDismissSuccess);
  const pending = useRef<{ key: string; clientId: string; media?: { path: string; type: 'image' | 'video' } } | null>(null);
  callback.current = onMessage; dismiss.current = onDismissSuccess;
  const merge = (items: ChatMessage[]) => setMessages(current => [...new Map([...current, ...items].map(m => [m.id, m])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id));
  useEffect(() => { if (success) { const timer = setTimeout(() => dismiss.current(), 3200); return () => clearTimeout(timer); } }, [success]);
  useEffect(() => {
    let active = true; let subscription: RealtimeChatSubscription | undefined;
    setLoading(true); setError('');
    void (async () => {
      try {
        const community = await communitiesProductionService.getCommunity(id);
        if (!active) return;
        setMetadata({ name: community.name, avatar: community.imageUrl || undefined });
        setPostingAllowed(!community.adminsOnly || community.membershipRole === 'admin');
        const page = await realtimeChatService.loadMessagesPage(Number(id));
        if (!active) return;
        merge(page.items); setCursor(page.nextCursor); setLoading(false);
        void realtimeChatService.markConversationRead(Number(id)).catch(() => undefined);
        try {
          subscription = await realtimeChatService.subscribeToConversation({ conversationId: Number(id), onMessageChange: change => {
            if (!active) return;
            if (change.eventType === 'DELETE') setMessages(current => current.filter(m => m.id !== change.old.id));
            else if (change.message) { merge([change.message]); callback.current(change.message); void realtimeChatService.markConversationRead(Number(id)).catch(() => undefined); }
          }, onReadReceipt: receipt => { if (active) setReadAt(current => ({ ...current, [receipt.userId]: receipt.readAt })); }, onError: e => { if (active) setError(e.message); } });
          if (!active) { await subscription.cleanup(); return; }
        } catch (e) {
          if (active) setError(`Messages loaded, but live updates are unavailable: ${errorText(e)}`);
        }
      } catch (e) { if (active) { setError(errorText(e)); setLoading(false); } }
    })();
    return () => { active = false; void subscription?.cleanup(); };
  }, [id, retry]);
  useEffect(() => {
    const channel = supabase.channel('community-metadata:' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tbl_chat_rooms', filter: 'id=eq.' + id }, () => {
      void communitiesProductionService.getCommunity(id).then(community => { setMetadata({ name: community.name, avatar: community.imageUrl || undefined }); setPostingAllowed(!community.adminsOnly || community.membershipRole === 'admin'); }).catch(e => setError(errorText(e)));
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);
  const pollKey = messages.filter(m => m.poll_id).map(m => `${m.poll_id}:${m.edited_at}`).join(',');
  useEffect(() => {
    let active = true;
    const ids = messages.flatMap(m => m.poll_id ? [m.poll_id] : []);
    if (ids.length) void communityPoll('list', id, { poll_ids: ids.slice(-100) }).then(items => { if (active) setPolls(Object.fromEntries(items.map(p => [p.id, p]))); }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [id, pollKey]);
  const loadEarlier = async () => {
    if (!cursor || historyLoading) return; historyScrollHold.current = true; setHistoryLoading(true);
    try { const page = await realtimeChatService.loadMessagesPage(Number(id), { cursor }); merge(page.items); setCursor(page.nextCursor); } catch (e) { setError(errorText(e)); } finally { setHistoryLoading(false); }
  };
  const send = async (mediaUri = attachment, textValue = body) => {
    if (locked.current || loading || !postingAllowed || (!textValue.trim() && !mediaUri)) return;
    locked.current = true; setSending(true); setError('');
    const text = textValue.trim(), key = JSON.stringify([text, mediaUri]);
    if (pending.current?.key !== key) pending.current = { key, clientId: createMessageClientId() };
    try {
      if (mediaUri && !pending.current.media) { const media = await uploadMedia('messages', mediaUri, attachmentMime.current); pending.current.media = { path: media.path, type: attachmentType.current }; }
      const message = await realtimeChatService.sendMessage({ conversationId: Number(id), clientId: pending.current.clientId, body: text, media: pending.current.media });
      merge([message]); callback.current(message); setBody(''); setAttachment(''); pending.current = null;
    } catch (e) { setError(errorText(e)); } finally { locked.current = false; setSending(false); }
  };
  const pick = async (type: 'image' | 'video') => { setOptionsOpen(false); try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) { setError('Allow media access to share a photo or video.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: type === 'video' ? ['videos'] : ['images'], quality: .85 });
    if (!result.canceled && result.assets[0]?.uri) { const asset = result.assets[0]; if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) throw new Error('Choose media smaller than 50 MB.'); const mime = asset.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg'); if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mime)) throw new Error(type === 'video' ? 'Choose an MP4 video.' : 'Choose a JPEG, PNG or WebP photo.'); attachmentMime.current = mime; attachmentType.current = type; setAttachment(asset.uri); await send(asset.uri, ''); }
  } catch (e) { setError(errorText(e)); } };
  return <SafeAreaView style={s.chat} edges={['top', 'bottom']}><KeyboardAvoidingView style={s.chat} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.chatHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to messages" onPress={onBack} style={s.iconButton}><Icon name="arrow-back" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Community information" onPress={onInfo} style={s.chatIdentity}><Text numberOfLines={1} style={s.chatName}>{metadata.name}</Text></Pressable></View>
    {success ? <View accessibilityRole="alert" style={s.toast}><Icon name="checkmark-circle" size={20} /><Text style={s.toastText}>Community created successfully!</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss success" onPress={onDismissSuccess} style={s.iconButton}><Icon name="close" size={19} /></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={s.errorBanner}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(v => v + 1)}><Text style={s.body}>Retry connection</Text></Pressable></View> : null}
    {loading ? <View style={s.center}><ActivityIndicator color="#8B81FF" /></View> : <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.messages, !messages.length && { flexGrow: 1, justifyContent: 'flex-end' }]} onContentSizeChange={() => { if (historyScrollHold.current) { historyScrollHold.current = false; return; } if (!historyLoading) scroll.current?.scrollToEnd({ animated: false }); }}>
      {cursor ? <Pressable accessibilityRole="button" disabled={historyLoading} onPress={() => void loadEarlier()} style={s.earlier}><Text style={s.muted}>{historyLoading ? 'Loading...' : 'Load earlier messages'}</Text></Pressable> : null}
      {!messages.length && !error ? <Text style={s.emptyChat}>No messages yet. Send a message to start the conversation!</Text> : null}
      {messages.map((message, index) => { const mine = String(message.sender_id) === userId; const day = new Date(message.created_at).toLocaleDateString(); const prev = index ? new Date(messages[index - 1].created_at).toLocaleDateString() : ''; const read = Object.entries(readAt).some(([uid, at]) => uid !== userId && at >= message.created_at); const media = message.media_signed_url; return <View key={message.id}>
        {day !== prev ? <Text style={s.day}>{new Date(message.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</Text> : null}
        <View style={[s.messageRow, { alignItems: mine ? 'flex-end' : 'flex-start' }]}><View style={[s.bubble, mine && s.ownBubble, Boolean(message.poll_id || message.media_type === 'video') && { backgroundColor: mine ? c.accent : c.card, borderWidth: 2, borderColor: mine ? c.accent : c.border, minWidth: 225 }]}>{!mine ? <Text style={s.sender}>{message.profiles?.full_name || message.profiles?.username || 'Member'}</Text> : null}{message.deleted_at ? <Text style={s.muted}>Message deleted</Text> : <>{message.poll_id ? (polls[message.poll_id] ? <PollCard poll={polls[message.poll_id]} roomId={id} onUpdated={poll => setPolls(current => ({ ...current, [poll.id]: poll }))} /> : <Text style={s.muted}>Loading poll...</Text>) : null}{media && message.media_type === 'image' ? <Pressable accessibilityRole="button" accessibilityLabel="Open attached image" onPress={() => void Linking.openURL(media)}><Image source={{ uri: media }} style={s.messageImage} /></Pressable> : media ? <Pressable accessibilityRole="button" accessibilityLabel={message.media_type === 'video' ? 'Play Video' : 'Open attachment'} onPress={() => message.media_type === 'video' ? setPlayingVideo(media) : void Linking.openURL(media)}>{message.media_type === 'video' ? <View style={{ width: 220, height: 135, alignItems: 'center', justifyContent: 'center', gap: 14 }}><Icon name="film-outline" size={35} /><Text style={[s.body, mine && s.ownText]}>Play Video</Text></View> : <Text style={[s.body, mine && s.ownText]}>Open {message.media_type || 'attachment'}</Text>}</Pressable> : null}{message.share_payload ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(message.share_payload!.deepLink)}><Text style={[s.body, mine && s.ownText]}>{message.share_payload.title}</Text></Pressable> : null}{message.body && !message.poll_id ? <Text selectable style={[s.body, mine && s.ownText]}>{message.body}</Text> : null}</>}</View><View style={s.timestamp}><Text style={s.time}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>{mine ? <Icon name={read ? 'checkmark-done' : 'checkmark'} color={read ? c.accent : c.iconMuted} size={13} /> : null}</View></View>
      </View>; })}
    </ScrollView>}
    {attachment ? <View style={s.attachment}>{attachmentType.current === 'image' ? <Image source={{ uri: attachment }} style={{ width: 54, height: 54, borderRadius: 8 }} /> : <Icon name="film-outline" />}<Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" disabled={sending} onPress={() => setAttachment('')} style={s.iconButton}><Icon name="close" /></Pressable></View> : null}
    <View style={s.composer}><Pressable accessibilityRole="button" accessibilityLabel="Chat Options" disabled={sending || loading || !postingAllowed} onPress={() => setOptionsOpen(true)} style={s.iconButton}><Icon name="add" size={25} /></Pressable><TextInput accessibilityLabel="Community message" placeholder={postingAllowed ? 'Type a message...' : 'Only admins can post'} placeholderTextColor={c.muted} value={body} onChangeText={setBody} editable={!sending && !loading && postingAllowed} multiline maxLength={10000} style={s.messageInput} /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || loading || !postingAllowed || (!body.trim() && !attachment)} onPress={() => void send()} style={[s.send, (!body.trim() && !attachment) && { opacity: .55 }]}>{sending ? <ActivityIndicator color="white" size="small" /> : <Icon name="paper-plane" size={18} color="white" />}</Pressable></View>
    {playingVideo ? <CommunityVideo uri={playingVideo} close={() => setPlayingVideo('')} /> : null}
    {optionsOpen && <Sheet title="Chat Options" close={() => setOptionsOpen(false)}>{[['Share Photo', 'image-outline', () => void pick('image')], ['Share Video', 'videocam-outline', () => void pick('video')], ['Create Poll', 'stats-chart-outline', () => { setOptionsOpen(false); setPollOpen(true); }]].map(([label, icon, action]) => <Pressable accessibilityRole="button" key={String(label)} onPress={action as () => void} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 13 }}><Icon name={icon as any} color={c.accent} /><Text style={s.body}>{String(label)}</Text></Pressable>)}<Button label="Cancel" onPress={() => setOptionsOpen(false)} /></Sheet>}
    {pollOpen && <PollComposer roomId={id} close={() => setPollOpen(false)} onPosted={async () => { setPollOpen(false); const page = await realtimeChatService.loadMessagesPage(Number(id)); merge(page.items); const latest = page.items[page.items.length - 1]; if (latest) callback.current(latest); }} />}
  </KeyboardAvoidingView></SafeAreaView>;
}

export function VibeEntryState({ loading, error, onBack, onRetry }: { loading: boolean; error?: string; onBack: () => void; onRetry: () => void }) {
  const { s } = useCommunityStyles();
  return <SafeAreaView style={s.chat} edges={['top']}><View style={s.chatHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to Host" onPress={onBack} style={s.iconButton}><Icon name="arrow-back" /></Pressable><Text style={s.title}>Post a Vibe</Text></View><View style={s.vibeEmpty}>{loading ? <><ActivityIndicator color="#8A83FE" /><Text style={s.muted}>Loading active events...</Text></> : error ? <><Text style={s.body}>Could not load activities</Text><Text style={s.muted}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={s.earlier}><Text style={s.body}>Retry</Text></Pressable></> : <><Icon name="calendar-outline" size={40} color="#727D91" /><Text style={s.noEvents}>No events found</Text><Text style={s.vibeHint}>You must join or host an activity first before you can post a vibe highlights!</Text></>}</View></SafeAreaView>;
}
const createStyles = (c: ReferencePalette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: 'center', backgroundColor: c.sheet, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, minHeight: 54, borderBottomWidth: 1, borderColor: c.border },
  title: { fontSize: 17, color: c.text, fontWeight: '600' },
  iconButton: { padding: 12, minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  form: { padding: 16, gap: 23 },
  label: { color: c.text, fontSize: 13, marginBottom: 10, fontWeight: '500' },
  input: { color: c.text, fontSize: 13, backgroundColor: c.input, borderWidth: 1, borderColor: c.border, borderRadius: 11, minHeight: 48, paddingHorizontal: 14, paddingVertical: 13 },
  focus: { borderColor: c.accent },
  description: { height: 84 },
  avatarCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.input, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  avatarPick: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 7 },
  avatarImage: { width: '100%', height: '100%' },
  avatarHint: { color: c.muted, fontSize: 10 },
  removeAvatar: { position: 'absolute', bottom: 0, width: '100%', height: 24, backgroundColor: '#EC4848E6', alignItems: 'center', justifyContent: 'center' },
  category: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  create: { height: 46, backgroundColor: c.accent, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  createText: { color: 'white', fontSize: 13, fontWeight: '500' },
  errorBanner: { padding: 12, backgroundColor: c.isDark ? '#542631' : '#FCE8EC', gap: 8 },
  errorText: { color: c.danger, fontSize: 12 },
  fieldError: { color: c.danger, fontSize: 11, marginTop: 6 },
  categoryOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 140 },
  categoryMenu: { width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH - 32, alignSelf: 'center', maxHeight: '70%', backgroundColor: c.surfaceElevated, borderRadius: 12, overflow: 'hidden' },
  categoryOption: { paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', justifyContent: 'space-between' },
  body: { color: c.text, fontSize: 13, lineHeight: 19 },
  ownText: { color: 'white' },
  muted: { color: c.muted, fontSize: 12 },
  chat: { flex: 1, backgroundColor: c.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderColor: c.border },
  chatIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  initial: { backgroundColor: c.inset, alignItems: 'center', justifyContent: 'center' },
  chatName: { color: c.text, fontSize: 15, fontWeight: '600', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: 16, paddingVertical: 16 },
  emptyChat: { color: c.muted, fontSize: 11, textAlign: 'left', paddingHorizontal: 10, paddingBottom: 10, lineHeight: 18 },
  day: { color: c.muted, fontSize: 10, textAlign: 'center' },
  messageRow: { marginBottom: 12 },
  bubble: { maxWidth: '85%', backgroundColor: c.card, borderRadius: 13, padding: 11 },
  ownBubble: { backgroundColor: c.accent, borderBottomRightRadius: 3 },
  sender: { color: c.isDark ? '#C2BDFD' : c.accent, fontSize: 10, marginBottom: 4 },
  timestamp: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  time: { fontSize: 9, color: c.muted },
  messageImage: { width: 200, height: 160, borderRadius: 8, marginBottom: 4 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, borderColor: c.border, paddingRight: 12, paddingVertical: 10, backgroundColor: c.bg },
  messageInput: { flex: 1, color: c.text, backgroundColor: c.input, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, fontSize: 12, minHeight: 42, maxHeight: 115 },
  send: { backgroundColor: c.accent, width: 44, height: 40, marginLeft: 4, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  attachment: { padding: 12, flexDirection: 'row', alignItems: 'center' },
  earlier: { padding: 12, alignItems: 'center' },
  toast: { position: 'absolute', zIndex: 5, top: 10, left: 10, right: 10, backgroundColor: c.success, borderRadius: 7, minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 10 },
  toastText: { flex: 1, color: 'white', fontSize: 12 },
  vibeEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 34, paddingBottom: 74 },
  noEvents: { color: c.text, fontSize: 18, fontWeight: '600' },
  vibeHint: { color: c.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
});

function PollComposer({ roomId, close, onPosted }: { roomId: string; close: () => void; onPosted: () => Promise<void> }) {
 const c = usePalette(); const [question, setQuestion] = useState(''), [options, setOptions] = useState(['', '']), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const locked = useRef(false), submission = useRef(createMessageClientId());
 const valid = question.trim().length > 0 && options.every(o => o.trim()) && new Set(options.map(o => o.trim().toLowerCase())).size === options.length;
 return <Sheet title="Create a Poll" close={() => { if (!busy) close(); }}><Text style={{ color: c.text, fontSize: 13 }}>Question</Text><Field accessibilityLabel="Poll question" placeholder="What is your question?" value={question} onChangeText={setQuestion} maxLength={300} editable={!busy} /><Text style={{ color: c.text, fontSize: 13 }}>Options (2 to 6 options)</Text>{options.map((option, index) => <Field key={index} accessibilityLabel={`Option ${index + 1}`} placeholder={`Option ${index + 1}`} value={option} onChangeText={text => setOptions(current => current.map((o, i) => i === index ? text : o))} maxLength={150} editable={!busy} />)}{options.length < 6 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setOptions(current => [...current, ''])}><Text style={{ color: '#9588FF', fontSize: 13, padding: 10 }}>+ Add Option</Text></Pressable>}<ErrorLine text={error} /><Button label="Post Poll" disabled={!valid} busy={busy} onPress={() => { if (locked.current) return; locked.current = true; setBusy(true); setError(''); void communityPoll('create', roomId, { question: question.trim(), options: options.map(o => o.trim()), client_id: submission.current }).then(onPosted).catch(e => setError(errorText(e))).finally(() => { locked.current = false; setBusy(false); }); }} /></Sheet>;
}
function PollCard({ poll, roomId, onUpdated }: { poll: CommunityPoll; roomId: string; onUpdated: (poll: CommunityPoll) => void }) {
 const c = usePalette(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
 return <View style={{ gap: 10, maxWidth: 260 }}><Text style={{ color: c.text, fontSize: 14, fontWeight: '600', marginBottom: 5 }}>{poll.question}</Text>{poll.options.map(o => <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: poll.my_option_id === o.id, disabled: busy }} disabled={busy} onPress={() => { setBusy(true); setError(''); void communityPoll('vote', roomId, { poll_id: poll.id, option_id: o.id }).then(items => { if (items[0]) onUpdated(items[0]); }).catch(e => setError(errorText(e))).finally(() => setBusy(false)); }} style={{ borderWidth: 1, borderColor: poll.my_option_id === o.id ? c.accent : c.border, borderRadius: 9, padding: 10, overflow: 'hidden' }}><View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${o.percentage}%`, backgroundColor: '#7060EF45' }} /><View style={{ flexDirection: 'row', gap: 10 }}><Text style={{ color: c.text, flex: 1, fontSize: 12 }}>{o.text}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{o.percentage}%</Text></View></Pressable>)}<Text style={{ color: c.muted, fontSize: 10 }}>{poll.total_votes} votes</Text><ErrorLine text={error} /></View>;
}

function CommunityVideo({ uri, close }: { uri: string; close: () => void }) {
 const player = useVideoPlayer(uri, instance => { instance.loop = false; instance.play(); });
 return <Modal transparent animationType="fade" onRequestClose={close}><MobileOverlayFrame><SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}><View style={{ alignItems: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="Close video" onPress={close} style={{ padding: 18 }}><Icon name="close" /></Pressable></View><VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1 }} /></SafeAreaView></MobileOverlayFrame></Modal>;
}
