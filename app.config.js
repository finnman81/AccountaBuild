const fs = require('fs');

module.exports = ({ config }) => {
  const basePlugins = Array.isArray(config.plugins) ? config.plugins : [];
  const filteredPlugins = basePlugins.filter((plugin) => {
    if (Array.isArray(plugin)) {
      return plugin[0] !== '@kingstinct/react-native-healthkit';
    }
    return plugin !== '@kingstinct/react-native-healthkit';
  });

  const healthKitPlugin = [
    '@kingstinct/react-native-healthkit',
    {
      NSHealthShareUsageDescription:
        'AccountaBuild reads workouts, weight, and calories from Apple Health to keep your logs accurate. Manual logs always take priority.',
      NSHealthUpdateUsageDescription:
        'AccountaBuild can read health data from Apple Health when you enable sync.',
      background: true, // HealthKit background delivery → near-instant sync
    },
  ];

  return {
    ...config,
    updates: {
      ...(config.updates ?? {}),
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
    plugins: [
      ...filteredPlugins,
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            compileSdkVersion: 35,
            targetSdkVersion: 35,
          },
        },
      ],
      healthKitPlugin,
      // Android health sync via Health Connect (replaces deprecated Google Fit).
      'react-native-health-connect',
      // OS-scheduled background health sync (runs when the app is closed).
      'expo-background-task',
    ],
    android: {
      ...config.android,
      // Permissions are defined in app.json.
      // FCM config for Android push (cheer/nudge). Wired only when the file is
      // present so a build never breaks if it hasn't been added yet.
      ...(fs.existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
    },
    ios: {
      ...config.ios,
      entitlements: {
        ...(config.ios?.entitlements ?? {}),
        'com.apple.developer.healthkit': true,
      },
      infoPlist: {
        ...(config.ios?.infoPlist ?? {}),
        NSHealthShareUsageDescription:
          'AccountaBuild needs access to your health data to automatically sync workouts, calories, and weight from Apple Health.',
        NSHealthUpdateUsageDescription:
          'AccountaBuild needs permission to read your health data from Apple Health.',
      },
    },
    extra: {
      ...config.extra,
      // Firebase config - use env vars if available, otherwise fallback to hardcoded values
      // (Firebase config values are public and safe to include in client code)
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBtuewV8hkI9UbcGOuFLFcaWcqEoM4RRUY',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'accountabuild.firebaseapp.com',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'accountabuild',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'accountabuild.firebasestorage.app',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '364977359326',
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:364977359326:web:d7ce539ba3099c72b1b54f',
    },
  };
};
