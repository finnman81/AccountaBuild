module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
    env: {
      // Release bundles (production `eas update` / `eas build`) strip console.*
      // except error/warn. The app never relies on console.log side effects
      // (telemetry writes to Firestore via errorReporter/Heartbeat), and the
      // startup path logs on every launch (firebase auth debug, etc.) — pure
      // overhead in prod. Dev + jest keep logs; this env block is release-only.
      production: {
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  };
};
