import { Platform } from 'react-native';
import { exchangeGoogleIdentity, getGoogleWebClientId, GoogleSignInError, requireGoogleBackend } from './google-auth.shared';
import type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';
export { googleSignInErrorMessage } from './google-auth.shared';
export type { GoogleIdentityOptions, GoogleIdentityResult } from './google-auth.shared';

let nativeAttemptRunning = false;

/** Opens Google's genuine native account chooser in an installed native build. */
export async function signInWithGoogleIdentity({ signal }: GoogleIdentityOptions = {}): Promise<GoogleIdentityResult> {
  if (signal?.aborted) return { status: 'cancelled' };
  requireGoogleBackend();
  const webClientId = getGoogleWebClientId();
  if (nativeAttemptRunning) throw new GoogleSignInError('in_progress', 'A Google sign-in is already open. Finish or close it before trying again.');
  nativeAttemptRunning = true;
  let nativeCodes: Partial<Record<'SIGN_IN_CANCELLED' | 'IN_PROGRESS' | 'PLAY_SERVICES_NOT_AVAILABLE', string>> = {};
  try {
    // Lazy import keeps Expo Go usable for visual review; native sign-in still requires a development/installed build.
    let sdk: typeof import('@react-native-google-signin/google-signin');
    try {
      sdk = await import('@react-native-google-signin/google-signin');
      nativeCodes = sdk.statusCodes;
    } catch {
      throw new GoogleSignInError('native_build_required', 'Google sign-in needs an installed WeNitro Android/iOS build. Expo Go does not include the native Google account chooser.');
    }
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
    if (Platform.OS === 'ios' && !iosClientId) {
      throw new GoogleSignInError('missing_ios_client_id', 'Google sign-in on iOS needs the iOS client ID and URL scheme configured in this build.');
    }
    sdk.GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}), offlineAccess: false });
    await sdk.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (signal?.aborted) return { status: 'cancelled' };
    // Clear only the Google SDK selection so logout/relogin can select another account.
    // This does not revoke Google consent or alter the existing Supabase session.
    if (sdk.GoogleSignin.hasPreviousSignIn()) await sdk.GoogleSignin.signOut();
    if (signal?.aborted) return { status: 'cancelled' };
    const response = await sdk.GoogleSignin.signIn();
    if (response.type === 'cancelled' || signal?.aborted) return { status: 'cancelled' };
    return await exchangeGoogleIdentity(response.data.idToken ?? '', undefined, signal);
  } catch (error) {
    if (error instanceof GoogleSignInError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === nativeCodes.SIGN_IN_CANCELLED || code === '12501' || signal?.aborted) return { status: 'cancelled' };
    if (code === nativeCodes.IN_PROGRESS) throw new GoogleSignInError('in_progress', 'A Google sign-in is already open.');
    if (code === nativeCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleSignInError('play_services_unavailable', 'Update Google Play Services to continue with Google.');
    if (code === '10' || code === 'DEVELOPER_ERROR') throw new GoogleSignInError('android_configuration', 'Google sign-in needs this Android package and signing certificate registered with its Google client ID.');
    throw new GoogleSignInError('google_failed', 'Google sign-in could not be completed. Please check your connection and try again.');
  } finally {
    nativeAttemptRunning = false;
  }
}
