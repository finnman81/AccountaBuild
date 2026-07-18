import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Portal } from 'react-native-paper';
import { doc, getDoc } from 'firebase/firestore';

import AppText from '../ui/AppText';
import { AuthContext } from '../../store/AuthContext';
import { db } from '../../firebase/firebase';
import { colors, radius, spacing } from '../../theme';

/**
 * "What's New" — a once-per-user feature announcement shown on next app open.
 * Driven entirely by remote config so announcing a feature needs NO release:
 * set config/app.announcement = { id, emoji, title, lines: string[] } via an
 * admin write. A new `id` shows the modal once (per user, per announcement);
 * clearing the field turns the system off.
 */
const SEEN_PREFIX = 'announcementSeen';

type Announcement = { id: string; emoji?: string; title: string; lines: string[] };

export default function WhatsNewModal() {
  const { user } = useContext(AuthContext);
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        const a = (snap.exists() ? (snap.data() as any)?.announcement : null) as Announcement | null;
        if (!a?.id || !a?.title || !Array.isArray(a.lines)) return;
        const seen = await AsyncStorage.getItem(`${SEEN_PREFIX}:${uid}`).catch(() => null);
        if (seen === a.id) return;
        setAnn(a);
      } catch {
        /* offline — try again next open */
      }
    })();
  }, [user?.uid]);

  if (!ann || !user?.uid) return null;

  const dismiss = () => {
    void AsyncStorage.setItem(`${SEEN_PREFIX}:${user.uid}`, ann.id).catch(() => {});
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
