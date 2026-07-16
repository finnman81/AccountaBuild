/**
 * Tiny in-app event bus for FP (Fitness Points) gain moments.
 *
 * LogComposer fires `notifyLogSaved()` after a manual log commits; the
 * FpGainOverlay pairs that with the live projection stream to float "+N FP".
 * Firestore latency compensation means the projection can tick BEFORE the
 * save promise resolves, so the overlay must handle either ordering.
 */

/** Where the just-saved log lives, so the FP toast can stamp its fpDelta back on it. */
export type SavedLogInfo = { groupId: string; logId: string };

type Listener = (info?: SavedLogInfo) => void;

const listeners = new Set<Listener>();
const firstLogListeners = new Set<() => void>();
const changedListeners = new Set<() => void>();

export function notifyLogSaved(info?: SavedLogInfo) {
  listeners.forEach((l) => {
    try {
      l(info);
    } catch {
      // listener errors must never break a save
    }
  });
  notifyLogsChanged();
}

/**
 * "My logs changed somehow" — fired by saves (via notifyLogSaved) AND by
 * deletes/edits. Coarser than log-saved: drives things that only need to
 * re-settle state (live FP recompute), not user-facing save feedback
 * (toasts, reminder-clearing), which stays on subscribeLogSaved.
 */
export function notifyLogsChanged() {
  changedListeners.forEach((l) => {
    try {
      l();
    } catch {
      // never break the caller
    }
  });
}

export function subscribeLogsChanged(listener: () => void): () => void {
  changedListeners.add(listener);
  return () => changedListeners.delete(listener);
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
