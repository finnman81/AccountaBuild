import { useMemo } from 'react';

/**
 * Group members this viewer may read (themselves plus the canSee index), as
 * an array whose identity only changes when the set of uids does.
 *
 * Roster listeners used to depend on memberUids and canSee directly. Both
 * arrive several times on open (cache seed, then live), each with a new
 * identity, so the publicUsers listener tore down and rebuilt up to four
 * times and the names and avatars flickered. Keying on a sorted string
 * rebuilds it only when someone actually joins, leaves, or becomes visible.
 */
export function useVisibleUids(memberUids: string[], canSee: Set<string>, myUid: string | null | undefined): string[] {
  const key = myUid
    ? memberUids
        .filter((uid) => uid === myUid || canSee.has(uid))
        .sort()
        .join(',')
    : '';
  return useMemo(() => (key ? key.split(',') : []), [key]);
}
