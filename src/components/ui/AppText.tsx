import React from 'react';
import { Text, TextProps, useTheme } from 'react-native-paper';
import { typography } from '../../theme/typography';
import { colors } from '../../theme/colors';

type Variant = 'title' | 'body' | 'label' | 'numberLg' | 'numberMd';

type AppTextProps = Omit<TextProps<never>, 'variant'> & {
  variant?: Variant;
  color?: 'primary' | 'secondary' | 'muted' | 'default';
};

export default function AppText({
  variant = 'body',
  color = 'default',
  style,
  ...props
}: AppTextProps) {
  const theme = useTheme();
  const typo = typography[variant];
  
  let textColor = theme.colors.onSurface;
  if (color === 'primary') {
    textColor = colors.textPrimary;
  } else if (color === 'secondary') {
    textColor = colors.textSecondary;
  } else if (color === 'muted') {
    textColor = colors.textMuted;
  }

  return (
    <Text
      {...props}
      style={[
        {
          fontSize: typo.fontSize,
          fontWeight: typo.fontWeight,
          color: textColor,
        },
        style,
      ]}
    />
  );
}
