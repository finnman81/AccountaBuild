import { useContext, useEffect } from 'react';

import { AuthContext } from '../../store/AuthContext';
import { registerPushToken } from '../../services/pushTokens';

/**
 * Registers this device's Expo push token whenever a user is signed in (so
 * cheers/nudges can reach them). Renders nothing. Safe to call repeatedly — it
 * no-ops without granted permission and just refreshes the stored token.
 */
export default function PushRegistrar() {
  const { user } = useContext(AuthContext);
  useEffect(() => {
    if (!user?.uid) return;
    void registerPushToken(user.uid);
  }, [user?.uid]);
  return null;
}
