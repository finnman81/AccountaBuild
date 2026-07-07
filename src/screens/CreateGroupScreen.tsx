import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GroupsStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { createGroup } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<GroupsStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { setActiveGroupId } = useActiveGroup();
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
      // New group becomes active; land on its GroupInfo so the creator can grab
      // the invite code and add members right away.
      await setActiveGroupId(res.groupId);
      navigation.replace('GroupInfo', { groupId: res.groupId });
    } catch (e) {
      setError('Failed to create group.');
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
          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>New group</AppText>
          <Card>
            <AppText variant="pageTitle" color="primary">Create a group</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>
              Invite friends with a join code
            </AppText>

            <View style={styles.form}>
              <TextField
                label="Group name"
                value={name}
                onChangeText={setName}
                editable={!isSubmitting}
              />
              <TextField
                label="Description (optional)"
                value={description}
                onChangeText={setDescription}
                editable={!isSubmitting}
                multiline
              />
              {error ? (
                <AppText variant="rowSubtitle" color="danger">{error}</AppText>
              ) : null}
              <PrimaryButton onPress={onSubmit} loading={isSubmitting} disabled={isSubmitting}>
                Create group
              </PrimaryButton>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
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
