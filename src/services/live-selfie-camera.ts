import type { ImagePickerAsset } from 'expo-image-picker';

export function selfieCameraError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow camera access for WeNitro in your browser settings, then retry.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No usable camera was found. Connect a camera or open WeNitro on a camera-equipped device.';
  if (name === 'NotReadableError') return 'The camera is unavailable or in use. Close other camera apps, then retry.';
  return error instanceof Error ? error.message : 'The camera could not open. Check browser camera permissions and retry.';
}

type CameraEnvironment = {
  secure: boolean;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  createCanvas: () => HTMLCanvasElement;
};

/** Capture comes only from a live stream; there is deliberately no file-input fallback. */
export function createLiveSelfieSession(video: HTMLVideoElement, environment: CameraEnvironment = {
  secure: typeof window !== 'undefined' && window.isSecureContext,
  mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
  createCanvas: () => document.createElement('canvas'),
}) {
  let closed = false;
  let stream: MediaStream | null = null;
  const stopTracks = (value: MediaStream) => value.getTracks().forEach(track => track.stop());
  const stop = () => {
    closed = true;
    if (stream) stopTracks(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
  };
  return {
    stop,
    async start(): Promise<boolean> {
      if (closed) return false;
      if (!environment.secure) throw new Error('Live selfie capture requires HTTPS. Open the secure WeNitro site and retry.');
      if (!environment.mediaDevices?.getUserMedia) throw new Error('This browser does not support live camera capture. Open WeNitro in a supported browser on a camera-equipped device.');
      const acquired = await environment.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
      if (closed) { stopTracks(acquired); return false; }
      stream = acquired;
      video.srcObject = acquired;
      try { await video.play(); } catch (error) { stop(); throw error; }
      return !closed;
    },
    capture(): ImagePickerAsset {
      if (closed || !stream || !stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('The camera is no longer active. Reopen the camera to take a new selfie.');
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('The camera is still starting. Wait for the live preview, then capture again.');
      const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * ratio));
      const height = Math.max(1, Math.round(video.videoHeight * ratio));
      const canvas = environment.createCanvas();
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot capture a camera frame. Try a different supported browser.');
      context.drawImage(video, 0, 0, width, height);
      const uri = canvas.toDataURL('image/jpeg', .9);
      if (!uri.startsWith('data:image/jpeg;base64,')) throw new Error('The camera frame could not be saved. Please retry.');
      stop();
      return { uri, width, height, type: 'image', mimeType: 'image/jpeg', fileName: 'live-selfie.jpg' };
    },
  };
}
