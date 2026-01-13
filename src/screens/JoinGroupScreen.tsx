import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { joinGroupByCode } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await joinGroupByCode({
        uid: user.uid,
        displayName: user.displayName ?? friendlyNameFromDisplayName(user.email ?? null, user.uid),
        joinCode,
      });
      navigation.replace('GroupDetail', { groupId: res.groupId });
    } catch (e) {
      setError('Invalid code or join failed.');
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
    </KeyboardAvoidingView>
  );
}


