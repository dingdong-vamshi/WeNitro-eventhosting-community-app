import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { chatService } from "../services/wenitro";
import type { InternalShareEntity } from "../services/internal-share";
import type { ChatMessage } from "../services/realtime-chat";

type ConversationTarget = {
  id: string;
  name: string;
  type: "People" | "Groups";
  avatar: string;
  userId?: string;
};

type PersonTarget = {
  id: string;
  name: string;
  username: string;
  avatar: string;
};

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
  onSent: (roomIds: string[], messages: ChatMessage[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setQuery("");
    setSelected([]);
    setSending(false);
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
      }));
    return [...rooms, ...peopleWithoutRooms];
  }, [conversations, people]);

  const targets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allTargets.filter((item) =>
      !normalized || `${item.name} ${item.detail}`.toLowerCase().includes(normalized),
    );
  }, [allTargets, query]);

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  const send = async () => {
    if (!entity || !selected.length || sending) return;
    setSending(true);
    try {
      const selectedTargets = allTargets.filter((item) => selected.includes(item.key));
      const roomIds: string[] = [];
      for (const target of selectedTargets) {
        roomIds.push(target.roomId ?? (await chatService.createDirect(String(target.personId))));
      }
      const uniqueRoomIds = [...new Set(roomIds)];
      const messages = await chatService.share(uniqueRoomIds, entity.kind, entity.id);
      onSent(uniqueRoomIds, messages);
      onClose();
      Alert.alert("Shared", `Sent to ${uniqueRoomIds.length} chat${uniqueRoomIds.length === 1 ? "" : "s"}.`);
    } catch (error) {
      Alert.alert("Could not share", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const shareExternally = async () => {
    if (!entity) return;
    await Share.share({
      title: entity.title,
      message: `${entity.title}\n\n${entity.preview}\n\nShared from WeNitro`,
    });
  };

  return (
    <Modal visible={Boolean(entity)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>WENITRO</Text>
              <Text style={styles.title}>Share to Chat</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose}>
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          </View>
          <View style={styles.preview}>
            <Text style={styles.previewKind}>{entity?.kind.replaceAll("_", " ")}</Text>
            <Text numberOfLines={1} style={styles.previewTitle}>{entity?.title}</Text>
            <Text numberOfLines={2} style={styles.previewText}>{entity?.preview}</Text>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={20} color="#667085" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats, groups, or people"
              placeholderTextColor="#8C96A8"
              style={styles.searchInput}
            />
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {targets.map((target) => {
              const checked = selected.includes(target.key);
              return (
                <Pressable key={target.key} style={styles.target} onPress={() => toggle(target.key)}>
                  <Image source={{ uri: target.avatar }} style={styles.avatar} />
                  <View style={styles.targetText}>
                    <Text style={styles.targetName}>{target.name}</Text>
                    <Text style={styles.targetDetail}>{target.detail}</Text>
                  </View>
                  <Ionicons name={checked ? "checkmark-circle" : "ellipse-outline"} size={27} color={checked ? "#1D16CE" : "#A8B0BF"} />
                </Pressable>
              );
            })}
            {!targets.length ? <Text style={styles.empty}>No matching WeNitro chats or people.</Text> : null}
          </ScrollView>
          <Pressable onPress={send} disabled={!selected.length || sending} style={[styles.send, (!selected.length || sending) && styles.sendDisabled]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
            <Text style={styles.sendText}>{sending ? "Sending..." : `Send${selected.length ? ` (${selected.length})` : ""}`}</Text>
          </Pressable>
          <Pressable style={styles.external} onPress={shareExternally}>
            <Ionicons name="share-outline" size={20} color="#1D16CE" />
            <Text style={styles.externalText}>Share externally</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(5,10,22,.58)" },
  sheet: { maxHeight: "88%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#F7F8FC", padding: 20, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontFamily: "Manrope_800ExtraBold", fontSize: 11, letterSpacing: 1.8, color: "#1D16CE" },
  title: { fontFamily: "Manrope_800ExtraBold", fontSize: 25, color: "#111827" },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EAF4" },
  preview: { borderRadius: 18, padding: 14, backgroundColor: "#101D31" },
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
});
