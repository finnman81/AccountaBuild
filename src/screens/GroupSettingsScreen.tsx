import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Dialog, Portal, SegmentedButtons, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';

import Screen from '../components/layout/Screen';
import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { deleteGroupAsCreator, setGroupLogoUrl, setGroupStreakRule } from '../services/groups';
import { uploadGroupLogo } from '../services/photos';

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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    <Screen>
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete group?</Dialog.Title>
          <Dialog.Content>
            <Text>This will delete the group and its join code. Members will no longer be able to access it.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} disabled={isDeletingGroup}>
              Cancel
            </Button>
            <Button onPress={onDeleteGroup} loading={isDeletingGroup} disabled={isDeletingGroup}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Card>
        <Card.Title title="Group settings" subtitle={group?.name ?? undefined} />
        <Card.Content>
          {!isAdmin ? <Text variant="bodyMedium">Only group admins can change settings.</Text> : null}

          <Text variant="titleMedium" style={{ marginTop: 4 }}>
            Streak rule
          </Text>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Controls what counts as a “streak day” for members in this group.
          </Text>
          <View style={{ height: 8 }} />
          <SegmentedButtons
            value={(group?.streakRule ?? 'workout') as any}
            onValueChange={(v) => void onChangeStreakRule(v as any)}
            buttons={[
              { value: 'workout', label: 'Workout only', disabled: !isAdmin || isSavingStreakRule },
              { value: 'any', label: 'Any log', disabled: !isAdmin || isSavingStreakRule },
            ]}
          />

          <View style={{ height: 16 }} />

          {!isCreator ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Only the group creator can change logo or delete the group.
            </Text>
          ) : (
            <>
              <Button mode="outlined" onPress={changeGroupLogo} loading={isUploadingLogo} disabled={isUploadingLogo}>
                Set group logo
              </Button>
              <View style={{ height: 8 }} />
              <Button
                mode="outlined"
                onPress={() => setDeleteDialogVisible(true)}
                disabled={isUploadingLogo || isDeletingGroup}
              >
                Delete group
              </Button>
            </>
          )}
        </Card.Content>
      </Card>
    </Screen>
  );
}

