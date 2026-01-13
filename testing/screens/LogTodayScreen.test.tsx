import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LogTodayScreen from '../../src/screens/LogTodayScreen';
import { appTheme } from '../../src/theme/theme';

describe('LogTodayScreen', () => {
  test('renders log options and navigates', () => {
    const navigate = jest.fn();
    const r = render(
      <PaperProvider theme={appTheme}>
        <LogTodayScreen
          route={{ key: 'x', name: 'LogToday', params: { groupId: 'g1' } } as any}
          navigation={{ navigate } as any}
        />
      </PaperProvider>,
    );

    fireEvent.press(r.getByText('Log workout'));
    expect(navigate).toHaveBeenCalledWith('AddWorkout', { groupId: 'g1' });
  });
});

