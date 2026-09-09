import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { referralLink } from '../../services/referrals';
import { Button, ErrorLine, Header, Icon, Page, Sheet, usePalette, purple } from './ui';
export function ReferenceInviteSquad({ userId, back }: { userId: string; back: () => void }) {
 const c = usePalette(); const url = /^[1-9]\d*$/.test(userId) ? referralLink(userId) : ''; 
 const [copied, setCopied] = useState(false), [fallback, setFallback] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const copy = async () => { setError(''); try { const ok = await Clipboard.setStringAsync(url); if (!ok) throw new Error('Select the link below and copy it manually.'); setCopied(true); } catch { setFallback(true); setError('Select the invitation link to copy it manually.'); } };
 const share = async () => {
  if (busy) return; setBusy(true); setError('');
  try {
   const text = 'Join my squad on WeNitro. Meet people through real activities!';
   if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ title: 'Join me on WeNitro', text, url });
    else setFallback(true);
   } else await Share.share({ message: `${text}\n${url}` });
  } catch (e: any) { if (e?.name !== 'AbortError') { setFallback(true); setError('Sharing is unavailable. You can copy your invitation link.'); } }
  finally { setBusy(false); }
 };
 const steps = [
  ['Share Link', 'Copy or share your unique referral link to your friends.', 'share-social-outline'],
  ['Friend Joins WeNitro', 'Your friend creates an account using your invitation link.', 'people-outline'],
  ['Unlock points', 'Earn 20 Nitro points per friend when referral rewards become available.', 'flash-outline'],
 ] as const;
 return <Page><Header title="Invite Squad" back={back} /><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 24 }}>
  <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: '#7560B466', borderRadius: 21, padding: 24, alignItems: 'center', gap: 16 }}><View style={{ backgroundColor: '#7760E62A', padding: 18, borderRadius: 40 }}><Icon name="people-outline" color="#A18CF4" size={40} /></View><Text style={{ color: c.text, fontSize: 23, fontWeight: '700', textAlign: 'center' }}>Expand Your Squad</Text><Text style={{ color: c.muted, textAlign: 'center', lineHeight: 21, fontSize: 13 }}>Invite your friends to WeNitro and build your squad!</Text><View style={{ backgroundColor: purple, borderRadius: 25, paddingHorizontal: 17, paddingVertical: 11 }}><Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Earn 20 Points per Friend</Text></View><Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>Referral rewards are coming soon. No points are credited yet.</Text></View>
  <Text style={{ color: c.muted, fontSize: 12, letterSpacing: 1 }}>HOW IT WORKS</Text><View style={{ gap: 24 }}>{steps.map(([title, description, icon], i) => <View key={title} style={{ flexDirection: 'row', gap: 16 }}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#7560EF26', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#A18CF4', fontSize: 17, fontWeight: '700' }}>{i+1}</Text></View><View style={{ flex: 1, gap: 7 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{title}</Text><Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>{description}</Text></View><Icon name={icon} size={20} color={purple} /></View>)}</View>
  <View style={{ gap: 11 }}><Text style={{ color: c.muted, fontSize: 11, letterSpacing: 1 }}>YOUR REFERRAL LINK</Text><View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 11 }}><Text selectable style={{ color: c.text, fontSize: 12, flex: 1, lineHeight: 18, paddingVertical: 13 }}>{url}</Text><Pressable accessibilityRole="button" accessibilityLabel="Copy referral link" onPress={() => void copy()} style={{ padding: 14 }}><Icon name={copied ? 'checkmark' : 'copy-outline'} size={21} color={purple} /></Pressable></View>{copied && <Text accessibilityLiveRegion="polite" style={{ color: '#5DB88C', fontSize: 12 }}>Invitation link copied.</Text>}</View>
  <ErrorLine text={error || (!url ? 'Sign in to get your invitation link.' : '')} /><Button label="Share Invitation Link" disabled={!url} busy={busy} onPress={() => void share()} />
 </ScrollView>{fallback && <Sheet title="Share Invitation Link" centered close={() => setFallback(false)}><Text selectable style={{ color: c.text, fontSize: 14, lineHeight: 23 }}>{url}</Text><ErrorLine text={error} /><Button label={copied ? 'Copied' : 'Copy Link'} onPress={() => void copy()} /></Sheet>}</Page>;
}
