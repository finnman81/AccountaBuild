import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/** Root nav ref so non-screen code (push notification handlers) can navigate. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// A deep-link request that arrives before NavigationContainer has mounted
// (e.g. app cold-started by tapping a push) is queued here and flushed once
// the container reports ready via AppNavigator's onReady.
let pending: (() => void) | null = null;

function runOrQueue(action: () => void) {
  if (navigationRef.isReady()) action();
  else pending = action;
}

export function flushPendingNavigation() {
  if (!pending) return;
  const action = pending;
  pending = null;
  action();
}

/** Deep-link to the Activity feed (used by cheer/nudge push taps). */
export function navigateToActivity() {
  runOrQueue(() => {
    navigationRef.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'Activity' } } as any);
  });
}

/** Deep-link to a group's chat (used by chat/team-activity push taps). */
export function navigateToGroupChat(groupId: string) {
  runOrQueue(() => {
    navigationRef.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'GroupChat', params: { groupId } } } as any);
  });
}
