import React, { useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import AppText from '../ui/AppText';
import PrimaryButton from '../ui/PrimaryButton';
import SegmentedControl from '../ui/SegmentedControl';
import TextField from '../ui/TextField';
import { colors, radius, spacing } from '../../theme';
import { feetInchesError, joinFeetInches } from '../../utils/height';

export type EstimateStats = { sex: 'male' | 'female' | 'other' | null; age: number; heightIn: number; weightLb: number };

type Props = {
  units: 'imperial' | 'metric';
  /** What the profile already has (pounds / inches). Missing weight adds a weight field. */
  initial: { sex?: 'male' | 'female' | 'other' | null; age?: number | null; heightIn?: number | null; weightLb?: number | null };
  onEstimate: (stats: EstimateStats) => void;
};

/**
 * Optional: turn the starter calorie number into a personal estimate. Sits
 * under the calorie target, closed. Asks for sex, age and height (and weight
 * when it was skipped earlier), which is everything the estimate needs.
 */
export default function PersonalEstimate({ units, initial, onEstimate }: Props) {
  const [open, setOpen] = useState(false);
  const [sex, setSex] = useState<'male' | 'female' | 'other' | ''>(initial.sex ?? '');
  const [age, setAge] = useState(initial.age ? String(initial.age) : '');
  const [ft, setFt] = useState(initial.heightIn ? String(Math.floor(initial.heightIn / 12)) : '');
  const [inch, setInch] = useState(initial.heightIn ? String(Math.round(initial.heightIn % 12)) : '');
  const [cm, setCm] = useState(initial.heightIn ? String(Math.round(initial.heightIn * 2.54)) : '');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inchRef = useRef<any>(null);
  const needWeight = !(Number(initial.weightLb) > 0);

  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)} style={styles.link} accessibilityRole="button" activeOpacity={0.7}>
        <AppText variant="rowTitle" color="accent">Get a personal estimate  ›</AppText>
        <AppText variant="rowSubtitle" color="muted">Takes your height and age. Optional.</AppText>
      </TouchableOpacity>
    );
  }

  const submit = () => {
    const a = Number(age);
    if (!age.trim() || !Number.isFinite(a) || a < 13 || a > 99) return setError('Enter an age from 13 to 99.');
    let heightIn: number;
    if (units === 'imperial') {
      const e = feetInchesError(ft, inch);
      if (e) return setError(e);
      heightIn = joinFeetInches(ft, inch) ?? 0;
    } else {
      const c = Number(cm);
      if (!Number.isFinite(c) || c < 120 || c > 230) return setError('Enter a height from 120 to 230 cm.');
      heightIn = c * 0.393701;
    }
    let weightLb = Number(initial.weightLb);
    if (needWeight) {
      const w = Number(weight);
      const ok = Number.isFinite(w) && (units === 'imperial' ? w >= 80 && w <= 450 : w >= 35 && w <= 205);
      if (!ok) return setError(units === 'imperial' ? 'Enter a weight from 80 to 450 lbs.' : 'Enter a weight from 35 to 205 kg.');
      weightLb = units === 'metric' ? w * 2.20462 : w;
    }
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onEstimate({ sex: sex || null, age: a, heightIn, weightLb });
    setOpen(false);
  };

  return (
    <View style={styles.box}>
      <SegmentedControl
        variant="primary"
        value={sex}
        onChange={(v) => setSex(v as any)}
        options={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ]}
      />
      <View style={styles.rowFields}>
        <View style={styles.col}>
          <TextField label="Age" value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" />
        </View>
        {units === 'imperial' ? (
          <>
            <View style={styles.col}>
              <TextField
                label="Feet"
                value={ft}
                onChangeText={(t) => {
                  // One digit is feet; anything typed after it spills into inches.
                  const d = t.replace(/[^0-9]/g, '');
                  setFt(d.slice(0, 1));
                  if (d.length > 1) setInch(d.slice(1, 3));
                  if (d) setTimeout(() => inchRef.current?.focus(), 60);
                }}
                keyboardType="number-pad"
                placeholder="5"
              />
            </View>
            <View style={styles.col}>
              <TextField label="Inches" value={inch} onChangeText={(t) => setInch(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="10" ref={inchRef} />
            </View>
          </>
        ) : (
          <View style={styles.col}>
            <TextField label="Height (cm)" value={cm} onChangeText={(t) => setCm(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
          </View>
        )}
      </View>
      {needWeight ? (
        <TextField
          label={`Weight (${units === 'imperial' ? 'lbs' : 'kg'})`}
          value={weight}
          onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
      ) : null}
      {error ? <AppText variant="rowSubtitle" color="danger">{error}</AppText> : null}
      <PrimaryButton secondary onPress={submit}>Use my estimate</PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { marginTop: spacing.sm, marginLeft: spacing.xs, gap: 2, paddingVertical: spacing.xs },
  box: {
    marginTop: spacing.sm,
    padding: spacing.base,
    gap: spacing.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    backgroundColor: colors.surface,
  },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
});
