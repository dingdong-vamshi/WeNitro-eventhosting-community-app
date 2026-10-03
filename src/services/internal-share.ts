import { Platform, Share } from "react-native";
import type { ChatShareKind, ChatSharePayload } from "./realtime-chat";

export type InternalShareEntity = {
  kind: ChatShareKind;
  id: string;
  title: string;
  preview: string;
  thumbnailUrl?: string | null;
  creatorName?: string | null;
  inviteUrl?: string;
};

// Invalidates asynchronous share work synchronously when the root accepts a new session.
let shareIdentity: string | null = null;
let shareGeneration = 0;
export function setShareIdentity(identity: string | null) {
  if (identity !== shareIdentity) { shareIdentity = identity; shareGeneration++; }
}
export function captureShareScope() {
  const identity = shareIdentity, generation = shareGeneration;
  return () => identity !== null && identity === shareIdentity && generation === shareGeneration;
}

type ShareRequestListener = (entity: InternalShareEntity) => void;
type NavigationListener = (payload: ChatSharePayload) => void;

const shareRequestListeners = new Set<ShareRequestListener>();
const navigationListeners = new Set<NavigationListener>();

export function requestInternalShare(entity: InternalShareEntity) {
  if (!captureShareScope()()) return;
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

export function shareEntityUrl(entity: InternalShareEntity) {
  if (entity.inviteUrl) {
    if (entity.kind !== "activity" || !/^(?:https?:\/\/[^\s#]+#\/activity-invite\/|wenitro:\/\/activity\/invite\/)[0-9a-f-]{36}$/i.test(entity.inviteUrl)) throw new Error("Invalid Activity invite link.");
    return entity.inviteUrl;
  }
  const base = "https://wenitro-app.vercel.app";
  const canonicalUrl = entity.kind === "vibe"
    ? `${base}/share/vibe/${encodeURIComponent(entity.id)}`
    : `${base}/#/${entity.kind.replace("_", "-")}/${encodeURIComponent(entity.id)}`;
  return canonicalUrl;
}

export async function shareEntityExternally(entity: InternalShareEntity) {
  const canonicalUrl = shareEntityUrl(entity);
  const caption = `${entity.title}\n\n${entity.preview}\n\n${canonicalUrl}\n\nShared from WeNitro`;
  try {
    const result = await Share.share({
      title: entity.title,
      url: canonicalUrl,
      message: Platform.OS === "ios" ? `${entity.title}\n\n${entity.preview}\n\nShared from WeNitro` : caption,
    });
    return (Platform.OS === "web" && result == null) || result?.action === Share.sharedAction;
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return false;
    throw error;
  }
}
