import React, { createContext, useContext } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
    bg: '#101824', card: '#202C38', surfaceElevated: '#263341', input: '#202B37', nav: '#202C38', sheet: '#101824',
    text: '#F3F4F7', muted: '#949CA8', border: '#35404D', inset: '#111827', icon: '#F3F4F7', iconMuted: '#949CA8',
    overlay: '#00000099', accent: '#7060EF', success: '#26B77A', danger: '#F47786', warning: '#F5A524',
  },
  light: {
    mode: 'light', isDark: false,
    bg: '#F7F7FB', card: '#FFFFFF', surfaceElevated: '#FFFFFF', input: '#FFFFFF', nav: '#FFFFFF', sheet: '#FFFFFF',
    text: '#182033', muted: '#667085', border: '#DFE2EA', inset: '#F0F1F8', icon: '#182033', iconMuted: '#7D8799',
    overlay: '#10182866', accent: '#6252E8', success: '#178A5B', danger: '#C6374C', warning: '#B76B00',
  },
};

export const ReferenceTheme = createContext<ReferenceThemeMode>('dark');
export const useReferenceTheme = () => useContext(ReferenceTheme);
export const usePalette = () => referencePalettes[useReferenceTheme()];
export const purple = '#7060EF';
export function Icon({ name, size = 22, color }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) { const c = usePalette(); return <Ionicons name={name} size={size} color={color || c.text} />; }
export function Action({ name, label, onPress, disabled }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[ui.action, disabled && { opacity: .4 }]}><Icon name={name} /></Pressable>; }
export function Header({ title, back, children }: { title: string; back?: () => void; children?: React.ReactNode }) { const c = usePalette(); return <View style={[ui.header, { borderColor: c.border }]}>{back && <Action name="arrow-back" label="Back" onPress={back} />}<Text numberOfLines={1} style={[ui.title, { color: c.text, flex: 1, marginLeft: back ? 0 : 16 }]}>{title}</Text>{children}</View>; }
export function Page({ children }: { children: React.ReactNode }) { const c = usePalette(); return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}><View style={{ flex: 1, width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: 'center' }}>{children}</View></SafeAreaView>; }
export function Field(props: TextInputProps) { const c = usePalette(); return <TextInput placeholderTextColor={c.muted} {...props} style={[ui.field, { backgroundColor: c.card, color: c.text, borderColor: c.border }, props.style]} />; }
export function SearchField(props: TextInputProps) { const c = usePalette(); return <View style={[ui.search, { backgroundColor: c.card }]}><Icon name="search-outline" color={c.muted} size={19} /><TextInput placeholderTextColor={c.muted} {...props} style={[{ flex: 1, color: c.text, fontSize: 13, minHeight: 43, outlineStyle: 'none' } as any, props.style]} /></View>; }
export function Pills({ values, selected, onChange, underline = false }: { values: readonly string[]; selected: string; onChange: (v: string) => void; underline?: boolean }) { const c = usePalette(); return <View style={[ui.pills, underline && { gap: 0, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: c.border }]}>{values.map(v => <Pressable accessibilityRole="tab" accessibilityState={{ selected: selected === v }} key={v} onPress={() => onChange(v)} style={[ui.pill, underline ? { flex: 1, paddingHorizontal: 3, borderRadius: 0, borderBottomWidth: 2, borderBottomColor: selected === v ? purple : 'transparent', paddingVertical: 14 } : { backgroundColor: selected === v ? purple : c.card }]}><Text style={{ color: selected === v ? underline ? '#9488FF' : '#FFF' : c.muted, fontWeight: selected === v ? '600' : '400', fontSize: 13, textAlign: 'center' }}>{v}</Text></Pressable>)}</View>; }
export function Sheet({ title, close, children, centered = false, footer }: { title: string; close: () => void; children: React.ReactNode; centered?: boolean; footer?: React.ReactNode }) { const c = usePalette(); return <Modal transparent animationType={centered ? 'fade' : 'slide'} onRequestClose={close}><MobileOverlayFrame><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: c.overlay, justifyContent: centered ? 'center' : 'flex-end', padding: centered ? 24 : 0 }}><View style={{ backgroundColor: c.sheet, width: '100%', maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: 'center', borderRadius: 17, height: footer ? '90%' : undefined, maxHeight: '90%', paddingBottom: footer ? 0 : 22, overflow: 'hidden' }}><Header title={title}><Action name="close" label={`Close ${title}`} onPress={close} /></Header><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16 }}>{children}</ScrollView>{footer ? <View style={{ padding: 14, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.sheet }}>{footer}</View> : null}</View></KeyboardAvoidingView></MobileOverlayFrame></Modal>; }
export function Button({ label, onPress, disabled, busy, danger = false }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? '#C6374C' : purple, borderRadius: 8, opacity: disabled || busy ? .5 : 1, padding: 12 }}>{busy ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>{label}</Text>}</Pressable>; }
export function ErrorLine({ text }: { text?: string }) { return text ? <Text accessibilityRole="alert" style={{ color: '#F47786', fontSize: 12, lineHeight: 18, padding: 12 }}>{text}</Text> : null; }
export function Skeleton({ count = 4 }: { count?: number }) { const c = usePalette(); return <View accessibilityLabel="Loading" style={{ gap: 18, padding: 18 }}>{Array.from({ length: count }, (_, i) => <View key={i} style={{ flexDirection: 'row', gap: 13 }}><View style={{ width: 46, height: 46, borderRadius: 24, backgroundColor: c.card }} /><View style={{ flex: 1, gap: 10 }}><View style={{ width: '62%', height: 13, borderRadius: 4, backgroundColor: c.card }} /><View style={{ width: '86%', height: 11, borderRadius: 4, backgroundColor: c.card }} /></View></View>)}</View>; }
export const ui = StyleSheet.create({ header: { height: 61, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingRight: 8 }, title: { fontSize: 18, fontWeight: '700' }, action: { width: 43, height: 44, alignItems: 'center', justifyContent: 'center' }, field: { minHeight: 46, borderWidth: 1, borderRadius: 9, padding: 12, fontSize: 13 }, search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, margin: 14, borderRadius: 12 }, pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 9 }, pill: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22 }, label: { fontSize: 13, marginBottom: 8 }, section: { fontSize: 12, marginBottom: 11, marginTop: 23 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12, paddingHorizontal: 16 }, avatar: { width: 46, height: 46, borderRadius: 24 }, muted: { fontSize: 12, lineHeight: 18 }, text: { fontSize: 13, lineHeight: 19 } });
export function ReferenceNavigation({ active, go }: { active: string; go: (s: 'feed' | 'vibes' | 'host' | 'chat' | 'profile') => void }) { const c = usePalette(); return <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.nav }}><View style={{ height: 60, flexDirection: 'row', backgroundColor: c.nav, borderTopWidth: 1, borderColor: c.border }}>{([['feed', 'home-outline', 'Feed'], ['vibes', 'film-outline', 'Vibes'], ['host', 'add-circle-outline', 'Host'], ['chat', 'chatbubble-outline', 'Chat'], ['profile', 'person-outline', 'Profile']] as const).map(([key, icon, label]) => <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active === key }} key={key} onPress={() => go(key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}><Icon name={icon} size={25} color={active === key ? c.accent : c.iconMuted} /><Text style={{ color: active === key ? c.accent : c.iconMuted, fontSize: 9 }}>{label}</Text></Pressable>)}</View></SafeAreaView>; }
