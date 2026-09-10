import React, { useCallback, useSyncExternalStore } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { subscribeVerifiedUser, verifiedUserSnapshot } from '../services/verified-users';

export function VerifiedBadge({ userId, size = 15, color = '#6B9DEB' }: { userId?: string | number | null; size?: number; color?: string }) {
  const id = String(userId ?? '');
  const subscribe = useCallback((notify: () => void) => subscribeVerifiedUser(id, notify), [id]);
  const snapshot = useCallback(() => verifiedUserSnapshot(id), [id]);
  const verified = useSyncExternalStore(subscribe, snapshot, () => false);
  return verified ? <Ionicons accessibilityLabel="Verified account" name="checkmark-circle" size={size} color={color} /> : null;
}
