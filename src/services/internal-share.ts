import type { ChatShareKind, ChatSharePayload } from "./realtime-chat";

export type InternalShareEntity = {
  kind: ChatShareKind;
  id: string;
  title: string;
  preview: string;
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
