import React, { useContext, useEffect, useState, useCallback } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View, AppState, AppStateStatus } from 'react-native';
import { Button, Card, Text, useTheme, IconButton } from 'react-native-paper';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import Screen from '../components/layout/Screen';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeHealthSettings, updateHealthSettings, type HealthSettings } from '../services/healthSettings';
import * as HealthService from '../services/health/healthService';
import { syncHealthData } from '../services/healthSync';
import { db } from '../firebase/firebase';
import * as HealthKitService from '../services/health/healthKitService';
<<<<<<< HEAD
import { todayYYYYMMDD } from '../utils/dates';
=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

export default function HealthSettingsScreen() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const theme = useTheme();
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
      
      if (anyGranted) {
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
<<<<<<< HEAD
      const today = todayYYYYMMDD();
=======
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
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
<<<<<<< HEAD
          const calData = cal.dataFromHealth || {};
          const calSummary = {
            entriesCount: calData.entriesCount ?? calData.entries?.length ?? 0,
            syncedCount: calData.syncedCount ?? 0,
            skippedDuplicates: calData.skippedDuplicates ?? 0,
            sampleEntries: Array.isArray(calData.entriesDetailed) ? calData.entriesDetailed.slice(0, 3) : [],
            total: calData.total ?? null,
          };
          addLog(`Calories: hasManualLog=${cal.hasManualLog}, data=${JSON.stringify(calSummary)}, reason=${cal.reason || 'N/A'}`);
        }
        if (result.diagnostics.workouts) {
          const wkt = result.diagnostics.workouts;
          const wktData = wkt.dataFromHealth || {};
          const wktSummary = {
            totalCount: wktData.totalCount ?? 0,
            syncedCount: wktData.syncedCount ?? 0,
            skippedDuplicates: wktData.skippedDuplicates ?? 0,
            sampleItems: Array.isArray(wktData.items) ? wktData.items.slice(0, 3) : [],
          };
          addLog(`Workouts: hasManualLog=${wkt.hasManualLog}, data=${JSON.stringify(wktSummary)}, reason=${wkt.reason || 'N/A'}`);
=======
          addLog(`Calories: hasManualLog=${cal.hasManualLog}, data=${JSON.stringify(cal.dataFromHealth)}, reason=${cal.reason || 'N/A'}`);
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
        }
        if (result.diagnostics.weight) {
          const w = result.diagnostics.weight;
          addLog(`Weight: hasManualLog=${w.hasManualLog}, data=${JSON.stringify(w.dataFromHealth)}, reason=${w.reason || 'N/A'}`);
        }
      }

<<<<<<< HEAD
      addLog(`Sync result: workoutsSynced=${result.workoutsSynced}, caloriesSynced=${result.caloriesSynced}, weightSynced=${result.weightSynced}, errors=${result.errors.length}`);
=======
      addLog(`Sync result: ${JSON.stringify(result, null, 2)}`);
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

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
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>
            {user
              ? db
                ? 'Loading...'
                : 'Health settings unavailable (database not initialized).'
              : 'Please log in to manage Health & Fitness settings.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const platformName = Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Card>
            <Card.Title 
              title="Health & Fitness Integration" 
              subtitle={`Connect with ${platformName}`}
              right={(props) => (
                <IconButton
                  {...props}
                  icon="refresh"
                  onPress={refreshPermissions}
                  disabled={!isAvailable}
                />
              )}
            />
            <Card.Content>
              {!isAvailable ? (
                <Text style={{ color: theme.colors.error, marginBottom: 16 }}>
                  {platformName} is not available on this device.
                </Text>
              ) : (
                <>
                  <View style={{ marginBottom: 24 }}>
                    <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
                      Sync your fitness data automatically from {platformName}. Manual logs always take priority.
                    </Text>
                    {!permissions.workouts && !permissions.calories && !permissions.weight && (
                      <>
                        <Button
                          mode="contained"
                          onPress={handleRequestPermissions}
                          style={{ marginTop: 8 }}
                        >
                          Request Permissions
                        </Button>
                        <Text 
                          variant="bodySmall" 
                          style={{ 
                            color: theme.colors.onSurfaceVariant, 
                            marginTop: 8,
                            textAlign: 'center'
                          }}
                        >
                          If no dialog appears, permissions were already requested. Enable them in iOS Settings → Privacy & Security → Health → AccountaBuild
                        </Text>
                      </>
                    )}
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="titleMedium">Sync Workouts</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Automatically sync workouts from {platformName}
                        </Text>
                        {!permissions.workouts && (
                          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                            {settings.syncWorkouts 
                              ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                              : 'Permission required'}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={settings.syncWorkouts}
                        onValueChange={() => handleToggle('syncWorkouts')}
                        disabled={false}
                      />
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="titleMedium">Sync Calories</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Sync dietary energy (calories consumed) from {platformName}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                          Works with apps like MyFitnessPal that sync to {platformName}
                        </Text>
                        {!permissions.calories && (
                          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                            {settings.syncCalories 
                              ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                              : 'Permission required'}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={settings.syncCalories}
                        onValueChange={() => handleToggle('syncCalories')}
                        disabled={false}
                      />
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="titleMedium">Sync Weight</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Automatically sync weight entries from {platformName}
                        </Text>
                        {!permissions.weight && (
                          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 4 }}>
                            {settings.syncWeight 
                              ? 'Permission required - enable in Settings → Privacy & Security → Health → AccountaBuild'
                              : 'Permission required'}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={settings.syncWeight}
                        onValueChange={() => handleToggle('syncWeight')}
                        disabled={false}
                      />
                    </View>
                  </View>

                  {error && (
                    <Text style={{ color: theme.colors.error, marginBottom: 16 }}>{error}</Text>
                  )}
                  {success && (
                    <Text style={{ color: theme.colors.primary, marginBottom: 16 }}>{success}</Text>
                  )}
                  {(!permissions.workouts || !permissions.calories || !permissions.weight) && (
                    <View style={{ marginBottom: 16, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                        <Text style={{ fontWeight: 'bold' }}>Permission Status:</Text> Not all permissions are granted.
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        To enable permissions, go to: iOS Settings → Privacy & Security → Health → AccountaBuild
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        Then toggle ON: Workouts, Dietary Energy, and Body Mass.
                      </Text>
                    </View>
                  )}

                  <Button
                    mode="contained"
                    onPress={handleSync}
                    loading={syncing}
                    disabled={syncing || !activeGroupId}
                    style={{ marginTop: 8 }}
                  >
                    Sync Now
                  </Button>

                  {settings.lastSyncAt && (
                    <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                      Last synced: {new Date((settings.lastSyncAt as any)?.toDate?.() || settings.lastSyncAt).toLocaleString()}
                    </Text>
                  )}
                </>
              )}
            </Card.Content>
          </Card>

          {/* Sync Debug Logs Panel */}
          {showSyncLogs && (
            <Card style={{ marginTop: 16 }}>
              <Card.Title 
                title="Sync Debug Logs" 
                subtitle="Real-time sync information"
                right={(props) => (
                  <IconButton
                    {...props}
                    icon="close"
                    onPress={() => setShowSyncLogs(false)}
                  />
                )}
              />
              <Card.Content>
                {syncLogs.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    No logs yet. Tap "Sync Now" to see debug information.
                  </Text>
                ) : (
                  <ScrollView
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      padding: 12,
                      borderRadius: 8,
                      maxHeight: 300,
                    }}
                    nestedScrollEnabled
                  >
                    <Text
                      selectable
                      style={{
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        fontSize: 10,
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      {syncLogs.join('\n')}
                    </Text>
                  </ScrollView>
                )}
                <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                  These logs show what happens during sync. Copy the text above to share for debugging.
                </Text>
              </Card.Content>
            </Card>
          )}

          {/* Debug Diagnostics Panel */}
          {Platform.OS === 'ios' && (
            <Card style={{ marginTop: 16 }}>
              <Card.Title title="HealthKit Diagnostics" subtitle="Debug information" />
              <Card.Content>
                <Button
                  mode="outlined"
                  onPress={handleRunDiagnostics}
                  loading={runningDiagnostics}
                  disabled={runningDiagnostics}
                  style={{ marginBottom: 16 }}
                >
                  Run Diagnostics
                </Button>

                {diagnostics && (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      padding: 12,
                      borderRadius: 8,
                      maxHeight: 400,
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        fontSize: 11,
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      {diagnostics}
                    </Text>
                  </View>
                )}

                <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                  Tap "Run Diagnostics" to test HealthKit API calls. Copy the output above to share for debugging.
                </Text>
              </Card.Content>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
