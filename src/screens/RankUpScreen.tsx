import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, TouchableOpacity, Share, StyleSheet as RNStyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import AppText from '../components/ui/AppText';
import RankEmblem from '../components/ui/RankEmblem';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RankUp'>;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export default function RankUpScreen({ route, navigation }: Props) {
  const { tier, division, kind, mmr } = route.params;
  const promo = kind === 'promotion';
  const accent = promo ? colors.rankGold : colors.danger;

  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(promo ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const share = async () => {
    try {
      await Share.share({
        message: promo
          ? `I just ranked up to ${tier}${division ? ` ${ROMAN[division]}` : ''} on AccountaBuild 💪`
          : `Slipped to ${tier}${division ? ` ${ROMAN[division]}` : ''} — climbing back this week.`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <View style={styles.container}>
      <Svg style={RNStyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="ru" cx="50%" cy="34%" rx="80%" ry="55%">
            <Stop offset="0" stopColor={promo ? '#2A2410' : '#2A1414'} />
            <Stop offset="0.7" stopColor={colors.background} />
            <Stop offset="1" stopColor={colors.background} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ru)" />
      </Svg>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <AppText variant="eyebrow" style={[styles.eyebrow, { color: accent }]}>
            {promo ? 'PROMOTED' : 'RANK AT RISK'}
          </AppText>

          <Animated.View style={{ transform: [{ scale }], opacity, marginVertical: spacing.xl }}>
            <RankEmblem tier={tier} size={104} division={(division ?? undefined) as any} showPips />
          </Animated.View>

          <AppText style={styles.rankText}>
            {tier}{division ? ` ${ROMAN[division]}` : ''}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subcopy}>
            {promo
              ? 'Your week paid off. Keep your group moving and defend the climb.'
              : 'A soft week cost you ground. One strong week puts it right back.'}
          </AppText>

          <View style={styles.recap}>
            {/* This is the CUMULATIVE career total (RankChangeWatcher passes
                state.mmr), not the week's earnings. Labelled "this week's
                result" it read as a single week worth 3,517 FP when the real
                week was +26 (reported 2026-08-31). */}
            <AppText variant="eyebrow" color="muted">Total Fitness Points</AppText>
            <AppText variant="statBig" style={{ color: accent, marginTop: 4 }}>
              {mmr != null ? `${Math.round(mmr).toLocaleString()} FP` : `${tier}${division ? ` ${ROMAN[division]}` : ''}`}
            </AppText>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: accent }]} onPress={share} activeOpacity={0.85}>
            <AppText variant="rowTitle" style={{ color: promo ? '#3D2C05' : '#FFFFFF' }}>
              {promo ? 'Share with your group' : 'Plan my comeback'}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.continueBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <AppText variant="rowTitle" color="secondary">Continue</AppText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { letterSpacing: 2, fontSize: 12 },
  rankText: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  subcopy: { textAlign: 'center', marginTop: spacing.md, lineHeight: 21, paddingHorizontal: spacing.base },
  recap: {
    marginTop: spacing.xxl,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingVertical: spacing.lg,
  },
  actions: { gap: spacing.sm, paddingBottom: spacing.base },
  shareBtn: { height: 54, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  continueBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
});
