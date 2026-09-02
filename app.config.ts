import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Strength Rebuild',
  slug: 'strength-rebuild',
  version: '2.2.0',
  icon: './assets/images/icon.png',
  orientation: 'portrait',
  scheme: 'strengthrebuild',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'cl.matias.strengthrebuild',
    versionCode: 5,
    permissions: [],
    adaptiveIcon: {
      backgroundColor: '#E7FF00',
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    './plugins/with-android-lint-compat',
    './plugins/with-secure-android-release',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#E7FF00',
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
