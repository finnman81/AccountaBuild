import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { addCaloriesLog, addWeightLog, addWorkoutLog, type LogType, type MealType, type WorkoutType } from '../../services/logs';
import { todayYYYYMMDD } from '../../utils/dates';
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
  { value: 'bike', label: 'Bike' },
  { value: 'swim', label: 'Swim' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'rowing', label: 'Row' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'stairMaster', label: 'Stairs' },
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
}: {
  value: number;
  decimals: 0 | 1;
  unit: string;
  onCommit: (v: number) => void;
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
      <Text style={styles.heroHint}>Tap the number to type it</Text>
    </View>
  );
}

export default function LogComposer({ initialType = 'weight', onClose, onSaved, onOpenPhoto }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();

  const [mode, setMode] = useState<LogType>(initialType);
  const [weight, setWeight] = useState(180);
  const [duration, setDuration] = useState(45);
  const [workoutType, setWorkoutType] = useState<WorkoutType>('weightLifting');
  const [calories, setCalories] = useState(2000);
  const [meal, setMeal] = useState<MealType>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = todayYYYYMMDD();
  const canSave = !!user?.uid && !!activeGroupId && mode !== 'photo' && !saving;

  async function handleSave() {
    if (!user?.uid || !activeGroupId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'weight') await addWeightLog({ groupId: activeGroupId, uid: user.uid, weight, date });
      else if (mode === 'workout') await addWorkoutLog({ groupId: activeGroupId, uid: user.uid, workoutType, durationMinutes: duration, date });
      else if (mode === 'calories') await addCaloriesLog({ groupId: activeGroupId, uid: user.uid, calories, meal, date });
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
            <Hero value={weight} decimals={1} unit="lb" onCommit={(v) => setWeight(Math.max(50, Math.min(500, v)))} />
            <RulerDial value={weight} onChange={setWeight} min={50} max={500} step={0.1} majorEvery={10} />
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
            <Hero value={duration} decimals={0} unit="min" onCommit={(v) => setDuration(Math.max(1, Math.min(300, Math.round(v))))} />
            <RulerDial value={duration} onChange={setDuration} min={1} max={300} step={1} majorEvery={15} />
          </View>
        )}

        {mode === 'calories' && (
          <View style={styles.body}>
            <Hero value={calories} decimals={0} unit="kcal" onCommit={(v) => setCalories(Math.max(0, Math.min(6000, Math.round(v))))} />
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
        <View style={styles.dateRow}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Date</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Today</Text>
        </View>
        {error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8 }}>{error}</Text>}
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
    height: 52,
    marginBottom: 12,
  },
});
