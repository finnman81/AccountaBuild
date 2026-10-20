import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Modal, Portal, Text } from 'react-native-paper';
import * as Haptics from 'expo-haptics';

import Avatar from '../ui/Avatar';
import { clearInviterAsk, getInviterAsk, setMyInviter } from '../../services/inviter';
import { colors } from '../../theme/colors';

type Person = { uid: string; name: string; photoURL: string | null };

/**
 * "Who got you here?" One-time, right after joining a group. The answer
 * credits the inviter server-side (Recruiter badge, a thank-you line in chat,
 * a push), so recruiting is visible and rewarded.
 *
 * Asked in-app because a link tag can't survive a fresh install: new members
 * go link -> landing page -> App Store -> install -> type the code.
 */
export default function InviterPrompt({ uid, groupId, groupName, people }: { uid: string; groupId: string; groupName: string; people: Person[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void getInviterAsk(uid).then((gid) => {
      if (alive) setOpen(gid === groupId && people.length > 0);
    });
    return () => {
      alive = false;
    };
  }, [uid, groupId, people.length]);

  if (!open) return null;

  const pick = async (inviter: string | null) => {
    setOpen(false);
    await clearInviterAsk(uid);
    if (inviter) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await setMyInviter(groupId, uid, inviter).catch(() => {});
    }
  };

  return (
    <Portal>
      <Modal visible onDismiss={() => void pick(null)} contentContainerStyle={styles.modal}>
        <Text style={styles.title}>Who got you into {groupName}?</Text>
        <Text style={styles.sub}>They'll get the credit.</Text>
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8, marginTop: 14 }}>
          {people.map((p) => (
            <TouchableOpacity key={p.uid} onPress={() => void pick(p.uid)} style={styles.person} activeOpacity={0.85} accessibilityRole="button">
              <Avatar photoURL={p.photoURL} name={p.name} size={36} />
              <Text style={styles.name}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={() => void pick(null)} style={styles.none} activeOpacity={0.8}>
          <Text style={styles.noneText}>Nobody, I found it myself</Text>
        </TouchableOpacity>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderCard, marginHorizontal: 24, padding: 20 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: colors.surface2 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  none: { alignItems: 'center', paddingTop: 14 },
  noneText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
