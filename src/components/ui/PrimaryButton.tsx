import React from 'react';
import { Button } from 'react-native-paper';

import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { primaryButtonShadow } from '../../theme/shadows';

type Props = React.ComponentProps<typeof Button> & {
  /** Secondary CTAs are shorter (46–48) and drop the glow. */
  secondary?: boolean;
};

export default function PrimaryButton({ secondary = false, style, ...props }: Props) {
  return (
    <Button
      mode="contained"
      uppercase={false}
      labelStyle={{ ...typography.button, marginVertical: 0 }}
      contentStyle={{ height: secondary ? 48 : 54, justifyContent: 'center' }}
      style={[{ borderRadius: radius.button }, secondary ? null : primaryButtonShadow, style]}
      {...props}
    />
  );
}
