import React, { useContext, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyProfile } from '../../services/profile';
import { subscribeMyMmrGoals } from '../../services/mmrGoals';
import { registerPushToken } from '../../services/pushTokens';
import { syncNotifPrefsToServer } from '../../services/appSettings';
import { subscribeHealthSettings } from '../../services/healthSettings';
import { requestHealthPermissions } from '../../services/health/healthService';
import { updateHealthSettings } from '../../services/healthSettings';
import { colors } from '../../theme/colors';

const DISMISS_KEY_PREFIX = 'setupChecklistDismissed';

/**
 * "Get set up" nudge on Today for users missing push notifications, health
 * sync, or a weight goal. Each row fixes itself in one tap; the card
 * disappears when everything is on (or dismissed).
 *
 * The weight row exists because opting into weight tracking during onboarding
 * does NOT create the scoring goal: FP for weight comes from an active
 * weightLoss/weightGain doc (mmr-compute.js:302), and onboarding never
 * collects a goal weight. Without this prompt someone weighs in all week and
 * silently earns nothing — two BPM members were in exactly that state when
 * this was found (2026-08-19). Strictly conditional: only for people who
 * ASKED to track weight.
 */
export default function SetupChecklistCard() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();

  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [pushCanAsk, setPushCanAsk] = useState(true);
  const [healthOn, setHealthOn] = useState<boolean | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState(false);
  // null = still loading (keeps the card from flashing a row it may not need)
  const [tracksWeight, setTracksWeight] = useState<boolean | null>(null);
  const [hasWeightGoal, setHasWeightGoal] = useState<boolean | null>(null);

  const dismissKey = user?.uid ? `${DISMISS_KEY_PREFIX}:${user.uid}` : null;

  useEffect(() => {
    if (!dismissKey) return;
    AsyncStorage.getItem(dismissKey)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false));
  }, [dismissKey]);

  useEffect(() => {
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then(({ status, canAskAgain }) => {
        if (cancelled) return;
        setPushGranted(status === 'granted');
        setPushCanAsk(status === 'undetermined' && canAskAgain);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeHealthSettings(
      user.uid,
      (s) => setHealthOn(!!s && (s.syncWorkouts || s.syncCalories || s.syncWeight)),
      () => setHealthOn(false),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyProfile(
      user.uid,
      (p) => setTracksWeight(!!p && Number(p.logWeightDaysPerWeek ?? 0) > 0),
      () => setTracksWeight(false),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyMmrGoals(user.uid, (goals) => {
      const active = (g: any) => g?.status === 'active';
      setHasWeightGoal(active(goals?.weightLoss) || active(goals?.weightGain));
    });
  }, [user?.uid]);

  const enablePush = async () => {
    if (!user?.uid) return;
    try {
      if (pushCanAsk) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          await registerPushToken(user.uid);
          await syncNotifPrefsToServer(user.uid);
          setPushGranted(true);
        } else {
          setPushCanAsk(false);
        }
      } else {
        // Previously declined — the OS prompt can't be shown again from the app.
        await Linking.openSettings();
      }
    } catch {
      /* non-fatal */
    }
  };

  const enableHealth = async () => {
    if (!user?.uid || healthBusy) return;
    setHealthBusy(true);
    setHealthError(false);
    try {
      const res = await requestHealthPermissions();
      if (res.success) {
        await updateHealthSettings(user.uid, {
          syncWorkouts: true,
          syncCalories: true,
          syncWeight: true,
          healthKitAuthorized: Platform.OS === 'ios',
          googleFitAuthorized: Platform.OS === 'android',
        });
      } else {
        setHealthError(true);
      }
    } catch {
      setHealthError(true);
    } finally {
      setHealthBusy(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    if (dismissKey) void AsyncStorage.setItem(dismissKey, '1').catch(() => {});
  };

  // Wait until every signal has loaded to avoid a flash; hide when done/dismissed.
  if (dismissed !== false || pushGranted === null || healthOn === null) return null;
  if (tracksWeight === null || hasWeightGoal === null) return null;
  const needsPush = !pushGranted;
  const needsHealth = !healthOn;
  // ONLY for people who opted into weight tracking. Someone tracking just
  // workouts must never be nagged about a goal weight they never wanted.
  const needsWeightGoal = tracksWeight && !hasWeightGoal;
  if (!needsPush && !needsHealth && !needsWeightGoal) return null;

  const healthLabel = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Get set up</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss">
          <Icon source="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {needsPush ? (
        <View style={styles.row}>
          <Icon source="bell-ring-outline" size={20} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Turn on notifications</Text>
            <Text style={styles.rowSub}>Cheers and nudges from your group can't reach you without them.</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={enablePush} activeOpacity={0.85}>
            <Text style={styles.btnText}>{pushCanAsk ? 'Enable' : 'Settings'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {needsHealth ? (
        <View style={[styles.row, needsPush && styles.rowDivider]}>
          <Icon source="heart-pulse" size={20} color={colors.success} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Connect {healthLabel}</Text>
            <Text style={styles.rowSub}>
              {healthError ? 'Couldn’t connect — try Settings → Health & Fitness.' : 'Auto-log workouts, calories, and weigh-ins.'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnHealth]} onPress={enableHealth} activeOpacity={0.85} disabled={healthBusy}>
            <Text style={styles.btnText}>{healthBusy ? '…' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {needsWeightGoal ? (
        <View style={[styles.row, (needsPush || needsHealth) && styles.rowDivider]}>
          <Icon source="scale-bathroom" size={20} color={colors.rankGold} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Set your goal weight</Text>
            <Text style={styles.rowSub}>You're logging weigh-ins, but they don't earn FP until you set a target.</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.btnWeight]}
            onPress={() => nav.navigate('MMRGoals')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Set</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowText: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  btn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  btnHealth: { backgroundColor: colors.success },
  btnWeight: { backgroundColor: colors.rankGold },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
