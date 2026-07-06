import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useContext } from 'react';
import Constants from 'expo-constants';
import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeHealthSettings, type HealthSettings } from '../../services/healthSettings';
// Importing this module also defines the background task (required at import time).
import { registerBackgroundHealthSync } from '../../services/health/backgroundHealthSync';

/**
 * Component that automatically syncs health data when app comes to foreground
 * and user has health sync enabled
 */
export default function HealthAutoSync() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const appState = useRef(AppState.currentState);
  const [settings, setSettings] = useState<HealthSettings | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExpoGo = Constants.appOwnership === 'expo';
  const SYNC_COOLDOWN_MS = 30000; // 30 seconds minimum between auto-syncs
  const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour when app is open

  const triggerSync = useCallback((reason: 'foreground' | 'interval' | 'initial') => {
    if (!user || !activeGroupId || !settings) {
      console.log(`[HealthAutoSync] Skipping auto-sync (${reason}) - missing requirements:`, {
        hasUser: !!user,
        hasActiveGroupId: !!activeGroupId,
        hasSettings: !!settings,
      });
      return;
    }
    
    const hasAnySyncEnabled = settings.syncWorkouts || settings.syncCalories || settings.syncWeight;
    if (!hasAnySyncEnabled) {
      console.log(`[HealthAutoSync] Skipping auto-sync (${reason}) - no sync types enabled`);
      return;
    }

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    if (timeSinceLastSync < SYNC_COOLDOWN_MS) {
      console.log(
        `[HealthAutoSync] Skipping auto-sync (${reason}) - cooldown active (${Math.round((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining)`,
      );
      return;
    }

    lastSyncTimeRef.current = now;
    console.log(`[HealthAutoSync] Triggering auto-sync (${reason})`, {
      syncWorkouts: settings.syncWorkouts,
      syncCalories: settings.syncCalories,
      syncWeight: settings.syncWeight,
    });
    void import('../../services/healthSync')
      .then(({ syncHealthData }) => syncHealthData(user.uid, activeGroupId, settings))
      .catch((err) => {
        console.error('[HealthAutoSync] Auto-sync failed:', err);
      });
  }, [user, activeGroupId, settings]);

  // Register the OS-scheduled background sync task once (runs even when the app
  // is closed). It self-checks user/group/settings, so registering is safe.
  useEffect(() => {
    if (isExpoGo) return;
    void registerBackgroundHealthSync();
  }, [isExpoGo]);

  // iOS HealthKit background delivery: fire a sync near-instantly when new
  // workouts/calories/weight land in Apple Health (Strava-style). No-op on
  // Android (covered by the periodic background task).
  useEffect(() => {
    if (isExpoGo || !user || !activeGroupId || !settings) return;
    if (!settings.syncWorkouts && !settings.syncCalories && !settings.syncWeight) return;

    let cleanup: (() => void) | null = null;
    let active = true;
    void import('../../services/health/healthService')
      .then((HS) => HS.setupBackgroundObservers(() => triggerSync('foreground')))
      .then((c) => {
        if (active) cleanup = c;
        else c();
      })
      .catch((e) => console.warn('[HealthAutoSync] background observers setup failed', e));

    return () => {
      active = false;
      if (cleanup) cleanup();
    };
  }, [user, activeGroupId, settings, isExpoGo, triggerSync]);

  // Subscribe to health settings
  useEffect(() => {
    if (isExpoGo) {
      console.log('[HealthAutoSync] Skipping - running in Expo Go');
      return;
    }
    if (!user) {
      console.log('[HealthAutoSync] No user, clearing settings');
      setSettings(null);
      return;
    }
    
    console.log('[HealthAutoSync] Subscribing to health settings for user:', user.uid);
    return subscribeHealthSettings(
      user.uid,
      (newSettings) => {
        if (!newSettings) {
          setSettings(null);
          return;
        }
        console.log('[HealthAutoSync] Settings loaded:', {
          syncWorkouts: newSettings.syncWorkouts,
          syncCalories: newSettings.syncCalories,
          syncWeight: newSettings.syncWeight,
        });
        setSettings(newSettings);
      },
      (err) => {
        console.error('[HealthAutoSync] Error loading health settings:', err);
        setSettings(null);
      },
    );
  }, [user, isExpoGo]);

  // Initial sync when all requirements are met (app first opens)
  useEffect(() => {
    if (isExpoGo) return;
    if (!user || !activeGroupId || !settings) return;
    
    // Only trigger initial sync if app is already active (not coming from background)
    if (appState.current === 'active') {
      // Small delay to ensure everything is initialized
      const timeoutId = setTimeout(() => {
        console.log('[HealthAutoSync] Triggering initial sync on mount');
        triggerSync('initial');
      }, 2000); // 2 second delay to let everything initialize
      
      return () => clearTimeout(timeoutId);
    }
  }, [user, activeGroupId, settings, isExpoGo, triggerSync]);

  // Handle app state changes
  useEffect(() => {
    if (isExpoGo) return;
    if (!user || !activeGroupId) return;
    
    console.log('[HealthAutoSync] Setting up AppState listener');
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('[HealthAutoSync] AppState changed:', {
        from: appState.current,
        to: nextAppState,
        hasUser: !!user,
        hasActiveGroupId: !!activeGroupId,
        hasSettings: !!settings,
      });
      
      // App has come to foreground - triggerSync will check all requirements
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[HealthAutoSync] App came to foreground, triggering sync');
        triggerSync('foreground');
      }
      appState.current = nextAppState;
    });

    return () => {
      console.log('[HealthAutoSync] Cleaning up AppState listener');
      subscription.remove();
    };
  }, [user, activeGroupId, settings, isExpoGo, triggerSync]);

  // Interval sync while app stays open
  useEffect(() => {
    if (isExpoGo) return;
    if (!user || !activeGroupId || !settings) {
      // Clear interval if requirements not met
      if (intervalRef.current) {
        console.log('[HealthAutoSync] Clearing interval - requirements not met');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    console.log('[HealthAutoSync] Setting up interval sync (1 hour)');
    intervalRef.current = setInterval(() => {
      // Use current values from closure (triggerSync will check requirements)
      if (appState.current === 'active') {
        console.log('[HealthAutoSync] Interval triggered, app is active');
        triggerSync('interval');
      } else {
        console.log('[HealthAutoSync] Interval triggered but app not active (state:', appState.current, ')');
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        console.log('[HealthAutoSync] Cleaning up interval');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, activeGroupId, settings, isExpoGo, triggerSync]);

  return null; // This component doesn't render anything
}
