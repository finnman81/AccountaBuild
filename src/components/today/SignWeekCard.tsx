import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import AppText from '../ui/AppText';
import Avatar from '../ui/Avatar';
import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { colors, radius, spacing } from '../../theme';
import { currentWeekId, signCurrentWeek, signingOpen, subscribeWeekSignatures } from '../../services/signatures';
import { getHydrated, setHydrated } from '../../services/hydrationCache';
import { friendlyNameFromDisplayName } from '../../utils/formatters';
import type { PublicUser } from '../../services/publicUsers';

/** Long enough to feel deliberate, short enough not to annoy. */
const HOLD_MS = 1500;

type Props = {
  memberUids: string[];
  publicUsers: Record<string, PublicUser>;
  canSee: Set<string>;
};

/**
 * "Sign your week" — hold-to-commit, then a live who's-in strip for the rest
 * of the week.
 *
 * The HOLD is the feature: a tap would make this a checkbox. Filling ring +
 * escalating haptics + a name that writes itself is what turns it into a small
 * ceremony. Purely symbolic — see services/signatures.ts.
 */
export default function SignWeekCard({ memberUids, publicUsers, canSee }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  // Seed from the hydration cache so the card paints its CORRECT shape on the
  // first frame. Without this it rendered the tall "Sign your week" ceremony,
  // then collapsed to the thin strip ~500ms later when Firestore resolved —
  // shoving the whole screen up. Sentry showed first paint unchanged (575 ->
  // 584ms), because the problem was never speed: it was reflow at the very top
  // of Today, which reads as launch jank.
  const cacheKey = activeGroupId ? `signatures:${activeGroupId}:${currentWeekId()}` : null;
  const [signed, setSigned] = useState<Set<string>>(
    () => new Set(cacheKey ? getHydrated<string[]>(cacheKey) ?? [] : []),
  );
  const [loaded, setLoaded] = useState<boolean>(() => !!(cacheKey && getHydrated<string[]>(cacheKey)));
  const [busy, setBusy] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  const weekId = currentWeekId();
  const isOpen = signingOpen();
  const myUid = user?.uid ?? '';

  const progress = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);
  const hapticTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    if (!activeGroupId) return;
    return subscribeWeekSignatures(activeGroupId, weekId, (uids) => {
      setSigned(uids);
      setLoaded(true);
      setHydrated(`signatures:${activeGroupId}:${weekId}`, Array.from(uids));
    });
  }, [activeGroupId, weekId]);

  const visible = useMemo(
    () => memberUids.filter((u) => u === myUid || canSee.has(u)),
    [memberUids, canSee, myUid],
  );
  const iSigned = signed.has(myUid);

  const clearHaptics = () => {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  };

  const onPressIn = () => {
    if (busy || iSigned) return;
    // Ticks accelerate toward the end so the commit feels like it's building.
    [200, 500, 800, 1050, 1250, 1400].forEach((ms) => {
      hapticTimers.current.push(
        setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), ms),
      );
    });
    holdAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false, // width interpolation
    });
    holdAnim.current.start(({ finished }) => {
      if (finished) void commit();
    });
  };

  const onPressOut = () => {
    clearHaptics();
    holdAnim.current?.stop();
    if (!justSigned) {
      Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    }
  };

  const commit = async () => {
    if (!activeGroupId || !myUid || busy) return;
    setBusy(true);
    clearHaptics();
    try {
      await signCurrentWeek(activeGroupId, myUid);
      setJustSigned(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Offline or already signed — the listener is the source of truth.
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => clearHaptics(), []);

  if (!activeGroupId || !myUid) return null;
  // First run on this device (no cache yet): render nothing rather than guess
  // wrong and reflow a moment later.
  if (!loaded) return null;

  const signedCount = visible.filter((u) => signed.has(u)).length;

  // ---- Strip: shown once you've signed, or once the window has closed ----
  if (iSigned || !isOpen) {
    if (!signed.size && !isOpen) return null; // nobody signed; don't nag all week
    return (
      <View style={styles.strip}>
        <View style={styles.stripHeader}>
          <AppText variant="rowTitle" color="primary">
            ✍️ {signedCount}/{visible.length} signed this week
          </AppText>
          {iSigned ? <AppText variant="label" color="success">You're in</AppText> : null}
        </View>
        <View style={styles.avatarRow}>
          {visible.map((uid) => {
            const p = publicUsers[uid];
            const has = signed.has(uid);
            return (
              <View key={uid} style={[styles.avatarWrap, !has && styles.avatarUnsigned]}>
                <Avatar
                  photoURL={p?.photoURL ?? null}
                  name={friendlyNameFromDisplayName(p?.displayName ?? null, uid)}
                  size={34}
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ---- The ceremony ----
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const myName = friendlyNameFromDisplayName(user?.displayName ?? null, myUid);

  return (
    <View style={styles.card}>
      <AppText variant="rowTitle" color="primary">✍️ Sign your week</AppText>
      <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 4 }}>
        Committing out loud to people who'll notice is the difference between
        wanting it and doing it. {signedCount > 0 ? `${signedCount} of your group already signed.` : 'Be the one who goes first.'}
      </AppText>

      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.holdBtn}
        accessibilityRole="button"
        accessibilityLabel="Hold to sign your week"
        accessibilityHint="Press and hold for one and a half seconds to commit"
      >
        <Animated.View style={[styles.holdFill, { width: fillWidth }]} />
        <AppText variant="rowTitle" style={styles.holdLabel}>
          {busy ? 'Signing…' : 'Hold to sign'}
        </AppText>
      </Pressable>

      <AppText variant="label" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
        {myName} · I'm showing up this week
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  holdBtn: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.primary },
  holdLabel: { color: colors.textPrimary },
  strip: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.base,
  },
  stripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  avatarWrap: { opacity: 1 },
  // Not-yet-signed teammates read as absent without the app ever calling them out.
  avatarUnsigned: { opacity: 0.28 },
});
