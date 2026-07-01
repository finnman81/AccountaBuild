import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme, Card } from 'react-native-paper';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';

type EvidenceCardProps = {
  primaryStat: string;
  statHighlight: string;
  citation: string;
  supportingLine?: string;
};

export default function EvidenceCard({ primaryStat, statHighlight, citation, supportingLine }: EvidenceCardProps) {
  const theme = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    opacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(200, withTiming(0, { duration: 600 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content style={styles.content}>
          <Text variant="bodyLarge" style={[styles.primaryText, { color: theme.colors.onSurface }]}>
            {primaryStat.split(statHighlight).map((part, index, array) => {
              if (index === array.length - 1) {
                return <React.Fragment key={index}>{part}</React.Fragment>;
              }
              return (
                <React.Fragment key={index}>
                  {part}
                  <Text style={[styles.highlight, { color: theme.colors.primary }]}>{statHighlight}</Text>
                </React.Fragment>
              );
            })}
          </Text>
          
          <Text variant="bodySmall" style={[styles.citation, { color: theme.colors.onSurfaceVariant }]}>
            {citation}
          </Text>
          
          {supportingLine && (
            <Text variant="bodySmall" style={[styles.supportingText, { color: theme.colors.onSurfaceVariant }]}>
              {supportingLine}
            </Text>
          )}
        </Card.Content>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    elevation: 0,
  },
  content: {
    padding: 20,
    gap: 12,
  },
  primaryText: {
    lineHeight: 26,
    fontWeight: '500',
  },
  highlight: {
    fontWeight: '700',
  },
  citation: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  supportingText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.8,
  },
});
