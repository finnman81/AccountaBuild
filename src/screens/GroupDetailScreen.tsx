import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Avatar, Button, Card, Dialog, Divider, List, Portal, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { subscribeGroupGoals, UserGoals } from '../services/goals';
import { deleteGroupAsCreator, ensureJoinCodeMapping, setGroupLogoUrl, subscribeMyGroupMeta } from '../services/groups';
import { formatHeightInches, formatWeightLb, friendlyNameFromDisplayName } from '../utils/formatters';
import { uploadGroupLogo } from '../services/photos';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

type GroupDoc = {
  name?: string;
  description?: string | null;
  joinCode?: string;
  createdBy?: string;
  logoUrl?: string | null;
};

type MemberDoc = {
  uid: string;
  role: 'admin' | 'member';
  displayName?: string | null;
  photoURL?: string | null;
  height?: number | null;
  age?: number | null;
  weightCurrent?: number | null;
  weightGoal?: number | null;
};

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  // Avoid timezone ambiguity by forcing local midnight
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

function weekStartSundayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const theme = useTheme();

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [goals, setGoals] = useState<UserGoals[]>([]);
  const [myMeta, setMyMeta] = useState<any | null>(null);
  const [latestChatAt, setLatestChatAt] = useState<any | null>(null);
  const [latestPhotoAt, setLatestPhotoAt] = useState<any | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showAllStats, setShowAllStats] = useState(false);
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  useEffect(() => {
    const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup(snap.exists() ? (snap.data() as GroupDoc) : null);
    });

    const unsubMembers = onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        const uid = (data.uid ?? d.id) as string;
        return { uid, ...(data as Omit<MemberDoc, 'uid'>) } as MemberDoc;
      });
      setMembers(items);
    });

    return () => {
      unsubGroup();
      unsubMembers();
    };
  }, [groupId]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyGroupMeta(user.uid, groupId, setMyMeta);
  }, [groupId, user]);

  useEffect(() => {
    // Latest message timestamp for badge.
    const ref = query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'desc'), limit(1));
    return onSnapshot(ref, (snap) => {
      const d = snap.docs[0]?.data() as any;
      setLatestChatAt(d?.createdAt ?? null);
    });
  }, [groupId]);

  useEffect(() => {
    // Latest photo log timestamp for badge.
    const ref = query(
      collection(db, 'groups', groupId, 'logs'),
      where('type', '==', 'photo'),
      orderBy('ts', 'desc'),
      limit(1),
    );
    return onSnapshot(ref, (snap) => {
      const d = snap.docs[0]?.data() as any;
      setLatestPhotoAt(d?.ts ?? null);
    });
  }, [groupId]);

  useEffect(() => {
    return subscribeGroupLogs(groupId, setLogs, undefined, 50);
  }, [groupId]);

  useEffect(() => {
    return subscribeGroupGoals(groupId, setGoals);
  }, [groupId]);

  const myRole = useMemo(() => {
    if (!user) return null;
    return members.find((m) => m.uid === user.uid)?.role ?? null;
  }, [members, user]);

  const isCreator = Boolean(user?.uid && group?.createdBy && user.uid === group.createdBy);

  const onDeleteGroup = async () => {
    if (!user) return;
    setIsDeletingGroup(true);
    try {
      await deleteGroupAsCreator({ uid: user.uid, groupId });
      setDeleteDialogVisible(false);
      navigation.popToTop();
    } catch {
      // Keep UX simple for now; failures will leave group in place.
      setDeleteDialogVisible(false);
    } finally {
      setIsDeletingGroup(false);
    }
  };

  // Backfill join code mapping for existing groups (so older groups can be joined).
  useEffect(() => {
    if (!group || !group.joinCode || !group.createdBy || myRole !== 'admin') return;
    void ensureJoinCodeMapping({
      joinCode: group.joinCode,
      groupId,
      name: group.name ?? 'Group',
      description: group.description ?? null,
      createdBy: group.createdBy,
    });
  }, [group, groupId, myRole]);

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

  const memberMap = useMemo(() => {
    const map: Record<string, MemberDoc> = {};
    for (const m of members) map[m.uid] = m;
    return map;
  }, [members]);

  const displayNameFor = (uid: string) => {
    const m = memberMap[uid];
    return friendlyNameFromDisplayName(m?.displayName ?? null, uid);
  };

  const photoUrlFor = (uid: string) => {
    const m = memberMap[uid];
    const u = (m?.photoURL ?? '').trim();
    return u || null;
  };

  const initialsFor = (uid: string) => {
    const name = displayNameFor(uid).trim();
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = (parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '');
    return letters.toUpperCase();
  };

  const UserAvatar = ({ uid, size = 40 }: { uid: string; size?: number }) => {
    const url = photoUrlFor(uid);
    return url ? (
      <Avatar.Image size={size} source={{ uri: url }} />
    ) : (
      <Avatar.Text size={size} label={initialsFor(uid)} />
    );
  };

  const friendlyWorkout = (t: unknown) => {
    switch (t) {
      case 'weightLifting':
        return 'Weight Lifting';
      case 'running':
        return 'Running';
      case 'jogging':
        return 'Jogging';
      case 'ruck':
        return 'Ruck';
      case 'swim':
        return 'Swim';
      case 'bike':
        return 'Bike';
      case 'stairMaster':
        return 'StairMaster';
      case 'inclineWalk':
        return 'Incline Walk';
      case 'rowing':
        return 'Rowing';
      case 'elliptical':
        return 'Elliptical';
      case 'hiit':
        return 'HIIT';
      case 'yoga':
        return 'Yoga';
      default:
        return 'Workout';
    }
  };

  const formatLog = (l: GroupLog): { title: string; subtitle: string } => {
    const who = displayNameFor(l.uid);
    if (l.type === 'weight') {
      const w = Number((l.payload as any)?.weight);
      return {
        title: who,
        subtitle: `Weight${Number.isFinite(w) ? ` • ${formatWeightLb(w)}` : ''}`,
      };
    }
    if (l.type === 'calories') {
      const c = Number((l.payload as any)?.calories);
      const meal = String((l.payload as any)?.meal ?? '').trim();
      const mealLabel =
        meal && meal !== 'all'
          ? ` • ${meal.charAt(0).toUpperCase()}${meal.slice(1)}`
          : '';
      return {
        title: who,
        subtitle: `Calories${mealLabel}${Number.isFinite(c) ? ` • ${c}` : ''}`,
      };
    }
    if (l.type === 'workout') {
      const wt = (l.payload as any)?.workoutType;
      const mins = Number((l.payload as any)?.durationMinutes);
      return {
        title: who,
        subtitle: `${friendlyWorkout(wt)}${Number.isFinite(mins) ? ` • ${mins}m` : ''}`,
      };
    }
    if (l.type === 'photo') {
      return { title: who, subtitle: 'Photo' };
    }
    return { title: who, subtitle: String(l.type) };
  };

  const rollup = useMemo(() => {
    const today = todayYYYYMMDD();
    const weekStart = weekStartSundayLocal();

    const byUid: Record<
      string,
      { caloriesToday: number; workoutsThisWeek: number; lastWeight: number | null }
    > = {};

    for (const l of logs) {
      if (!byUid[l.uid]) byUid[l.uid] = { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };

      if (l.type === 'calories' && l.date === today) {
        const c = Number((l.payload as any)?.calories);
        if (Number.isFinite(c)) byUid[l.uid].caloriesToday += c;
      }

      if (l.type === 'workout') {
        const d = parseYYYYMMDDLocal(l.date);
        if (!Number.isNaN(d.valueOf()) && d >= weekStart) byUid[l.uid].workoutsThisWeek += 1;
      }

      if (l.type === 'weight' && byUid[l.uid].lastWeight == null) {
        const w = Number((l.payload as any)?.weight);
        if (Number.isFinite(w)) byUid[l.uid].lastWeight = w;
      }
    }

    return byUid;
  }, [logs]);

  const todayWorkoutTypesByUid = useMemo(() => {
    const today = todayYYYYMMDD();
    const out: Record<string, Set<string>> = {};
    for (const l of logs) {
      if (l.type !== 'workout') continue;
      if (l.date !== today) continue;
      const wt = (l.payload as any)?.workoutType;
      const label = friendlyWorkout(wt);
      out[l.uid] = out[l.uid] ?? new Set<string>();
      out[l.uid].add(label);
    }
    return out;
  }, [logs]);

  const todayWorkoutMinutesByUid = useMemo(() => {
    const today = todayYYYYMMDD();
    const out: Record<string, number> = {};
    for (const l of logs) {
      if (l.type !== 'workout') continue;
      if (l.date !== today) continue;
      const mins = Number((l.payload as any)?.durationMinutes);
      if (!Number.isFinite(mins) || mins <= 0) continue;
      out[l.uid] = (out[l.uid] ?? 0) + mins;
    }
    return out;
  }, [logs]);

  const RECENT_LIMIT = 5;
  const LIST_LIMIT = 10;

  const recentItems = useMemo(() => (showAllRecent ? logs : logs.slice(0, RECENT_LIMIT)), [logs, showAllRecent]);

  const membersSorted = useMemo(() => {
    const copy = [...members];
    copy.sort((a, b) => displayNameFor(a.uid).localeCompare(displayNameFor(b.uid)));
    return copy;
  }, [members, displayNameFor]);

  const statsMembers = useMemo(
    () => (showAllStats ? membersSorted : membersSorted.slice(0, LIST_LIMIT)),
    [membersSorted, showAllStats],
  );

  const goalsMembers = useMemo(
    () => (showAllGoals ? membersSorted : membersSorted.slice(0, LIST_LIMIT)),
    [membersSorted, showAllGoals],
  );

  const toMillis = (t: any | null) => {
    if (!t) return null;
    try {
      if (typeof t?.toMillis === 'function') return t.toMillis();
    } catch {}
    const d = t instanceof Date ? t : null;
    return d ? d.getTime() : null;
  };

  const formatLogDateTime = (l: GroupLog) => {
    const ms = toMillis(l.ts ?? null);
    if (ms != null) {
      const d = new Date(ms);
      const date = d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
      const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${date} ${time}`;
    }
    return l.date;
  };

  const logNote = (l: GroupLog) => {
    const p = l.payload as any;
    const note = String(p?.note ?? '').trim();
    if (note) return note;
    if (l.type === 'photo') {
      const caption = String(p?.caption ?? '').trim();
      if (caption) return caption;
    }
    return null;
  };

  const hasNewChat = useMemo(() => {
    const lastSeen = toMillis(myMeta?.chatLastSeenAt ?? null) ?? 0;
    const latest = toMillis(latestChatAt) ?? 0;
    return latest > lastSeen;
  }, [latestChatAt, myMeta?.chatLastSeenAt]);

  const hasNewPhotos = useMemo(() => {
    const lastSeen = toMillis(myMeta?.photosLastSeenAt ?? null) ?? 0;
    const latest = toMillis(latestPhotoAt) ?? 0;
    return latest > lastSeen;
  }, [latestPhotoAt, myMeta?.photosLastSeenAt]);

  const BadgedButton = ({
    show,
    children,
    mode,
    onPress,
  }: {
    show: boolean;
    children: React.ReactNode;
    mode: 'contained' | 'outlined';
    onPress: () => void;
  }) => {
    return (
      <View style={{ position: 'relative' }}>
        <Button mode={mode} onPress={onPress}>
          {children}
        </Button>
        {show ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: theme.colors.secondary,
              borderWidth: 2,
              borderColor: theme.colors.background,
            }}
          />
        ) : null}
      </View>
    );
  };

  const DashboardTable = () => {
    const labelColW = 160;
    const colW = 120;
    const border = theme.colors.outline;

    const caloriesRemainingFor = (uid: string) => {
      const s = rollup[uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };
      const g = goals.find((x) => x.uid === uid) ?? null;
      const goal = Number(g?.dailyCalorieGoal ?? 0);
      if (!Number.isFinite(goal) || goal <= 0) return '—';
      const remaining = Math.max(0, Math.round(goal - s.caloriesToday));
      return String(remaining);
    };

    const caloriesLoggedFor = (uid: string) => {
      const s = rollup[uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };
      return String(Math.round(s.caloriesToday));
    };

    const workoutMinutesFor = (uid: string) => {
      const mins = todayWorkoutMinutesByUid[uid] ?? 0;
      return mins > 0 ? `${Math.round(mins)}m` : '—';
    };

    const workoutTypesFor = (uid: string) => {
      const set = todayWorkoutTypesByUid[uid];
      if (!set || set.size === 0) return '—';
      return Array.from(set.values()).sort().join(', ');
    };

    const lastWeightFor = (uid: string) => {
      const s = rollup[uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };
      return s.lastWeight == null ? '—' : formatWeightLb(s.lastWeight);
    };

    const LabelCell = ({ children }: { children: React.ReactNode }) => (
      <View style={{ width: labelColW, paddingVertical: 10, paddingHorizontal: 12 }}>
        {children}
      </View>
    );

    const RowLabel = ({ label }: { label: string }) => (
      <LabelCell>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
      </LabelCell>
    );

    const ValueRow = ({ getValue }: { getValue: (uid: string) => string }) => (
      <View style={{ flexDirection: 'row' }}>
        {membersSorted.map((m) => (
          <View
            key={m.uid}
            style={{ width: colW, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 1, borderColor: border }}
          >
            <Text variant="bodyMedium" numberOfLines={1}>
              {getValue(m.uid)}
            </Text>
          </View>
        ))}
      </View>
    );

    return (
      <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row' }}>
          {/* Sticky left labels column */}
          <View style={{ backgroundColor: theme.colors.surface }}>
            <LabelCell>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Member
              </Text>
            </LabelCell>
            <View style={{ borderTopWidth: 1, borderColor: border }} />
            <RowLabel label="Calories remaining" />
            <View style={{ borderTopWidth: 1, borderColor: border }} />
            <RowLabel label="Calories logged (today)" />
            <View style={{ borderTopWidth: 1, borderColor: border }} />
            <RowLabel label="Workout types (today)" />
            <View style={{ borderTopWidth: 1, borderColor: border }} />
            <RowLabel label="Workout minutes (today)" />
            <View style={{ borderTopWidth: 1, borderColor: border }} />
            <RowLabel label="Last weight" />
          </View>

          {/* Horizontally-scrollable member columns */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: colW * Math.max(1, membersSorted.length) }}>
              <View style={{ flexDirection: 'row' }}>
                {membersSorted.map((m) => (
                  <View
                    key={`hdr:${m.uid}`}
                    style={{ width: colW, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 1, borderColor: border }}
                  >
                    <Text variant="labelMedium" numberOfLines={1}>
                      {displayNameFor(m.uid)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ borderTopWidth: 1, borderColor: border }} />
              <ValueRow getValue={caloriesRemainingFor} />
              <View style={{ borderTopWidth: 1, borderColor: border }} />
              <ValueRow getValue={caloriesLoggedFor} />
              <View style={{ borderTopWidth: 1, borderColor: border }} />
              <ValueRow getValue={workoutTypesFor} />
              <View style={{ borderTopWidth: 1, borderColor: border }} />
              <ValueRow getValue={workoutMinutesFor} />
              <View style={{ borderTopWidth: 1, borderColor: border }} />
              <ValueRow getValue={lastWeightFor} />
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete group?</Dialog.Title>
          <Dialog.Content>
            <Text>
              This will delete the group and its join code. Members will no longer be able to access it.
            </Text>
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
        <Card.Title
          title={group?.name ?? 'Group'}
          subtitle={group?.description ?? undefined}
          left={() =>
            group?.logoUrl ? (
              <Image
                source={{ uri: group.logoUrl }}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#111' }}
              />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#222' }} />
            )
          }
        />
        <Card.Content>
          <Text variant="bodyMedium">Join code: {group?.joinCode ?? '—'}</Text>
          <View style={{ height: 8 }} />
          <Text variant="bodySmall">Your role: {myRole ?? '—'}</Text>
          {isCreator ? (
            <>
              <View style={{ height: 12 }} />
              <Button mode="outlined" onPress={changeGroupLogo} loading={isUploadingLogo} disabled={isUploadingLogo}>
                Set group logo
              </Button>
              <View style={{ height: 8 }} />
              <Button
                mode="outlined"
                onPress={() => setDeleteDialogVisible(true)}
                disabled={isUploadingLogo || isDeletingGroup}
                textColor={theme.colors.secondary}
              >
                Delete group
              </Button>
            </>
          ) : null}
          <View style={{ height: 16 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              mode="contained"
              compact
              uppercase={false}
              contentStyle={{ paddingHorizontal: 6 }}
              labelStyle={{ fontSize: 14 }}
              onPress={() => navigation.navigate('AddCalories', { groupId })}
              style={{ flex: 1 }}
            >
              Calories
            </Button>
            <Button
              mode="contained"
              compact
              uppercase={false}
              contentStyle={{ paddingHorizontal: 6 }}
              labelStyle={{ fontSize: 14 }}
              onPress={() => navigation.navigate('AddWorkout', { groupId })}
              style={{ flex: 1 }}
            >
              Workout
            </Button>
            <Button
              mode="contained"
              compact
              uppercase={false}
              contentStyle={{ paddingHorizontal: 6 }}
              labelStyle={{ fontSize: 14 }}
              onPress={() => navigation.navigate('AddWeight', { groupId })}
              style={{ flex: 1 }}
            >
              Weight
            </Button>
          </View>
          <View style={{ height: 12 }} />
          <Button mode="contained" onPress={() => navigation.navigate('AddPhoto', { groupId })}>
            Upload photo
          </Button>
          <View style={{ height: 12 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('GroupCharts', { groupId })}>
            View charts
          </Button>
          <View style={{ height: 12 }} />
          <BadgedButton show={hasNewChat} mode="outlined" onPress={() => navigation.navigate('GroupChat', { groupId })}>
            Group chat
          </BadgedButton>
          <View style={{ height: 12 }} />
          <BadgedButton show={hasNewPhotos} mode="outlined" onPress={() => navigation.navigate('ViewPhotos', { groupId })}>
            View photos
          </BadgedButton>
          <View style={{ height: 12 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('SetGoals', { groupId })}>
            Set my goals
          </Button>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Dashboard" subtitle="Today" />
        <Card.Content>
          {membersSorted.length === 0 ? <Text>No members yet.</Text> : <DashboardTable />}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Recent activity" />
        <Card.Content>
          {logs.length === 0 ? <Text>No logs yet. Add one!</Text> : null}
        </Card.Content>
        <Divider />
        {recentItems.map((l) => (
          <List.Item
            key={l.id}
            title={formatLog(l).title}
            description={`${formatLog(l).subtitle} • ${formatLogDateTime(l)}${logNote(l) ? `\n${logNote(l)}` : ''}`}
            left={() => <UserAvatar uid={l.uid} />}
          />
        ))}
        {logs.length > RECENT_LIMIT ? (
          <Card.Actions style={{ justifyContent: 'flex-end' }}>
            <Button mode="text" compact onPress={() => setShowAllRecent((v) => !v)}>
              {showAllRecent ? 'View less' : 'View all'}
            </Button>
          </Card.Actions>
        ) : null}
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Quick stats" />
        <Card.Content>
          {statsMembers.map((m) => {
            const s = rollup[m.uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };
            return (
              <View key={m.uid} style={{ marginBottom: 12 }}>
                <Text variant="bodyMedium">{displayNameFor(m.uid)}</Text>
                <Text variant="bodySmall">Calories today: {s.caloriesToday}</Text>
                <Text variant="bodySmall">Workouts (this week): {s.workoutsThisWeek}</Text>
                <Text variant="bodySmall">
                  Last weight: {s.lastWeight == null ? '—' : formatWeightLb(s.lastWeight)}
                </Text>
              </View>
            );
          })}
        </Card.Content>
        {members.length > LIST_LIMIT ? (
          <Card.Actions style={{ justifyContent: 'flex-end' }}>
            <Button mode="text" compact onPress={() => setShowAllStats((v) => !v)}>
              {showAllStats ? 'View less' : 'View all'}
            </Button>
          </Card.Actions>
        ) : null}
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Goals (this week)" />
        <Card.Content>
          {goalsMembers.map((m) => {
            const g = goals.find((x) => x.uid === m.uid) ?? null;
            const s = rollup[m.uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };

            const weekStart = weekStartSundayLocal();
            const caloriesDaysThisWeek = new Set(
              logs
                .filter((l) => {
                  if (l.uid !== m.uid || l.type !== 'calories') return false;
                  const d = parseYYYYMMDDLocal(l.date);
                  return !Number.isNaN(d.valueOf()) && d >= weekStart;
                })
                .map((l) => l.date),
            ).size;
            const weightDaysThisWeek = new Set(
              logs
                .filter((l) => {
                  if (l.uid !== m.uid || l.type !== 'weight') return false;
                  const d = parseYYYYMMDDLocal(l.date);
                  return !Number.isNaN(d.valueOf()) && d >= weekStart;
                })
                .map((l) => l.date),
            ).size;

            return (
              <View key={m.uid} style={{ marginBottom: 12 }}>
                <Text variant="bodyMedium">{displayNameFor(m.uid)}</Text>
                {g ? (
                  <>
                    <Text variant="bodySmall">Workouts: {s.workoutsThisWeek}/{g.workoutsPerWeek}</Text>
                    <Text variant="bodySmall">
                      Daily calorie goal: {g.dailyCalorieGoal ? `${s.caloriesToday}/${g.dailyCalorieGoal}` : '—'}
                    </Text>
                    <Text variant="bodySmall">
                      Calories days: {caloriesDaysThisWeek}/{g.logCaloriesDaysPerWeek}
                    </Text>
                    <Text variant="bodySmall">
                      Weight days: {weightDaysThisWeek}/{g.logWeightDaysPerWeek}
                    </Text>
                  </>
                ) : (
                  <Text variant="bodySmall">No goals set yet.</Text>
                )}
              </View>
            );
          })}
        </Card.Content>
        {members.length > LIST_LIMIT ? (
          <Card.Actions style={{ justifyContent: 'flex-end' }}>
            <Button mode="text" compact onPress={() => setShowAllGoals((v) => !v)}>
              {showAllGoals ? 'View less' : 'View all'}
            </Button>
          </Card.Actions>
        ) : null}
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Members" />
        <Card.Content>
          {members.length === 0 ? <Text>No members found yet.</Text> : null}
        </Card.Content>
        <Divider />
        {members.map((m) => (
          <List.Item
            key={m.uid}
            title={displayNameFor(m.uid)}
            description={[
              `Role: ${m.role}`,
              m.age != null ? `Age: ${m.age}` : null,
              m.height != null ? `Height: ${formatHeightInches(m.height)}` : null,
              m.weightCurrent != null ? `Current weight: ${formatWeightLb(m.weightCurrent)}` : null,
              m.weightGoal != null ? `Goal weight: ${formatWeightLb(m.weightGoal)}` : null,
            ]
              .filter(Boolean)
              .join('\n')}
            left={() => <UserAvatar uid={m.uid} size={36} />}
          />
        ))}
      </Card>
    </ScrollView>
  );
}


