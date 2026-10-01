import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Sheet, usePalette } from './ui';

/** A cancellable warning before opening the system picker; no media is read first. */
export function useResponsibleUpload() {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const pending = useRef<((allowed: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const finish = (allowed: boolean) => {
    const resolve = pending.current; pending.current = null; setOpen(false); resolve?.(allowed);
  };
  const confirmUpload = () => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => { pending.current = resolve; setOpen(true); });
  };
  const uploadNotice = open ? <Sheet title="Upload Responsibly" close={() => finish(false)}>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>Upload only appropriate media you have permission to share. Explicit, hateful, discriminatory, misleading or unrelated content may be removed and may result in permanent account suspension.</Text>
    <Button label="Continue" onPress={() => finish(true)} />
    <Button label="Cancel" variant="outline" onPress={() => finish(false)} />
  </Sheet> : null;
  return { confirmUpload, uploadNotice };
}
