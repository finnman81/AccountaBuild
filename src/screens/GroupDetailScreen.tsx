import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Divider, List, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, onSnapshot } from 'firebase/firestore';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { subscribeGroupGoals, UserGoals } from '../services/goals';
import { ensureJoinCodeMapping } from '../services/groups';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

type GroupDoc = {
  name?: string;
  description?: string | null;
  joinCode?: string;
  createdBy?: string;
};

type MemberDoc = {
  uid: string;
  role: 'admin' | 'member';
  displayName?: string | null;
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

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [goals, setGoals] = useState<UserGoals[]>([]);

  useEffect(() => {
    const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup(snap.exists() ? (snap.data() as GroupDoc) : null);
    });

    const unsubMembers = onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const items = snap.docs.map((d) => d.data() as MemberDoc);
      setMembers(items);
    });

    return () => {
      unsubGroup();
      unsubMembers();
    };
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

  const memberMap = useMemo(() => {
    const map: Record<string, MemberDoc> = {};
    for (const m of members) map[m.uid] = m;
    return map;
  }, [members]);

  const displayNameFor = (uid: string) => {
    const m = memberMap[uid];
    return (m?.displayName || '').trim() || uid;
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
        subtitle: `Weight${Number.isFinite(w) ? ` • ${w}` : ''}`,
      };
    }
    if (l.type === 'calories') {
      const c = Number((l.payload as any)?.calories);
      return {
        title: who,
        subtitle: `Calories${Number.isFinite(c) ? ` • ${c}` : ''}`,
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

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Card.Title title={group?.name ?? 'Group'} subtitle={group?.description ?? undefined} />
        <Card.Content>
          <Text variant="bodyMedium">Join code: {group?.joinCode ?? '—'}</Text>
          <View style={{ height: 8 }} />
          <Text variant="bodySmall">Your role: {myRole ?? '—'}</Text>
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
          <Button mode="outlined" onPress={() => navigation.navigate('ViewPhotos', { groupId })}>
            View photos
          </Button>
          <View style={{ height: 12 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('GroupCharts', { groupId })}>
            View charts
          </Button>
          <View style={{ height: 12 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('GroupChat', { groupId })}>
            Open group chat
          </Button>
          <View style={{ height: 12 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('SetGoals', { groupId })}>
            Set my goals
          </Button>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Recent activity" />
        <Card.Content>
          {logs.length === 0 ? <Text>No logs yet. Add one!</Text> : null}
        </Card.Content>
        <Divider />
        {logs.map((l) => (
          <List.Item
            key={l.id}
            title={formatLog(l).title}
            description={`${formatLog(l).subtitle}\n${l.date}`}
            left={(props) => <List.Icon {...props} icon="history" />}
          />
        ))}
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Quick stats" />
        <Card.Content>
          {members.map((m) => {
            const s = rollup[m.uid] ?? { caloriesToday: 0, workoutsThisWeek: 0, lastWeight: null };
            return (
              <View key={m.uid} style={{ marginBottom: 12 }}>
                <Text variant="bodyMedium">{displayNameFor(m.uid)}</Text>
                <Text variant="bodySmall">Calories today: {s.caloriesToday}</Text>
                <Text variant="bodySmall">Workouts (this week): {s.workoutsThisWeek}</Text>
                <Text variant="bodySmall">Last weight: {s.lastWeight ?? '—'}</Text>
              </View>
            );
          })}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Goals (this week)" />
        <Card.Content>
          {members.map((m) => {
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
              m.height != null ? `Height: ${m.height}` : null,
              m.weightCurrent != null ? `Current weight: ${m.weightCurrent}` : null,
              m.weightGoal != null ? `Goal weight: ${m.weightGoal}` : null,
            ]
              .filter(Boolean)
              .join('\n')}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
        ))}
      </Card>
    </ScrollView>
  );
}


