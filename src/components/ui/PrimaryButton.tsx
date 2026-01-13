import React from 'react';
import { Button } from 'react-native-paper';

type Props = React.ComponentProps<typeof Button>;

export default function PrimaryButton(props: Props) {
  return (
    <Button
      mode="contained"
      uppercase={false}
      contentStyle={{ height: 48, justifyContent: 'center' }}
      style={[{ borderRadius: 12 }, props.style]}
      {...props}
    />
  );
}

