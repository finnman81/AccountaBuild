import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Button, Dialog, Portal } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';

import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { deleteGroupAsCreator, setGroupLogoUrl, setGroupStreakRule } from '../services/groups';
import { uploadGroupLogo } from '../services/photos';
import Card from '../components/ui/Card';
import AppText from '../components/ui/AppText';
import PrimaryButton from '../components/ui/PrimaryButton';
import SegmentedControl from '../components/ui/SegmentedControl';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupSettings'>;

type GroupDoc = {
  createdBy?: string;
  name?: string;
  logoUrl?: string | null;
  streakRule?: 'workout' | 'any';
};

export default function GroupSettingsScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [isSavingStreakRule, setIsSavingStreakRule] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup(snap.exists() ? (snap.data() as GroupDoc) : null);
    });
  }, [groupId]);

  const isCreator = useMemo(() => Boolean(user?.uid && group?.createdBy && user.uid === group.createdBy), [group?.createdBy, user?.uid]);
  const isAdmin = useMemo(() => isCreator || myRole === 'admin', [isCreator, myRole]);

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(doc(db, 'groups', groupId, 'members', user.uid), (snap) => {
      if (!snap.exists()) {
        setMyRole(null);
        return;
      }
      const data = snap.data() as any;
      setMyRole((data?.role as any) ?? null);
    });
  }, [groupId, user?.uid]);

  const changeGroupLogo = async () => {
    if (!isCreator) return;
    setIsUploadingLogo(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsEditing: true,
        quality: 0.9,
        aspect: [1, 1],
      });
      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const url = await uploadGroupLogo({ groupId, uri });
      await setGroupLogoUrl({ groupId, logoUrl: url });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const onChangeStreakRule = async (next: 'workout' | 'any') => {
    if (!isAdmin) return;
    setIsSavingStreakRule(true);
    try {
      await setGroupStreakRule({ groupId, streakRule: next });
    } finally {
      setIsSavingStreakRule(false);
    }
  };

  const onDeleteGroup = async () => {
    if (!user) return;
    setIsDeletingGroup(true);
    try {
      await deleteGroupAsCreator({ uid: user.uid, groupId });
      setDeleteDialogVisible(false);
      navigation.popToTop();
    } finally {
      setIsDeletingGroup(false);
    }
  };

  return (
    <View style={styles.container}>
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => !isDeletingGroup && setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete group?</Dialog.Title>
          <Dialog.Content>
            <AppText variant="body" color="secondary">
              This will delete the group and its join code. Members will no longer be able to access it.
            </AppText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} disabled={isDeletingGroup}>
              Cancel
            </Button>
            <Button onPress={onDeleteGroup} loading={isDeletingGroup} disabled={isDeletingGroup} textColor={colors.danger}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <AppText variant="pageTitle" color="primary" style={styles.title}>
            Group settings
          </AppText>
          {group?.name ? (
            <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>
              {group.name}
            </AppText>
          ) : null}

          {!isAdmin ? (
            <AppText variant="body" color="secondary">
              Only group admins can change settings.
            </AppText>
          ) : null}

          <AppText variant="rowTitle" color="primary" style={styles.sectionTitle}>
            Streak rule
          </AppText>
          <AppText variant="rowSubtitle" color="muted" style={styles.sectionHelp}>
            Controls what counts as a “streak day” for members in this group.
          </AppText>
          <SegmentedControl
            options={[
              { value: 'workout', label: 'Workout only' },
              { value: 'any', label: 'Any log' },
            ]}
            value={(group?.streakRule ?? 'workout') as 'workout' | 'any'}
            onChange={(v) => void onChangeStreakRule(v)}
            style={styles.segmented}
          />

          {!isCreator ? (
            <AppText variant="rowSubtitle" color="muted" style={styles.footnote}>
              Only the group creator can change logo or delete the group.
            </AppText>
          ) : (
            <View style={styles.actions}>
              <PrimaryButton
                secondary
                onPress={changeGroupLogo}
                loading={isUploadingLogo}
                disabled={isUploadingLogo}
              >
                Set group logo
              </PrimaryButton>
              <PrimaryButton
                secondary
                onPress={() => setDeleteDialogVisible(true)}
                disabled={isUploadingLogo || isDeletingGroup}
                textColor={colors.danger}
              >
                Delete group
              </PrimaryButton>
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm },
  sectionTitle: { marginTop: spacing.sm },
  sectionHelp: { marginBottom: spacing.sm, lineHeight: 18 },
  segmented: { marginTop: spacing.xs },
  footnote: { marginTop: spacing.base, lineHeight: 18 },
  actions: { marginTop: spacing.base, gap: spacing.md },
});
