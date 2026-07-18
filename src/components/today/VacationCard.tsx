import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from 'react-native-paper';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import { getVacationState, setVacationForCurrentWeek, type VacationState } from '../../services/vacation';
import { todayYYYYMMDD } from '../../utils/dates';

const DISMISS_PREFIX = 'vacayPromptDismissed';
/** Suggest vacation after this many consecutive silent days (incl. today). */
const QUIET_DAYS = 3;

type Props = {
  uid: string;
  /** YYYY-MM-DD dates (this week) the user logged ANYTHING on. */
  myLogDates: string[];
};

function recentSilentDays(myLogDates: string[]): number {
  const logged = new Set(myLogDates);
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 7; i += 1) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (logged.has(`${y}-${m}-${day}`)) break;
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * Vacation mode on Today. Two states:
 *  - ACTIVE: "vacation week" banner with an end-it action.
 *  - PROMPT: after 3+ consecutive silent days (and allowance left), suggest
 *    pausing the week BEFORE the close penalty hits. Dismissible per week.
 */
export default function VacationCard({ uid, myLogDates }: Props) {
  const [state, setState] = useState<VacationState | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getVacationState(uid)
      .then((s) => {
        setState(s);
        return AsyncStorage.getItem(`${DISMISS_PREFIX}:${uid}:${s.weekId}`);
      })
      .then((v) => setDismissed(v != null))
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh, myLogDates.length]);

  if (!state) return null;

  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await setVacationForCurrentWeek(uid, on);
      setState(next);
    } catch (e: any) {
      Alert.alert('Vacation mode', e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (state.onVacationThisWeek) {
    return (
      <View style={[styles.card, styles.active]}>
        <AppText variant="rowTitle" color="primary">🏖️ Vacation week</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
          This week can't cost you FP and your streak is safe. Anything you log still counts.
        </AppText>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('End vacation?', 'Scoring resumes normally for the rest of this week (your allowance is refunded).', [
              { text: 'Keep vacationing', style: 'cancel' },
              { text: 'End vacation', onPress: () => void toggle(false) },
            ])
          }
          hitSlop={8}
          style={{ marginTop: spacing.sm }}
        >
          <AppText variant="rowSubtitle" style={{ color: colors.primary }}>I'm back — end vacation</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const silent = recentSilentDays(myLogDates);
  if (dismissed || silent < QUIET_DAYS || state.remaining <= 0) return null;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="rowTitle" color="primary">🏖️ On vacation?</AppText>
        <TouchableOpacity
          onPress={() => {
            setDismissed(true);
            void AsyncStorage.setItem(`${DISMISS_PREFIX}:${uid}:${state.weekId}`, todayYYYYMMDD()).catch(() => {});
          }}
          hitSlop={12}
          accessibilityLabel="Dismiss"
        >
          <Icon source="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
        Quiet few days — pause this week's scoring so it can't cost you FP or your streak. Anything you do log still
        counts. {state.remaining} of {2} vacation weeks left this season.
      </AppText>
      <TouchableOpacity onPress={() => void toggle(true)} style={styles.cta} activeOpacity={0.85} disabled={busy}>
        <AppText variant="rowSubtitle" style={{ color: '#FFFFFF', fontWeight: '700' }}>Turn on vacation mode</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(103,183,220,0.35)',
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  active: { borderColor: 'rgba(103,183,220,0.6)' },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
