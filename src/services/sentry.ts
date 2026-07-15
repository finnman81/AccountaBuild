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

let sentry: any = null;
let started = false;

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
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sentry = require('@sentry/react-native');
    sentry.init({
      dsn: d,
      // Errors only for now; turn on tracing/replay deliberately later so we
      // don't blow the free-tier event quota on a handful of beta users.
      tracesSampleRate: 0,
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
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
