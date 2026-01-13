import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Button, Card, Divider, List, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import PrimaryButton from '../components/ui/PrimaryButton';
import NavList from '../components/ui/NavList';
import LoadingState from '../components/state/LoadingState';
import ErrorState from '../components/state/ErrorState';
import { GroupsStackParamList } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyGroups, UserGroupListItem } from '../services/groups';
import { subscribeMyProfile } from '../services/profile';
import { friendlyNameFromDisplayName, formatTimeAgo } from '../utils/formatters';
import { useActiveGroup } from '../store/ActiveGroupContext';

type Props = NativeStackScreenProps<GroupsStackParamList, 'GroupList'>;

export default function GroupListScreen({ navigation }: Props) {
  const theme = useTheme();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useContext(AuthContext);
  const { setActiveGroupId } = useActiveGroup();
  const [groups, setGroups] = useState<UserGroupListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [myPhotoURL, setMyPhotoURL] = useState<string | null>(null);

  const username = useMemo(() => {
    return friendlyNameFromDisplayName(user?.displayName ?? user?.email ?? null, user?.uid);
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(
      user.uid,
      (p) => setMyPhotoURL((p?.photoURL ?? '').trim() || null),
      () => setMyPhotoURL(null),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    return subscribeMyGroups(
      user.uid,
      (items) => {
        setGroups(items);
        setError(null);
        setIsLoading(false);
      },
      () => {
        setError('Failed to load groups.');
        setIsLoading(false);
      },
    );
  }, [retryKey, user]);

  const toMillis = (t: any | null) => {
    if (!t) return null;
    try {
      if (typeof t?.toMillis === 'function') return t.toMillis();
    } catch {}
    const d = t instanceof Date ? t : null;
    return d ? d.getTime() : null;
  };

  return (
    <Screen>
      <Card>
        <Card.Title
          title={username}
          subtitle={user?.email ? `Signed in as ${user.email}` : 'Your account'}
          left={() =>
            myPhotoURL ? (
              <Image
                source={{ uri: myPhotoURL }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceVariant,
                }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceVariant,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text variant="titleMedium">{username.slice(0, 2).toUpperCase()}</Text>
              </View>
            )
          }
        />
        <Card.Content>
          {error ? <Text style={{ color: 'crimson' }}>{error}</Text> : null}
          <PrimaryButton onPress={() => navigation.navigate('CreateGroup')}>Create group</PrimaryButton>
          <View style={{ height: 8 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('JoinGroup')}>
            Join group
          </Button>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 8 }}>
        Your groups
      </Text>

      <Card>
        <Card.Content style={{ paddingHorizontal: 0 }}>
          {isLoading ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <LoadingState skeletonCount={2} />
            </View>
          ) : error ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <ErrorState onRetry={() => setRetryKey((k) => k + 1)} message={error} />
            </View>
          ) : groups.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text variant="bodyMedium">No groups yet. Create one or join with a code.</Text>
            </View>
          ) : (
            <>
              <Divider />
              {groups.map((g) => (
                <React.Fragment key={g.groupId}>
                  <List.Item
                    title={g.name}
                    description={[
                      g.description ?? null,
                      `${g.memberCount ?? '—'} members • Updated ${formatTimeAgo(toMillis(g.lastActivityAt ?? null))}`,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                    onPress={() => {
                      void setActiveGroupId(g.groupId);
                      rootNav.navigate('MainTabs', { screen: 'HomeTab' } as any);
                    }}
                    left={() =>
                      <View style={{ marginLeft: 8, justifyContent: 'center' }}>
                        {g.logoUrl ? (
                          <Image
                            source={{ uri: g.logoUrl }}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              backgroundColor: theme.colors.surfaceVariant,
                            }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              backgroundColor: theme.colors.surfaceVariant,
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                          >
                            <Text variant="titleMedium">{g.name.slice(0, 2).toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                    }
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                  />
                  <Divider />
                </React.Fragment>
              ))}
            </>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 12 }} />
      <Button mode="text" onPress={logout}>
        Sign out
      </Button>
    </Screen>
  );
}


