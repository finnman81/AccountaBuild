import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { createGroup } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      if (!name.trim()) {
        setError('Group name is required.');
        return;
      }
      const res = await createGroup({
        uid: user.uid,
        displayName: user.displayName ?? friendlyNameFromDisplayName(user.email ?? null, user.uid),
        name,
        description,
      });
      navigation.replace('GroupDetail', { groupId: res.groupId });
    } catch (e) {
      setError('Failed to create group.');
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
          <Card.Title title="Create a group" subtitle="Invite friends with a join code" />
          <Card.Content>
            <TextInput label="Group name" value={name} onChangeText={setName} disabled={isSubmitting} />
            <View style={{ height: 12 }} />
            <TextInput
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              disabled={isSubmitting}
              multiline
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
              Create group
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


