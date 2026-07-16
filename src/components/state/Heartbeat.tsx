import { useContext, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import Constants from 'expo-constants';

import { AuthContext } from '../../store/AuthContext';
import { db } from '../../firebase/firebase';
import { setErrorReporterUser, flushPendingErrors } from '../../services/errorReporter';

/**
 * App-health heartbeat: on open/foreground (throttled to hourly), stamp the
 * user doc with when + what they're running. Answers "is this user even able
 * to open the app, and on which build?" remotely — the exact questions we
 * couldn't answer during the Matt Mologne crash report (2026-07-16).
 * Also flushes any crash reports queued by a previous session.
 */
const THROTTLE_MS = 60 * 60 * 1000;
const LAST_BEAT_KEY = 'lastHeartbeatAt';

export default function Heartbeat() {
  const { user } = useContext(AuthContext);

  useEffect(() => {
    setErrorReporterUser(user?.uid ?? null);
    if (!user?.uid) return;
    const uid = user.uid;

    const beat = async () => {
      try {
        const last = Number(await AsyncStorage.getItem(`${LAST_BEAT_KEY}:${uid}`).catch(() => null)) || 0;
        if (Date.now() - last < THROTTLE_MS) return;
        await AsyncStorage.setItem(`${LAST_BEAT_KEY}:${uid}`, String(Date.now())).catch(() => {});

        let updateId: string | null = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          updateId = require('expo-updates').updateId ?? null;
        } catch {
          /* dev client */
        }
        await setDoc(
          doc(db, 'users', uid),
          {
            appHealth: {
              lastOpenedAt: serverTimestamp(),
              platform: Platform.OS,
              osVersion: String(Platform.Version ?? ''),
              appVersion: (Constants as any).nativeAppVersion ?? (Constants.expoConfig?.version as string | undefined) ?? null,
              // nativeBuildVersion is the build ACTUALLY installed on the
              // device — expoConfig values would just echo the OTA bundle's
              // config and report the same build number for everyone.
              nativeBuild: (Constants as any).nativeBuildVersion ?? null,
              otaUpdateId: updateId,
            },
          },
          { merge: true },
        );
      } catch {
        /* offline — next foreground will retry */
      }
    };

    void beat();
    void flushPendingErrors();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void beat();
    });
    return () => sub.remove();
  }, [user?.uid]);

  return null;
}
