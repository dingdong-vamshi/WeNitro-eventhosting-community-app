import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { createLiveSelfieSession, selfieCameraError } from '../../services/live-selfie-camera';
import { Button, ErrorLine, Sheet, usePalette } from './ui';

type LiveSelfieCameraProps = { onCapture: (asset: ImagePickerAsset) => void; onClose: () => void };

export function LiveSelfieCamera({ onCapture, onClose }: LiveSelfieCameraProps) {
  const c = usePalette();
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<ReturnType<typeof createLiveSelfieSession> | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setReady(false); setError('');
    const current = createLiveSelfieSession(video.current!);
    session.current = current;
    void current.start().then(started => { if (active) setReady(started); }).catch(error => { if (active) setError(selfieCameraError(error)); });
    return () => { active = false; current.stop(); if (session.current === current) session.current = null; };
  }, [retry]);
  const close = () => { session.current?.stop(); onClose(); };
  const capture = () => {
    try {
      const asset = session.current?.capture();
      if (asset) { setReady(false); onCapture(asset); }
    } catch (error) { setError(selfieCameraError(error)); }
  };
  return <Sheet title="Take a live selfie" centered close={close}>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>Allow camera access and keep your face in view. This camera preview stays on your device until you submit the captured selfie for private review.</Text>
    <video ref={video} autoPlay muted playsInline aria-label="Live selfie camera preview" style={{ width: '100%', maxHeight: 360, aspectRatio: '3 / 4', background: '#000', borderRadius: 12, objectFit: 'contain', transform: 'scaleX(-1)' }} />
    {!ready && !error ? <Text style={{ color: c.muted }}>Waiting for camera permission and preview…</Text> : null}
    <ErrorLine text={error} />
    {error ? <Button label="Retry camera" onPress={() => setRetry(value => value + 1)} /> : null}
    <Button label="Capture selfie" disabled={!ready} onPress={capture} />
    <Button label="Cancel camera" variant="outline" onPress={close} />
  </Sheet>;
}
