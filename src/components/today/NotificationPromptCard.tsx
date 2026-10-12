import React, { useCallback, useContext, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { registerPushToken } from '../../services/pushTokens';
import { syncNotifPrefsToServer } from '../../services/appSettings';
import { colors } from '../../theme/colors';

const SNOOZE_PREFIX = 'notifPromptSnoozedUntil';
const SNOOZE_DAYS = 3;

/**
 * "Turn on notifications" on Today, for anyone whose phone blocks them.
 *
 * WHY its own card: it used to be one row of the "Get set up" checklist,
 * which one tap dismissed FOREVER and which never showed on the no-group
 * screen. 6 of the first 13 App Store signups (10/12) had no push, so the
 * daily "start a group" reminder, cheers and nudges never reached them.
 *
 * "Later" snoozes for 3 days, never permanently. Never asked before: the
 * button shows the OS prompt. Declined before: iOS won't prompt again, so
 * it opens Settings, and the card re-checks when the app comes back.
 */
export default function NotificationPromptCard() {
  const { user } = useContext(AuthContext);
  const uid = user?.uid ?? null;
  const [granted, setGranted] = useState<boolean | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [snoozed, setSnoozed] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      const ok = status === 'granted';
      setGranted(ok);
      setCanAsk(status === 'undetermined' && canAskAgain);
      // Back from Settings with it switched on: make sure the server can reach us.
      if (ok && uid) {
        await registerPushToken(uid);
        await syncNotifPrefsToServer(uid).catch(() => {});
      }
    } catch {
      setGranted(true); // can't tell: stay quiet rather than nag
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void refresh();
    AsyncStorage.getItem(`${SNOOZE_PREFIX}:${uid}`)
      .then((v) => setSnoozed(!!v && Date.now() < Number(v)))
      .catch(() => setSnoozed(false));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [uid, refresh]);

  if (!uid || granted !== false || snoozed !== false) return null;

  const turnOn = async () => {
    try {
      if (canAsk) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') setCanAsk(false);
        await refresh();
      } else {
        await Linking.openSettings();
      }
    } catch {
      /* non-fatal */
    }
  };

  const later = () => {
    setSnoozed(true);
    void AsyncStorage.setItem(`${SNOOZE_PREFIX}:${uid}`, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Icon source="bell-ring-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Turn on notifications</Text>
          <Text style={styles.sub}>
            Cheers and nudges from your group, and a heads-up before your streak breaks. Nothing else.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={later} style={styles.later} activeOpacity={0.8} accessibilityRole="button">
          <Text style={styles.laterText}>Later</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void turnOn()} style={styles.btn} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.btnText}>{canAsk ? 'Turn on' : 'Open Settings'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 16,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 },
  later: { paddingHorizontal: 12, paddingVertical: 9 },
  laterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
