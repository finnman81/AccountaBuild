import React, { useContext, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { addCaloriesLog, addWorkoutLog, type LogType, type MealType, type WorkoutType } from '../../services/logs';
import { addWeightEverywhere } from '../../services/logEdits';
import { notifyLogSaved, notifyFirstLog } from '../../services/fpEvents';
import { useMyUnits } from '../../hooks/useMyUnits';
import { kgToLb, lbToKg } from '../../utils/formatters';
import { todayYYYYMMDD, yesterdayYYYYMMDD } from '../../utils/dates';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import PrimaryButton from '../ui/PrimaryButton';
import SegmentedControl from '../ui/SegmentedControl';
import RulerDial from './RulerDial';

type Props = {
  initialType?: LogType;
  onClose?: () => void;
  onSaved?: () => void;
  /** Photo logging is a separate flow (upload); the composer hands off to it. */
  onOpenPhoto?: () => void;
};

const LAST_VALUES_KEY_PREFIX = 'logComposerLast';

type LastValues = { weightLb?: number; calories?: number; duration?: number; workoutType?: WorkoutType; meal?: MealType };

const MODE_OPTIONS: ReadonlyArray<{ value: LogType; label: string }> = [
  { value: 'calories', label: 'Calories' },
  { value: 'workout', label: 'Workout' },
  { value: 'weight', label: 'Weight' },
  { value: 'photo', label: 'Photo' },
];

const WORKOUTS: Array<{ value: WorkoutType; label: string }> = [
  { value: 'weightLifting', label: 'Lift' },
  { value: 'running', label: 'Run' },
  { value: 'walking', label: 'Walk' },
  { value: 'other', label: 'Other' },
  { value: 'bike', label: 'Bike' },
  { value: 'swim', label: 'Swim' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'rowing', label: 'Row' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'stairMaster', label: 'Stairs' },
  { value: 'tennis', label: 'Tennis' },
];

const MEALS: Array<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'all', label: 'All day' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryOnDark : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

/** Big tappable value that flips to a numeric TextInput (tap-to-type fallback). */
function Hero({
  value,
  decimals,
  unit,
  onCommit,
  onStep,
}: {
  value: number;
  decimals: 0 | 1;
  unit: string;
  onCommit: (v: number) => void;
  /** Optional −/+ stepper (a guaranteed fallback if the ruler drag misfires). */
  onStep?: (delta: number) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  if (typing) {
    return (
      <View style={styles.heroRow}>
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
            setTyping(false);
          }}
          onSubmitEditing={() => {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
            setTyping(false);
          }}
          style={styles.heroInput}
          placeholder={value.toFixed(decimals)}
          placeholderTextColor={colors.faint}
        />
        <Text style={styles.heroUnit}> {unit}</Text>
      </View>
    );
  }

  const s = value.toFixed(decimals);
  const [intPart, decPart] = s.split('.');
  return (
    <View>
      <View style={styles.heroRowWithSteppers}>
        {onStep && (
          <Pressable onPress={() => onStep(-1)} hitSlop={10} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Decrease">
            <Text style={styles.stepGlyph}>−</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setDraft(s);
            setTyping(true);
          }}
          accessibilityRole="button"
          accessibilityHint="Tap to type an exact value"
          style={styles.heroRow}
        >
          <Text style={styles.heroInt}>{intPart}</Text>
          {decPart != null && <Text style={styles.heroDec}>.{decPart}</Text>}
          <Text style={styles.heroUnit}> {unit}</Text>
        </Pressable>
        {onStep && (
          <Pressable onPress={() => onStep(1)} hitSlop={10} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Increase">
            <Text style={styles.stepGlyph}>+</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.heroHint}>Tap the number to type it, drag the ruler, or use −/+</Text>
    </View>
  );
}

export default function LogComposer({ initialType = 'weight', onClose, onSaved, onOpenPhoto }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const units = useMyUnits();

  const [mode, setMode] = useState<LogType>(initialType);
  // Weight is kept in lb internally (the storage unit everywhere in Firestore)
  // and converted to the viewer's units only at the display boundary.
  const [weightLb, setWeightLb] = useState(180);
  const [duration, setDuration] = useState(45);
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weightLifting');
  const [calories, setCalories] = useState(2000);
  const [meal, setMeal] = useState<MealType>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logDay, setLogDay] = useState<'today' | 'yesterday'>('today');
  const restoredRef = useRef(false);
  const lastSavedWeightRef = useRef<number | null>(null);

  // Prefill from the user's last-entered values so nobody drags the dial from
  // 180 lb every single day.
  useEffect(() => {
    if (!user?.uid || restoredRef.current) return;
    restoredRef.current = true;
    AsyncStorage.getItem(`${LAST_VALUES_KEY_PREFIX}:${user.uid}`)
      .then((raw) => {
        if (!raw) return;
        const last = JSON.parse(raw) as LastValues;
        if (Number.isFinite(last.weightLb) && (last.weightLb as number) > 0) {
          setWeightLb(last.weightLb as number);
          lastSavedWeightRef.current = last.weightLb as number;
        }
        if (Number.isFinite(last.calories) && (last.calories as number) > 0) setCalories(last.calories as number);
        if (Number.isFinite(last.duration) && (last.duration as number) > 0) setDuration(last.duration as number);
        if (last.workoutType) setWorkoutType(last.workoutType);
        if (last.meal) setMeal(last.meal);
      })
      .catch(() => {});
  }, [user?.uid]);

  const metric = units === 'metric';
  const weightUnit = metric ? 'kg' : 'lb';
  const displayWeight = metric ? lbToKg(weightLb) : weightLb;
  const weightMin = metric ? 23 : 50;
  const weightMax = metric ? 227 : 500;
  const commitDisplayWeight = (v: number) => {
    const clamped = Math.max(weightMin, Math.min(weightMax, v));
    setWeightLb(metric ? kgToLb(clamped) : Math.round(clamped * 10) / 10);
  };

  const date = logDay === 'today' ? todayYYYYMMDD() : yesterdayYYYYMMDD();
  const canSave = !!user?.uid && !!activeGroupId && mode !== 'photo' && !saving;

  async function handleSave() {
    if (!user?.uid || !activeGroupId) return;
    // Sanity-check absurd weigh-ins BEFORE saving: a fat-fingered dial value
    // cascades (profile weight, weight-goal completion, FP). Prod case: a
    // 212 lb user saving the dial-default 180.
    if (mode === 'weight' && lastSavedWeightRef.current != null) {
      const jump = Math.abs(weightLb - lastSavedWeightRef.current);
      if (jump > 15) {
        const prevDisp = metric ? `${lbToKg(lastSavedWeightRef.current)} kg` : `${lastSavedWeightRef.current} lb`;
        const nowDisp = metric ? `${lbToKg(weightLb)} kg` : `${Math.round(weightLb * 10) / 10} lb`;
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Big change — sure?',
            `Your last weigh-in was ${prevDisp}; this one is ${nowDisp}. Save anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Save', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const weight = Math.round(weightLb * 10) / 10;
      let savedRef: { id: string } | null = null;
      if (mode === 'weight') savedRef = await addWeightEverywhere({ groupId: activeGroupId, uid: user.uid, weight, date });
      else if (mode === 'workout') savedRef = await addWorkoutLog({ groupId: activeGroupId, uid: user.uid, workoutType, durationMinutes: duration, date });
      else if (mode === 'calories') savedRef = await addCaloriesLog({ groupId: activeGroupId, uid: user.uid, calories, meal, date });
      if (mode === 'weight') lastSavedWeightRef.current = weight;
      const last: LastValues = { weightLb: weight, calories, duration, workoutType, meal };
      void AsyncStorage.setItem(`${LAST_VALUES_KEY_PREFIX}:${user.uid}`, JSON.stringify(last)).catch(() => {});
      notifyLogSaved(savedRef ? { groupId: activeGroupId, logId: savedRef.id } : undefined);
      // First-ever log: fire a one-time celebration. Guard on a per-user flag so
      // it never replays. Set it BEFORE notifying so a double-tap can't double-fire.
      void (async () => {
        const key = `firstLogCelebrated:${user.uid}`;
        const seen = await AsyncStorage.getItem(key).catch(() => 'seen');
        if (seen) return;
        await AsyncStorage.setItem(key, new Date().toISOString()).catch(() => {});
        notifyFirstLog();
      })();
      onSaved?.();
      onClose?.();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>LOG · {mode.toUpperCase()}</Text>
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: colors.textSecondary, fontSize: 18 }}>✕</Text>
        </Pressable>
      </View>

      <SegmentedControl variant="primary" value={mode} onChange={(m) => setMode(m as LogType)} options={MODE_OPTIONS} style={{ marginTop: 8 }} />

      <ScrollView contentContainerStyle={{ paddingVertical: 28 }} keyboardShouldPersistTaps="handled">
        {mode === 'weight' && (
          <View style={styles.body}>
            <Hero
              value={displayWeight}
              decimals={1}
              unit={weightUnit}
              onCommit={commitDisplayWeight}
              onStep={(d) => commitDisplayWeight(Math.round((displayWeight + d) * 10) / 10)}
            />
            <RulerDial value={displayWeight} onChange={commitDisplayWeight} min={weightMin} max={weightMax} step={0.1} majorEvery={10} />
          </View>
        )}

        {mode === 'workout' && (
          <View style={styles.body}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {WORKOUTS.map((w) => (
                <Chip key={w.value} label={w.label} active={workoutType === w.value} onPress={() => setWorkoutType(w.value)} />
              ))}
            </ScrollView>
            <View style={{ height: 20 }} />
            <Hero
              value={duration}
              decimals={0}
              unit="min"
              onCommit={(v) => setDuration(Math.max(1, Math.min(300, Math.round(v))))}
              onStep={(d) => setDuration((x) => Math.max(1, Math.min(300, x + d * 5)))}
            />
            <RulerDial value={duration} onChange={setDuration} min={1} max={300} step={1} majorEvery={15} />
          </View>
        )}

        {mode === 'calories' && (
          <View style={styles.body}>
            <Hero
              value={calories}
              decimals={0}
              unit="kcal"
              onCommit={(v) => setCalories(Math.max(0, Math.min(6000, Math.round(v))))}
              onStep={(d) => setCalories((x) => Math.max(0, Math.min(6000, x + d * 50)))}
            />
            <RulerDial value={calories} onChange={setCalories} min={0} max={6000} step={10} majorEvery={5} />
            <View style={{ height: 20 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {MEALS.map((m) => (
                <Chip key={m.value} label={m.label} active={meal === m.value} onPress={() => setMeal(m.value)} />
              ))}
            </ScrollView>
          </View>
        )}

        {mode === 'photo' && (
          <View style={[styles.body, { alignItems: 'center', paddingVertical: 24 }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 16 }}>
              Add a progress photo to today's log.
            </Text>
            <PrimaryButton onPress={onOpenPhoto ?? (() => {})}>Choose photo</PrimaryButton>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {mode !== 'photo' && (
        <View style={styles.dateRow}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Date</Text>
          <View style={styles.dateToggle}>
            {(['today', 'yesterday'] as const).map((d) => {
              const active = logDay === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setLogDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryOnDark : colors.textSecondary }}>
                    {d === 'today' ? 'Today' : 'Yesterday'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        )}
        {error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8 }}>{error}</Text>}
        {!activeGroupId && !!user?.uid && (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
            Join a group to start logging — logs live with your crew.
          </Text>
        )}
        {mode !== 'photo' && (
          <PrimaryButton onPress={handleSave} loading={saving} disabled={!canSave}>
            {`Save ${mode}`}
          </PrimaryButton>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: 52 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  body: { minHeight: 180, justifyContent: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 8 },
  heroRowWithSteppers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, lineHeight: 28 },
  heroInt: { fontSize: 72, fontWeight: '800', letterSpacing: -2, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  heroDec: { fontSize: 72, fontWeight: '800', letterSpacing: -2, color: colors.faint, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 20, fontWeight: '600', color: colors.textSecondary },
  heroHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  heroInput: { fontSize: 72, fontWeight: '800', color: colors.textPrimary, minWidth: 160, textAlign: 'center', padding: 0 },
  chipRow: { gap: 10, paddingHorizontal: 2 },
  chip: { height: 40, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chipActive: { backgroundColor: colors.primaryTint, borderColor: 'rgba(62,139,255,0.5)' },
  chipIdle: { backgroundColor: colors.surface2, borderColor: 'transparent' },
  footer: { paddingBottom: 28, paddingTop: 8 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 52,
    marginBottom: 12,
  },
  dateToggle: { flexDirection: 'row', gap: 6 },
  dateChip: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  dateChipActive: { backgroundColor: colors.primary },
});
