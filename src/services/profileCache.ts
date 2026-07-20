import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Last-known display name / group name, cached to disk and mirrored in memory.
 *
 * WHY: the launch frame paints before Firestore delivers anything (the JS SDK
 * has no disk cache on React Native), so it greeted users with
 * `uid.slice(0,6)` — "Good afternoon, dJXX3v". This is the smallest possible
 * slice of the Phase 1 hydration cache: prime once at startup, read
 * SYNCHRONOUSLY during render, refresh whenever live data arrives.
 *
 * Deliberately in-memory-first: an async read can't help the very first paint.
 */
const NAME_KEY = 'cache:displayName';
const GROUP_KEY = 'cache:groupName';

let names: Record<string, string> = {};
let groups: Record<string, string> = {};
let primed = false;

/** Load the disk cache into memory. Call once, as early as possible. */
export async function primeProfileCache(): Promise<void> {
  if (primed) return;
  primed = true;
  try {
    const [n, g] = await Promise.all([AsyncStorage.getItem(NAME_KEY), AsyncStorage.getItem(GROUP_KEY)]);
    if (n) names = { ...JSON.parse(n), ...names }; // never clobber values already learned this session
    if (g) groups = { ...JSON.parse(g), ...groups };
  } catch {
    /* corrupt/absent cache is not worth failing startup over */
  }
}

export function getCachedDisplayName(uid?: string | null): string | null {
  return (uid && names[uid]) || null;
}

export function rememberDisplayName(uid?: string | null, displayName?: string | null) {
  const name = (displayName ?? '').trim();
  if (!uid || !name || names[uid] === name) return;
  names[uid] = name;
  void AsyncStorage.setItem(NAME_KEY, JSON.stringify(names)).catch(() => {});
}

export function getCachedGroupName(groupId?: string | null): string | null {
  return (groupId && groups[groupId]) || null;
}

export function rememberGroupName(groupId?: string | null, name?: string | null) {
  const n = (name ?? '').trim();
  if (!groupId || !n || groups[groupId] === n) return;
  groups[groupId] = n;
  void AsyncStorage.setItem(GROUP_KEY, JSON.stringify(groups)).catch(() => {});
}
