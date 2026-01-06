import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupLog, subscribeGroupPhotoLogs } from '../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'ViewPhotos'>;

type MemberDoc = { uid: string; displayName?: string | null };

export default function ViewPhotosScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [photos, setPhotos] = useState<GroupLog[]>([]);
  const [members, setMembers] = useState<Record<string, MemberDoc>>({});

  useEffect(() => subscribeGroupPhotoLogs(groupId, setPhotos, undefined, 50), [groupId]);

  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const map: Record<string, MemberDoc> = {};
      for (const d of snap.docs) {
        const data = d.data() as any;
        const uid = (data.uid ?? d.id) as string;
        map[uid] = { uid, displayName: data.displayName ?? null };
      }
      setMembers(map);
    });
  }, [groupId]);

  const displayNameFor = (uid: string) => {
    const n = (members[uid]?.displayName || '').trim();
    return n || uid;
  };

  const data = useMemo(() => photos, [photos]);

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
            <Card.Title title="No photos yet" subtitle="Upload one to start the feed" />
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


