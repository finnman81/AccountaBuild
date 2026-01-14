import React from 'react';
import { View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { todayYYYYMMDD, yesterdayYYYYMMDD } from '../../utils/dates';

export default function LogDateField(props: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        label="Log date (YYYY-MM-DD)"
        value={props.value}
        onChangeText={props.onChange}
        disabled={props.disabled}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={todayYYYYMMDD()}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button mode="outlined" compact disabled={props.disabled} onPress={() => props.onChange(todayYYYYMMDD())}>
          Today
        </Button>
        <Button mode="outlined" compact disabled={props.disabled} onPress={() => props.onChange(yesterdayYYYYMMDD())}>
          Yesterday
        </Button>
      </View>
    </View>
  );
}

