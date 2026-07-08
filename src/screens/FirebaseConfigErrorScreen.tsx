import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';

import Card from '../components/ui/Card';
import AppText from '../components/ui/AppText';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, spacing } from '../theme';

const ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

export default function FirebaseConfigErrorScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <AppText variant="pageTitle" color="primary" style={styles.title}>
            Firebase not configured
          </AppText>
          <AppText variant="body" color="secondary" style={styles.body}>
            This app needs Firebase environment variables to run.
          </AppText>
          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>
            Add these to your local .env (and to EAS secrets later)
          </AppText>
          <View style={styles.keyList}>
            {ENV_KEYS.map((key) => (
              <AppText key={key} variant="rowSubtitle" color="primary" style={styles.key}>
                {key}
              </AppText>
            ))}
          </View>
          <PrimaryButton onPress={() => {}} style={styles.button}>
            Got it
          </PrimaryButton>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  card: { gap: spacing.sm },
  title: { marginBottom: spacing.xs },
  body: { lineHeight: 20 },
  sectionLabel: { marginTop: spacing.md },
  keyList: {
    backgroundColor: colors.surface2,
    borderRadius: 14,
    padding: spacing.base,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  key: { fontFamily: 'monospace' },
  button: { marginTop: spacing.lg },
});
