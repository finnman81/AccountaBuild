import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput, Snackbar, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { GroupsStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { joinGroupByCode } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';

type Props = NativeStackScreenProps<GroupsStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const theme = useTheme();
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="Join a group" subtitle="Ask a friend for the 6‑char code" />
          <Card.Content>
            <TextInput
              label="Join code"
              autoCapitalize="characters"
              value={joinCode}
              onChangeText={setJoinCode}
              disabled={isSubmitting}
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
              Join
            </Button>
          </Card.Content>
        </Card>
      </View>
      
      <Snackbar
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        duration={2000}
        style={{ backgroundColor: '#22C55E' }}
        theme={{ colors: { onSurface: '#FFFFFF' } }}
      >
        Successfully joined group!
      </Snackbar>
    </KeyboardAvoidingView>
  );
}


