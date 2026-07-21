import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Portal } from 'react-native-paper';
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import AppText from '../ui/AppText';
import { AuthContext } from '../../store/AuthContext';
import { db } from '../../firebase/firebase';
import { colors, radius, spacing } from '../../theme';

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

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        const data = snap.exists() ? (snap.data() as any) : null;
        if (!data) return;

        // Queue first, legacy single field as fallback.
        const queue: Announcement[] = Array.isArray(data.announcements)
          ? data.announcements.filter(isValid)
          : isValid(data.announcement)
            ? [data.announcement]
            : [];
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

  if (!ann || !user?.uid) return null;

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
        <TouchableOpacity style={styles.cta} onPress={dismiss} activeOpacity={0.85}>
          <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>Got it</AppText>
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
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
