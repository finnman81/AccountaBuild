import { getHydrated, setHydrated } from './hydrationCache';

/**
 * Health-sync status for the UI. The sync used to be invisible except as a
 * screen that reshuffled on open; a timestamp reads as "in control" where a
 * spinner reads as "slow". Last completed sync is persisted so "Synced 9:42
 * AM" survives a restart.
 */
export type SyncState =
  | { phase: 'idle'; lastAt: number | null; lastNew: number }
  | { phase: 'syncing'; lastAt: number | null; lastNew: number }
  | { phase: 'done'; lastAt: number; lastNew: number }
  | { phase: 'error'; lastAt: number | null; lastNew: number };

const KEY = 'healthSync:last';
let state: SyncState = (() => {
  const last = getHydrated<{ at: number; newItems: number }>(KEY);
  return { phase: 'idle', lastAt: last?.at ?? null, lastNew: last?.newItems ?? 0 };
})();
const listeners = new Set<(s: SyncState) => void>();

function emit(next: SyncState) {
  state = next;
  listeners.forEach((l) => {
    try {
      l(state);
    } catch {
      /* never break the sync */
    }
  });
}

export function notifySyncStarted(): void {
  emit({ phase: 'syncing', lastAt: state.lastAt, lastNew: state.lastNew });
}

export function notifySyncFinished(newItems: number, ok: boolean): void {
  if (!ok) {
    emit({ phase: 'error', lastAt: state.lastAt, lastNew: state.lastNew });
    return;
  }
  const at = Date.now();
  setHydrated(KEY, { at, newItems });
  emit({ phase: 'done', lastAt: at, lastNew: newItems });
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
