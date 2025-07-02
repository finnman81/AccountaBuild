/**
 * Accountabuild App
 * Fitness-focused social accountability app
 *
 * @format
 */

import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import AppNavigator from './navigation/AppNavigator';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppNavigator />
    </>
  );
}

export default App;
