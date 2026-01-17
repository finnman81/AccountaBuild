import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Button, Text, TextInput, useTheme, Checkbox, Chip } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupIssue, subscribeGroupIssues, addGroupIssue, toggleIssueResolved } from '../services/issues';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<HomeStackParamList, 'Issues'>;

export default function IssuesScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [issues, setIssues] = useState<GroupIssue[]>([]);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [composerH, setComposerH] = useState(0);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);
  const [group, setGroup] = useState<{ createdBy?: string } | null>(null);

  useEffect(() => subscribeGroupIssues(groupId, setIssues), [groupId]);
  
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
    });
  }, [groupId]);

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const myDoc = snap.docs.find((d) => d.id === user.uid);
      if (myDoc) {
        const data = myDoc.data() as any;
        setMyRole((data?.role as 'admin' | 'member') ?? 'member');
      } else {
        setMyRole(null);
      }
    });
  }, [groupId, user?.uid]);

  useEffect(() => {
    return onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup(snap.exists() ? (snap.data() as any) : null);
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

  const isAdmin = useMemo(() => {
    if (!user?.uid || !group) return false;
    return Boolean(group.createdBy === user.uid || myRole === 'admin');
  }, [group, myRole, user?.uid]);

  // subscribeGroupIssues returns newest-first; use FlatList inverted to show newest at bottom.
  const data = useMemo(() => issues, [issues]);

  const displayNameFor = (uid: string) => {
    return friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid);
  };

  const send = async () => {
    if (!user) return;
    setIsSending(true);
    try {
      await addGroupIssue({ groupId, uid: user.uid, text });
      setText('');
    } finally {
      setIsSending(false);
    }
  };

  const toggleResolved = async (issue: GroupIssue) => {
    if (!user || !isAdmin) return;
    await toggleIssueResolved({
      groupId,
      issueId: issue.id,
      resolved: !issue.resolved,
      resolvedBy: user.uid,
    });
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
          keyExtractor={(item) => item.id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: composerH + 12 + insets.bottom }}
          renderItem={({ item }) => {
            const mine = user?.uid === item.uid;
            const bubbleBg = item.resolved
              ? theme.colors.surfaceVariant
              : mine
                ? theme.colors.primary
                : theme.colors.surfaceVariant;
            const nameColor = item.resolved
              ? theme.colors.onSurfaceVariant
              : mine
                ? theme.colors.onPrimary
                : theme.colors.onSurfaceVariant;
            const textColor = item.resolved
              ? theme.colors.onSurfaceVariant
              : mine
                ? theme.colors.onPrimary
                : theme.colors.onSurface;
            const opacity = item.resolved ? 0.6 : 1;

            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <View
                  style={{
                    maxWidth: '85%',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 16,
                    borderTopLeftRadius: mine ? 16 : 6,
                    borderTopRightRadius: mine ? 6 : 16,
                    backgroundColor: bubbleBg,
                    opacity,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text variant="labelSmall" style={{ color: nameColor, opacity: mine ? 0.9 : 0.8 }}>
                      {mine ? 'Me' : displayNameFor(item.uid)}
                    </Text>
                    {isAdmin && (
                      <TouchableOpacity
                        onPress={() => toggleResolved(item)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Checkbox
                          status={item.resolved ? 'checked' : 'unchecked'}
                          onPress={() => toggleResolved(item)}
                        />
                        <Text variant="labelSmall" style={{ color: nameColor, opacity: 0.8 }}>
                          {item.resolved ? 'Resolved' : 'Resolve'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
              label="Issue or suggestion"
              value={text}
              onChangeText={setText}
              multiline
              disabled={isSending}
              placeholder="Describe a bug, feature request, or suggestion..."
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
