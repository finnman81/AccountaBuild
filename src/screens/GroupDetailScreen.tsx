import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Avatar, Button, Card, Divider, IconButton, List, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import Screen from '../components/layout/Screen';
import PrimaryButton from '../components/ui/PrimaryButton';
import NavList from '../components/ui/NavList';
import MemberStatusCard from '../components/group/MemberStatusCard';
import LoadingState from '../components/state/LoadingState';
import EmptyState from '../components/state/EmptyState';
import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { subscribeGroupGoals, UserGoals } from '../services/goals';
import { ensureJoinCodeMapping, subscribeMyGroupMeta } from '../services/groups';
import { formatHeightInches, formatWeightLb, friendlyNameFromDisplayName } from '../utils/formatters';
import { buildMemberSummaries, sortMemberSummaries } from '../viewmodels/memberSummary';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupDetail'>;

type GroupDoc = {
  name?: string;
  description?: string | null;
  joinCode?: string;
  createdBy?: string;
  logoUrl?: string | null;
  streakRule?: 'workout' | 'any';
};

type MemberDoc = {
  uid: string;
  role: 'admin' | 'member';
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
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [goals, setGoals] = useState<UserGoals[]>([]);
  const [myMeta, setMyMeta] = useState<any | null>(null);
  const [latestChatAt, setLatestChatAt] = useState<any | null>(null);
  const [latestPhotoAt, setLatestPhotoAt] = useState<any | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [isGoalsLoading, setIsGoalsLoading] = useState(true);
  const [todayMode, setTodayMode] = useState<'calories' | 'workout' | 'weight'>('calories');

  useEffect(() => {
    const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      setGroup(snap.exists() ? (snap.data() as GroupDoc) : null);
    });

    setIsMembersLoading(true);
    const unsubMembers = onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data() as any;
        const uid = (data.uid ?? d.id) as string;
        return { uid, ...(data as Omit<MemberDoc, 'uid'>) } as MemberDoc;
      });
      setMembers(items);
      setIsMembersLoading(false);
    });

    return () => {
      unsubGroup();
      unsubMembers();
    };
  }, [groupId]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const allowed = members
      .map((m) => m.uid)
      .filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, setPublicUsers);
  }, [canSee, members, user?.uid]);

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
    setIsLogsLoading(true);
    return subscribeGroupLogs(
      groupId,
      (items) => {
        setLogs(items);
        setIsLogsLoading(false);
      },
      () => setIsLogsLoading(false),
      50,
    );
  }, [groupId]);

  useEffect(() => {
    setIsGoalsLoading(true);
    return subscribeGroupGoals(groupId, (items) => {
      setGoals(items);
      setIsGoalsLoading(false);
    });
  }, [groupId]);

  const myRole = useMemo(() => {
    if (!user) return null;
    return members.find((m) => m.uid === user.uid)?.role ?? null;
  }, [members, user]);

  const isCreator = Boolean(user?.uid && group?.createdBy && user.uid === group.createdBy);
  const streakRule = (group?.streakRule ?? 'workout') as 'workout' | 'any';

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
    const p = publicUsers[uid];
    return friendlyNameFromDisplayName(p?.displayName ?? null, uid);
  };

  const rankLabelFor = (uid: string) => {
    const p = publicUsers[uid] as any;
    const tier = String(p?.rankTierPublic ?? '').trim();
    const div = p?.rankDivisionPublic;
    const lp = p?.lpPublic;
    if (!tier) return '—';
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const lpTxt = typeof lp === 'number' ? `${Math.round(lp)} LP` : null;
    return [div ? `${tier} ${roman}` : tier, lpTxt].filter(Boolean).join(' • ');
  };

  const photoUrlFor = (uid: string) => {
    const p = publicUsers[uid];
    const u = (p?.photoURL ?? '').trim();
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
    if (url) {
      return (
        <Image
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
          }}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceVariant,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text variant="titleMedium">{initialsFor(uid).slice(0, 2)}</Text>
      </View>
    );
  };

  const RecentAvatar = ({ uid }: { uid: string }) => {
    const url = photoUrlFor(uid);
    const size = 44;
    if (url) {
      return (
        <Image
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
          }}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceVariant,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text variant="titleMedium">{initialsFor(uid).slice(0, 2)}</Text>
      </View>
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

  const streakDaysThisWeekByUid = useMemo(() => {
    const weekStart = weekStartSundayLocal();
    const allowed = streakRule === 'any' ? new Set(['workout', 'calories', 'weight', 'photo']) : new Set(['workout']);
    const datesByUid: Record<string, Set<string>> = {};
    for (const l of logs) {
      if (!allowed.has(l.type)) continue;
      const d = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(d.valueOf()) || d < weekStart) continue;
      datesByUid[l.uid] = datesByUid[l.uid] ?? new Set<string>();
      datesByUid[l.uid].add(l.date);
    }
    const out: Record<string, number> = {};
    for (const [uid, set] of Object.entries(datesByUid)) out[uid] = set.size;
    return out;
  }, [logs, streakRule]);

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

  const memberSummaries = useMemo(() => {
    const today = todayYYYYMMDD();
    const weekStart = weekStartSundayLocal();
    const summaries = buildMemberSummaries({
      members: members.map((m) => ({
        uid: m.uid,
        displayName: publicUsers[m.uid]?.displayName ?? null,
        photoURL: publicUsers[m.uid]?.photoURL ?? null,
      })),
      goals,
      logs,
      todayYYYYMMDD: today,
      weekStart,
      workoutLabel: friendlyWorkout,
    });
    return sortMemberSummaries(summaries);
  }, [goals, logs, members, publicUsers]);

  const isTodayLoading = isMembersLoading || isLogsLoading || isGoalsLoading;
  const nobodyLoggedToday = memberSummaries.length > 0 && memberSummaries.every((m) => !m.loggedToday);

  const todaySummary = useMemo(() => {
    const today = todayYYYYMMDD();
    const totalMembers = members.length;
    const loggedCount = memberSummaries.filter((m) => m.loggedToday).length;
    const workoutDayCount = memberSummaries.filter((m) => m.workoutMinutesToday > 0).length;
    const photosToday = logs.filter((l) => l.type === 'photo' && l.date === today).length;
    return { totalMembers, loggedCount, workoutDayCount, photosToday };
  }, [logs, memberSummaries, members.length]);

  return (
    <Screen safeTop={false}>
      <Card>
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {group?.logoUrl ? (
              <Image
                source={{ uri: group.logoUrl }}
                style={{ width: 140, height: 140, borderRadius: 24, backgroundColor: '#111' }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ width: 140, height: 140, borderRadius: 24, backgroundColor: '#222' }} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="headlineLarge">{group?.name ?? 'Group'}</Text>
              {group?.description ? (
                <Text variant="bodyMedium" style={{ opacity: 0.8, marginTop: 4 }}>
                  {group.description}
                </Text>
              ) : null}
              <View style={{ height: 10 }} />
              <Text variant="bodyMedium">Join code: {group?.joinCode ?? '—'}</Text>
              <View style={{ height: 6 }} />
              <Text variant="bodySmall" style={{ opacity: 0.8 }}>
                Your role: {myRole ?? '—'}
              </Text>
            </View>
          </View>

          <View style={{ height: 16 }} />
          <PrimaryButton onPress={() => navigation.navigate('LogToday', { groupId })}>Log today</PrimaryButton>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <NavList
            items={[
              { title: 'View charts', icon: 'chart-line', onPress: () => navigation.navigate('GroupCharts', { groupId }) },
              { title: 'Leaderboard', icon: 'trophy', onPress: () => navigation.navigate('Leaderboard', { groupId }) },
              { title: 'Group chat', icon: 'message', badge: hasNewChat, onPress: () => navigation.navigate('GroupChat', { groupId }) },
              { title: 'Progress gallery', icon: 'image-multiple', badge: hasNewPhotos, onPress: () => navigation.navigate('ViewPhotos', { groupId }) },
              { title: 'Goals', icon: 'target', onPress: () => navigation.navigate('SetGoals', { groupId }) },
              { title: 'Group settings', icon: 'cog', onPress: () => navigation.navigate('GroupSettings', { groupId }) },
            ]}
          />
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Today" subtitle="Member status" />
        <Card.Content>
          {isTodayLoading ? (
            <LoadingState skeletonCount={3} />
          ) : memberSummaries.length === 0 ? (
            <Text>No members yet.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {nobodyLoggedToday ? (
                <EmptyState
                  title="No one has logged today"
                  message="Be the first to log calories or a workout."
                  ctaLabel="Log now"
                  onCta={() => navigation.navigate('LogToday', { groupId })}
                />
              ) : null}
              <View
                style={{
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: theme.colors.surfaceVariant,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                      Logged today
                    </Text>
                    <Text variant="titleLarge">
                      {todaySummary.loggedCount}/{todaySummary.totalMembers}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                      Workout days
                    </Text>
                    <Text variant="titleLarge">{todaySummary.workoutDayCount}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                      Photos
                    </Text>
                    <Text variant="titleLarge">{todaySummary.photosToday}</Text>
                  </View>
                </View>
                <View style={{ height: 10 }} />
                <View
                  style={{
                    height: 8,
                    borderRadius: 999,
                    overflow: 'hidden',
                    backgroundColor: theme.colors.backdrop,
                    opacity: 0.35,
                  }}
                >
                  <View
                    style={{
                      height: 8,
                      width: `${todaySummary.totalMembers > 0 ? (todaySummary.loggedCount / todaySummary.totalMembers) * 100 : 0}%`,
                      backgroundColor: theme.colors.primary,
                      opacity: 1,
                    }}
                  />
                </View>
              </View>

              <SegmentedButtons
                value={todayMode}
                onValueChange={(v) => setTodayMode(v as any)}
                buttons={[
                  { value: 'calories', label: 'Calories' },
                  { value: 'workout', label: 'Workout' },
                  { value: 'weight', label: 'Weight' },
                ]}
              />

              {memberSummaries.map((m) => (
                <MemberStatusCard key={m.uid} item={m} mode={todayMode} />
              ))}
            </View>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />
      <Card>
        <Card.Title title="Recent activity" />
        <Card.Content>
          {logs.length === 0 ? <Text>No logs yet. Add one!</Text> : null}
        </Card.Content>
        <Divider />
        {recentItems.map((l) => {
          const meta = formatLog(l);
          const note = logNote(l);
          const ts = formatLogDateTime(l);
          const canEdit = Boolean(user?.uid && l.uid === user.uid && l.type !== 'photo');
          return (
            <List.Item
              key={l.id}
              title={meta.title}
              description={
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Text variant="bodySmall" style={{ opacity: 0.85 }}>
                      {meta.subtitle}
                    </Text>
                    <Text variant="bodySmall" style={{ opacity: 0.5 }}>
                      {'  ·  '}
                    </Text>
                    <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                      {ts}
                    </Text>
                  </View>
                  {note ? (
                    <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                      {note}
                    </Text>
                  ) : null}
                </View>
              }
              left={() => (
                <View style={{ marginLeft: 8, justifyContent: 'center' }}>
                  <RecentAvatar uid={l.uid} />
                </View>
              )}
              right={() =>
                canEdit ? (
                  <IconButton
                    icon="pencil"
                    onPress={() => {
                      if (l.type === 'calories') {
                        const c = Number((l.payload as any)?.calories);
                        const meal = ((l.payload as any)?.meal ?? 'all') as any;
                        const n = (l.payload as any)?.note ?? null;
                        if (!Number.isFinite(c) || c <= 0) return;
                        navigation.navigate('AddCalories', { groupId, edit: { logId: l.id, date: l.date, calories: c, meal, note: n } });
                        return;
                      }
                      if (l.type === 'workout') {
                        const workoutType = ((l.payload as any)?.workoutType ?? 'weightLifting') as any;
                        const mins = Number((l.payload as any)?.durationMinutes);
                        const n = (l.payload as any)?.note ?? null;
                        if (!Number.isFinite(mins) || mins <= 0) return;
                        navigation.navigate('AddWorkout', {
                          groupId,
                          edit: { logId: l.id, date: l.date, workoutType, durationMinutes: mins, note: n },
                        });
                        return;
                      }
                      if (l.type === 'weight') {
                        const w = Number((l.payload as any)?.weight);
                        const n = (l.payload as any)?.note ?? null;
                        if (!Number.isFinite(w) || w <= 0) return;
                        navigation.navigate('AddWeight', { groupId, edit: { logId: l.id, date: l.date, weight: w, note: n } });
                      }
                    }}
                  />
                ) : null
              }
            />
          );
        })}
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
              (() => {
                const n = streakDaysThisWeekByUid[m.uid] ?? 0;
                return n > 0 ? `🔥 ${n}-day streak` : `😢 ${n}-day streak`;
              })(),
              `Rank: ${rankLabelFor(m.uid)}`,
              publicUsers[m.uid]?.age != null ? `Age: ${publicUsers[m.uid]?.age}` : null,
              publicUsers[m.uid]?.height != null ? `Height: ${formatHeightInches(publicUsers[m.uid]?.height)}` : null,
              publicUsers[m.uid]?.weightCurrent != null ? `Current weight: ${formatWeightLb(publicUsers[m.uid]?.weightCurrent)}` : null,
              publicUsers[m.uid]?.weightGoal != null ? `Goal weight: ${formatWeightLb(publicUsers[m.uid]?.weightGoal)}` : null,
            ]
              .filter(Boolean)
              .join('\n')}
            left={() => (
              <View style={{ marginLeft: 8, justifyContent: 'center' }}>
                <UserAvatar uid={m.uid} size={36} />
              </View>
            )}
          />
        ))}
      </Card>
    </Screen>
  );
}


