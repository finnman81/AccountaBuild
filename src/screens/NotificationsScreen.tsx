import React, { useContext, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AppText from '../components/ui/AppText';
import PressableScale from '../components/ui/PressableScale';
import TimePicker from '../components/ui/TimePicker';
import { AuthContext } from '../store/AuthContext';
import {
  getAppNotificationSettings,
  getNotifLevelSettings,
  saveNotifLevelSettings,
  setAppNotificationSetting,
  type NotifGroup,
  type NotifLevel,
  type NotifLevelSettings,
} from '../services/appSettings';
import { getNotificationPermissionsStatus, requestNotificationPermissions } from '../services/notifications';
import { getLocalReminderStyle, REMINDER_STYLES, saveReminderStyle, type ReminderStyle } from '../services/reminderStyle';
import { colors, radius, spacing } from '../theme';

/**
 * One screen for every push. The member picks a level first; each level says
 * how many pushes a day it means, and the server holds it to that
 * (functions/notif-level.js). Custom opens the six kinds for the few who want
 * them. Every change saves at once: there is no Save button.
 */
const LEVELS: Array<{ value: Exclude<NotifLevel, 'custom'>; label: string; count: string; body: string }> = [
  { value: 'quiet', label: 'Quiet', count: '0 to 1 a day', body: 'Only what is sent to you: cheers, reactions, chat. Plus the Monday recap.' },
  { value: 'standard', label: 'Standard', count: 'About 2 a day', body: 'A morning line. One reminder if you have not logged. Anything sent to you.' },
  { value: 'allin', label: 'All in', count: '5 or more a day', body: 'Everything in Standard, plus a push each time a teammate trains, and three reminders.' },
];

// Rough pushes a day per kind, from the week of 2026-11-04.
const GROUPS: Array<{ key: NotifGroup; title: string; subtitle: string; perDay: number }> = [
  { key: 'direct', title: 'Sent to you', subtitle: 'Cheers, reactions, nudges, chat', perDay: 0.2 },
  { key: 'reminder', title: 'Your reminder', subtitle: 'Once a day, only if nothing is logged', perDay: 0.7 },
  { key: 'progress', title: 'Your progress', subtitle: 'Rank changes, streak at risk, weekly recap', perDay: 0.2 },
  { key: 'morning', title: 'Morning line', subtitle: "Yesterday's champion and who logged", perDay: 1 },
  { key: 'teammate', title: "Each teammate's workout", subtitle: 'A push every time someone trains', perDay: 3 },
  { key: 'events', title: 'Events', subtitle: 'Challenges, contests, milestones', perDay: 0.2 },
];

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function NotificationsScreen() {
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<NotifLevelSettings | null>(null);
  const [style, setStyle] = useState<ReminderStyle>('friendly');
  const [nudges, setNudges] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let live = true;
    void getNotifLevelSettings(user?.uid).then((s) => live && setSettings(s));
    void getLocalReminderStyle().then((s) => live && setStyle(s));
    void getAppNotificationSettings().then((s) => live && setNudges(s.nudgesAllowed));
    void getNotificationPermissionsStatus().then((s) => live && setDenied(s === 'denied')).catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.uid]);

  const apply = (next: NotifLevelSettings) => {
    setSettings(next);
    void Haptics.selectionAsync().catch(() => {});
    void saveNotifLevelSettings(user?.uid, next).catch(() => {});
    // First choice on a phone that was never asked: ask now.
    void requestNotificationPermissions().then((ok) => setDenied(!ok)).catch(() => {});
  };

  const pickStyle = (next: ReminderStyle) => {
    if (next === style) return;
    setStyle(next);
    void Haptics.selectionAsync().catch(() => {});
    if (user?.uid) void saveReminderStyle(user.uid, next);
  };

  if (!settings) return <View style={styles.container} />;

  const level = settings.level;
  const customCount = Math.round(GROUPS.reduce((sum, g) => sum + (settings.groups[g.key] ? g.perDay : 0), 0));
  const hasReminder = level === 'standard' || (level === 'custom' && settings.groups.reminder);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
        {denied ? (
          <View style={styles.warnBox}>
            <AppText variant="rowSubtitle" color="danger">Notifications are off for this app. Turn them on in your phone settings.</AppText>
          </View>
        ) : null}

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>How much</AppText>
        {LEVELS.map((l) => {
          const on = level === l.value;
          return (
            <PressableScale
              key={l.value}
              onPress={() => apply({ ...settings, level: l.value })}
              style={[styles.level, on && styles.levelOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${l.label}, ${l.count}`}
            >
              <View style={styles.levelTop}>
                <AppText variant="cardTitle" color="primary">{l.label}</AppText>
                <AppText variant="stat" color={on ? 'accent' : 'secondary'}>{l.count}</AppText>
              </View>
              <AppText variant="rowSubtitle" color="secondary" style={styles.levelBody}>{l.body}</AppText>
            </PressableScale>
          );
        })}

        <PressableScale
          onPress={() => apply({ ...settings, level: 'custom' })}
          style={[styles.level, level === 'custom' && styles.levelOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: level === 'custom' }}
          accessibilityLabel="Custom, pick each kind yourself"
        >
          <View style={styles.levelTop}>
            <AppText variant="cardTitle" color="primary">Custom</AppText>
            <AppText variant="stat" color={level === 'custom' ? 'accent' : 'secondary'}>
              {level === 'custom' ? `About ${customCount} a day` : 'Pick each kind'}
            </AppText>
          </View>
          {level === 'custom' ? (
            <View style={styles.groupList}>
              {GROUPS.map((g) => (
                <View key={g.key} style={styles.groupRow}>
                  <View style={styles.rowLeft}>
                    <AppText variant="rowTitle" color="primary">{g.title}</AppText>
                    <AppText variant="rowSubtitle" color="muted">{g.subtitle}</AppText>
                  </View>
                  <Switch
                    value={settings.groups[g.key]}
                    onValueChange={(v) => apply({ ...settings, groups: { ...settings.groups, [g.key]: v } })}
                    trackColor={{ false: colors.ringNotLogged, true: colors.success }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={colors.ringNotLogged}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </PressableScale>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Reminder</AppText>
        <View style={styles.group}>
          {hasReminder ? (
            <View style={styles.timeBlock}>
              <AppText variant="rowTitle" color="primary">Reminder time</AppText>
              <AppText variant="rowSubtitle" color="muted" style={styles.timeHint}>It only arrives if nothing is logged that day.</AppText>
              <TimePicker value={settings.reminderTime} onChange={(v) => apply({ ...settings, reminderTime: v })} />
            </View>
          ) : (
            <View style={styles.row}>
              <AppText variant="rowTitle" color="primary" style={{ flex: 1 }}>Reminder</AppText>
              <AppText variant="rowSubtitle" color="muted">
                {level === 'allin' ? ['09:00', '12:00', '21:00'].map(clock).join(', ') : 'Off'}
              </AppText>
            </View>
          )}
        </View>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>How it talks</AppText>
        {REMINDER_STYLES.map((o) => {
          const on = o.value === style;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => pickStyle(o.value)}
              activeOpacity={0.8}
              style={[styles.styleRow, on && styles.levelOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="rowTitle" color="primary">{o.label}</AppText>
                <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>"{o.sample}"</AppText>
              </View>
              <View style={[styles.radio, on && styles.radioOn]} />
            </TouchableOpacity>
          );
        })}

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Teammates</AppText>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <AppText variant="rowTitle" color="primary">Let teammates nudge me</AppText>
              <AppText variant="rowSubtitle" color="muted">They can poke you to log</AppText>
            </View>
            <Switch
              value={nudges}
              onValueChange={(v) => {
                setNudges(v);
                void setAppNotificationSetting(user?.uid, 'nudgesAllowed', v);
              }}
              trackColor={{ false: colors.ringNotLogged, true: colors.success }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.ringNotLogged}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  warnBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.dangerTint, borderRadius: radius.tile },
  level: {
    marginBottom: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    backgroundColor: colors.surface,
  },
  levelOn: { borderColor: colors.primary, backgroundColor: colors.surfaceHero },
  levelTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  levelBody: { marginTop: spacing.xs, lineHeight: 18 },
  groupList: { marginTop: spacing.sm },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  rowLeft: { flex: 1, gap: 2 },
  timeBlock: { paddingVertical: spacing.md },
  timeHint: { marginTop: 2, marginBottom: spacing.md },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    backgroundColor: colors.surface,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textMuted },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});
