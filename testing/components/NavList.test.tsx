import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NavList from '../../src/components/ui/NavList';
import { appTheme } from '../../src/theme/theme';

describe('NavList', () => {
  test('renders items and calls handler', () => {
    const onPress = jest.fn();
    const r = render(
      <PaperProvider theme={appTheme}>
        <NavList items={[{ title: 'Profile', icon: 'account', onPress }]} />
      </PaperProvider>,
    );

    fireEvent.press(r.getByText('Profile'));
    expect(onPress).toHaveBeenCalled();
  });
});

