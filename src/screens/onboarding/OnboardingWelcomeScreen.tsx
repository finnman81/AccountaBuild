import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import AppMark from '../../components/ui/AppMark';
import GlowBackground from '../../components/ui/GlowBackground';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { fetchJoinPreview, peekPendingJoinCode } from '../../services/inviteLinks';
import { colors, spacing, radius } from '../../theme';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

const TILE_TINT: Record<string, { bg: string; fg: string }> = {
  primary: { bg: colors.primaryTint, fg: colors.primary },
  success: { bg: colors.successTint, fg: colors.success },
  gold: { bg: 'rgba(233,181,66,0.14)', fg: colors.rankGold },
};

export default function OnboardingWelcomeScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { welcome } = onboardingCopy;

  // Arrived from a friend's invite: say whose group it is, right away.
  const [invitedTo, setInvitedTo] = useState<string | null>(null);

  useEffect(() => {
    onboardingAnalytics.screenView(1, 'Welcome', 1);
    let live = true;
    void peekPendingJoinCode()
      .then((code) => (code ? fetchJoinPreview(code) : null))
      .then((p) => live && p && setInvitedTo(p.name))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const handleContinue = async () => {
    if (!user?.uid) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 1);
      onboardingAnalytics.continue(1, 2);
      navigation.navigate('Goals');
    } catch (error) {
      console.error('[Onboarding] Error saving step:', error);
    }
  };

  return (
    <GlowBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <AppMark size={84} glyph="dumbbell" />

          {invitedTo ? (
            <View style={styles.invite}>
              <AppText variant="eyebrow" color="accent">You're invited</AppText>
              <AppText variant="cardTitle" color="primary" style={{ textAlign: 'center' }}>{invitedTo}</AppText>
            </View>
          ) : null}
          <AppText style={styles.headline}>{welcome.headline}</AppText>
          <AppText variant="body" color="secondary" style={styles.subtext}>
            {invitedTo ? `${invitedTo} is waiting. Set your goals and you're in.` : welcome.subtext}
          </AppText>

          <View style={styles.valueRows}>
            {welcome.valueRows.map((row) => {
              const tint = TILE_TINT[row.tint] ?? TILE_TINT.primary;
              return (
                <View key={row.title} style={styles.valueRow}>
                  <View style={[styles.tile, { backgroundColor: tint.bg }]}>
                    <Icon source={row.icon} size={20} color={tint.fg} />
                  </View>
                  <View style={styles.valueText}>
                    <AppText variant="rowTitle" color="primary">{row.title}</AppText>
                    <AppText variant="rowSubtitle" color="muted">{row.subtitle}</AppText>
                  </View>
                </View>
              );
            })}
          </View>

        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton onPress={handleContinue} style={styles.button}>
            {welcome.cta}
          </PrimaryButton>
          <AppText variant="label" color="muted" style={styles.ctaSubtext}>
            {welcome.ctaSubtext}
          </AppText>
        </View>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  headline: {
    ...typography.displayTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  subtext: {
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  valueRows: {
    alignSelf: 'stretch',
    marginTop: spacing.xxl,
    gap: spacing.base,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: { flex: 1, gap: 2 },
  invite: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceHero,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  button: { width: '100%' },
  ctaSubtext: { marginTop: spacing.sm },
});
