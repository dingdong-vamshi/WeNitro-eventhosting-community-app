import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { chatService } from "../services/wenitro";
import { shareEntityExternally, type InternalShareEntity } from "../services/internal-share";
import type { ChatMessage } from "../services/realtime-chat";
import { MobileOverlayFrame } from "./mobile-app-shell";
import { usePalette } from "./reconstruction/ui";

type ConversationTarget = {
  id: string;
  name: string;
  type: "People" | "Groups";
  avatar: string;
  userId?: string;
  roomType?: string;
};

type PersonTarget = {
  id: string;
  name: string;
  username: string;
  avatar: string;
};

export type ResolvedShareTarget = {
  roomId: string;
  name: string;
  avatar: string;
  type: "People" | "Groups";
  userId?: string;
  roomType: string;
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))]);
}

export function ShareToChatModal({
  entity,
  conversations,
  people,
  onClose,
  onSent,
}: {
  entity: InternalShareEntity | null;
  conversations: ConversationTarget[];
  people: PersonTarget[];
  onClose: () => void;
  onSent: (roomIds: string[], messages: ChatMessage[], targets: ResolvedShareTarget[]) => void;
}) {
  const c = usePalette();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    setQuery("");
    setSelected([]);
    setSending(false);
    setFeedback(null);
  }, [entity?.kind, entity?.id]);

  const allTargets = useMemo(() => {
    const directUserIds = new Set(
      conversations.filter((item) => item.type === "People").map((item) => item.userId),
    );
    const rooms = conversations.map((item) => ({
      key: `room:${item.id}`,
      roomId: item.id,
      personId: undefined as string | undefined,
      name: item.name,
      detail: item.type === "Groups" ? "Group" : "Recent conversation",
      avatar: item.avatar,
      type: item.type,
      userId: item.userId,
      roomType: item.roomType || (item.type === "People" ? "personal" : "group"),
    }));
    const peopleWithoutRooms = people
      .filter((person) => !directUserIds.has(person.id))
      .map((person) => ({
        key: `person:${person.id}`,
        roomId: undefined as string | undefined,
        personId: person.id,
        name: person.name,
        detail: `@${person.username}`,
        avatar: person.avatar,
        type: "People" as const,
        userId: person.id,
        roomType: "personal",
      }));
    return [...rooms, ...peopleWithoutRooms];
  }, [conversations, people]);

  const targets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allTargets.filter((item) =>
      !normalized || `${item.name} ${item.detail}`.toLowerCase().includes(normalized),
    );
  }, [allTargets, query]);

  const toggle = (key: string) => setSelected((current) => {
    setFeedback(null);
    if (current.includes(key)) return current.filter((item) => item !== key);
    if (current.length >= 20) { setFeedback({ tone: "error", text: "You can share with up to 20 recipients at a time." }); return current; }
    return [...current, key];
  });

  const send = async () => {
    if (!entity || !selected.length || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const selectedTargets = allTargets.filter((item) => selected.includes(item.key));
      if (selectedTargets.length > 20) throw new Error("Select up to 20 recipients.");
      const resolved = await Promise.all(selectedTargets.map(async (target) => ({
        roomId: target.roomId ?? await withTimeout(chatService.createDirect(String(target.personId)), 15_000, `Could not open the chat with ${target.name}. Try again.`),
        name: target.name,
        avatar: target.avatar,
        type: target.type,
        userId: target.userId,
        roomType: target.roomType,
      })));
      const roomIds = resolved.map(target => target.roomId);
      const uniqueRoomIds = [...new Set(roomIds)];
      const messages = await chatService.share(uniqueRoomIds, entity.kind, entity.id);
      onSent(uniqueRoomIds, messages, resolved.filter((target, index, all) => all.findIndex(item => item.roomId === target.roomId) === index));
      setSelected([]);
      setFeedback({ tone: "success", text: `Sent to ${uniqueRoomIds.length} chat${uniqueRoomIds.length === 1 ? "" : "s"}.` });
      setSending(false);
      setTimeout(onClose, 800);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Could not share. Please try again." });
      setSending(false);
    }
  };

  const shareExternally = async () => {
    if (!entity) return;
    try {
      await shareEntityExternally(entity);
    } catch (error) {
      Alert.alert("Could not share", error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <Modal visible={Boolean(entity)} transparent animationType="slide" onRequestClose={onClose}>
      <MobileOverlayFrame style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: c.sheet }]}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logo}><Text style={styles.logoMark}>W</Text></View>
              <View>
                <Text style={styles.eyebrow}>WENITRO</Text>
                <Text style={[styles.title, { color: c.text }]}>Share to Chat</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close share" disabled={sending} style={[styles.close, { backgroundColor: c.inset }, sending && { opacity: .45 }]} onPress={onClose}>
              <Ionicons name="close" size={24} color={c.icon} />
            </Pressable>
          </View>
          <View style={styles.preview}>
            {entity?.thumbnailUrl ? <Image source={{ uri: entity.thumbnailUrl }} style={styles.previewImage} /> : <View style={styles.previewFallback}><Text style={styles.logoMark}>W</Text></View>}
            <View style={styles.previewCopy}>
              <Text style={styles.previewKind}>{entity?.kind.replaceAll("_", " ")}</Text>
              <Text numberOfLines={1} style={styles.previewTitle}>{entity?.title}</Text>
              <Text numberOfLines={2} style={styles.previewText}>{entity?.preview}</Text>
            </View>
          </View>
          <View style={[styles.search, { borderColor: c.border, backgroundColor: c.input }]}>
            <Ionicons name="search" size={20} color={c.iconMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats, groups, or people"
              placeholderTextColor={c.muted}
              style={[styles.searchInput, { color: c.text }]}
            />
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {targets.map((target) => {
              const checked = selected.includes(target.key);
              return (
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`Share with ${target.name}`} accessibilityState={{ checked }} key={target.key} style={[styles.target, { backgroundColor: c.card }]} onPress={() => toggle(target.key)}>
                  <Image source={{ uri: target.avatar }} style={[styles.avatar, { backgroundColor: c.inset }]} />
                  <View style={styles.targetText}>
                    <Text style={[styles.targetName, { color: c.text }]}>{target.name}</Text>
                    <Text style={[styles.targetDetail, { color: c.muted }]}>{target.detail}</Text>
                  </View>
                  <Ionicons name={checked ? "checkmark-circle" : "ellipse-outline"} size={27} color={checked ? c.accent : c.iconMuted} />
                </Pressable>
              );
            })}
            {!targets.length ? <Text style={[styles.empty, { color: c.muted }]}>No matching WeNitro chats or people.</Text> : null}
          </ScrollView>
          {feedback ? <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: feedback.tone === "success" ? (c.isDark ? "#163B2D" : "#E2F7EC") : (c.isDark ? "#4A2229" : "#FDECEF") }]}><Ionicons name={feedback.tone === "success" ? "checkmark-circle" : "alert-circle"} size={19} color={feedback.tone === "success" ? "#23956B" : c.danger} /><Text style={[styles.feedbackText, { color: feedback.tone === "success" ? (c.isDark ? "#9AE6C5" : "#176848") : c.danger }]}>{feedback.text}</Text></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Send shared item" accessibilityState={{ disabled: !selected.length || sending }} onPress={send} disabled={!selected.length || sending} style={[styles.send, (!selected.length || sending) && styles.sendDisabled]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name={feedback?.tone === "success" ? "checkmark-circle" : "send"} size={20} color="#fff" />}
            <Text style={styles.sendText}>{sending ? "Sending..." : feedback?.tone === "success" ? "Sent" : `Send${selected.length ? ` (${selected.length})` : ""}`}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share externally" style={styles.external} onPress={shareExternally}>
            <Ionicons name="share-outline" size={20} color={c.accent} />
            <Text style={[styles.externalText, { color: c.accent }]}>Share externally</Text>
          </Pressable>
        </View>
      </MobileOverlayFrame>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(5,10,22,.58)" },
  sheet: { width: "100%", maxHeight: "88%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#F7F8FC", padding: 20, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#1D16CE", alignItems: "center", justifyContent: "center" },
  logoMark: { color: "#FFF", fontWeight: "900", fontSize: 18 },
  eyebrow: { fontFamily: "Manrope_800ExtraBold", fontSize: 11, letterSpacing: 1.8, color: "#1D16CE" },
  title: { fontFamily: "Manrope_800ExtraBold", fontSize: 25, color: "#111827" },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EAF4" },
  preview: { borderRadius: 18, overflow: "hidden", backgroundColor: "#101D31" },
  previewImage: { width: "100%", height: 148, backgroundColor: "#1B2434" },
  previewFallback: { width: "100%", height: 88, alignItems: "center", justifyContent: "center", backgroundColor: "#1B2434" },
  previewCopy: { padding: 14 },
  previewKind: { fontFamily: "Manrope_800ExtraBold", fontSize: 11, textTransform: "uppercase", color: "#8FB7FF" },
  previewTitle: { marginTop: 4, fontFamily: "Manrope_700Bold", fontSize: 17, color: "#fff" },
  previewText: { marginTop: 3, fontFamily: "Manrope_400Regular", fontSize: 13, color: "#C3CDDA" },
  search: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 16, borderWidth: 1, borderColor: "#D9DDE7", backgroundColor: "#fff", paddingHorizontal: 14 },
  searchInput: { flex: 1, minHeight: 48, fontFamily: "Manrope_500Medium", color: "#111827" },
  list: { maxHeight: 340 },
  listContent: { gap: 8, paddingBottom: 4 },
  target: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 16, backgroundColor: "#fff" },
  avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#E7E8F2" },
  targetText: { flex: 1 },
  targetName: { fontFamily: "Manrope_700Bold", fontSize: 15, color: "#121827" },
  targetDetail: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#737D8D" },
  empty: { paddingVertical: 28, textAlign: "center", fontFamily: "Manrope_500Medium", color: "#737D8D" },
  send: { minHeight: 54, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "#1D16CE" },
  sendDisabled: { opacity: 0.42 },
  sendText: { fontFamily: "Manrope_800ExtraBold", fontSize: 16, color: "#fff" },
  external: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  externalText: { fontFamily: "Manrope_700Bold", color: "#1D16CE" },
  feedback: { minHeight: 44, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  feedbackText: { flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 12, lineHeight: 17 },
});
