import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase/firebase';

const isExpoGo = Constants.appOwnership === 'expo';

function resolveProjectId(): string | undefined {
  const c: any = Constants;
  return c?.expoConfig?.extra?.eas?.projectId ?? c?.easConfig?.projectId ?? undefined;
}

/**
 * Register this device's Expo push token so teammates' cheers/nudges can reach
 * it. Stored (privately) on users/{uid}; the Cloud Function reads it server-side
 * to send — clients never read another user's token. No-op without granted
 * permission (we don't prompt here — onboarding/Settings own the prompt) or in
 * Expo Go.
 */
export async function registerPushToken(uid: string): Promise<void> {
  if (!uid || isExpoGo) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      // A channel is required for heads-up notifications on Android.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }

    const projectId = resolveProjectId();
    const resp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = resp?.data;
    if (!token) return;

    await setDoc(
      doc(db, 'users', uid),
      { expoPushToken: token, pushPlatform: Platform.OS, pushTokenUpdatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[Push] registerPushToken failed', e);
  }
}
