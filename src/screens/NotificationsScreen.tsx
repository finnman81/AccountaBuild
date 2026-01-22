import React, { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Switch, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, Modal, Portal, Text, useTheme } from 'react-native-paper';
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
  const [count, setCount] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [times, setTimes] = useState<string[]>(['09:00', '12:00', '21:00']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [loading, setLoading] = useState(true);
  const [countModalVisible, setCountModalVisible] = useState(false);
  const [tempCount, setTempCount] = useState<1 | 2 | 3 | 4 | 5>(3);
  const countScrollRef = useRef<ScrollView>(null);

  const countOptions: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  const COUNT_ITEM_HEIGHT = 44;

  const getDefaultTimes = (nextCount: number) => {
    if (nextCount === 1) return ['09:00'];
    if (nextCount === 2) return ['09:00', '21:00'];
    if (nextCount === 3) return ['09:00', '12:00', '21:00'];
    // Evenly distribute between 09:00 and 21:00 (inclusive)
    const startHour = 9;
    const endHour = 21;
    const interval = (endHour - startHour) / (nextCount - 1);
    const out: string[] = [];
    for (let i = 0; i < nextCount; i += 1) {
      const hour = Math.round(startHour + interval * i);
      out.push(`${String(hour).padStart(2, '0')}:00`);
    }
    return out;
  };

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

  const applyCountChange = (nextCount: 1 | 2 | 3 | 4 | 5) => {
    setCount(nextCount);
    if (nextCount >= 4) {
      setTimes(getDefaultTimes(nextCount));
      return;
    }
    // Keep existing times where possible
    const newTimes = [...times];
    while (newTimes.length < nextCount) {
      const defaults = getDefaultTimes(nextCount);
      newTimes.push(defaults[newTimes.length] ?? '09:00');
    }
    setTimes(newTimes.slice(0, nextCount));
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
        // Schedule notifications (force re-schedule on save)
        // Allow later-today notifications, but avoid immediate bursts.
        await scheduleNotifications({ force: true, startFromTomorrow: false, minLeadSeconds: 300 });
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
                  <TouchableOpacity
                    onPress={() => {
                      setTempCount(count);
                      setCountModalVisible(true);
                      requestAnimationFrame(() => {
                        const idx = countOptions.indexOf(count);
                        if (countScrollRef.current && idx >= 0) {
                          countScrollRef.current.scrollTo({ y: idx * COUNT_ITEM_HEIGHT, animated: false });
                        }
                      });
                    }}
                    disabled={saving || !canEdit}
                    style={{
                      backgroundColor: theme.colors.surfaceVariant,
                      borderColor: theme.colors.outline,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      marginBottom: 16,
                    }}
                  >
                    <Text variant="titleMedium">{count}</Text>
                  </TouchableOpacity>

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
      <Portal>
        <Modal
          visible={countModalVisible}
          onDismiss={() => setCountModalVisible(false)}
          contentContainerStyle={{
            margin: 20,
            borderRadius: 16,
            padding: 20,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text variant="titleLarge" style={{ marginBottom: 16 }}>
            Notifications per day
          </Text>
          <View
            style={{
              height: COUNT_ITEM_HEIGHT * 5,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.outline,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
            }}
          >
            <ScrollView
              ref={countScrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={COUNT_ITEM_HEIGHT}
              decelerationRate="fast"
              contentContainerStyle={{
                paddingVertical: COUNT_ITEM_HEIGHT * 2,
              }}
              onMomentumScrollEnd={(e) => {
                const offsetY = e?.nativeEvent?.contentOffset?.y ?? 0;
                const idx = Math.round(offsetY / COUNT_ITEM_HEIGHT);
                const clampedIdx = Math.max(0, Math.min(idx, countOptions.length - 1));
                const next = countOptions[clampedIdx] ?? 3;
                setTempCount(next);
                countScrollRef.current?.scrollTo({ y: clampedIdx * COUNT_ITEM_HEIGHT, animated: true });
              }}
            >
              {countOptions.map((opt) => {
                const isSelected = opt === tempCount;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setTempCount(opt)}
                    style={{
                      height: COUNT_ITEM_HEIGHT,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    }}
                  >
                    <Text variant="titleLarge" style={{ color: isSelected ? theme.colors.primary : theme.colors.onSurface }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 12 }}>
            <Button mode="text" onPress={() => setCountModalVisible(false)}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={() => {
                applyCountChange(tempCount);
                setCountModalVisible(false);
              }}
            >
              Done
            </Button>
          </View>
        </Modal>
      </Portal>
    </KeyboardAvoidingView>
  );
}
