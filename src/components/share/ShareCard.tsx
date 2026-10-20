import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import AppMark from '../ui/AppMark';
import { colors } from '../../theme';

/**
 * Shareable story card: a branded 9:16 image of a moment (streak, rank-up),
 * rendered off-screen, snapshotted with Skia and handed to the share sheet,
 * so a member's Instagram story carries the app and their group's invite.
 *
 * Skia ships natively in every current build (iOS 34+ / Android vc14+). iOS
 * shares the PNG as a data URI; Android's share sheet only takes text, so it
 * (and any snapshot failure) falls back to the message alone.
 */
export type ShareMoment = {
  eyebrow: string; // "DAY STREAK", "PROMOTED"
  big: string; // "89", "Gold II"
  title: string; // "50 days."
  sub?: string;
  accent?: string;
  groupName?: string | null;
};

export type ShareCardHandle = { share: (moment: ShareMoment, message: string) => Promise<void> };

const W = 360;
const H = 640; // snapshots at device scale: 1080x1920 on a 3x phone

const ShareCardHost = forwardRef<ShareCardHandle>(function ShareCardHost(_props, ref) {
  const viewRef = useRef<View>(null);
  const [moment, setMoment] = useState<ShareMoment | null>(null);

  const share = useCallback(async (m: ShareMoment, message: string) => {
    setMoment(m);
    // Two frames: one to commit the new content, one for layout.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let shared = false;
    if (Platform.OS === 'ios') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { makeImageFromView } = require('@shopify/react-native-skia');
        const img = await makeImageFromView(viewRef);
        const b64 = img?.encodeToBase64?.();
        if (b64) {
          await Share.share({ url: `data:image/png;base64,${b64}`, message });
          shared = true;
        }
      } catch {
        /* fall back to text */
      }
    }
    if (!shared) await Share.share({ message }).catch(() => {});
  }, []);

  useImperativeHandle(ref, () => ({ share }), [share]);

  const accent = moment?.accent ?? colors.ringStreakLeader;
  return (
    // Off-screen but mounted: the snapshot needs a real, laid-out view.
    <View pointerEvents="none" style={styles.offscreen}>
      <View ref={viewRef} collapsable={false} style={styles.card}>
        {moment ? (
          <>
            <View style={[styles.glow, { backgroundColor: accent }]} />
            <View style={styles.top}>
              <AppMark size={44} />
              <AppText style={styles.brand}>AccountaBuild</AppText>
            </View>
            <View style={styles.center}>
              <AppText style={[styles.eyebrow, { color: accent }]}>{moment.eyebrow}</AppText>
              <AppText style={[styles.big, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                {moment.big}
              </AppText>
              <AppText style={styles.title}>{moment.title}</AppText>
              {moment.sub ? <AppText style={styles.sub}>{moment.sub}</AppText> : null}
            </View>
            <View style={styles.bottom}>
              {moment.groupName ? <AppText style={styles.group}>with {moment.groupName}</AppText> : null}
              <AppText style={styles.tag}>Nobody left behind.</AppText>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
});

export default ShareCardHost;

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -W * 3, top: 0, width: W, height: H },
  card: { width: W, height: H, backgroundColor: colors.background, overflow: 'hidden', paddingHorizontal: 28, paddingVertical: 36, justifyContent: 'space-between' },
  glow: { position: 'absolute', width: 420, height: 420, borderRadius: 210, top: 110, left: -30, opacity: 0.14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  center: { alignItems: 'center' },
  eyebrow: { fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  big: { fontSize: 120, lineHeight: 132, fontWeight: '800', marginTop: 8 },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  sub: { color: colors.textSecondary, fontSize: 16, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  bottom: { alignItems: 'center', gap: 6 },
  group: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  tag: { color: colors.textMuted, fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
});
