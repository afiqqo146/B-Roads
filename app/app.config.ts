import type { ConfigContext, ExpoConfig } from 'expo/config';

// Secrets come from the environment (or EAS secrets) rather than app.json.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
});
