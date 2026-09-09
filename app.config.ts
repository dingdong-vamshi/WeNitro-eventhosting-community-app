import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  // Android is autolinked. The non-Firebase plugin adds the iOS callback scheme only.
  // Do not fabricate a scheme or require iOS credentials for Android/web builds.
  const googlePlugin: NonNullable<ExpoConfig['plugins']> = iosClientId
    ? [['@react-native-google-signin/google-signin', { iosUrlScheme: `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` }]]
    : [];
  return { ...config, name: config.name ?? 'weNitro-module', slug: config.slug ?? 'weNitro-module', plugins: [...(config.plugins ?? []), ...googlePlugin] };
};
