import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../../firebase/firebase';
import { AuthContext } from '../../store/AuthContext';
import { subscribeMyBadges, type EarnedBadge } from '../../services/mmrBadges';
import { colors } from '../../theme/colors';

const SEEN_KEY_PREFIX = 'badgesSeen';
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export function badgeLabel(b: EarnedBadge): string {
  if (b.type === 'achievement') return b.title;
  const rank = `${b.tier}${b.division ? ` ${ROMAN[b.division]}` : ''}`;
  return b.type === 'seasonPeak' ? `Season peak: ${rank}` : `Season rank: ${rank}`;
}

/**
 * Badges used to be earned silently (written by the weekly compute) and shown
 * nowhere prominent. This watcher:
 *  1. floats a "Badge earned" banner when a NEW badge lands (diffed against an
 *     AsyncStorage seen-set; the first-ever snapshot seeds it silently so
 *     existing users don't get a burst), and
 *  2. mirrors a compact badge list to publicUsers/{uid}.badgesPublic so
 *     teammates can see achievements on the member profile.
 */
export default function BadgeCelebrationWatcher() {
  const { user } = useContext(AuthContext);
  const [toast, setToast] = useState<string | null>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const lastMirrorRef = useRef<string>('');
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const show = (label: string) => {
    setToast(label);
    opacity.setValue(0);
    slide.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(slide, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const seenKey = `${SEEN_KEY_PREFIX}:${uid}`;

    return subscribeMyBadges(uid, (badges) => {
      void (async () => {
        try {
          // Mirror the newest badges publicly (owner-writable; teammates read).
          const mirror = badges.slice(0, 12).map((b) => ({
            id: b.id,
            type: b.type,
            label: badgeLabel(b),
            seasonId: b.seasonId,
          }));
          const mirrorKey = JSON.stringify(mirror.map((m) => m.id));
          if (mirrorKey !== lastMirrorRef.current) {
            lastMirrorRef.current = mirrorKey;
            await setDoc(doc(db, 'publicUsers', uid), { badgesPublic: mirror, updatedAt: serverTimestamp() }, { merge: true });
          }

          // Celebrate genuinely new badges.
          if (seenRef.current === null) {
            const raw = await AsyncStorage.getItem(seenKey);
            seenRef.current = new Set(raw ? (JSON.parse(raw) as string[]) : []);
            if (!raw) {
              // First run for this user/device: seed silently, no toast burst.
              seenRef.current = new Set(badges.map((b) => b.id));
              await AsyncStorage.setItem(seenKey, JSON.stringify([...seenRef.current]));
              return;
            }
          }
          const seen = seenRef.current;
          const fresh = badges.filter((b) => !seen.has(b.id));
          if (fresh.length === 0) return;
          for (const b of fresh) seen.add(b.id);
          await AsyncStorage.setItem(seenKey, JSON.stringify([...seen]));
          show(badgeLabel(fresh[0]!));
        } catch {
          /* non-fatal */
        }
      })();
    });
  }, [user?.uid]);

  if (!toast) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      <Animated.Text style={styles.emoji}>🏅</Animated.Text>
      <Animated.Text style={styles.text}>Badge earned: {toast}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,32,54,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.5)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  emoji: { fontSize: 16 },
  text: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
});
