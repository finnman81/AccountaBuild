import React from 'react';
import { Button } from 'react-native-paper';

import { radius } from '../../theme/radius';
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
      labelStyle={{ fontSize: 16, fontWeight: '600' }}
      contentStyle={{ height: secondary ? 48 : 54, justifyContent: 'center' }}
      style={[{ borderRadius: radius.button }, secondary ? null : primaryButtonShadow, style]}
      {...props}
    />
  );
}
