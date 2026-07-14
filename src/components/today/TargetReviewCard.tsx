import React, { useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../../firebase/firebase';
import { AuthContext } from '../../store/AuthContext';
import { subscribeMmrWeeklyHistory, type MmrWeeklySummary } from '../../services/mmrWeekly';
import { subscribeMyMmrGoals, upsertGoal } from '../../services/mmrGoals';
import { updateMyProfile } from '../../services/profile';
import { D_calDays, D_workouts } from '../../mmr/difficulty';
import { DEFAULT_TZ, isoWeekIdInTz, nextIsoWeekId } from '../../mmr/time';
import { colors } from '../../theme/colors';

const DISMISS_PREFIX = 'targetNudgeDismissed';
const STREAK_NEEDED = 3; // consecutive CLOSED weeks at 100% vs the current target

type Suggestion = {
  goalId: 'workouts' | 'calorieDays';
  label: string;
  current: number;
  next: number;
  gainPct: number;
};

/**
 * Turns the FP system's hidden optimal move into a guided one: when a user
 * has hit 100% of a target for 3 straight closed weeks, offer a one-tap
 * raise (+~X% FP from the difficulty table). The raise applies from NEXT
 * week (weeks score against their goalsSnapshot), so it can never hurt the
 * week in progress. D-matching ensures the trigger only counts weeks scored
 * against the CURRENT target — accepting a raise resets the clock.
 */
export default function TargetReviewCard() {
  const { user } = useContext(AuthContext);
  const [weeks, setWeeks] = useState<MmrWeeklySummary[]>([]);
  const [goals, setGoals] = useState<Record<string, any>>({});
  const [dismissedKeys, setDismissedKeys] = useState<Set<string> | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMmrWeeklyHistory(user.uid, 8, setWeeks);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyMmrGoals(user.uid, setGoals);
  }, [user?.uid]);

  const suggestion = useMemo<Suggestion | null>(() => {
    if (!weeks.length) return null;
    const currentWeekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
    const closed = weeks.filter((w) => w.weekId < currentWeekId).slice(0, STREAK_NEEDED);
    if (closed.length < STREAK_NEEDED) return null;

    const beaten = (goalId: string, D: number) =>
      closed.every((w) => {
        const g = w.goals?.find((x) => x.id === goalId);
        return !!g && g.A >= 0.999 && Math.abs(g.D - D) < 0.001;
      });

    const wTarget = Math.round(Number(goals.workouts?.targetWorkoutsPerWeek));
    if ((goals.workouts?.status ?? 'paused') === 'active' && Number.isFinite(wTarget) && wTarget >= 1 && wTarget < 7) {
      if (beaten('workouts', D_workouts(wTarget))) {
        const gainPct = Math.round((D_workouts(wTarget + 1) / D_workouts(wTarget) - 1) * 100);
        return { goalId: 'workouts', label: 'workouts / week', current: wTarget, next: wTarget + 1, gainPct };
      }
    }

    const cTarget = Math.round(Number(goals.calorieDays?.targetDaysPerWeek));
    if ((goals.calorieDays?.status ?? 'paused') === 'active' && Number.isFinite(cTarget) && cTarget >= 1 && cTarget < 7) {
      if (beaten('calorieDays', D_calDays(cTarget))) {
        const gainPct = Math.round((D_calDays(cTarget + 1) / D_calDays(cTarget) - 1) * 100);
        return { goalId: 'calorieDays', label: 'calorie days / week', current: cTarget, next: cTarget + 1, gainPct };
      }
    }
    return null;
  }, [weeks, goals]);

  const dismissKey = suggestion && user?.uid ? `${DISMISS_PREFIX}:${user.uid}:${suggestion.goalId}:${suggestion.current}` : null;

  useEffect(() => {
    if (!dismissKey) return;
    AsyncStorage.getItem(dismissKey)
      .then((v) => setDismissedKeys(v === '1' ? new Set([dismissKey]) : new Set()))
      .catch(() => setDismissedKeys(new Set()));
  }, [dismissKey]);

  const accept = async () => {
    if (!user?.uid || !suggestion || busy) return;
    setBusy(true);
    try {
      if (suggestion.goalId === 'workouts') {
        await upsertGoal(user.uid, 'workouts', { type: 'workouts', status: 'active', targetWorkoutsPerWeek: suggestion.next });
        await updateMyProfile({ uid: user.uid, workoutsPerWeek: suggestion.next });
      } else {
        await upsertGoal(user.uid, 'calorieDays', { type: 'calorieDays', status: 'active', targetDaysPerWeek: suggestion.next });
        await updateMyProfile({ uid: user.uid, logCaloriesDaysPerWeek: suggestion.next });
      }
      // Fairness stamp (same as the Goals screen): changes count from next week.
      const nextWeek = nextIsoWeekId(isoWeekIdInTz(new Date(), DEFAULT_TZ), DEFAULT_TZ);
      await setDoc(doc(db, 'users', user.uid), { goalsEffectiveWeekId: nextWeek, updatedAt: serverTimestamp() }, { merge: true });
      setAccepted(`Locked in: ${suggestion.next} ${suggestion.label} — starts next week 💪`);
    } catch {
      /* non-fatal; card stays for retry */
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    if (dismissKey) {
      setDismissedKeys(new Set([dismissKey]));
      void AsyncStorage.setItem(dismissKey, '1').catch(() => {});
    }
  };

  if (accepted) {
    return (
      <View style={styles.wrap}>
        <Icon source="check-circle" size={18} color={colors.success} />
        <Text style={styles.acceptedText}>{accepted}</Text>
      </View>
    );
  }

  if (!suggestion || dismissedKeys === null || (dismissKey && dismissedKeys.has(dismissKey))) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon source="trending-up" size={18} color={colors.rankGold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>You've outgrown your target</Text>
        <Text style={styles.body}>
          {STREAK_NEEDED} straight weeks at 100% of {suggestion.current} {suggestion.label}. Raise it to {suggestion.next} and earn ~{suggestion.gainPct}% more FP every week.
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.raiseBtn} onPress={accept} activeOpacity={0.85} disabled={busy}>
          <Text style={styles.raiseText}>{busy ? '…' : `Raise to ${suggestion.next}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} hitSlop={8} style={styles.dismissBtn} accessibilityLabel="Not now">
          <Text style={styles.dismissText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    backgroundColor: 'rgba(233,181,66,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  actions: { alignItems: 'center', gap: 6 },
  raiseBtn: { backgroundColor: colors.rankGold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  raiseText: { color: '#1A1A0E', fontSize: 13, fontWeight: '800' },
  dismissBtn: { paddingHorizontal: 4 },
  dismissText: { color: colors.textMuted, fontSize: 11 },
  acceptedText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
});
