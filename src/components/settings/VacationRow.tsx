import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import AppText from '../ui/AppText';
import { colors, spacing } from '../../theme';
import {
  getVacationState,
  setVacationForCurrentWeek,
  VACATION_WEEKS_PER_SEASON,
  type VacationState,
} from '../../services/vacation';

/**
 * Vacation toggle in Settings.
 *
 * Vacation used to be reachable ONLY from a Today card that appears after 3+
 * silent days, so anyone who logs regularly could never find it and nobody
 * could plan a week off in advance (Jake, 2026-08-21: "I tried to turn
 * vacation on, but it was nowhere to be found"). The Today prompt stays — it
 * catches people who've already gone quiet — this is the deliberate door.
 */
export default function VacationRow({ uid, divider = true }: { uid: string; divider?: boolean }) {
  const [state, setState] = useState<VacationState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getVacationState(uid).then(setState).catch(() => {});
  }, [uid]);
  useEffect(() => { refresh(); }, [refresh]);

  const onToggle = async (on: boolean) => {
    if (busy || !state) return;
    setBusy(true);
    try {
      setState(await setVacationForCurrentWeek(uid, on));
    } catch (e: any) {
      Alert.alert('Vacation week', e?.message ?? 'Something went wrong.');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const none = state.remaining <= 0 && !state.onVacationThisWeek;
  const subtitle = state.onVacationThisWeek
    ? "This week can't cost you FP or your streak"
    : none
      ? `No vacation weeks left this season (${VACATION_WEEKS_PER_SEASON} per season)`
      : `Pause this week's scoring · ${state.remaining} of ${VACATION_WEEKS_PER_SEASON} left this season`;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.left}>
          <AppText variant="rowTitle" color="primary">Vacation week</AppText>
          <AppText variant="rowSubtitle" color="muted">{subtitle}</AppText>
        </View>
        <Switch
          value={state.onVacationThisWeek}
          onValueChange={onToggle}
          disabled={busy || none}
          trackColor={{ false: colors.ringNotLogged, true: colors.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.ringNotLogged}
        />
      </View>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm },
  left: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
});
