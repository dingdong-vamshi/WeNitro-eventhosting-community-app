import type { ImagePickerAsset } from 'expo-image-picker';

export type LiveSelfieCameraProps = { onCapture: (asset: ImagePickerAsset) => void; onClose: () => void };
// Native verification keeps Expo's actual camera capture, never a gallery picker.
export function LiveSelfieCamera(_props: LiveSelfieCameraProps) { return null; }
