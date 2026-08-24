import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import Screen from '../components/layout/Screen';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import PrimaryButton from '../components/ui/PrimaryButton';
import { AuthContext } from '../store/AuthContext';
import {
  bookVacation,
  cancelVacation,
  getVacationState,
  weekIdsFrom,
  VACATION_WEEKS_PER_SEASON,
  type VacationState,
} from '../services/vacation';
import { DEFAULT_TZ, isoWeekDatesInTz, nextIsoWeekId } from '../mmr/time';
import { colors, radius, spacing } from '../theme';

/** "Aug 24 – 30" for a week id. */
function weekLabel(weekId: string): string {
  const dates = isoWeekDatesInTz(weekId, DEFAULT_TZ);
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

/**
 * Book vacation weeks in advance. Weeks are Mon–Sun, so "leaving Saturday for
 * two weeks" means booking the two weeks your trip actually covers.
 */
export default function VacationScreen() {
  const { user } = useContext(AuthContext);
  const [state, setState] = useState<VacationState | null>(null);
  const [startNext, setStartNext] = useState(false);
  const [weeks, setWeeks] = useState(1);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!user?.uid) return;
    getVacationState(user.uid).then(setState).catch(() => {});
  }, [user?.uid]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!state) return <Screen scroll><AppText variant="body" color="secondary">Loading…</AppText></Screen>;

  const startWeekId = startNext ? nextIsoWeekId(state.weekId, DEFAULT_TZ) : state.weekId;
  const maxWeeks = Math.max(1, state.remaining);
  const chosen = weekIdsFrom(startWeekId, Math.min(weeks, maxWeeks));

  const book = async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      setState(await bookVacation(user.uid, startWeekId, Math.min(weeks, maxWeeks)));
    } catch (e: any) {
      Alert.alert('Vacation', e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      setState(await cancelVacation(user.uid));
    } catch (e: any) {
      Alert.alert('Vacation', e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Card>
        <AppText variant="rowTitle" color="primary">🏖️ Vacation weeks</AppText>
        <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm, lineHeight: 21 }}>
          A booked week can't cost you FP or your streak. You can still log anything you want while
          you're away, and it still earns FP. {VACATION_WEEKS_PER_SEASON} weeks per season.
        </AppText>
      </Card>

      <View style={{ height: spacing.base }} />

      {state.bookedWeekIds.length ? (
        <Card>
          <AppText variant="rowTitle" color="primary">Booked</AppText>
          {state.bookedWeekIds.map((w) => (
            <AppText key={w} variant="rowSubtitle" color="secondary" style={{ marginTop: 4 }}>
              {weekLabel(w)}{w === state.weekId ? ' · this week' : ''}
            </AppText>
          ))}
          <PrimaryButton onPress={cancel} loading={busy} disabled={busy} style={{ marginTop: spacing.md }}>
            Cancel vacation
          </PrimaryButton>
        </Card>
      ) : null}

      {state.remaining > 0 ? (
        <>
          {state.bookedWeekIds.length ? <View style={{ height: spacing.base }} /> : null}
          <Card>
            <AppText variant="rowTitle" color="primary">Book time off</AppText>
            <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
              {state.remaining} of {VACATION_WEEKS_PER_SEASON} left this season. Weeks run Monday to Sunday.
            </AppText>

            <AppText variant="eyebrow" color="muted" style={styles.label}>Starting</AppText>
            <View style={styles.row}>
              {[false, true].map((next) => (
                <TouchableOpacity
                  key={String(next)}
                  onPress={() => setStartNext(next)}
                  activeOpacity={0.85}
                  style={[styles.chip, startNext === next && styles.chipOn]}
                >
                  <AppText variant="rowSubtitle" style={{ color: startNext === next ? '#FFFFFF' : colors.textSecondary, fontWeight: '700' }}>
                    {next ? 'Next week' : 'This week'}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <AppText variant="eyebrow" color="muted" style={styles.label}>How many weeks</AppText>
            <View style={styles.row}>
              {Array.from({ length: maxWeeks }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setWeeks(n)}
                  activeOpacity={0.85}
                  style={[styles.chip, weeks === n && styles.chipOn]}
                >
                  <AppText variant="rowSubtitle" style={{ color: weeks === n ? '#FFFFFF' : colors.textSecondary, fontWeight: '700' }}>
                    {n}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <AppText variant="rowSubtitle" color="muted" style={{ marginTop: spacing.md }}>
              Covers {chosen.map(weekLabel).join('  ·  ')}
            </AppText>

            <PrimaryButton onPress={book} loading={busy} disabled={busy} style={{ marginTop: spacing.md }}>
              Book {Math.min(weeks, maxWeeks)} week{Math.min(weeks, maxWeeks) === 1 ? '' : 's'}
            </PrimaryButton>
          </Card>
        </>
      ) : !state.bookedWeekIds.length ? (
        <Card>
          <AppText variant="rowSubtitle" color="secondary">
            You've used both vacation weeks this season. Away for longer? Settings → Hibernation
            covers two weeks or more.
          </AppText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.base, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface2,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
