import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Text } from 'react-native-paper';
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

// ViewPhotos is in the Home stack but navigates to the root-level AddPhoto modal.
type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'ViewPhotos'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ViewPhotosScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [photos, setPhotos] = useState<GroupLog[]>([]);
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

  const displayNameFor = (uid: string) => {
    return friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid);
  };

  const data = useMemo(() => photos, [photos]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      void markGroupPhotosSeen({ uid: user.uid, groupId });
    }, [groupId, user?.uid]),
  );

  if (!user) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>You must be signed in.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={
          <Card>
            <Card.Content>
              <EmptyState
                title="No photos yet"
                message="Upload one to start the feed."
                ctaLabel="Add progress photo"
                onCta={() => navigation.navigate('AddPhoto', { groupId })}
              />
            </Card.Content>
          </Card>
        }
        renderItem={({ item }) => {
          const url = String((item.payload as any)?.url ?? '');
          const caption = ((item.payload as any)?.caption ?? null) as string | null;
          return (
            <Card style={{ marginBottom: 16 }}>
              <Card.Title title={displayNameFor(item.uid)} subtitle={item.date} />
              <Card.Content>
                {url ? (
                  <Image
                    source={{ uri: url }}
                    style={{ width: '100%', height: 280, borderRadius: 12, backgroundColor: '#111' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text>Missing image URL.</Text>
                )}
                {caption ? (
                  <>
                    <View style={{ height: 12 }} />
                    <Text variant="bodyMedium">{caption}</Text>
                  </>
                ) : null}
              </Card.Content>
            </Card>
          );
        }}
      />
    </View>
  );
}


