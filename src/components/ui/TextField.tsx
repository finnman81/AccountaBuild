import React, { forwardRef, useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, TextInputProps, ViewStyle } from 'react-native';
import { Icon } from 'react-native-paper';

import AppText from './AppText';
import { colors, radius, spacing } from '../../theme';

type Props = TextInputProps & {
  /** Optional label rendered above the field. */
  label?: string;
  /** Toggle a password reveal eye. */
  secure?: boolean;
  /** Error message rendered below the field (also turns the border red). */
  error?: string;
  containerStyle?: ViewStyle;
};

/**
 * Midnight Blue text field: 52px surface2 box, blue focus border, optional label
 * and password reveal. Reused across auth, onboarding, and edit-profile forms.
 */
const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, secure, error, containerStyle, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderCard;

  return (
    <View style={containerStyle}>
      {label ? (
        <AppText variant="eyebrow" color="muted" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, { borderColor }]}>
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Icon source={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <AppText variant="rowSubtitle" color="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: radius.tile,
    borderWidth: 1,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.base,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.md,
  },
  error: { marginTop: spacing.xs },
});
