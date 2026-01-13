import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Button, Card, Divider, List, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyGroups, UserGroupListItem } from '../services/groups';
import { friendlyNameFromDisplayName } from '../utils/formatters';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupList'>;

export default function GroupListScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user, logout } = useContext(AuthContext);
  const [groups, setGroups] = useState<UserGroupListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const username = useMemo(() => {
    return friendlyNameFromDisplayName(user?.displayName ?? user?.email ?? null, user?.uid);
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyGroups(
      user.uid,
      (items) => {
        setGroups(items);
        setError(null);
      },
      () => setError('Failed to load groups.'),
    );
  }, [user]);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button mode="contained" onPress={() => navigation.navigate('CreateGroup')} style={{ flex: 1 }}>
          Create
        </Button>
        <Button mode="outlined" onPress={() => navigation.navigate('JoinGroup')} style={{ flex: 1 }}>
          Join
        </Button>
      </View>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title={username} />
        <Card.Content>
          {error ? <Text style={{ color: 'crimson' }}>{error}</Text> : null}
          <View style={{ height: 12 }} />
          <Button mode="contained" onPress={() => navigation.navigate('Profile')}>
            Edit profile
          </Button>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
        Your groups
      </Text>

      <Card>
        <Card.Content style={{ paddingHorizontal: 0 }}>
          {groups.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text variant="bodyMedium">No groups yet. Create one or join with a code.</Text>
            </View>
          ) : null}
          <FlatList
            data={groups}
            keyExtractor={(g) => g.groupId}
            ItemSeparatorComponent={() => <Divider />}
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                description={item.description ?? `Join code: ${item.joinCode}`}
                onPress={() => navigation.navigate('GroupDetail', { groupId: item.groupId })}
                titleStyle={{ color: theme.colors.onSurface }}
                descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
                left={(props) => <List.Icon {...props} icon="account-group" color={theme.colors.onSurface} />}
                right={(props) => <List.Icon {...props} icon="chevron-right" color={theme.colors.onSurfaceVariant} />}
              />
            )}
          />
        </Card.Content>
      </Card>

      <View style={{ height: 8 }} />
      <Button mode="text" onPress={logout}>
        Sign out
      </Button>
    </View>
  );
}


