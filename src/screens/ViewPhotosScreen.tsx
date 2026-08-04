import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import { collection, onSnapshot } from 'firebase/firestore';

import { HomeStackParamList, RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupLog, subscribeGroupPhotoLogs } from '../services/logs';
import { markGroupPhotosSeen } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import EmptyState from '../components/state/EmptyState';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { blockUser, reportContent, subscribeMyBlocks } from '../services/moderation';
import Card from '../components/ui/Card';
import AppText from '../components/ui/AppText';
import { colors, radius, spacing } from '../theme';

// ViewPhotos is in the Home stack but navigates to the root-level AddPhoto modal.
type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'ViewPhotos'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ViewPhotosScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [photos, setPhotos] = useState<GroupLog[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());

  useEffect(() => subscribeGroupPhotoLogs(groupId, setPhotos, undefined, 50), [groupId]);

  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
    });
  }, [groupId]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, setPublicUsers);
  }, [canSee, memberUids, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyBlocks(user.uid, setBlocked);
  }, [user?.uid]);

  /**
   * Long-press a photo -> report / block. Progress photos are the highest-risk
   * UGC surface in the app, so Apple expects this here specifically, not just
   * in chat (Guideline 1.2).
   */
  const moderate = (targetUid: string, contentId: string, caption?: string | null) => {
    if (!user?.uid || targetUid === user.uid) return;
    const who = displayNameFor(targetUid);
    Alert.alert(who, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report photo',
        style: 'destructive',
        onPress: () => {
          void reportContent({
            reporterUid: user.uid,
            targetUid,
            kind: 'photo',
            reason: 'Reported from group photos',
            groupId,
            contentId,
            contentText: caption ?? null,
          }).catch(() => {});
          Alert.alert('Reported', 'Thanks — this has been sent for review.');
        },
      },
      {
        text: `Block ${who}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Block ${who}?`, "You won't see their photos, messages or logs.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => void blockUser(user.uid, targetUid).catch(() => {}) },
          ]),
      },
    ]);
  };

  const displayNameFor = (uid: string) => {
    return friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid);
  };

  const data = useMemo(() => photos.filter((p) => !blocked.has(p.uid)), [photos, blocked]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      void markGroupPhotosSeen({ uid: user.uid, groupId });
    }, [groupId, user?.uid]),
  );

  if (!user) {
    return (
      <View style={styles.centered}>
        <AppText variant="body" color="secondary">You must be signed in.</AppText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Card>
            <EmptyState
              title="No photos yet"
              message="Upload one to start the feed."
              ctaLabel="Add progress photo"
              onCta={() => navigation.navigate('AddPhoto', { groupId })}
            />
          </Card>
        }
        renderItem={({ item }) => {
          const url = String((item.payload as any)?.url ?? '');
          const caption = ((item.payload as any)?.caption ?? null) as string | null;
          return (
            <TouchableOpacity
              activeOpacity={1}
              onLongPress={() => moderate(item.uid, item.id, caption)}
              delayLongPress={450}
            >
            <Card style={styles.photoCard}>
              <View style={styles.photoHeader}>
                <AppText variant="rowTitle" color="primary">{displayNameFor(item.uid)}</AppText>
                <AppText variant="rowSubtitle" color="muted">{item.date}</AppText>
              </View>
              {url ? (
                <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
              ) : (
                <AppText variant="body" color="secondary">Missing image URL.</AppText>
              )}
              {caption ? (
                <AppText variant="body" color="secondary" style={styles.caption}>{caption}</AppText>
              ) : null}
            </Card>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  photoCard: { marginBottom: spacing.base, gap: spacing.md },
  photoHeader: { gap: 2 },
  photo: {
    width: '100%',
    height: 280,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
  },
  caption: { marginTop: spacing.xs },
});
