import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';
import ProgressBar from '../ui/ProgressBar';

type OnboardingHeaderProps = {
  currentStep: number;
  totalSteps: number;
  showBack: boolean;
  onBack: () => void;
};

export default function OnboardingHeader({ currentStep, totalSteps, showBack, onBack }: OnboardingHeaderProps) {
  const theme = useTheme();
  const progress = currentStep / totalSteps;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backButton, { backgroundColor: theme.colors.surface }]}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Icon source="chevron-left" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} height={4} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
  },
});
