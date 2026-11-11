import React, { useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import AppText from '../components/ui/AppText';
import PressableScale from '../components/ui/PressableScale';
import PrimaryButton from '../components/ui/PrimaryButton';
import TimePicker from '../components/ui/TimePicker';
import { AuthContext } from '../store/AuthContext';
import {
  getAppNotificationSettings,
  getNotifLevelSettings,
  NOTIF_LEVELS,
  saveNotifLevelSettings,
  setAppNotificationSetting,
  type NotifGroup,
  type NotifLevelSettings,
} from '../services/appSettings';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '../services/notifications';
import { getLocalReminderStyle, REMINDER_STYLES, saveReminderStyle, type ReminderStyle } from '../services/reminderStyle';
import { colors, radius, spacing } from '../theme';

/**
 * One screen for every push. The member picks a level first; each level says
 * how many pushes a day it means, and the server holds it to that
 * (functions/notif-level.js). Custom opens the six kinds for the few who want
 * them. Changes wait for Save (Jake, 2026-11-11: saving on every tap gave
 * no sign that anything was saved); leaving with unsaved changes asks first.
 */
const LEVELS = NOTIF_LEVELS;

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
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  // What is saved now. The screen edits a draft until Save.
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const nav = useNavigation<any>();

  useEffect(() => {
    let live = true;
    void Promise.all([getNotifLevelSettings(user?.uid), getLocalReminderStyle(), getAppNotificationSettings()]).then(([s, st, app]) => {
      if (!live) return;
      setSettings(s);
      setStyle(st);
      setNudges(app.nudgesAllowed);
      setSavedSnap(JSON.stringify([s, st, app.nudgesAllowed]));
    });
    // Android reports "denied" (and "can't ask again") before it has ever
    // asked, so on Android the banner waits for a request that fails. iOS
    // reports the truth up front.
    if (Platform.OS === 'ios') {
      void Notifications.getPermissionsAsync()
        .then((p) => live && setDenied(p.status === 'denied'))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [user?.uid]);

  const apply = (next: NotifLevelSettings) => {
    setSettings(next);
    setStatus(null);
    void Haptics.selectionAsync().catch(() => {});
  };

  const pickStyle = (next: ReminderStyle) => {
    if (next === style) return;
    setStyle(next);
    setStatus(null);
    void Haptics.selectionAsync().catch(() => {});
  };

  const dirty = !!settings && savedSnap !== null && JSON.stringify([settings, style, nudges]) !== savedSnap;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const save = async () => {
    if (!settings || !settings.level) return;
    setSaving(true);
    setStatus(null);
    try {
      await saveNotifLevelSettings(user?.uid, settings);
      if (user?.uid) await saveReminderStyle(user.uid, style);
      await setAppNotificationSetting(user?.uid, 'nudgesAllowed', nudges);
      setSavedSnap(JSON.stringify([settings, style, nudges]));
      setStatus('saved');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // A phone that was never asked gets asked now.
      if (settings.level !== 'quiet') {
        void requestNotificationPermissions()
          .then((ok) => setDenied(!ok))
          .catch(() => {});
      }
    } catch {
      setStatus('error');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  // Leaving with unsaved changes asks first.
  useEffect(
    () =>
      nav.addListener('beforeRemove', (e: any) => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        Alert.alert('Save your changes?', 'Your notification changes are not saved yet.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => nav.dispatch(e.data.action) },
        ]);
      }),
    [nav],
  );

  if (!settings) return <View style={styles.container} />;

  const level = settings.level;
  const customCount = Math.round(GROUPS.reduce((sum, g) => sum + (settings.groups[g.key] ? g.perDay : 0), 0));
  const hasReminder = level === 'standard' || (level === 'custom' && settings.groups.reminder);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}>
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
                {level === 'allin' ? ['09:00', '12:00', '21:00'].map(clock).join(', ') : level ? 'Off' : 'Pick a level first'}
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
                setStatus(null);
              }}
              trackColor={{ false: colors.ringNotLogged, true: colors.success }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.ringNotLogged}
            />
          </View>
        </View>
      </ScrollView>
      {/* Save sits above the tab bar's raised + button. */}
      <View style={[styles.footer, { paddingBottom: spacing.md + 56 }]}>
        {status ? (
          <AppText variant="rowSubtitle" color={status === 'saved' ? 'success' : 'danger'} style={styles.status}>
            {status === 'saved' ? 'Saved. Your notifications follow these settings now.' : "Couldn't save. Try again."}
          </AppText>
        ) : !settings.level ? (
          <AppText variant="rowSubtitle" color="muted" style={styles.status}>Pick a level to save.</AppText>
        ) : null}
        <PrimaryButton onPress={() => void save()} loading={saving} disabled={saving || !dirty || !settings.level}>
          {status === 'saved' && !dirty ? 'Saved' : 'Save'}
        </PrimaryButton>
      </View>
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
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.background },
  status: { textAlign: 'center', marginBottom: spacing.sm },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textMuted },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});
