import { VerifiedBadge } from '../verified-badge';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { communitiesProductionService, manageCommunity, type CommunityDetail } from '../../services/communities-production';
import { realtimeChatService, type ChatMember, type CommunityMemberPermissions, type CommunityMemberRole } from '../../services/realtime-chat';
import { CreateCommunitySheet } from './reference-community';
import { Action, Button, ErrorLine, Header, Icon, Page, SearchField, Sheet, Skeleton, ui, usePalette, purple, type ReferencePalette } from '../reconstruction/ui';

const errorText = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Please try again.';
const roleLabel = (role: CommunityMemberRole, isOwner: boolean) => isOwner ? 'Creator' : role === 'admin' ? 'Co-Admin' : role === 'moderator' ? 'Moderator' : 'Member';
const defaultPermissions = (role: CommunityMemberRole): CommunityMemberPermissions => ({
  can_approve: role === 'admin' || role === 'moderator',
  can_post: role === 'admin' || role === 'moderator',
  can_edit: role === 'admin',
  can_manage_roles: role === 'admin',
});

export function CommunityInfo({ id, back, openProfile, openChat, openPosts, onChanged, onDeleted }: { id: string; back: () => void; openProfile: (id: string) => void; openChat: () => void; openPosts: () => void; onChanged: (c: CommunityDetail) => void; onDeleted: () => void }) {
  const c = usePalette();
  const s = useMemo(() => createStyles(c), [c]);
  const [community, setCommunity] = useState<CommunityDetail | null>(null), [members, setMembers] = useState<ChatMember[]>([]), [query, setQuery] = useState('');
  const [view, setView] = useState<'info' | 'settings' | 'requests'>('info'), [edit, setEdit] = useState(false), [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requests, setRequests] = useState<{ user_id: number; name: string }[]>([]), [requestsLoading, setRequestsLoading] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false), [rulesOpen, setRulesOpen] = useState(false);
  const [roleMember, setRoleMember] = useState<ChatMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<CommunityMemberRole>('member');
  const [permDraft, setPermDraft] = useState<CommunityMemberPermissions>(defaultPermissions('member'));
  const refresh = async () => {
    const result = await communitiesProductionService.getCommunity(id);
    setCommunity(result);
    onChanged(result);
    if (result.membership === 'created' || result.membership === 'joined') setMembers(await realtimeChatService.loadConversationMembers(Number(id)));
    else setMembers([]);
  };
  useEffect(() => { void refresh().catch(error => setError(errorText(error))); }, [id]);
  const admin = community?.membershipRole === 'admin' || community?.membership === 'created';
  const canEdit = community?.permissions.can_edit === true;
  const canApprove = community?.permissions.can_approve === true;
  const canManageRoles = community?.permissions.can_manage_roles === true;
  const canOpenSettings = canEdit || canApprove || admin;
  const joined = community?.membership === 'created' || community?.membership === 'joined';
  const visibleMembers = members.filter(member => `${member.profiles?.full_name || ''} ${member.profiles?.username || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const preference = async (key: string, value: boolean) => { setBusy(true); setError(''); try { await manageCommunity(id, 'preferences', { [key]: value }); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const loadRequests = async () => { setRequestsLoading(true); setError(''); try { const { data, error } = await supabase.from('tbl_community_join_requests').select('user_id,tbl_users(username,fullname)').eq('room_id', Number(id)).eq('status', 'pending').limit(50); if (error) throw error; setRequests((data || []).map((request: any) => ({ user_id: request.user_id, name: request.tbl_users?.fullname || request.tbl_users?.username || `Member ${request.user_id}` }))); } catch (error) { setError(errorText(error)); } finally { setRequestsLoading(false); } };
  const respond = async (user: number, action: 'approve' | 'reject') => { setBusy(true); setError(''); try { await manageCommunity(id, action, { user_id: user }); await loadRequests(); await refresh(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const setting = (title: string, subtitle: string, value: boolean, key: string) => <View style={[ui.row, s.settingRow]}><View style={{ flex: 1, gap: 5 }}><Text style={s.settingTitle}>{title}</Text><Text style={s.settingSubtitle}>{subtitle}</Text></View><Switch accessibilityLabel={title} disabled={busy} value={value} onValueChange={next => void preference(key, next)} trackColor={{ true: purple, false: c.iconMuted }} /></View>;
  const openRole = (member: ChatMember) => {
    setRoleMember(member);
    setRoleDraft(member.role);
    setPermDraft(member.permissions || defaultPermissions(member.role));
  };
  const saveRole = async () => {
    if (!roleMember) return;
    setBusy(true); setError('');
    try {
      await manageCommunity(id, 'set_role', { user_id: roleMember.user_id, role: roleDraft, ...permDraft });
      setRoleMember(null);
      await refresh();
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  };

  return <Page>
    {view !== 'info' ? <Header title={view === 'settings' ? 'Community Settings' : 'Join Requests'} back={() => setView(view === 'requests' ? 'settings' : 'info')} /> : null}
    <ErrorLine text={error} />
    {!community ? <Skeleton /> : <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.content}>
      {view === 'info' ? <>
        <View style={s.heroCard}>
          <View style={s.cover}>
            {community.coverUrl ? <Image source={{ uri: community.coverUrl }} style={s.coverImage} /> : <View style={s.coverFallback}><Icon name="images-outline" size={34} color="#FFF" /></View>}
            <LinearGradient colors={['#07111F99', 'transparent', '#07111FEE']} style={StyleSheet.absoluteFill} />
            <View style={s.heroBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to all communities" onPress={back} style={s.heroIcon}><Icon name="arrow-back" color="#FFF" /></Pressable>
              <Text style={s.heroTitle}>Community</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Share community" onPress={() => { void Share.share({ message: `Join our community "${community.name}" on WeNitro! Tap here: wenitro://community/join/${id}` }).catch(error => setError(errorText(error))); }} style={s.heroIcon}><Icon name="share-social-outline" color="#FFF" /></Pressable>
              {canOpenSettings ? <Pressable accessibilityRole="button" accessibilityLabel="Community settings" onPress={() => setView('settings')} style={s.heroIcon}><Icon name="settings-outline" color="#FFF" /></Pressable> : null}
            </View>
            <View style={s.coverActions}>
              <View style={s.categoryBadge}><Icon name="bicycle-outline" size={13} color="#FFF" /><Text numberOfLines={1} style={s.categoryText}>{community.category}</Text></View>
              {!joined ? <Pressable accessibilityRole="button" disabled={community.membership === 'pending' || busy} onPress={() => { setBusy(true); setError(''); void communitiesProductionService.join(id).then(refresh).catch(error => setError(errorText(error))).finally(() => setBusy(false)); }} style={s.joinChip}><Icon name="person-add-outline" size={14} color="#FFF" /><Text style={s.joinChipText}>{community.membership === 'pending' ? 'Pending' : community.requiresApproval ? 'Request' : 'Join'}</Text></Pressable> : null}
            </View>
          </View>
          <View style={s.identityBody}>
            <View style={s.avatarWrap}>{community.imageUrl ? <Image source={{ uri: community.imageUrl }} style={s.avatar} /> : <View style={[s.avatar, s.avatarFallback]}><Icon name="people" size={34} color={c.accent} /></View>}</View>
            <Text style={s.name}>{community.name}</Text>
            {community.tagline ? <Text style={s.tagline}>{community.tagline}</Text> : null}
            <View style={s.metaRow}>
              <View style={s.memberStat}>
                <View style={s.avatarStack}>{members.slice(0, 4).map((member, index) => member.profiles?.avatar_url ? <Image key={member.user_id} source={{ uri: member.profiles.avatar_url }} style={[s.stackAvatar, { marginLeft: index ? -8 : 0 }]} /> : <View key={member.user_id} style={[s.stackAvatar, s.avatarFallback, { marginLeft: index ? -8 : 0 }]} />)}</View>
                <Text style={s.metaText}>{community.memberCount ?? members.length} members</Text>
              </View>
              <Meta icon={community.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'} text={community.visibility === 'private' ? 'Private' : 'Public'} />
              {community.membership === 'created' ? <Meta icon="shield-checkmark-outline" text="Created by you" accent /> : null}
            </View>
          </View>
        </View>
        <View style={s.card}>
          <View style={s.sectionTitleRow}><Title icon="information-circle-outline" text="About" /><Pressable onPress={() => setAboutOpen(v => !v)}><Text style={s.seeAll}>{aboutOpen ? 'Hide' : 'See all'}</Text></Pressable></View>
          <Text selectable numberOfLines={aboutOpen ? undefined : 3} style={s.description}>{community.description}</Text>
          {community.tags.length ? <View style={s.tags}>{community.tags.map(tag => <View key={tag} style={s.tag}><Text style={s.tagText}>{tag.replace(/^#/, '')}</Text></View>)}</View> : null}
        </View>
        {community.rules.length ? <View style={s.card}>
          <View style={s.sectionTitleRow}><Title icon="shield-checkmark-outline" text="Community Rules" /><Pressable onPress={() => setRulesOpen(v => !v)}><Text style={s.seeAll}>{rulesOpen ? 'Hide' : 'See all'}</Text></Pressable></View>
          {(rulesOpen ? community.rules : community.rules.slice(0, 4)).map((rule, index) => <View key={rule.id} style={s.rule}><View style={s.ruleNumber}><Text style={s.ruleNumberText}>{index + 1}</Text></View><Text selectable style={s.ruleText}>{rule.body}</Text></View>)}
        </View> : null}
        {joined ? <View style={s.actionRow}><Pressable accessibilityRole="button" onPress={openPosts} style={[s.primaryAction, { backgroundColor: c.accent }]}><Icon name="newspaper-outline" size={19} color="#FFF" /><Text style={s.primaryActionText}>Community Posts</Text></Pressable><Pressable accessibilityRole="button" onPress={openChat} style={s.secondaryAction}><Icon name="chatbubbles-outline" size={19} color={c.accent} /><Text style={s.secondaryActionText}>Open Chat</Text></Pressable></View> : null}
        <View style={s.card}><View style={s.sectionTitleRow}><Icon name="people-outline" size={19} color={c.accent} /><Text style={s.sectionTitle}>Members</Text><Text style={s.sectionCount}>{community.memberCount ?? members.length}</Text></View>{joined ? <>{canManageRoles ? <Text style={s.settingSubtitle}>{admin ? 'Tap a joined member to make them Co-Admin or Moderator and choose what they can do.' : 'Tap a member to manage the moderator permissions you can grant.'}</Text> : null}<SearchField accessibilityLabel="Search members" placeholder="Search members..." value={query} onChangeText={setQuery} style={{ margin: 0 }} />{visibleMembers.length ? visibleMembers.map(member => {
          const isOwner = String(member.user_id) === community.ownerId;
          const canManageMember = canManageRoles && !isOwner && (admin || member.role !== 'admin');
          return <Pressable accessibilityRole="button" key={member.user_id} onPress={() => canManageMember ? openRole(member) : openProfile(String(member.user_id))} style={s.memberRow}>{member.profiles?.avatar_url ? <Image source={{ uri: member.profiles.avatar_url }} style={s.memberAvatar} /> : <View style={[s.memberAvatar, s.avatarFallback]}><Icon name="person-outline" size={21} color={c.iconMuted} /></View>}<View style={{ flex: 1, gap: 3 }}><Text style={s.memberName}>{member.profiles?.full_name || member.profiles?.username || 'Member'} <VerifiedBadge userId={String(member.user_id)} /></Text><Text style={s.memberUsername}>@{member.profiles?.username || 'member'}</Text></View><View style={s.creatorBadge}><Text style={s.creatorText}>{roleLabel(member.role, isOwner)}</Text></View>{canManageMember ? <Icon name="options-outline" size={17} color={c.iconMuted} /> : <Icon name="chevron-forward" size={17} color={c.iconMuted} />}</Pressable>;
        }) : <Text style={s.empty}>No members match your search.</Text>}</> : <Text style={s.empty}>Join this community to see its members.</Text>}</View>
        {community.membership === 'joined' ? <Pressable accessibilityRole="button" onPress={() => setConfirm('leave')} style={s.dangerAction}><Text style={s.dangerText}>Leave Community</Text></Pressable> : null}
      </> : view === 'settings' ? <>
        {canEdit ? <><Text style={s.eyebrow}>INFORMATION</Text><Pressable accessibilityRole="button" onPress={() => setEdit(true)} style={s.settingsCard}><View style={s.settingsIcon}><Icon name="create-outline" color={c.accent} /></View><View style={{ flex: 1, gap: 5 }}><Text style={s.settingTitle}>Edit Community Profile</Text><Text style={s.settingSubtitle}>Update name, description, image and category</Text></View><Icon name="chevron-forward" color={c.iconMuted} size={18} /></Pressable></> : null}
        <Text style={s.eyebrow}>MEMBERSHIP & POSTING</Text><View style={s.settingsGroup}>
          {canEdit ? <>{setting('Verified members only', 'Only verified members can join', community.verifiedOnly, 'verified_only')}{setting('Admin approval required', 'New requests appear in your approval list', community.requiresApproval, 'requires_approval')}{setting('Only admins can post', 'Admins and moderators with posting permission can post.', community.adminsOnly, 'admins_only')}</> : null}
          {canApprove ? <Pressable accessibilityRole="button" onPress={() => { setView('requests'); void loadRequests(); }} style={s.requestLink}><Text style={s.requestLinkText}>View Pending Join Requests</Text><Icon name="chevron-forward" size={17} color={c.accent} /></Pressable> : null}
        </View>
        {admin ? <Pressable accessibilityRole="button" onPress={() => setConfirm('delete')} style={s.dangerAction}><Text style={s.dangerText}>Delete Community</Text></Pressable> : null}
      </> : requestsLoading ? <Skeleton count={2} /> : requests.length ? requests.map(request => <View key={request.user_id} style={s.requestCard}><View style={[s.memberAvatar, s.avatarFallback]}><Icon name="person-outline" size={21} color={c.iconMuted} /></View><Text style={[s.memberName, { flex: 1 }]}>{request.name}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void respond(request.user_id, 'reject')} style={s.rejectButton}><Icon name="close" size={18} color={c.danger} /></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void respond(request.user_id, 'approve')} style={s.approveButton}><Icon name="checkmark" size={18} color="#FFF" /></Pressable></View>) : <View style={s.emptyState}><Icon name="people-outline" size={42} color={c.iconMuted} /><Text style={s.sectionTitle}>No pending requests</Text><Text style={s.empty}>New join requests will appear here.</Text></View>}
    </ScrollView>}
    {edit && community ? <CreateCommunitySheet initial={community} onClose={() => setEdit(false)} onCreated={() => { setEdit(false); void refresh().catch(error => setError(errorText(error))); }} /> : null}
    {roleMember ? <Sheet title="Member role" close={() => { if (!busy) setRoleMember(null); }}>
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>{roleMember.profiles?.full_name || roleMember.profiles?.username || 'Member'} can help run this community. Co-Admins share admin controls. Moderators get the permissions you turn on.</Text>
      {(['admin', 'moderator', 'member'] as const).filter(role => admin || role !== 'admin').map(role => <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: roleDraft === role }} onPress={() => { setRoleDraft(role); setPermDraft(defaultPermissions(role)); }} style={{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: roleDraft === role ? c.accent : c.border, backgroundColor: roleDraft === role ? (c.isDark ? '#26214C' : '#F0ECFF') : c.card, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ color: c.text, fontWeight: '800' }}>{roleLabel(role, false)}</Text></Pressable>)}
      {roleDraft === 'admin' ? <Text style={{ color: c.muted, fontSize: 13 }}>Co-Admins have all community management permissions.</Text> : null}
      {roleDraft === 'moderator' ? <>
        <Text style={{ color: c.text, fontWeight: '800', marginTop: 6 }}>What they can do</Text>
        {([['can_approve', 'Approve join requests'], ['can_post', 'Post when only admins can post'], ['can_edit', 'Edit community profile'], ['can_manage_roles', 'Change other member roles']] as const).map(([key, label]) => {
          const grantable = admin || (key !== 'can_manage_roles' && community?.permissions[key] === true);
          return <View key={key} style={[ui.row, { minHeight: 58 }]}><Text style={{ flex: 1, color: grantable ? c.text : c.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text><Switch accessibilityLabel={label} disabled={!grantable} value={grantable && permDraft[key]} onValueChange={value => setPermDraft(current => ({ ...current, [key]: value }))} trackColor={{ true: purple, false: c.iconMuted }} /></View>;
        })}
      </> : null}
      <Button label="Save role" busy={busy} onPress={() => void saveRole()} />
      <Button label="View profile" onPress={() => { const userId = String(roleMember.user_id); setRoleMember(null); openProfile(userId); }} />
    </Sheet> : null}
    {confirm ? <Sheet title={confirm === 'leave' ? 'Leave Community?' : 'Delete Community?'} centered close={() => { if (!busy) setConfirm(null); }}><Text style={{ color: c.muted, lineHeight: 21, fontSize: 13 }}>{confirm === 'leave' ? `You will leave ${community?.name || 'this community'} and it will be removed from your community conversations.` : 'This permanently deletes this community, its conversation, polls and posts. This action cannot be undone.'}</Text><Button label="Cancel" disabled={busy} onPress={() => setConfirm(null)} /><Button label={confirm === 'leave' ? 'Leave Community' : 'Delete'} danger busy={busy} onPress={() => { setBusy(true); const task = confirm === 'leave' ? communitiesProductionService.leave(id) : manageCommunity(id, 'delete', { confirmed: true }); void task.then(onDeleted).catch(error => { setError(errorText(error)); setConfirm(null); }).finally(() => setBusy(false)); }} /></Sheet> : null}
  </Page>;

  function Meta({ icon, text, accent = false }: { icon: React.ComponentProps<typeof Icon>['name']; text: string; accent?: boolean }) { return <View style={[s.metaPill, accent && s.ownerPill]}><Icon name={icon} size={14} color={accent ? c.accent : c.muted} /><Text style={[s.metaText, accent && { color: c.accent }]}>{text}</Text></View>; }
  function Title({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) { return <View style={s.sectionTitleRow}><Icon name={icon} size={19} color={c.accent} /><Text style={s.sectionTitle}>{text}</Text></View>; }
}

const createStyles = (c: ReferencePalette) => StyleSheet.create({
  content: { paddingBottom: 40, gap: 14 }, heroCard: { backgroundColor: c.card, overflow: 'hidden' },
  cover: { height: 248, backgroundColor: '#12182A' }, coverImage: { width: '100%', height: '100%' }, coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B2340' },
  heroBar: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }, heroIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#11182766' }, heroTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  coverActions: { position: 'absolute', left: 14, right: 14, bottom: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryBadge: { maxWidth: '62%', minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 15, backgroundColor: '#111827C9', paddingHorizontal: 10 }, categoryText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  joinChip: { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6C54FF' }, joinChipText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  identityBody: { paddingHorizontal: 16, paddingBottom: 18, marginTop: -38 }, avatarWrap: { width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: c.card, backgroundColor: c.card }, avatar: { width: 80, height: 80, borderRadius: 40 }, avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.inset }, name: { color: c.text, fontSize: 26, fontWeight: '800', marginTop: 10 }, tagline: { color: c.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }, memberStat: { flexDirection: 'row', alignItems: 'center', gap: 8 }, avatarStack: { flexDirection: 'row', alignItems: 'center' }, stackAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.card },
  metaPill: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 14, backgroundColor: c.inset }, ownerPill: { backgroundColor: c.isDark ? '#26214C' : '#F0ECFF' }, metaText: { color: c.muted, fontSize: 11, fontWeight: '700' },
  card: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, gap: 12 }, sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }, sectionTitle: { color: c.text, fontSize: 16, fontWeight: '800' }, sectionCount: { color: c.muted, fontSize: 11, marginLeft: 'auto', fontVariant: ['tabular-nums'] }, seeAll: { color: c.accent, fontSize: 12, fontWeight: '800' }, description: { color: c.muted, fontSize: 13, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tag: { backgroundColor: c.isDark ? '#26214C' : '#EEEAFE', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 }, tagText: { color: c.accent, fontSize: 11, fontWeight: '800' }, rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, ruleNumber: { width: 25, height: 25, borderRadius: 13, backgroundColor: c.isDark ? '#302A66' : '#EEEAFE', alignItems: 'center', justifyContent: 'center' }, ruleNumberText: { color: c.accent, fontSize: 10, fontWeight: '800' }, ruleText: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 19, paddingTop: 3 },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16 }, primaryAction: { flex: 1, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryActionText: { color: '#FFF', fontSize: 12, fontWeight: '800' }, secondaryAction: { flex: 1, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: c.accent, backgroundColor: c.card }, secondaryActionText: { color: c.accent, fontSize: 12, fontWeight: '800' },
  memberRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }, memberAvatar: { width: 42, height: 42, borderRadius: 21 }, memberName: { color: c.text, fontSize: 12, fontWeight: '700' }, memberUsername: { color: c.muted, fontSize: 10 }, creatorBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: c.isDark ? '#302A66' : '#EEEAFE' }, creatorText: { color: c.accent, fontSize: 9, fontWeight: '800' }, empty: { color: c.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 8 },
  dangerAction: { minHeight: 48, marginHorizontal: 16, borderWidth: 1, borderColor: c.danger, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, dangerText: { color: c.danger, fontSize: 12, fontWeight: '800' }, eyebrow: { color: c.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 6, marginHorizontal: 16 }, settingsCard: { minHeight: 82, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 15, borderWidth: 1, borderColor: c.border, padding: 14 }, settingsIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: c.isDark ? '#302A66' : '#EEEAFE', alignItems: 'center', justifyContent: 'center' }, settingsGroup: { marginHorizontal: 16, backgroundColor: c.card, borderRadius: 15, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }, settingRow: { minHeight: 78, borderBottomWidth: 1, borderColor: c.border }, settingTitle: { color: c.text, fontSize: 12, fontWeight: '700' }, settingSubtitle: { color: c.muted, fontSize: 10, lineHeight: 15 }, requestLink: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: c.border }, requestLinkText: { color: c.accent, fontSize: 11, fontWeight: '700' },
  requestCard: { minHeight: 72, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, backgroundColor: c.card, borderRadius: 15, borderWidth: 1, borderColor: c.border }, rejectButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.danger }, approveButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.success }, emptyState: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 70 },
});
