import React from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import AppText from '../components/ui/AppText';
import { colors, radius, spacing } from '../theme';

export const SUPPORT_EMAIL = 'support@munitor.ai';

/**
 * Terms + privacy summary, in-app.
 *
 * App Store review requires a zero-tolerance policy for objectionable content
 * (Guideline 1.2) and clear disclosure of health-data handling. Keeping the
 * text IN the app means review never blocks on a hosted page being live, and
 * users can read it offline. A hosted privacy-policy URL is still required for
 * App Store Connect metadata — see PRELAUNCH.md.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>{title}</AppText>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="body" color="secondary" style={styles.p}>{children}</AppText>
  );
}

export default function LegalScreen() {
  const nav = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Terms & Privacy</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Community rules — zero tolerance">
          <P>
            AccountaBuild is a fitness accountability app used with people you know. There is zero
            tolerance for objectionable content or abusive behaviour, including harassment, hate
            speech, threats, sexual content, and impersonation.
          </P>
          <P>
            You can report any message, log, or photo by pressing and holding it. Reports are
            reviewed and accounts that break these rules are removed. You can also block any member —
            they disappear from your feed and can no longer send you anything.
          </P>
        </Section>

        <Section title="Your health data">
          <P>
            With your permission, the app reads workouts, weight, and nutrition from Apple Health or
            Health Connect to save you logging them by hand. This data is used only to show your own
            progress and calculate your Fitness Points.
          </P>
          <P>
            Health data is never sold, never used for advertising, and never shared with third
            parties. Your body weight is private — teammates can see your workouts, streaks and
            points, but never your weight.
          </P>
        </Section>

        <Section title="What your group can see">
          <P>
            People in your groups can see your logs, streaks, rank, Fitness Points, and anything you
            post in chat or photos. They cannot see your weight, your email, or your goals'
            underlying numbers.
          </P>
        </Section>

        <Section title="Deleting your account">
          <P>
            You can delete your account at any time from Settings. This permanently removes your
            profile, goals, logs, weigh-ins, points history and badges. Messages you posted in group
            chats remain so conversations still make sense, but they are detached from your name.
          </P>
        </Section>

        <Section title="Contact">
          <P>Questions, problems, or reports that need a human:</P>
          <TouchableOpacity
            style={styles.mailBtn}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
            activeOpacity={0.85}
          >
            <AppText variant="rowTitle" color="accent">{SUPPORT_EMAIL}</AppText>
          </TouchableOpacity>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  p: { marginBottom: spacing.sm, lineHeight: 21 },
  mailBtn: { paddingVertical: spacing.sm },
});
