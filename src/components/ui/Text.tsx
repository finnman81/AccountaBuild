import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { Text as PaperText, type TextProps } from 'react-native-paper';

import { resolveFont } from '../../theme/fonts';

/**
 * The app's Text. Use this, not Paper's or React Native's: it turns
 * `fontWeight` into the matching font file (see theme/fonts.ts), so every
 * string renders in Inter or the display face.
 */
export default function Text({ style, ...props }: TextProps<never>) {
  const font = resolveFont(StyleSheet.flatten(style) as TextStyle | undefined, props.variant != null);
  return <PaperText {...props} style={font ? [style, font] : style} />;
}
