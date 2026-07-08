import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { subscribeLatestMmrWeeklySummary, type MmrWeeklySummary } from '../../services/mmrWeekly';
import { DEFAULT_TZ, isoWeekIdInTz, prevIsoWeekId } from '../../mmr/time';
import { colors } from '../../theme/colors';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const DISMISS_KEY_PREFIX = 'weeklyRecapDismissed';

type Props = { onOpen: () => void };

/**
 * A dismissible Monday recap: "Last week: +42 MMR, 4 workouts, 82% compliance"
 * (+ a promotion/demotion callout when relevant). Only shows on Mondays, for
 * the week that JUST ended, and only once per week (dismissal is remembered).
 */
export default function WeeklyRecapBanner({ onOpen }: Props) {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState<MmrWeeklySummary | null>(null);
  const [dismissedWeekId, setDismissedWeekId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeLatestMmrWeeklySummary(user.uid, setSummary);
  }, [user?.uid]);

  const dismissKey = user?.uid ? `${DISMISS_KEY_PREFIX}:${user.uid}` : null;
  useEffect(() => {
    if (!dismissKey) return;
    AsyncStorage.getItem(dismissKey).then(setDismissedWeekId).catch(() => {});
  }, [dismissKey]);

  const eligible = useMemo(() => {
    const now = new Date();
    const isMonday = now.getDay() === 1; // local device time; the recap is a soft nicety, not a scoring boundary
    if (!isMonday || !summary) return false;
    const currentWeekId = isoWeekIdInTz(now, DEFAULT_TZ);
    const lastWeekId = prevIsoWeekId(currentWeekId, DEFAULT_TZ);
    // Only surface the recap for the week that JUST ended (not a stale one from
    // a missed Monday, and not the still-in-progress current week).
    if (summary.weekId !== lastWeekId) return false;
    if (dismissedWeekId === summary.weekId) return false;
    return true;
  }, [summary, dismissedWeekId]);

  if (!eligible || !summary) return null;

  const dismiss = () => {
    if (dismissKey) {
      setDismissedWeekId(summary.weekId);
      void AsyncStorage.setItem(dismissKey, summary.weekId).catch(() => {});
    }
  };

  const delta = Math.round(summary.deltaMMR);
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta} MMR`;
  const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textSecondary;

  const rankChangeLabel = summary.promotion
    ? `🎉 Promoted to ${summary.promotion.to?.tier}${summary.promotion.to?.division ? ` ${ROMAN[summary.promotion.to.division]}` : ''}!`
    : summary.demotion
      ? `Dropped to ${summary.demotion.to?.tier}${summary.demotion.to?.division ? ` ${ROMAN[summary.demotion.to.division]}` : ''}`
      : summary.completedWeek
        ? 'Week completed'
        : summary.missedWeek
          ? 'Week missed'
          : 'Week wrapped';

  return (
    <Pressable onPress={onOpen} style={styles.wrap} accessibilityRole="button">
      <View style={styles.iconWrap}>
        <Icon source="calendar-week" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Last week: {deltaLabel}</Text>
        <Text style={styles.body}>
          {rankChangeLabel} · {summary.deltaMP != null ? `${summary.deltaMP >= 0 ? '+' : ''}${summary.deltaMP} MP` : ''}
        </Text>
      </View>
      <Text style={[styles.deltaChip, { color: deltaColor }]}>{deltaLabel}</Text>
      <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Icon source="close" size={16} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(62,139,255,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  deltaChip: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  closeBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
