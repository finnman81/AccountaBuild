import { useContext, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { registerPushToken } from '../../services/pushTokens';
import { syncNotifPrefsToServer } from '../../services/appSettings';

const ASKED_KEY_PREFIX = 'pushPermissionAsked';

/**
 * Registers this device's Expo push token whenever a user is signed in (so
 * cheers/nudges can reach them). Renders nothing.
 *
 * EXISTING users never see the onboarding permission prompt (it only runs for
 * new sign-ups), so before this fix they never got a token and pushes silently
 * skipped them (verified in production: only 1 real user had a token). If
 * permission is still undetermined, we request it ONCE per user (remembered in
 * AsyncStorage so we never nag) and register on grant. A user who denies is
 * left alone — they can enable later in OS Settings, and registerPushToken will
 * pick it up on the next launch.
 */
export default function PushRegistrar() {
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    void (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();

        if (status === 'undetermined' && canAskAgain) {
          const askedKey = `${ASKED_KEY_PREFIX}:${uid}`;
          const asked = await AsyncStorage.getItem(askedKey);
          if (!asked) {
            await AsyncStorage.setItem(askedKey, '1').catch(() => {});
            await Notifications.requestPermissionsAsync().catch(() => {});
          }
        }

        // Registers only if permission ended up granted (no-ops otherwise).
        await registerPushToken(uid);
        // Mirror local notification toggles so server pushes respect them.
        await syncNotifPrefsToServer(uid);
      } catch (e) {
        console.warn('[PushRegistrar] failed', e);
      }
    })();
  }, [user?.uid]);

  return null;
}
