import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useContext } from 'react';
import Constants from 'expo-constants';
import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeHealthSettings, type HealthSettings } from '../../services/healthSettings';

/**
 * Component that automatically syncs health data when app comes to foreground
 * and user has health sync enabled
 */
export default function HealthAutoSync() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const appState = useRef(AppState.currentState);
  const settingsRef = useRef<HealthSettings | null>(null);
<<<<<<< HEAD
  const lastSyncTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExpoGo = Constants.appOwnership === 'expo';
  const SYNC_COOLDOWN_MS = 30000; // 30 seconds minimum between auto-syncs
  const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour when app is open

  const triggerSync = (reason: 'foreground' | 'interval') => {
    if (!user || !activeGroupId || !settingsRef.current) return;
    const settings = settingsRef.current;
    const hasAnySyncEnabled = settings.syncWorkouts || settings.syncCalories || settings.syncWeight;
    if (!hasAnySyncEnabled) return;

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    if (timeSinceLastSync < SYNC_COOLDOWN_MS) {
      console.log(
        `[HealthAutoSync] Skipping auto-sync (${reason}) - cooldown active (${Math.round((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining)`,
      );
      return;
    }

    lastSyncTimeRef.current = now;
    console.log(`[HealthAutoSync] Triggering auto-sync (${reason})`);
    void import('../../services/healthSync')
      .then(({ syncHealthData }) => syncHealthData(user.uid, activeGroupId, settings))
      .catch((err) => {
        console.error('Auto-sync failed:', err);
      });
  };
=======
  const isExpoGo = Constants.appOwnership === 'expo';
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d

  // Subscribe to health settings
  useEffect(() => {
    if (isExpoGo) return;
    if (!user) return;
    return subscribeHealthSettings(
      user.uid,
      (settings) => {
        settingsRef.current = settings;
      },
      (err) => {
        console.error('Error loading health settings for auto-sync:', err);
      },
    );
  }, [user]);

  // Handle app state changes
  useEffect(() => {
    if (isExpoGo) return;
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user &&
        activeGroupId &&
        settingsRef.current
      ) {
        // App has come to foreground
<<<<<<< HEAD
        triggerSync('foreground');
=======
        const settings = settingsRef.current;
        const hasAnySyncEnabled = settings.syncWorkouts || settings.syncCalories || settings.syncWeight;
        
        if (hasAnySyncEnabled) {
          // Trigger sync in background (don't await to avoid blocking)
          void import('../../services/healthSync')
            .then(({ syncHealthData }) => syncHealthData(user.uid, activeGroupId, settings))
            .catch((err) => {
              console.error('Auto-sync failed:', err);
            });
        }
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user, activeGroupId, isExpoGo]);

<<<<<<< HEAD
  // Interval sync while app stays open
  useEffect(() => {
    if (isExpoGo) return;
    if (!user || !activeGroupId) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (appState.current === 'active') {
        triggerSync('interval');
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, activeGroupId, isExpoGo]);

=======
>>>>>>> c5553540f80b2245b2110786d7bbde4391e5503d
  return null; // This component doesn't render anything
}
