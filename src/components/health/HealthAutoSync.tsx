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
  const lastSyncTimeRef = useRef<number>(0);
  const isExpoGo = Constants.appOwnership === 'expo';
  const SYNC_COOLDOWN_MS = 30000; // 30 seconds minimum between auto-syncs

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
        const settings = settingsRef.current;
        const hasAnySyncEnabled = settings.syncWorkouts || settings.syncCalories || settings.syncWeight;
        
        if (hasAnySyncEnabled) {
          const now = Date.now();
          const timeSinceLastSync = now - lastSyncTimeRef.current;
          
          // Only sync if enough time has passed since last sync (cooldown)
          if (timeSinceLastSync >= SYNC_COOLDOWN_MS) {
            lastSyncTimeRef.current = now;
            console.log('[HealthAutoSync] Triggering auto-sync (cooldown passed)');
            // Trigger sync in background (don't await to avoid blocking)
            void import('../../services/healthSync')
              .then(({ syncHealthData }) => syncHealthData(user.uid, activeGroupId, settings))
              .catch((err) => {
                console.error('Auto-sync failed:', err);
              });
          } else {
            console.log(`[HealthAutoSync] Skipping auto-sync - cooldown active (${Math.round((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining)`);
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user, activeGroupId, isExpoGo]);

  return null; // This component doesn't render anything
}
