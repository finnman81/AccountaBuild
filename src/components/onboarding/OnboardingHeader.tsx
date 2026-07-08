import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';

import ProgressBar from '../ui/ProgressBar';
import AppText from '../ui/AppText';
import { colors, spacing, radius } from '../../theme';

type OnboardingHeaderProps = {
  currentStep: number;
  totalSteps: number;
  showBack: boolean;
  onBack: () => void;
  /** Show the "n/total" step label on the right (design 02). */
  showStepLabel?: boolean;
};

export default function OnboardingHeader({ currentStep, totalSteps, showBack, onBack, showStepLabel = true }: OnboardingHeaderProps) {
  const progress = currentStep / totalSteps;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
          >
            <Icon source="chevron-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} height={5} />
        </View>
        {showStepLabel && (
          <AppText variant="label" color="muted" style={styles.stepLabel}>
            {currentStep}/{totalSteps}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
  },
  stepLabel: {
    minWidth: 28,
    textAlign: 'right',
  },
});
