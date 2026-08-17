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
/**
 * Trace sampling. Errors are ALWAYS 100% (see init) — this only governs
 * performance traces, which are the quota driver.
 *
 * Overridable per build via EXPO_PUBLIC_SENTRY_TRACES_RATE so the rate can be
 * lowered at launch without a code change. Default 0.25 rather than the
 * textbook 0.1: at this size 10% would yield roughly one trace per screen per
 * day, which is too sparse to spot a regression — and 25% of 7 users is still
 * a rounding error on quota. Drop to ~0.05 once the user count is in the
 * hundreds; that is when the bill, not the signal, becomes the binding
 * constraint.
 */
const TRACES_SAMPLE_RATE = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.25;
})();

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
      // ERRORS stay at 100% forever — they're low-volume and they're the whole
      // point. Only TRACES are sampled; they're the quota driver.
      sampleRate: 1.0,
      tracesSampleRate: TRACES_SAMPLE_RATE,
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
      integrations: navigationIntegration ? [navigationIntegration] : [],
      /**
       * Drop Firestore's offline-read rejection. It fires on background wakes
       * (HK observer / background task) before iOS has connectivity: the read
       * throws, the sync path catches it, and the next wake retries. Nothing
       * is lost.
       *
       * It is unavoidable on this stack — Firestore's persistent cache is
       * IndexedDB-backed and the React Native build of the JS SDK ships no
       * IndexedDB layer, so reads can only ever come from memory or the wire
       * (verified against firebase 12.15.0). Disk caching would need
       * @react-native-firebase, i.e. a second Firebase implementation.
       *
       * Keeping it visible buried the signal: 4 benign events were the ONLY
       * entries in the error feed, so a real error would have looked like more
       * of the same. Narrow on purpose — message AND unhandled-rejection, so a
       * genuine offline bug thrown from real code still reports.
       */
      beforeSend(event: any) {
        try {
          const v = event?.exception?.values?.[0];
          const offlineRead =
            v?.type === 'FirebaseError' &&
            typeof v?.value === 'string' &&
            v.value.includes('client is offline') &&
            v?.mechanism?.type === 'onunhandledrejection';
          return offlineRead ? null : event;
        } catch {
          return event; // never let the filter swallow a report
        }
      },
    });
  } catch {
    sentry = null; // native module absent (older build) — silently stay off
  }
}

/**
 * True only when the native module was present AND init succeeded — i.e. this
 * device is running a build that actually ships Sentry. Doubles as our build
 * detector: `Constants.nativeBuildVersion` returns null on SDK 54, so the
 * heartbeat had no way to tell who upgraded.
 */
export function isSentryActive(): boolean {
  return sentry != null;
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
