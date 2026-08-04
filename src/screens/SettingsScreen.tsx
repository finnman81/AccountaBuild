import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Icon } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';

import { AuthContext } from '../store/AuthContext';
import { getAppNotificationSettings, setAppNotificationSetting, type AppNotificationSettings } from '../services/appSettings';
import { deleteMyAccount } from '../services/accountDeletion';
import AppText from '../components/ui/AppText';
import { colors, radius, spacing } from '../theme';

function ToggleRow({ title, subtitle, value, onValueChange, divider = true }: { title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <AppText variant="rowTitle" color="primary">{title}</AppText>
          {subtitle ? <AppText variant="rowSubtitle" color="muted">{subtitle}</AppText> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.ringNotLogged, true: colors.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.ringNotLogged}
        />
      </View>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

function NavRow({ title, value, onPress, divider = true }: { title: string; value?: string; onPress?: () => void; divider?: boolean }) {
  return (
    <>
      <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
        <AppText variant="rowTitle" color="primary" style={{ flex: 1 }}>{title}</AppText>
        {value ? <AppText variant="rowSubtitle" color="muted" style={{ marginRight: spacing.sm }}>{value}</AppText> : null}
        {onPress ? <Icon source="chevron-right" size={20} color={colors.textMuted} /> : null}
      </TouchableOpacity>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useContext(AuthContext);
  const [deleting, setDeleting] = useState(false);
  const nav = useNavigation<any>();
  const [prefs, setPrefs] = useState<AppNotificationSettings | null>(null);

  useEffect(() => {
    getAppNotificationSettings().then(setPrefs);
  }, []);

  const toggle = (key: keyof AppNotificationSettings) => (v: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: v } : p));
    void setAppNotificationSetting(user?.uid, key, v);
  };

  const version = Constants.expoConfig?.version ?? '—';

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'Sign out of AccountaBuild?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);

  /**
   * Two-step confirm, because this is irreversible. Apple requires account
   * deletion to be reachable in-app (Guideline 5.1.1(v)); the second prompt is
   * ours — an accidental tap shouldn't end someone's streak history.
   */
  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteMyAccount();
      // The auth record is gone; onAuthStateChanged drops the app back to the
      // signed-out stack on its own.
      await logout().catch(() => {});
    } catch {
      setDeleting(false);
      Alert.alert(
        'Could not delete',
        'Something went wrong and nothing was deleted. Please try again, or email support if it keeps happening.',
      );
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete account',
      [
        'This permanently deletes your account, goals, logs, weigh-ins, FP history and badges, and removes you from your groups.',
        '',
        'Your chat messages stay in the conversation but are detached from your name.',
        '',
        'This cannot be undone.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you sure?', 'Last chance — this is permanent.', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: () => void runDelete() },
            ]),
        },
      ],
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Settings</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Notifications</AppText>
        <View style={styles.group}>
          <ToggleRow title="Streak reminder" subtitle="Daily at 6:00 PM if you haven't logged" value={!!prefs?.streakReminder} onValueChange={toggle('streakReminder')} />
          <ToggleRow title="Team activity" subtitle="Each day, when crew members log" value={!!prefs?.teamActivity} onValueChange={toggle('teamActivity')} />
          <ToggleRow title="Milestones" subtitle="Goals reached, rank-ups, challenges — rare" value={!!prefs?.milestones} onValueChange={toggle('milestones')} />
          <ToggleRow title="Nudges" subtitle="Let teammates nudge you when at risk" value={!!prefs?.nudgesAllowed} onValueChange={toggle('nudgesAllowed')} />
          <ToggleRow title="Chat messages" value={!!prefs?.chatMessages} onValueChange={toggle('chatMessages')} />
          <ToggleRow title="Weekly recap" subtitle="Monday summary + rank changes" value={!!prefs?.weeklyRecap} onValueChange={toggle('weeklyRecap')} />
          <NavRow title="Reminder schedule" value="Times" onPress={() => nav.navigate('Notifications')} divider={false} />
        </View>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Health</AppText>
        <View style={styles.group}>
          <NavRow title="Apple Health sync" value="Manage" onPress={() => nav.navigate('HealthSettings')} />
          <NavRow title="Auto-log rules" value="Workouts ≥ 15 min" onPress={() => nav.navigate('HealthSettings')} divider={false} />
        </View>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Account</AppText>
        <View style={styles.group}>
          <NavRow title="Edit profile" onPress={() => nav.navigate('EditProfile')} />
          <NavRow title="Email" value={user?.email ?? '—'} divider={false} />
        </View>

        <TouchableOpacity style={styles.signOutCard} onPress={confirmSignOut} activeOpacity={0.8}>
          <AppText variant="rowTitle" color="danger">Sign out</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteRow}
          onPress={confirmDelete}
          activeOpacity={0.7}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <AppText variant="rowSubtitle" color="muted">
            {deleting ? 'Deleting your account…' : 'Delete account'}
          </AppText>
        </TouchableOpacity>

        <AppText variant="label" color="muted" style={styles.version}>AccountaBuild {version}</AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  rowLeft: { flex: 1, gap: 2 },
  divider: { height: 1, backgroundColor: colors.divider },
  deleteRow: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.md },
  signOutCard: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderCard, paddingVertical: spacing.base, alignItems: 'center' },
  version: { textAlign: 'center', marginTop: spacing.lg },
});
