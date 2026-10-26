// Ensures Metro can resolve .cjs modules (date-fns, date-fns-tz, etc.)
// See: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

// Sentry's wrapper adds debug IDs to each bundle so uploaded source maps
// match stack traces from OTA bundles too (falls back to plain Expo config
// if the package is missing, e.g. a stripped CI image).
let config;
try {
  const { getSentryExpoConfig } = require('@sentry/react-native/metro');
  config = getSentryExpoConfig(__dirname);
} catch {
  config = getDefaultConfig(__dirname);
}

config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'cjs']));

module.exports = config;

