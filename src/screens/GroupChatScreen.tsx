import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupMessage, sendGroupMessage, subscribeGroupMessages } from '../services/chat';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

export default function GroupChatScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Record<string, { displayName?: string | null }>>({});
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => subscribeGroupMessages(groupId, setMessages), [groupId]);
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const map: Record<string, { displayName?: string | null }> = {};
      for (const d of snap.docs) {
        const data = d.data() as any;
        map[data.uid ?? d.id] = { displayName: data.displayName ?? null };
      }
      setMembers(map);
    });
  }, [groupId]);

  const data = useMemo(() => [...messages].reverse(), [messages]);

  const displayNameFor = (uid: string) => {
    const n = (members[uid]?.displayName || '').trim();
    return n || uid;
  };

  const send = async () => {
    if (!user) return;
    setIsSending(true);
    try {
      await sendGroupMessage({ groupId, uid: user.uid, text });
      setText('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 12 }}>
        <FlatList
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item }) => {
            const mine = user?.uid === item.uid;
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <Card style={{ maxWidth: '85%' }}>
                  <Card.Content>
                    <Text variant="labelSmall" style={{ opacity: 0.7 }}>
                      {mine ? 'Me' : displayNameFor(item.uid)}
                    </Text>
                    <Text variant="bodyMedium">{item.text}</Text>
                  </Card.Content>
                </Card>
              </View>
            );
          }}
        />

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextInput
              label="Message"
              value={text}
              onChangeText={setText}
              multiline
              disabled={isSending}
            />
          </View>
          <Button mode="contained" onPress={send} disabled={!text.trim() || isSending} loading={isSending}>
            Send
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}


