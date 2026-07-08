import React, { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Switch, TouchableOpacity, TouchableWithoutFeedback, View, StyleSheet } from 'react-native';
import { Modal, Portal } from 'react-native-paper';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import PrimaryButton from '../components/ui/PrimaryButton';
import TimePicker from '../components/ui/TimePicker';
import { AuthContext } from '../store/AuthContext';
import { getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../services/notificationPreferences';
import { scheduleNotifications, cancelAllNotifications, requestNotificationPermissions, getNotificationPermissionsStatus } from '../services/notifications';
import { colors, radius, spacing } from '../theme';

function isValidTime(timeStr: string): boolean {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(timeStr);
  return match !== null;
}

export default function NotificationsScreen() {
  const { user } = useContext(AuthContext);
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
      <View style={styles.container}>
        <View style={styles.centered}>
          <AppText variant="body" color="secondary">You must be signed in.</AppText>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <AppText variant="body" color="secondary">Loading...</AppText>
        </View>
      </View>
    );
  }

  const permissionDenied = permissionStatus === 'denied';
  const canEdit = !permissionDenied || !enabled;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
          >
            <Card>
              <AppText variant="cardLabel" color="primary">Notification Settings</AppText>
              <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>Get reminders to log your workouts</AppText>

              <View style={styles.toggleRow}>
                <AppText variant="rowTitle" color="primary">Enable notifications</AppText>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  disabled={saving || permissionDenied}
                  trackColor={{ false: colors.ringNotLogged, true: colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.ringNotLogged}
                />
              </View>

              {permissionDenied && enabled && (
                <View style={styles.warnBox}>
                  <AppText variant="rowSubtitle" color="danger">
                    Notification permissions are denied. Please enable them in your device settings to receive reminders.
                  </AppText>
                </View>
              )}

              {enabled && (
                <>
                  <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Notifications per day</AppText>
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
                    activeOpacity={0.7}
                    style={styles.selectBox}
                  >
                    <AppText variant="rowTitle" color="primary">{count}</AppText>
                  </TouchableOpacity>

                  {Array.from({ length: count }).map((_, index) => (
                    <View key={index} style={styles.timeBlock}>
                      <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>
                        Notification {index + 1} time
                      </AppText>
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
                <AppText variant="rowSubtitle" color="danger" style={styles.feedback}>{error}</AppText>
              ) : null}
              {saved ? (
                <AppText variant="rowSubtitle" color="success" style={styles.feedback}>{saved}</AppText>
              ) : null}

              <PrimaryButton onPress={save} disabled={saving || !canEdit} loading={saving} style={styles.saveBtn}>
                Save settings
              </PrimaryButton>
            </Card>

            <Card style={styles.spacedCard}>
              <AppText variant="cardLabel" color="primary">About</AppText>
              <AppText variant="rowSubtitle" color="secondary" style={styles.aboutText}>
                You'll receive reminders at the times you set to log your workouts. If you don't log anything after the first reminder, a badge will appear on the app icon.
              </AppText>
            </Card>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <Portal>
        <Modal
          visible={countModalVisible}
          onDismiss={() => setCountModalVisible(false)}
          contentContainerStyle={styles.modalCard}
        >
          <AppText variant="cardLabel" color="primary" style={styles.modalTitle}>
            Notifications per day
          </AppText>
          <View style={[styles.pickerFrame, { height: COUNT_ITEM_HEIGHT * 5 }]}>
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
                    style={[
                      styles.pickerItem,
                      { height: COUNT_ITEM_HEIGHT },
                      isSelected ? styles.pickerItemActive : null,
                    ]}
                  >
                    <AppText variant="numberMd" color={isSelected ? 'accent' : 'secondary'}>
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.modalActions}>
            <PrimaryButton secondary onPress={() => setCountModalVisible(false)} style={styles.modalBtn}>
              Cancel
            </PrimaryButton>
            <PrimaryButton
              secondary
              onPress={() => {
                applyCountChange(tempCount);
                setCountModalVisible(false);
              }}
              style={styles.modalBtn}
            >
              Done
            </PrimaryButton>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.base },
  subLine: { marginTop: 2, marginBottom: spacing.base },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  warnBox: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.dangerTint, borderRadius: radius.tile },
  fieldLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  selectBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.borderCard,
    borderWidth: 1,
    borderRadius: radius.tile,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  timeBlock: { marginTop: spacing.md },
  feedback: { marginTop: spacing.md },
  saveBtn: { marginTop: spacing.lg },
  spacedCard: { marginTop: spacing.md },
  aboutText: { marginTop: spacing.sm, lineHeight: 18 },
  modalCard: {
    margin: spacing.lg,
    borderRadius: radius.card,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  modalTitle: { marginBottom: spacing.base },
  pickerFrame: {
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  pickerItem: { justifyContent: 'center', alignItems: 'center' },
  pickerItemActive: { backgroundColor: colors.primaryTint },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.base, gap: spacing.md },
  modalBtn: { minWidth: 100 },
});
