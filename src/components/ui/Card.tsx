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
};

export default function Card({ children, style, useShadow = false, useBorder = false }: CardProps) {
  const theme = useTheme();
  
  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacingDefaults.cardPadding,
    ...(useShadow && shadow),
    ...(useBorder && {
      borderWidth: 1,
      borderColor: colors.divider,
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
