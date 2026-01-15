// Ensures Metro can resolve .cjs modules (date-fns, date-fns-tz, etc.)
// See: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'cjs']));

module.exports = config;

