import React, { useContext, useEffect, useState, useCallback } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import PrimaryButton from '../components/ui/PrimaryButton';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeHealthSettings, updateHealthSettings, type HealthSettings } from '../services/healthSettings';
import * as HealthService from '../services/health/healthService';
import { syncHealthData } from '../services/healthSync';
import { db } from '../firebase/firebase';
import * as HealthKitService from '../services/health/healthKitService';
import { todayYYYYMMDD } from '../utils/dates';
import { colors, radius, spacing } from '../theme';

function ToggleRow({
  title,
  subtitle,
  extra,
  warning,
  value,
  onValueChange,
  divider = true,
}: {
  title: string;
  subtitle?: string;
  extra?: string;
  warning?: string;
  value: boolean;
  onValueChange: () => void;
  divider?: boolean;
}) {
  return (
    <>
      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <AppText variant="rowTitle" color="primary">{title}</AppText>
          {subtitle ? <AppText variant="rowSubtitle" color="muted" style={styles.rowGap}>{subtitle}</AppText> : null}
          {extra ? <AppText variant="rowSubtitle" color="muted" style={styles.rowGap}>{extra}</AppText> : null}
          {warning ? <AppText variant="rowSubtitle" color="danger" style={styles.rowGap}>{warning}</AppText> : null}
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

export default function HealthSettingsScreen() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<HealthSettings | null>(null);
  const [permissions, setPermissions] = useState<{ workouts: boolean; calories: boolean; weight: boolean }>({
    workouts: false,
    calories: false,
    weight: false,
  });
  const [isAvailable, setIsAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [showSyncLogs, setShowSyncLogs] = useState(false);

  useEffect(() => {
    if (!user || !db) {
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      return subscribeHealthSettings(
        user.uid,
        (s) => {
          setSettings(s);
          setLoading(false);
        },
        (err) => {
          console.error('Error loading health settings:', err);
          setLoading(false);
        },
      );
    } catch (err) {
      console.error('Failed to subscribe to health settings:', err);
      setLoading(false);
    }
  }, [user]);

  const refreshPermissions = useCallback(async () => {
    try {
      const available = await HealthService.isHealthAvailable();
      console.log('Health available:', available);
      setIsAvailable(available);
      if (available) {
        const perms = await HealthService.checkHealthPermissions();
        console.log('Permission status:', perms);
        setPermissions(perms);
      }
    } catch (err) {
      console.error('Error checking health availability:', err);
      setIsAvailable(false);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Refresh permissions when screen comes into focus (user might have changed them in Settings)
  useFocusEffect(
    useCallback(() => {
      refreshPermissions();
    }, [refreshPermissions])
  );

  const handleToggle = async (key: 'syncWorkouts' | 'syncCalories' | 'syncWeight') => {
    if (!user || !settings) return;
    const newValue = !settings[key];
    await updateHealthSettings(user.uid, { [key]: newValue });
    await Haptics.selectionAsync();
  };

  const handleRequestPermissions = async () => {
    setError(null);
    setSuccess(null);
    try {
      // First check if health is available
      const available = await HealthService.isHealthAvailable();
      if (!available) {
        setError(`${platformName} is not available on this device.`);
        return;
      }

      console.log('Requesting permissions...');
      const result = await HealthService.requestHealthPermissions();
      console.log('Permission request result:', result);

      if (!result.success) {
        setError(`Failed to request permissions: ${result.error || 'Unknown error'}`);
        return;
      }

      // Wait a moment for iOS to process the permission dialog (if it was shown)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Always re-check permissions after request
      const perms = await HealthService.checkHealthPermissions();
      console.log('Permission status after request:', perms);
      setPermissions(perms);

      // Check if permissions were actually granted
      const anyGranted = perms.workouts || perms.calories || perms.weight;

      if (anyGranted && user) {
        await updateHealthSettings(user.uid, {
          healthKitAuthorized: Platform.OS === 'ios' ? true : undefined,
          googleFitAuthorized: Platform.OS === 'android' ? true : undefined,
        });
        setSuccess('Permissions granted! You can now enable sync options.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // No permissions granted - this could mean:
        // 1. User denied in the dialog (if it was shown)
        // 2. Dialog wasn't shown because permissions were already requested before
        if (result.dialogShown) {
          setError('Permissions were denied. Please enable them in iOS Settings → Privacy & Security → Health → AccountaBuild');
        } else {
          setError('Permission dialog was not shown. This usually means permissions were already requested. Please enable them manually in iOS Settings → Privacy & Security → Health → AccountaBuild');
        }
      }
    } catch (err) {
      console.error('Permission request error:', err);
      setError(`Failed to request permissions: ${err}`);
    }
  };

  const handleSync = async () => {
    if (!user || !activeGroupId || !settings) return;
    setError(null);
    setSuccess(null);
    setSyncing(true);
    setSyncLogs([]);
    setShowSyncLogs(true);

    const logs: string[] = [];
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      logs.push(`[${timestamp}] ${message}`);
      setSyncLogs([...logs]);
    };

    try {
      addLog('Starting sync...');
      addLog(`Settings: syncWorkouts=${settings.syncWorkouts}, syncCalories=${settings.syncCalories}, syncWeight=${settings.syncWeight}`);

      // Check permissions
      const permissions = await HealthService.checkHealthPermissions();
      addLog(`Permissions: workouts=${permissions.workouts}, calories=${permissions.calories}, weight=${permissions.weight}`);

      // Check for manual logs
      const today = todayYYYYMMDD();
      addLog(`Today's date: ${today}`);

      const result = await syncHealthData(user.uid, activeGroupId, settings);

      // Update last sync time
      await updateHealthSettings(user.uid, {
        lastSyncAt: new Date(),
      });

      // Add detailed diagnostics to logs
      if (result.diagnostics) {
        if (result.diagnostics.calories) {
          const cal = result.diagnostics.calories;
          const calData = cal.dataFromHealth || {};
          const calSummary = {
            entriesCount: calData.entriesCount ?? calData.entries?.length ?? 0,
            syncedCount: cal.syncedCount ?? 0,
            sampleEntries: Array.isArray(calData.entriesDetailed) ? calData.entriesDetailed.slice(0, 3) : [],
            total: calData.total ?? null,
          };
          addLog(`Calories: data=${JSON.stringify(calSummary)}, reason=${cal.reason || 'N/A'}`);
        }
        if (result.diagnostics.workouts) {
          const wkt = result.diagnostics.workouts;
          const wktData = wkt.dataFromHealth || {};
          const wktSummary = {
            totalCount: wktData.totalCount ?? 0,
            syncedCount: wkt.syncedCount ?? 0,
            sampleItems: Array.isArray(wktData.items) ? wktData.items.slice(0, 3) : [],
          };
          addLog(`Workouts: data=${JSON.stringify(wktSummary)}, reason=${wkt.reason || 'N/A'}`);
        }
        if (result.diagnostics.weight) {
          const w = result.diagnostics.weight;
          addLog(`Weight: data=${JSON.stringify(w.dataFromHealth)}, reason=${w.reason || 'N/A'}`);
        }
      }

      addLog(`Sync result: workoutsSynced=${result.workoutsSynced}, caloriesSynced=${result.caloriesSynced}, weightSynced=${result.weightSynced}, errors=${result.errors.length}`);

      const messages: string[] = [];
      if (result.workoutsSynced > 0) {
        messages.push(`${result.workoutsSynced} workout${result.workoutsSynced > 1 ? 's' : ''} synced`);
      }
      if (result.caloriesSynced) {
        messages.push('Calories synced');
      }
      if (result.weightSynced) {
        messages.push('Weight synced');
      }
      if (messages.length === 0) {
        messages.push('No new data to sync (or manual logs exist for today)');
      }
      if (result.errors.length > 0) {
        messages.push(`Errors: ${result.errors.join(', ')}`);
      }

      // Log full result for debugging
      console.log('[HealthSettings] Sync result:', result);
      console.log('[HealthSettings] Messages:', messages);

      setSuccess(messages.join('. '));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const errorMsg = `Sync failed: ${err}`;
      addLog(`ERROR: ${errorMsg}`);
      setError(errorMsg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSyncing(false);
    }
  };

  const handleRunDiagnostics = async () => {
    if (Platform.OS !== 'ios') {
      setDiagnostics('Diagnostics only available on iOS');
      return;
    }

    setRunningDiagnostics(true);
    setDiagnostics(null);
    setError(null);
    setSuccess(null);

    try {
      const report = await HealthKitService.runHealthKitDiagnostics();
      setDiagnostics(report);
      console.log('HealthKit Diagnostics:', report);
    } catch (err) {
      const errorMsg = `Failed to run diagnostics: ${err}`;
      setDiagnostics(errorMsg);
      setError(errorMsg);
      console.error('Diagnostics error:', err);
    } finally {
      setRunningDiagnostics(false);
    }
  };

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <AppText variant="body" color="secondary" style={styles.centeredText}>
            {user
              ? db
                ? 'Loading...'
                : 'Health settings unavailable (database not initialized).'
              : 'Please log in to manage Health & Fitness settings.'}
          </AppText>
        </View>
      </View>
    );
  }

  const platformName = Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit';

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
        >
          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <AppText variant="cardLabel" color="primary">Health & Fitness Integration</AppText>
                <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>{`Connect with ${platformName}`}</AppText>
              </View>
              <TouchableOpacity onPress={refreshPermissions} disabled={!isAvailable} hitSlop={8} style={styles.iconBtn}>
                <Icon source="refresh" size={20} color={isAvailable ? colors.textSecondary : colors.faint} />
              </TouchableOpacity>
            </View>

            {!isAvailable ? (
              <AppText variant="body" color="danger" style={styles.blockGap}>
                {platformName} is not available on this device.
              </AppText>
            ) : (
              <>
                <View style={styles.introBlock}>
                  <AppText variant="rowSubtitle" color="secondary" style={styles.introText}>
                    Sync your fitness data automatically from {platformName}. Manual logs always take priority.
                  </AppText>
                  {!permissions.workouts && !permissions.calories && !permissions.weight && (
                    <>
                      <PrimaryButton onPress={handleRequestPermissions} style={styles.requestBtn}>
                        Request Permissions
                      </PrimaryButton>
                      <AppText variant="rowSubtitle" color="muted" style={styles.centerNote}>
                        If no dialog appears, permissions were already requested. Enable them in iOS Settings → Privacy & Security → Health → AccountaBuild
                      </AppText>
                    </>
                  )}
                </View>

                <AppText variant="eyebrow" color="muted" style={styles.eyebrow}>Sync options</AppText>
                <View style={styles.group}>
                  <ToggleRow
                    title="Sync Workouts"
                    subtitle={`Automatically sync workouts from ${platformName}`}
                    warning={
                      !permissions.workouts
                        ? settings.syncWorkouts
                          ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                          : 'Permission required'
                        : undefined
                    }
                    value={settings.syncWorkouts}
                    onValueChange={() => handleToggle('syncWorkouts')}
                  />
                  <ToggleRow
                    title="Sync Calories"
                    subtitle={`Sync dietary energy (calories consumed) from ${platformName}`}
                    extra={`Works with apps like MyFitnessPal that sync to ${platformName}`}
                    warning={
                      !permissions.calories
                        ? settings.syncCalories
                          ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                          : 'Permission required'
                        : undefined
                    }
                    value={settings.syncCalories}
                    onValueChange={() => handleToggle('syncCalories')}
                  />
                  <ToggleRow
                    title="Sync Weight"
                    subtitle={`Automatically sync weight entries from ${platformName}`}
                    warning={
                      !permissions.weight
                        ? settings.syncWeight
                          ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                          : 'Permission required'
                        : undefined
                    }
                    value={settings.syncWeight}
                    onValueChange={() => handleToggle('syncWeight')}
                    divider={false}
                  />
                </View>

                {error && (
                  <AppText variant="rowSubtitle" color="danger" style={styles.blockGap}>{error}</AppText>
                )}
                {success && (
                  <AppText variant="rowSubtitle" color="accent" style={styles.blockGap}>{success}</AppText>
                )}
                {(!permissions.workouts || !permissions.calories || !permissions.weight) && (
                  <View style={styles.noteBox}>
                    <AppText variant="rowSubtitle" color="secondary">
                      <AppText variant="rowSubtitle" color="primary" style={styles.bold}>Permission Status: </AppText>
                      Not all permissions are granted.
                    </AppText>
                    <AppText variant="rowSubtitle" color="secondary" style={styles.rowGap}>
                      To enable permissions, go to: iOS Settings → Privacy & Security → Health → AccountaBuild
                    </AppText>
                    <AppText variant="rowSubtitle" color="secondary" style={styles.rowGap}>
                      Then toggle ON: Workouts, Dietary Energy, and Body Mass.
                    </AppText>
                  </View>
                )}

                <PrimaryButton
                  onPress={handleSync}
                  loading={syncing}
                  disabled={syncing || !activeGroupId}
                  style={styles.syncBtn}
                >
                  Sync Now
                </PrimaryButton>

                {settings.lastSyncAt && (
                  <AppText variant="rowSubtitle" color="muted" style={styles.lastSync}>
                    Last synced: {new Date((settings.lastSyncAt as any)?.toDate?.() || settings.lastSyncAt).toLocaleString()}
                  </AppText>
                )}
              </>
            )}
          </Card>

          {/* Sync Debug Logs Panel */}
          {showSyncLogs && (
            <Card style={styles.spacedCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <AppText variant="cardLabel" color="primary">Sync Debug Logs</AppText>
                  <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>Real-time sync information</AppText>
                </View>
                <TouchableOpacity onPress={() => setShowSyncLogs(false)} hitSlop={8} style={styles.iconBtn}>
                  <Icon source="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {syncLogs.length === 0 ? (
                <AppText variant="rowSubtitle" color="muted" style={styles.blockGap}>
                  No logs yet. Tap "Sync Now" to see debug information.
                </AppText>
              ) : (
                <ScrollView style={styles.logBox} nestedScrollEnabled>
                  <AppText selectable style={styles.mono}>
                    {syncLogs.join('\n')}
                  </AppText>
                </ScrollView>
              )}
              <AppText variant="rowSubtitle" color="muted" style={styles.blockGap}>
                These logs show what happens during sync. Copy the text above to share for debugging.
              </AppText>
            </Card>
          )}

          {/* Debug Diagnostics Panel */}
          {Platform.OS === 'ios' && (
            <Card style={styles.spacedCard}>
              <AppText variant="cardLabel" color="primary">HealthKit Diagnostics</AppText>
              <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>Debug information</AppText>

              <PrimaryButton
                secondary
                onPress={handleRunDiagnostics}
                loading={runningDiagnostics}
                disabled={runningDiagnostics}
                style={styles.diagBtn}
              >
                Run Diagnostics
              </PrimaryButton>

              {diagnostics && (
                <ScrollView style={[styles.logBox, styles.diagBox]} nestedScrollEnabled>
                  <AppText selectable style={styles.mono}>
                    {diagnostics}
                  </AppText>
                </ScrollView>
              )}

              <AppText variant="rowSubtitle" color="muted" style={styles.blockGap}>
                Tap "Run Diagnostics" to test HealthKit API calls. Copy the output above to share for debugging.
              </AppText>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  centeredText: { textAlign: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardHeaderText: { flex: 1 },
  subLine: { marginTop: 2 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  blockGap: { marginTop: spacing.base },
  introBlock: { marginTop: spacing.base, marginBottom: spacing.sm },
  introText: { lineHeight: 18 },
  requestBtn: { marginTop: spacing.md },
  centerNote: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
  eyebrow: { marginTop: spacing.lg, marginBottom: spacing.sm },
  group: {
    backgroundColor: colors.surface2,
    borderRadius: radius.listGroup,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingHorizontal: spacing.base,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  toggleLeft: { flex: 1 },
  rowGap: { marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.divider },
  noteBox: { marginTop: spacing.base, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.tile },
  bold: { fontWeight: '700' },
  syncBtn: { marginTop: spacing.base },
  lastSync: { marginTop: spacing.md },
  spacedCard: { marginTop: spacing.md },
  logBox: { backgroundColor: colors.surface2, padding: spacing.md, borderRadius: radius.tile, maxHeight: 300, marginTop: spacing.base },
  diagBox: { maxHeight: 400 },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: colors.textSecondary,
  },
  diagBtn: { marginTop: spacing.base },
});
