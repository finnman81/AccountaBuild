import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupMessage, sendGroupMessage, subscribeGroupMessages } from '../services/chat';
import { markGroupChatSeen } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

export default function GroupChatScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Record<string, { displayName?: string | null }>>({});
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [composerH, setComposerH] = useState(0);

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

  // subscribeGroupMessages returns newest-first; use FlatList inverted to show newest at bottom.
  const data = useMemo(() => messages, [messages]);

  const displayNameFor = (uid: string) => {
    return friendlyNameFromDisplayName(members[uid]?.displayName ?? null, uid);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      void markGroupChatSeen({ uid: user.uid, groupId });
    }, [groupId, user?.uid]),
  );

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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 12 }}>
        <FlatList
          data={data}
          keyExtractor={(m) => m.id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: composerH + 12 + insets.bottom }}
          renderItem={({ item }) => {
            const mine = user?.uid === item.uid;
            const bubbleBg = mine ? theme.colors.primary : theme.colors.surfaceVariant;
            const nameColor = mine ? theme.colors.onPrimary : theme.colors.onSurfaceVariant;
            const textColor = mine ? theme.colors.onPrimary : theme.colors.onSurface;
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <View
                  style={{
                    maxWidth: '85%',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 16,
                    // Slightly more “iMessage-like” corners.
                    borderTopLeftRadius: mine ? 16 : 6,
                    borderTopRightRadius: mine ? 6 : 16,
                    backgroundColor: bubbleBg,
                  }}
                >
                  <Text variant="labelSmall" style={{ color: nameColor, opacity: mine ? 0.9 : 0.8, marginBottom: 2 }}>
                    {mine ? 'Me' : displayNameFor(item.uid)}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: textColor }}>
                    {item.text}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View
          onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
          style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingBottom: insets.bottom }}
        >
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


