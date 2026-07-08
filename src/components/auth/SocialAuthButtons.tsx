import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';

type Props = {
  onApple: () => void;
  onGoogle: () => void;
};

/**
 * Apple (white) + Google (surface) continue buttons for the auth screens
 * (design 03). Real OAuth is not wired yet — the parent decides what the
 * handlers do (currently a "coming soon" prompt).
 */
export default function SocialAuthButtons({ onApple, onGoogle }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={0.85} onPress={onApple} style={[styles.button, styles.apple]}>
        <Icon source="apple" size={20} color="#000000" />
        <AppText variant="rowTitle" style={styles.appleText}>Continue with Apple</AppText>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.85} onPress={onGoogle} style={[styles.button, styles.google]}>
        <Icon source="google" size={18} color={colors.textPrimary} />
        <AppText variant="rowTitle" color="primary">Continue with Google</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.button,
  },
  apple: { backgroundColor: '#FFFFFF' },
  appleText: { color: '#000000' },
  google: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
});
