import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Button, Dialog, Portal, Icon, ActivityIndicator } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';

import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { deleteGroupAsCreator, setGroupLogoUrl, setGroupStreakRule } from '../services/groups';
import { uploadGroupLogo } from '../services/photos';
import AppText from '../components/ui/AppText';
import SegmentedControl from '../components/ui/SegmentedControl';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupSettings'>;

function NavRow({ title, value, onPress, danger, loading, divider = true }: { title: string; value?: string; onPress?: () => void; danger?: boolean; loading?: boolean; divider?: boolean }) {
  return (
    <>
      <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress || loading} activeOpacity={0.7}>
        <AppText variant="rowTitle" color={danger ? 'danger' : 'primary'} style={{ flex: 1 }}>{title}</AppText>
        {loading ? <ActivityIndicator size={16} color={colors.textMuted} /> : value ? <AppText variant="rowSubtitle" color="muted" style={{ marginRight: spacing.sm }}>{value}</AppText> : null}
        {onPress && !danger && !loading ? <Icon source="chevron-right" size={20} color={colors.textMuted} /> : null}
      </TouchableOpacity>
      {divider ? <View style={styles.divider} /> : null}
    </>
  );
}

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
        {group?.name ? (
          <AppText variant="rowSubtitle" color="muted" style={styles.groupName}>{group.name}</AppText>
        ) : null}

        {!isAdmin ? (
          <View style={styles.notice}>
            <AppText variant="rowSubtitle" color="muted">Only group admins can change these settings.</AppText>
          </View>
        ) : null}

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Rules</AppText>
        <View style={styles.group}>
          <View style={styles.ruleBlock}>
            <AppText variant="rowTitle" color="primary">Streak rule</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.ruleHelp}>
              What counts as a “streak day” for members in this group.
            </AppText>
            <SegmentedControl
              options={[
                { value: 'workout', label: 'Workout only' },
                { value: 'any', label: 'Any log' },
              ]}
              value={(group?.streakRule ?? 'workout') as 'workout' | 'any'}
              onChange={(v) => isAdmin && void onChangeStreakRule(v)}
              style={styles.segmented}
            />
          </View>
        </View>

        {isCreator ? (
          <>
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Identity</AppText>
            <View style={styles.group}>
              <NavRow title="Group logo" value={group?.logoUrl ? 'Change' : 'Set'} onPress={changeGroupLogo} loading={isUploadingLogo} divider={false} />
            </View>

            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Danger zone</AppText>
            <View style={styles.group}>
              <NavRow title="Delete group" danger onPress={() => setDeleteDialogVisible(true)} divider={false} />
            </View>
          </>
        ) : (
          <AppText variant="rowSubtitle" color="muted" style={styles.footnote}>
            Only the group creator can change the logo or delete the group.
          </AppText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  groupName: { marginBottom: spacing.xs, marginLeft: spacing.xs },
  notice: { backgroundColor: colors.surface2, borderRadius: radius.tile, padding: spacing.base, marginTop: spacing.sm },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  divider: { height: 1, backgroundColor: colors.divider },
  ruleBlock: { paddingVertical: spacing.md, gap: spacing.xs },
  ruleHelp: { lineHeight: 18, marginBottom: spacing.sm },
  segmented: { marginTop: spacing.xs },
  footnote: { marginTop: spacing.lg, marginLeft: spacing.xs, lineHeight: 18 },
});
