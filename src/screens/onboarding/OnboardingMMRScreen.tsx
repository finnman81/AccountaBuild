import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import RankEmblem from '../../components/ui/RankEmblem';
import { updateOnboardingStep } from '../../services/onboarding';
import { onboardingAnalytics } from '../../services/analytics';
import { onboardingCopy } from '../../constants/onboardingCopy';
import { colors, spacing, radius } from '../../theme';
import type { Tier } from '../../mmr/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'MMRIntro'>;

const LADDER: Tier[] = ['Iron', 'Silver', 'Gold', 'Diamond', 'Challenger'];

const TILE_TINT: Record<string, { bg: string; fg: string }> = {
  primary: { bg: colors.primaryTint, fg: colors.primary },
  success: { bg: colors.successTint, fg: colors.success },
  gold: { bg: 'rgba(233,181,66,0.14)', fg: colors.rankGold },
};

/** Quick MMR explainer: what the ladder is + harder goals climb faster. */
export default function OnboardingMMRScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { mmrIntro } = onboardingCopy;

  useEffect(() => {
    onboardingAnalytics.screenView(2, 'MMRIntro', 1);
  }, []);

  const handleContinue = async () => {
    if (!user?.uid) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateOnboardingStep(user.uid, 2);
      onboardingAnalytics.continue(2, 3);
      navigation.navigate('BasicInfo');
    } catch (error) {
      console.error('[Onboarding] Error saving step:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={2} totalSteps={6} showBack onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="pageTitle" color="primary" style={styles.headline}>
          {mmrIntro.headline}
        </AppText>
        <AppText variant="body" color="secondary" style={styles.subtext}>
          {mmrIntro.subtext}
        </AppText>

        {/* The ladder: small → big diamonds, Iron → Challenger. */}
        <View style={styles.ladder}>
          {LADDER.map((tier, i) => (
            <View key={tier} style={styles.ladderStep}>
              <RankEmblem tier={tier} inline size={18 + i * 7} />
              <AppText variant="label" color={i === LADDER.length - 1 ? 'gold' : 'muted'}>{tier}</AppText>
            </View>
          ))}
        </View>

        <View style={styles.rows}>
          {mmrIntro.rows.map((row) => {
            const tint = TILE_TINT[row.tint] ?? TILE_TINT.primary;
            return (
              <View key={row.title} style={styles.row}>
                <View style={[styles.tile, { backgroundColor: tint.bg }]}>
                  <Icon source={row.icon} size={20} color={tint.fg} />
                </View>
                <View style={styles.rowText}>
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
          {mmrIntro.cta}
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.base },
  headline: { fontSize: 26, fontWeight: '800' },
  subtext: { marginTop: spacing.sm, lineHeight: 21 },
  ladder: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
    marginTop: spacing.xl,
  },
  ladderStep: { alignItems: 'center', gap: 6 },
  rows: { marginTop: spacing.xl, gap: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 38, height: 38, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.base, paddingTop: spacing.md },
  button: { width: '100%' },
});
