import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { ChatShareKind, ChatSharePayload } from "./realtime-chat";

export type InternalShareEntity = {
  kind: ChatShareKind;
  id: string;
  title: string;
  preview: string;
  thumbnailUrl?: string | null;
};

type ShareRequestListener = (entity: InternalShareEntity) => void;
type NavigationListener = (payload: ChatSharePayload) => void;

const shareRequestListeners = new Set<ShareRequestListener>();
const navigationListeners = new Set<NavigationListener>();

export function requestInternalShare(entity: InternalShareEntity) {
  shareRequestListeners.forEach((listener) => listener(entity));
}

export function subscribeToInternalShareRequests(listener: ShareRequestListener) {
  shareRequestListeners.add(listener);
  return () => {
    shareRequestListeners.delete(listener);
  };
}

export function openSharedContent(payload: ChatSharePayload) {
  navigationListeners.forEach((listener) => listener(payload));
}

export function subscribeToSharedContentNavigation(listener: NavigationListener) {
  navigationListeners.add(listener);
  return () => {
    navigationListeners.delete(listener);
  };
}

export async function shareEntityExternally(entity: InternalShareEntity) {
  const caption = `${entity.title}\n\n${entity.preview}\n\nShared from WeNitro`;
  let fileUrl = entity.thumbnailUrl || undefined;
  if (fileUrl && /^https?:\/\//i.test(fileUrl) && FileSystem.cacheDirectory) {
    try {
      const video = /video|\.mp4|\.mov/i.test(fileUrl);
      const dest = `${FileSystem.cacheDirectory}wenitro-share-${entity.id}.${video ? "mp4" : "jpg"}`;
      const downloaded = await FileSystem.downloadAsync(fileUrl, dest);
      if (downloaded.status === 200) fileUrl = downloaded.uri;
    } catch {
      /* Keep the remote URL so WhatsApp can still open a preview. */
    }
  }
  await Share.share({
    title: entity.title,
    url: fileUrl,
    message: Platform.OS === "ios" ? caption : `${caption}${fileUrl ? `\n\n${fileUrl}` : ""}`,
  });
}
