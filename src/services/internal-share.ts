import { Platform, Share } from "react-native";
import type { ChatShareKind, ChatSharePayload } from "./realtime-chat";

export type InternalShareEntity = {
  kind: ChatShareKind;
  id: string;
  title: string;
  preview: string;
  thumbnailUrl?: string | null;
  creatorName?: string | null;
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
  const base = "https://wenitro-app.vercel.app";
  const canonicalUrl = entity.kind === "vibe"
    ? `${base}/share/vibe/${encodeURIComponent(entity.id)}`
    : `${base}/#/${entity.kind.replace("_", "-")}/${encodeURIComponent(entity.id)}`;
  const caption = `${entity.title}\n\n${entity.preview}\n\n${canonicalUrl}\n\nShared from WeNitro`;
  await Share.share({
    title: entity.title,
    url: canonicalUrl,
    message: Platform.OS === "ios" ? `${entity.title}\n\n${entity.preview}\n\nShared from WeNitro` : caption,
  });
}
