import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Portal } from 'react-native-paper';
import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

import * as Haptics from 'expo-haptics';

import AppText from '../ui/AppText';
import { AuthContext } from '../../store/AuthContext';
import { db } from '../../firebase/firebase';
import { colors, radius, spacing } from '../../theme';
import { enqueueSocialPush } from '../../services/socialPush';
import { answerPoll, getMyAnswer, isValidPoll, type Poll } from '../../services/polls';
import { hypeById, type Hype } from '../../services/hypeCatalog';
import { friendlyNameFromDisplayName } from '../../utils/formatters';

/**
 * "What's New" — feature announcements, driven entirely by remote config so
 * announcing something needs NO release. Admin writes `config/app`:
 *
 *   announcements: [{ id, emoji, title, lines[], activeFrom? }, ...]   // QUEUE
 *   announcement:  { ... }                                            // legacy single
 *
 * QUEUE (added 2026-07-21): previously this was a single slot, so publishing a
 * new announcement silently CANCELLED the previous one for anyone who hadn't
 * opened the app in between — two users missed the calorie/weight notice that
 * way. Now every unseen announcement is shown, oldest first, one per open, so
 * nothing gets skipped. The legacy `announcement` field still works and is
 * treated as a one-item queue.
 *
 * READ RECEIPTS: seen ids are written to `users/{uid}.announcementsSeen` (array)
 * as well as AsyncStorage. The device copy keeps it instant/offline-safe; the
 * server copy is what lets us actually verify who has seen what (the local-only
 * marker was unreadable from admin tooling).
 */
const SEEN_PREFIX = 'announcementSeen'; // legacy single-id key (still honored)
const SEEN_LIST_KEY = 'announcementsSeenList';

type Announcement = {
  id: string;
  emoji?: string;
  title: string;
  /**
   * Celebration payload. When present the modal shows hype buttons that send a
   * REAL cheer push to `uid` — reusing the hype catalog rather than inventing a
   * second reaction store, so the honoree actually hears about it.
   */
  celebrate?: { uid: string; name: string; hypeIds: string[] };
  /**
   * Poll payload. Tapping an option records the answer and dismisses — one
   * response per person, enforced by doc id (services/polls.ts).
   */
  poll?: Poll;
  lines: string[];
  /** ISO timestamp — stays hidden until this moment (scheduled reveal). */
  activeFrom?: string;
};

function isValid(a: any): a is Announcement {
  return !!a && typeof a.id === 'string' && typeof a.title === 'string' && Array.isArray(a.lines);
}

export default function WhatsNewModal() {
  const { user } = useContext(AuthContext);
  const [ann, setAnn] = useState<Announcement | null>(null);
  const [sentEmoji, setSentEmoji] = useState<string | null>(null);
  const [pickedOption, setPickedOption] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    (async () => {
      try {
        // TWO sources now:
        //  - config/app        = genuine app-wide news (releases, polls)
        //  - groups/{gid}/announcements = THIS user's crews' celebrations
        // Celebrations moved per-group so one crew's goal party can't pop up
        // on a stranger's phone once more than one group exists.
        const myGroupsSnap = await getDocs(collection(db, 'users', uid, 'groups')).catch(() => null);
        const groupIds = (myGroupsSnap?.docs ?? [])
          .map((d) => String((d.data() as any)?.groupId ?? d.id))
          .filter(Boolean);

        const [globalSnap, ...groupSnaps] = await Promise.all([
          getDoc(doc(db, 'config', 'app')).catch(() => null),
          ...groupIds.map((gid) =>
            getDocs(collection(db, 'groups', gid, 'announcements')).catch(() => null),
          ),
        ]);

        const data = globalSnap?.exists() ? (globalSnap.data() as any) : null;
        // Queue first, legacy single field as fallback. IMPORTANT: keep BOTH
        // fields populated in config — clients on the pre-queue bundle read
        // ONLY `announcement`, so publishing to the array alone makes them go
        // silent (regression, caught 2026-07-21). Dedupe by id since the
        // legacy field normally duplicates the newest queue entry.
        const fromQueue: Announcement[] = Array.isArray(data?.announcements) ? data.announcements.filter(isValid) : [];
        const legacyOne: Announcement[] = isValid(data?.announcement) ? [data.announcement] : [];
        const fromGroups: Announcement[] = groupSnaps.flatMap((g) =>
          (g?.docs ?? []).map((d) => d.data() as any).filter(isValid),
        );

        const byId = new Map<string, Announcement>();
        for (const a of [...fromGroups, ...fromQueue, ...legacyOne]) if (!byId.has(a.id)) byId.set(a.id, a);
        const queue: Announcement[] = [...byId.values()];
        if (!queue.length) return;

        // Union of device + server seen ids: either source having it means the
        // user already saw it (covers reinstalls AND offline dismissals).
        const [rawList, legacy, userSnap] = await Promise.all([
          AsyncStorage.getItem(SEEN_LIST_KEY).catch(() => null),
          AsyncStorage.getItem(`${SEEN_PREFIX}:${uid}`).catch(() => null),
          getDoc(doc(db, 'users', uid)).catch(() => null),
        ]);
        const seen = new Set<string>();
        try {
          for (const id of JSON.parse(rawList ?? '[]')) seen.add(String(id));
        } catch {
          /* ignore a corrupt local list */
        }
        if (legacy) seen.add(legacy);
        const serverSeen = (userSnap?.data() as any)?.announcementsSeen;
        if (Array.isArray(serverSeen)) for (const id of serverSeen) seen.add(String(id));

        const now = Date.now();
        const next = queue.find(
          (a) => !seen.has(a.id) && !(a.activeFrom && now < Date.parse(a.activeFrom)),
        );
        if (next) setAnn(next);
      } catch {
        /* offline — try again next open */
      }
    })();
  }, [user?.uid]);

  // Rules deny reading pollResponses, so "already answered" comes from the
  // local record. Matters when someone answers and closes the app without
  // tapping Done — the poll reappears and should show their pick, not blank.
  useEffect(() => {
    const p = (ann as any)?.poll;
    if (!p?.id || !user?.uid) return;
    let alive = true;
    void getMyAnswer(p.id, user.uid).then((prev) => {
      if (alive && prev) setPickedOption(prev);
    });
    return () => { alive = false; };
  }, [ann, user?.uid]);

  if (!ann || !user?.uid) return null;

  const poll = isValidPoll((ann as any).poll) ? ((ann as any).poll as Poll) : null;

  const pick = async (optionId: string) => {
    if (!poll || !user?.uid) return;
    setPickedOption(optionId); // optimistic — the write is fire-and-forget
    try {
      await answerPoll({ pollId: poll.id, uid: user.uid, optionId, displayName: user.displayName ?? null });
    } catch {
      /* offline: the local pick still reads as answered; not worth a retry UI */
    }
  };

  const celebrate = ann.celebrate;
  const isHonoree = celebrate?.uid === user.uid;
  const hypes = (celebrate?.hypeIds ?? []).map((id) => hypeById(id)).filter(Boolean) as Hype[];

  const sendCheer = async (h: Hype) => {
    if (!celebrate || !user?.uid || isHonoree) return;
    setSentEmoji(h.emoji);
    try {
      await enqueueSocialPush({
        toUid: celebrate.uid,
        fromUid: user.uid,
        fromName: friendlyNameFromDisplayName(user.displayName ?? null, user.uid),
        type: 'cheer',
        hypeId: h.id,
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      /* non-fatal — the celebration still dismisses cleanly */
    }
  };

  const dismiss = () => {
    const uid = user.uid;
    const id = ann.id;
    // Device copy: instant + offline-safe.
    void AsyncStorage.getItem(SEEN_LIST_KEY)
      .then((raw) => {
        let list: string[] = [];
        try {
          list = JSON.parse(raw ?? '[]');
        } catch {
          list = [];
        }
        if (!list.includes(id)) list.push(id);
        return AsyncStorage.setItem(SEEN_LIST_KEY, JSON.stringify(list.slice(-50)));
      })
      .catch(() => {});
    // Server copy: what admin tooling can actually read. arrayUnion APPENDS —
    // assigning a plain array here would wipe every previously-seen id.
    void setDoc(
      doc(db, 'users', uid),
      { announcementsSeen: arrayUnion(id), announcementSeenAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {});
    setAnn(null);
  };

  return (
    <Portal>
      <Modal visible onDismiss={dismiss} contentContainerStyle={styles.modal}>
        <AppText variant="pageTitle" color="primary" style={{ textAlign: 'center' }}>
          {ann.emoji ? `${ann.emoji} ` : ''}{ann.title}
        </AppText>
        <View style={{ marginTop: spacing.base, gap: spacing.sm }}>
          {ann.lines.map((line, i) => (
            <AppText key={i} variant="body" color="secondary">
              {line}
            </AppText>
          ))}
        </View>
        {poll ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {poll.question ? (
              <AppText variant="rowTitle" color="primary" style={{ textAlign: 'center', marginBottom: spacing.xs }}>
                {poll.question}
              </AppText>
            ) : null}
            {poll.options.map((o) => {
              const picked = pickedOption === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.pollOption, picked && styles.pollOptionPicked]}
                  onPress={() => void pick(o.id)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                >
                  <AppText variant="rowTitle" color={picked ? 'accent' : 'primary'}>
                    {o.emoji ? `${o.emoji}  ` : ''}{o.label}
                  </AppText>
                  {picked ? <AppText variant="rowTitle" color="accent">✓</AppText> : null}
                </TouchableOpacity>
              );
            })}
            <AppText variant="label" color="muted" style={{ textAlign: 'center', marginTop: spacing.xs }}>
              {pickedOption ? 'Thanks — answer saved. Tap another to change it.' : 'Tap one. Only Jake sees the results.'}
            </AppText>
          </View>
        ) : null}
        {celebrate && !isHonoree ? (
          <>
            <AppText variant="eyebrow" color="muted" style={{ textAlign: 'center', marginTop: spacing.lg }}>
              {sentEmoji ? `SENT TO ${celebrate.name.toUpperCase()}` : `SEND ${celebrate.name.toUpperCase()} SOME HYPE`}
            </AppText>
            <View style={styles.hypeRow}>
              {hypes.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.hypeBtn, sentEmoji === h.emoji && styles.hypeBtnSent]}
                  onPress={() => void sendCheer(h)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={h.label}
                >
                  <AppText variant="pageTitle" style={styles.hypeEmoji}>{h.emoji}</AppText>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <TouchableOpacity style={styles.cta} onPress={dismiss} activeOpacity={0.85}>
          <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>
            {sentEmoji || pickedOption ? 'Done' : poll ? 'Skip' : 'Got it'}
          </AppText>
        </TouchableOpacity>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.35)',
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
  },
  pollOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  pollOptionPicked: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  hypeRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  hypeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  hypeBtnSent: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  hypeEmoji: { fontSize: 26, lineHeight: 32 },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
