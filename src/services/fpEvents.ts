/**
 * Tiny in-app event bus for FP (Fitness Points) gain moments.
 *
 * LogComposer fires `notifyLogSaved()` after a manual log commits; the
 * FpGainOverlay pairs that with the live projection stream to float "+N FP".
 * Firestore latency compensation means the projection can tick BEFORE the
 * save promise resolves, so the overlay must handle either ordering.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const firstLogListeners = new Set<Listener>();

export function notifyLogSaved() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // listener errors must never break a save
    }
  });
}

export function subscribeLogSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fired once, the very first time a user ever logs (see LogComposer). */
export function notifyFirstLog() {
  firstLogListeners.forEach((l) => {
    try {
      l();
    } catch {
      // never break a save
    }
  });
}

export function subscribeFirstLog(listener: Listener): () => void {
  firstLogListeners.add(listener);
  return () => firstLogListeners.delete(listener);
}
