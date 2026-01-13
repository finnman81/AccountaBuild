import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import PrimaryButton from '../../src/components/ui/PrimaryButton';
import { appTheme } from '../../src/theme/theme';

describe('PrimaryButton', () => {
  test('renders and calls onPress', () => {
    const onPress = jest.fn();
    const r = render(
      <PaperProvider theme={appTheme}>
        <PrimaryButton onPress={onPress}>Tap me</PrimaryButton>
      </PaperProvider>,
    );

    fireEvent.press(r.getByText('Tap me'));
    expect(onPress).toHaveBeenCalled();
  });
});

