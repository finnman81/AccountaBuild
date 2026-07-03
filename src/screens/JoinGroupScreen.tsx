import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { GroupsStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { joinGroupByCode } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<GroupsStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d78cd2b8-8a4c-4720-ac47-838b1499e885', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'screens/JoinGroupScreen.tsx:23',
        message: 'join submit pressed',
        data: { joinCodeLen: joinCode.trim().length, hasUser: !!user },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const res = await joinGroupByCode({
        uid: user.uid,
        displayName: user.displayName ?? friendlyNameFromDisplayName(user.email ?? null, user.uid),
        joinCode,
      });

      // Show success notification with haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);

      // Navigate after a brief delay so user sees the success message
      setTimeout(() => {
        // GroupDetail lives in the Home tab's stack; cross-tab replace resolves at runtime.
        (navigation as any).replace('GroupDetail', { groupId: res.groupId });
      }, 800);
    } catch (e) {
      console.error('[JoinGroup] Error joining group:', e);
      const errorMessage = e instanceof Error ? e.message : 'Invalid code or join failed.';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Join with a code</AppText>
          <Card>
            <AppText variant="pageTitle" color="primary">Join a group</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>
              Ask a friend for the 6‑char code
            </AppText>

            <View style={styles.form}>
              <TextField
                label="Join code"
                autoCapitalize="characters"
                value={joinCode}
                onChangeText={setJoinCode}
                editable={!isSubmitting}
              />
              {error ? (
                <AppText variant="rowSubtitle" color="danger">{error}</AppText>
              ) : null}
              <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
                Join
              </PrimaryButton>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        duration={2000}
        style={{ backgroundColor: colors.success }}
        theme={{ colors: { onSurface: '#FFFFFF' } }}
      >
        Successfully joined group!
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, justifyContent: 'center' },
  sectionLabel: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  subtitle: { marginTop: spacing.xs },
  form: { marginTop: spacing.lg, gap: spacing.md },
});
