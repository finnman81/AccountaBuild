import { useEffect } from 'react';
import * as Updates from 'expo-updates';

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
      try {
        if (!Updates.isEnabled) return;
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
