import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { Card as PaperCard, useTheme } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacingDefaults } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadow } from '../../theme/shadows';

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  useShadow?: boolean;
  useBorder?: boolean;
  /**
   * hero: the one card a screen is about. Lighter, no border, big radius.
   * standard: supporting content. Hairline border.
   * (The third tier is no card at all: rails and lists sit on the page.)
   */
  tier?: 'hero' | 'standard';
  /** No side padding: for children that pad themselves (Card.Content). */
  flush?: boolean;
};

export default function Card({ children, style, useShadow = false, useBorder = true, tier = 'standard', flush = false }: CardProps) {
  const hero = tier === 'hero';
  const theme = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: hero ? colors.surfaceHero : colors.surface,
    borderRadius: hero ? radius.card : radius.tile,
    padding: spacingDefaults.cardPadding,
    ...(flush && { paddingHorizontal: 0 }),
    ...(useShadow && shadow),
    ...(useBorder && !hero && {
      borderWidth: 1,
      borderColor: colors.borderCard,
    }),
  };

  return (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  );
}

// Re-export PaperCard subcomponents for compatibility
Card.Title = PaperCard.Title;
Card.Content = PaperCard.Content;
Card.Actions = PaperCard.Actions;
