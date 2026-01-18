import React, { useContext, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Switch, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import Screen from '../components/layout/Screen';
import { AuthContext } from '../store/AuthContext';
import { getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../services/notificationPreferences';
import { scheduleNotifications, cancelAllNotifications, requestNotificationPermissions, getNotificationPermissionsStatus } from '../services/notifications';
import TimePicker from '../components/ui/TimePicker';

function isValidTime(timeStr: string): boolean {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(timeStr);
  return match !== null;
}

export default function NotificationsScreen() {
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [enabled, setEnabled] = useState(true);
  const [count, setCount] = useState<1 | 2 | 3>(3);
  const [times, setTimes] = useState<string[]>(['09:00', '12:00', '21:00']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const prefs = await getNotificationPreferences();
        setEnabled(prefs.enabled);
        setCount(prefs.count);
        setTimes([...prefs.times]);
        const status = await getNotificationPermissionsStatus();
        setPermissionStatus(status);
      } catch (e) {
        console.error('Failed to load notification preferences:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const updateTime = (index: number, value: string) => {
    const newTimes = [...times];
    newTimes[index] = value;
    setTimes(newTimes);
  };

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    
    try {
      // Validate times
      for (let i = 0; i < count; i++) {
        const timeStr = times[i]?.trim();
        if (!timeStr || !isValidTime(timeStr)) {
          throw new Error(`Time ${i + 1} must be in HH:mm format (e.g., 09:00)`);
        }
      }

      const prefs: NotificationPreferences = {
        enabled,
        count,
        times: times.slice(0, count),
      };

      await saveNotificationPreferences(prefs);

      if (enabled) {
        // Request permissions if needed
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          setError('Notification permissions are required. Please enable them in your device settings.');
          setSaving(false);
          return;
        }
        // Schedule notifications
        await scheduleNotifications();
      } else {
        // Cancel all notifications
        await cancelAllNotifications();
      }

      const status = await getNotificationPermissionsStatus();
      setPermissionStatus(status);
      setSaved('Settings saved.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save settings.';
      setError(message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <Text>Loading...</Text>
      </Screen>
    );
  }

  const permissionDenied = permissionStatus === 'denied';
  const canEdit = !permissionDenied || !enabled;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Card>
            <Card.Title title="Notification Settings" subtitle="Get reminders to log your workouts" />
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text variant="titleMedium">Enable notifications</Text>
                <Switch value={enabled} onValueChange={setEnabled} disabled={saving || permissionDenied} />
              </View>

              {permissionDenied && enabled && (
                <View style={{ marginBottom: 16, padding: 12, backgroundColor: theme.colors.errorContainer, borderRadius: 8 }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                    Notification permissions are denied. Please enable them in your device settings to receive reminders.
                  </Text>
                </View>
              )}

              {enabled && (
                <>
                  <Text variant="titleMedium" style={{ marginBottom: 8 }}>Notifications per day</Text>
                  <SegmentedButtons
                    value={String(count)}
                    onValueChange={(v) => {
                      const newCount = Number(v) as 1 | 2 | 3;
                      setCount(newCount);
                      // Ensure we have enough times
                      const newTimes = [...times];
                      while (newTimes.length < newCount) {
                        newTimes.push('09:00');
                      }
                      setTimes(newTimes);
                    }}
                    buttons={[
                      { value: '1', label: '1' },
                      { value: '2', label: '2' },
                      { value: '3', label: '3' },
                    ]}
                    disabled={saving || !canEdit}
                  />

                  <View style={{ height: 16 }} />

                  {Array.from({ length: count }).map((_, index) => (
                    <View key={index} style={{ marginBottom: 24 }}>
                      <Text variant="titleSmall" style={{ marginBottom: 8 }}>
                        Notification {index + 1} time
                      </Text>
                      <TimePicker
                        value={times[index] ?? '09:00'}
                        onChange={(v) => updateTime(index, v)}
                        disabled={saving || !canEdit}
                      />
                    </View>
                  ))}
                </>
              )}

              {error ? (
                <>
                  <View style={{ height: 12 }} />
                  <Text style={{ color: 'crimson' }}>{error}</Text>
                </>
              ) : null}
              {saved ? (
                <>
                  <View style={{ height: 12 }} />
                  <Text style={{ color: 'green' }}>{saved}</Text>
                </>
              ) : null}

              <View style={{ height: 16 }} />
              <Button mode="contained" onPress={save} disabled={saving || !canEdit} loading={saving}>
                Save settings
              </Button>
            </Card.Content>
          </Card>

          <View style={{ height: 16 }} />

          <Card>
            <Card.Title title="About" />
            <Card.Content>
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                You'll receive reminders at the times you set to log your workouts. If you don't log anything after the first reminder, a badge will appear on the app icon.
              </Text>
            </Card.Content>
          </Card>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
