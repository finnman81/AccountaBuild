import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '../../firebase/firebase';
import { whenAppSettled } from '../../services/startupGate';

const LANE_KEY = 'updateLane';

/**
 * Preview lane: accounts listed in config/app.previewUids take their updates
 * from the "preview" channel, so a change can reach a few phones before
 * everyone. Everyone else stays on the channel the build shipped with.
 *
 * Publish to the lane with `eas update --branch preview`. Publish to
 * production too once the change is approved; a phone on the lane no longer
 * sees production updates.
 *
 * Any failure here leaves the phone on its current channel.
 */
async function applyUpdateLane(): Promise<void> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snap = await getDoc(doc(db, 'config', 'app'));
    const uids: unknown = snap.exists() ? (snap.data() as any)?.previewUids : null;
    const onLane = Array.isArray(uids) && uids.includes(uid);
    const was = await AsyncStorage.getItem(LANE_KEY);
    if (onLane) {
      Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': 'preview' });
      if (was !== 'preview') await AsyncStorage.setItem(LANE_KEY, 'preview');
    } else if (was === 'preview') {
      Updates.setUpdateRequestHeadersOverride(null);
      await AsyncStorage.removeItem(LANE_KEY);
    }
  } catch (error) {
    console.warn('[SafeUpdateChecker] Update lane check failed:', error);
  }
}

/**
 * Silently fetch OTA updates in the background; they apply on the NEXT cold
 * start (expo-updates loads the newest downloaded bundle at startup).
 *
 * Deliberately NO reloadAsync: reloading mid-launch made the app visibly
 * restart right after opening — with frequent OTA publishes, users saw a
 * stack of "loading screens" on every open. One-launch-later is the
 * industry-standard tradeoff.
 */
export default function SafeUpdateChecker() {
  useEffect(() => {
    void (async () => {
      await whenAppSettled(8000);
      try {
        if (!Updates.isEnabled) return;
        await applyUpdateLane();
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        await Updates.fetchUpdateAsync();
      } catch (error) {
        console.warn('[SafeUpdateChecker] Update check failed:', error);
      }
    })();
  }, []);

  return null;
}
