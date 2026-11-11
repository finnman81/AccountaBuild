/**
 * react-native-health-connect needs MainActivity to register its permission
 * delegate in onCreate. Its own Expo plugin does not add that line, so every
 * "connect Health Connect" tap on Android crashed the app:
 *   UninitializedPropertyAccessException: lateinit property requestPermission
 *   (found on the emulator 2026-11-11; it is the crash the onboarding code
 *   had been working around since July).
 *
 * This adds the import and the call. It only takes effect in a new native
 * build. JS knows a build has it by the presence of the ExpoApplication
 * native module, which was added to the project in the same change
 * (see androidHealthPromptSafe in src/services/health/healthService.ts).
 */
const { withMainActivity } = require('@expo/config-plugins');

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

module.exports = function withHealthConnectDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt') throw new Error('withHealthConnectDelegate: expected a Kotlin MainActivity');
    if (!src.includes(IMPORT)) {
      src = src.replace(/^(package .*\n)/m, `$1\n${IMPORT}\n`);
    }
    if (!src.includes(CALL)) {
      const next = src.replace(/(super\.onCreate\([^)]*\)\n)/, `$1    ${CALL}\n`);
      if (next === src) throw new Error('withHealthConnectDelegate: super.onCreate not found in MainActivity');
      src = next;
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
