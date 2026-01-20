import { useEffect } from 'react';
import * as Updates from 'expo-updates';

export default function SafeUpdateChecker() {
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!Updates.isEnabled) return;
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) {
          await Updates.reloadAsync();
        }
      } catch (error) {
        console.warn('[SafeUpdateChecker] Update check failed:', error);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
