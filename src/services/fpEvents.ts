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
