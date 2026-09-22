import React, { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MOBILE_APP_MAX_WIDTH, MobileOverlayFrame } from '../mobile-app-shell';
export type ReferenceThemeMode = 'light' | 'dark';
export type ReferencePalette = {
  mode: ReferenceThemeMode;
  isDark: boolean;
  bg: string;
  card: string;
  surfaceElevated: string;
  input: string;
  nav: string;
  sheet: string;
  text: string;
  muted: string;
  border: string;
  inset: string;
  icon: string;
  iconMuted: string;
  overlay: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
};

const referencePalettes: Record<ReferenceThemeMode, ReferencePalette> = {
  dark: {
    mode: 'dark', isDark: true,
    bg: '#07111F', card: '#101D30', surfaceElevated: '#16243A', input: '#122036', nav: '#0C1829', sheet: '#0A1626',
    text: '#F7F8FC', muted: '#96A3B6', border: '#263750', inset: '#0B1728', icon: '#F7F8FC', iconMuted: '#91A0B5',
    overlay: '#020712CC', accent: '#6C54FF', success: '#29C984', danger: '#FF647C', warning: '#FFB547',
  },
  light: {
    mode: 'light', isDark: false,
    bg: '#F7F8FC', card: '#FFFFFF', surfaceElevated: '#FFFFFF', input: '#FFFFFF', nav: '#FFFFFF', sheet: '#FFFFFF',
    text: '#10172A', muted: '#657087', border: '#E3E7F0', inset: '#F0F2F8', icon: '#182033', iconMuted: '#77839A',
    overlay: '#07111F80', accent: '#5943F4', success: '#168B5E', danger: '#D83C57', warning: '#B56D06',
  },
};

export const ReferenceTheme = createContext<ReferenceThemeMode>('dark');
export const useReferenceTheme = () => useContext(ReferenceTheme);
export const usePalette = () => referencePalettes[useReferenceTheme()];
export const purple = '#6650F5';
export const clientGradient = ['#5532E8', '#315CF5', '#17B9D6'] as const;
export function Icon({ name, size = 22, color }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) { const c = usePalette(); return <Ionicons name={name} size={size} color={color || c.text} />; }
export function Action({ name, label, onPress, disabled, color }: { color?: string; name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[ui.action, disabled && { opacity: .4 }]}><Icon name={name} color={color} /></Pressable>; }
export function Header({ title, back, children }: { title: string; back?: () => void; children?: React.ReactNode }) { const c = usePalette(); return <View style={[ui.header, { borderColor: c.border }]}>{back && <Action name="arrow-back" label="Back" onPress={back} />}<Text numberOfLines={1} style={[ui.title, { color: c.text, flex: 1, marginLeft: back ? 0 : 16 }]}>{title}</Text>{children}</View>; }
export function Page({ children }: { children: React.ReactNode }) { const c = usePalette(); return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}><View style={{ flex: 1, width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: 'center' }}>{children}</View></SafeAreaView>; }
export function Field(props: TextInputProps) { const c = usePalette(); return <TextInput placeholderTextColor={c.muted} {...props} style={[ui.field, { backgroundColor: c.card, color: c.text, borderColor: c.border }, props.style]} />; }
export function SearchField(props: TextInputProps) { const c = usePalette(); return <View style={[ui.search, { backgroundColor: c.card }]}><Icon name="search-outline" color={c.muted} size={19} /><TextInput placeholderTextColor={c.muted} {...props} style={[{ flex: 1, color: c.text, fontSize: 15, fontWeight: '600', minHeight: 43, outlineStyle: 'none' } as any, props.style]} /></View>; }
export function BrandBar({
  go,
  location = 'Bhubaneswar',
  avatarUrl,
  notificationCount = 0,
  children,
}: {
  go?: (screen: any) => void;
  location?: string;
  avatarUrl?: string;
  notificationCount?: number;
  children?: React.ReactNode;
}) {
  const c = usePalette();
  return <LinearGradient colors={c.isDark ? ['#1B1744', '#281E66'] : ['#2D23BA', '#533EE6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ui.brandBar, children ? { minHeight: undefined, paddingBottom: 16, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 } : null]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <View style={ui.brandIdentity}>
        <ImageLogo />
        <View>
          <Text style={ui.brandName}>WeNitro</Text>
          {location ? <Text style={ui.brandLocation}><Ionicons name="location" size={9} /> {location}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Action color="#FFFFFF" name="search-outline" label="Search" onPress={() => go?.('search')} />
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => go?.('notifications')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          {notificationCount > 0 ? (
            <View style={{ position: 'absolute', top: 5, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => go?.('profile')} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFFFFF80', overflow: 'hidden', marginLeft: 2 }}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} /> : <View style={{ width: '100%', height: '100%', backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person" size={18} color="#FFFFFF" /></View>}
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', borderWidth: 1, borderColor: '#FFFFFF' }} />
        </Pressable>
      </View>
    </View>
    {children}
  </LinearGradient>;
}
function ImageLogo() { return <View style={ui.logoTile}><Image source={require('../../../assets/wenitro-logo-transparent.png')} resizeMode="contain" style={{ width: 34, height: 34 }} /></View>; }
export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { const c = usePalette(); return <View style={ui.sectionHeading}><Text style={[ui.sectionHeadingText, { color: c.text }]}>{title}</Text>{action ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={[ui.sectionAction, { color: c.accent }]}>{action}  ›</Text></Pressable> : null}</View>; }
export function Pills({ values, selected, onChange, underline = false }: { values: readonly string[]; selected: string; onChange: (v: string) => void; underline?: boolean }) { const c = usePalette(); return <View style={[ui.pills, underline && { gap: 0, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: c.border }]}>{values.map(v => <Pressable accessibilityRole="tab" accessibilityState={{ selected: selected === v }} key={v} onPress={() => onChange(v)} style={[ui.pill, underline ? { flex: 1, paddingHorizontal: 3, borderRadius: 0, borderBottomWidth: 2, borderBottomColor: selected === v ? purple : 'transparent', paddingVertical: 14 } : { backgroundColor: selected === v ? purple : c.card }]}><Text style={{ color: selected === v ? underline ? '#9488FF' : '#FFF' : c.muted, fontWeight: selected === v ? '600' : '400', fontSize: 13, textAlign: 'center' }}>{v}</Text></Pressable>)}</View>; }
export function Sheet({ title, close, children, centered = false, footer }: { title: string; close: () => void; children: React.ReactNode; centered?: boolean; footer?: React.ReactNode }) { const c = usePalette(); return <Modal transparent animationType={centered ? 'fade' : 'slide'} onRequestClose={close}><MobileOverlayFrame><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.overlay, justifyContent: centered ? 'center' : 'flex-end', padding: centered ? 24 : 0 }}><View style={{ backgroundColor: c.sheet, width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: 'center', borderRadius: 17, height: footer ? '90%' : undefined, maxHeight: '90%', paddingBottom: footer ? 0 : 22, overflow: 'hidden' }}><Header title={title}><Action name="close" label={`Close ${title}`} onPress={close} /></Header><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16 }}>{children}</ScrollView>{footer ? <View style={{ padding: 14, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.sheet }}>{footer}</View> : null}</View></KeyboardAvoidingView></MobileOverlayFrame></Modal>; }
export function Button({ label, onPress, disabled, busy, danger = false }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? '#D83C57' : purple, borderRadius: 14, opacity: disabled || busy ? .5 : 1, padding: 12 }}>{busy ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>{label}</Text>}</Pressable>; }
export function ErrorLine({ text }: { text?: string }) { return text ? <Text accessibilityRole="alert" style={{ color: '#F47786', fontSize: 12, lineHeight: 18, padding: 12 }}>{text}</Text> : null; }
export function Skeleton({ count = 4 }: { count?: number }) { const c = usePalette(); return <View accessibilityLabel="Loading" style={{ gap: 18, padding: 18 }}>{Array.from({ length: count }, (_, i) => <View key={i} style={{ flexDirection: 'row', gap: 13 }}><View style={{ width: 46, height: 46, borderRadius: 24, backgroundColor: c.card }} /><View style={{ flex: 1, gap: 10 }}><View style={{ width: '62%', height: 13, borderRadius: 4, backgroundColor: c.card }} /><View style={{ width: '86%', height: 11, borderRadius: 4, backgroundColor: c.card }} /></View></View>)}</View>; }
export const ui = StyleSheet.create({ header: { height: 61, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingRight: 8 }, title: { fontSize: 18, fontWeight: '800' }, action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, field: { minHeight: 48, borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 13 }, search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, margin: 14, borderRadius: 16, borderWidth: 1, borderColor: '#73809A22' }, pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 9 }, pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 }, label: { fontSize: 13, marginBottom: 8 }, section: { fontSize: 12, marginBottom: 11, marginTop: 23 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 68, gap: 12, paddingHorizontal: 16 }, avatar: { width: 48, height: 48, borderRadius: 16 }, muted: { fontSize: 12, lineHeight: 18 }, text: { fontSize: 13, lineHeight: 19 }, brandBar: { minHeight: 76, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingHorizontal: 17, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center' }, brandIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logoTile: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, logoMark: { color: '#563EF0', fontWeight: '900', fontSize: 19 }, brandName: { color: '#FFF', fontSize: 18, fontWeight: '800' }, brandLocation: { color: '#E9E7FF', fontSize: 12, marginTop: 2 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 11 }, sectionHeadingText: { fontSize: 16, fontWeight: '800' }, sectionAction: { fontSize: 12, fontWeight: '700' } });
export function ReferenceNavigation({ active, go }: { active: string; go: (s: 'feed' | 'vibes' | 'host' | 'chat' | 'profile') => void }) { const c = usePalette(); const items = [['feed', 'home-outline', 'Home'], ['vibes', 'film-outline', 'Vibes'], ['host', 'add', 'Host'], ['chat', 'chatbubble-outline', 'Chat'], ['profile', 'person-outline', 'Profile']] as const; return <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.nav }}><View style={{ height: 72, flexDirection: 'row', backgroundColor: c.nav, borderTopWidth: 1, borderColor: c.border }}>{items.map(([key, icon, label]) => { const center = key === 'host'; return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active === key }} key={key} onPress={() => go(key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>{center ? <LinearGradient colors={clientGradient} style={{ width: 50, height: 50, marginTop: -22, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: c.nav }}><Icon name={icon} size={27} color="#FFF" /></LinearGradient> : <Icon name={active === key ? (icon.replace('-outline', '') as any) : icon} size={24} color={active === key ? c.accent : c.iconMuted} />}<Text style={{ color: active === key ? c.accent : c.iconMuted, fontSize: 12, fontWeight: active === key ? '700' : '500' }}>{label}</Text></Pressable>; })}</View></SafeAreaView>; }
