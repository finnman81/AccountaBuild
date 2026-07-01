import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, FadeInDown } from 'react-native-reanimated';
import RankBadge from '../mmr/RankBadge';
import type { Tier } from '../../mmr/types';

type WelcomeHeroCardProps = {
  rankLabel: Tier;
  workouts: { current: number; target: number };
  calories: { current: number; target: number };
  weightLogged: boolean;
};

export default function WelcomeHeroCard({ rankLabel, workouts, calories, weightLogged }: WelcomeHeroCardProps) {
  const theme = useTheme();

  // Animation values for score rows
  const row1Opacity = useSharedValue(0);
  const row2Opacity = useSharedValue(0);
  const row3Opacity = useSharedValue(0);

  useEffect(() => {
    // Stagger the score row animations
    row1Opacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    row2Opacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    row3Opacity.value = withDelay(600, withTiming(1, { duration: 400 }));
  }, []);

  const row1Style = useAnimatedStyle(() => ({
    opacity: row1Opacity.value,
  }));

  const row2Style = useAnimatedStyle(() => ({
    opacity: row2Opacity.value,
  }));

  const row3Style = useAnimatedStyle(() => ({
    opacity: row3Opacity.value,
  }));

  return (
    <Animated.View 
      entering={FadeInDown.duration(600).delay(200)}
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <RankBadge tier={rankLabel} size={56} />
        </View>
        
        <View style={styles.rightSection}>
          <Text variant="labelMedium" style={[styles.weeklyScoreTitle, { color: theme.colors.onSurfaceVariant }]}>
            Weekly Score
          </Text>
          
          <Animated.View style={[styles.scoreRow, row1Style]}>
            <Text variant="bodySmall" style={[styles.scoreLabel, { color: theme.colors.onSurfaceVariant }]}>
              Workouts:
            </Text>
            <Text variant="bodySmall" style={[styles.scoreValue, { color: theme.colors.onSurface }]}>
              {workouts.current} / {workouts.target}
            </Text>
          </Animated.View>
          
          <Animated.View style={[styles.scoreRow, row2Style]}>
            <Text variant="bodySmall" style={[styles.scoreLabel, { color: theme.colors.onSurfaceVariant }]}>
              Calories:
            </Text>
            <Text variant="bodySmall" style={[styles.scoreValue, { color: theme.colors.onSurface }]}>
              {calories.current} / {calories.target}
            </Text>
          </Animated.View>
          
          <Animated.View style={[styles.scoreRow, row3Style]}>
            <Text variant="bodySmall" style={[styles.scoreLabel, { color: theme.colors.onSurfaceVariant }]}>
              Weight:
            </Text>
            <Text variant="bodySmall" style={[styles.scoreValue, { color: theme.colors.onSurface }]}>
              {weightLogged ? 'Logged' : 'Not logged'}
            </Text>
          </Animated.View>
        </View>
      </View>
      
      <Text variant="bodySmall" style={[styles.tagline, { color: theme.colors.onSurfaceVariant }]}>
        Your consistency becomes rank.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  leftSection: {
    marginRight: 16,
  },
  rightSection: {
    flex: 1,
    gap: 6,
  },
  weeklyScoreTitle: {
    marginBottom: 4,
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreLabel: {
    flex: 1,
  },
  scoreValue: {
    fontWeight: '500',
  },
  tagline: {
    marginTop: 8,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.8,
  },
});
