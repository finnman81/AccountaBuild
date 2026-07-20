/**
 * Crash + error reporting (staged).
 *
 * @sentry/react-native is a NATIVE module: it only actually reports once a new
 * build ships with the native code compiled in. Two guards make this safe to
 * carry in an OTA to builds that DON'T have it yet:
 *   1. The SDK is loaded with a dynamic require() inside try/catch, so a
 *      missing native module throws at require time and is swallowed (a static
 *      `import` would be hoisted and crash the bundle on load).
 *   2. init() no-ops when the DSN is blank (Jake sets EXPO_PUBLIC_SENTRY_DSN
 *      before the first Sentry-enabled build).
 *
 * Until then this is inert. Nothing else in the app should import
 * '@sentry/react-native' directly — go through here.
 */
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

let sentry: any = null;
let started = false;
/** React Navigation instrumentation handle (null until init succeeds). */
let navigationIntegration: any = null;

function dsn(): string {
  const fromExtra = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_SENTRY_DSN;
  return String(process.env.EXPO_PUBLIC_SENTRY_DSN || fromExtra || '').trim();
}

/** Initialize Sentry if a DSN is configured and the native module is present. */
export function initSentry(): void {
  if (started) return;
  started = true;
  const d = dsn();
  if (!d) return; // not configured yet — stay inert

  // Hard precondition: the native module must actually be in THIS binary.
  // Builds cut before Sentry was added (iOS 34 / Android vc15 and earlier)
  // receive this JS via OTA but have no RNSentry — attempting init there is
  // pointless and risks async failures the try/catch below can't see. Checking
  // NativeModules makes "inert on old builds" provable rather than hopeful.
  if (!(NativeModules as any)?.RNSentry) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sentry = require('@sentry/react-native');
    // Screen-transition + time-to-initial-display timing. Optional chaining
    // throughout: an SDK without this export must not break error reporting.
    navigationIntegration = sentry.reactNavigationIntegration?.({ enableTimeToInitialDisplay: true }) ?? null;
    sentry.init({
      dsn: d,
      // 100% sampling: 7 beta users generate trivial volume, and we're actively
      // hunting the cold-start / tab-switch lag. Lower this before any real
      // growth — it is the main driver of quota burn.
      tracesSampleRate: 1.0,
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
      integrations: navigationIntegration ? [navigationIntegration] : [],
    });
  } catch {
    sentry = null; // native module absent (older build) — silently stay off
  }
}

/** Manually report a caught error; safe no-op when Sentry isn't running. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  try {
    if (sentry) sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* reporting must never throw into app code */
  }
}

/**
 * Hand React Navigation's container to Sentry so screen transitions are traced
 * (Progress/Groups/Profile switches — the reported lag). No-ops when Sentry
 * isn't running, which is every build before the native module ships.
 */
export function registerSentryNavigation(ref: unknown): void {
  try {
    navigationIntegration?.registerNavigationContainer?.(ref);
  } catch {
    /* instrumentation must never break navigation */
  }
}
