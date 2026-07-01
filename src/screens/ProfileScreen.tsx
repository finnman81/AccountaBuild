import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, TouchableOpacity, View } from 'react-native';
import { Card, IconButton, Text, useTheme } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import NavList from '../components/ui/NavList';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyProfile } from '../services/profile';
import { db } from '../firebase/firebase';
import { formatHeightInches, formatMinutesHM, formatWeightLb } from '../utils/formatters';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import type { RootStackParamList, ProfileStackParamList } from '../navigation/types';
import { DEFAULT_TZ, isoWeekIdInTz } from '../mmr/time';
import { formatYYYYMMDDLocal } from '../utils/dates';
import { subscribeMyMmrState, type MmrState } from '../services/mmrState';
import { updateGlobalMmrUpToCurrentWeek } from '../services/mmrUpdate';
import { subscribeLatestMmrWeeklySummary, type MmrWeeklySummary } from '../services/mmrWeekly';
import { ensureSeasonRollover } from '../services/mmrSeason';
import { subscribeMyBadges, type EarnedBadge } from '../services/mmrBadges';
import { ensureGlobalSeasonDoc } from '../services/mmrGlobalSeasons';
import { subscribeMyMmrProjection, type MmrProjection } from '../services/mmrProjection';
import { subscribeMyMmrGoals } from '../services/mmrGoals';
import RankHeroCard from '../components/profile/RankHeroCard';
import WeeklyTrajectoryCard from '../components/profile/WeeklyTrajectoryCard';
import RiskBanner from '../components/profile/RiskBanner';
import ConsistencyStrip from '../components/profile/ConsistencyStrip';
import TrendPreviewSparkline from '../components/profile/TrendPreviewSparkline';
import RankDetailsModal from '../components/profile/RankDetailsModal';
import ProjectionDetailsModal from '../components/profile/ProjectionDetailsModal';
import { spacing } from '../theme/spacing';

function weekStartMondayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout } = useContext(AuthContext);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList & ProfileStackParamList>>();
  const { activeGroupId } = useActiveGroup();

  const [profile, setProfile] = useState<any | null>(null);
  const [mmrState, setMmrState] = useState<MmrState | null>(null);
  const [mmrError, setMmrError] = useState<string | null>(null);
  const [mmrBusy, setMmrBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [latestWeekly, setLatestWeekly] = useState<MmrWeeklySummary | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [projection, setProjection] = useState<MmrProjection | null>(null);

  const [weightEntries, setWeightEntries] = useState<{ date: string; weight: number; tsMs: number | null }[]>([]);
  const [weekWorkoutDays, setWeekWorkoutDays] = useState<number[]>(Array(7).fill(0)); // circles
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [group, setGroup] = useState<{ streakRule?: 'workout' | 'any'; name?: string } | null>(null);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);
  const [rankDetailsVisible, setRankDetailsVisible] = useState(false);
  const [projectionDetailsVisible, setProjectionDetailsVisible] = useState(false);
  const [mmrGoals, setMmrGoals] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(user.uid, (p) => setProfile(p));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyMmrState(user.uid, setMmrState);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeLatestMmrWeeklySummary(user.uid, setLatestWeekly);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyBadges(user.uid, setBadges);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyMmrProjection(user.uid, setProjection);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyMmrGoals(user.uid, setMmrGoals);
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!mmrState?.currentSeasonId) return;
    // Best-effort initialize global season doc for countdown UI.
    void ensureGlobalSeasonDoc(user.uid, mmrState.currentSeasonId).catch(() => {});
  }, [mmrState?.currentSeasonId, user?.uid]);

  const didAutoCatchUpRef = useRef(false);
  useEffect(() => {
    if (!user || !mmrState) return;
    if (didAutoCatchUpRef.current) return;
    if (mmrBusy || refreshing) return;

    didAutoCatchUpRef.current = true;
    setMmrError(null);
    setMmrBusy(true);
    void ensureSeasonRollover(user.uid)
      .then(() => {
        // Only catch up MMR if the user is behind the current ISO week.
        const currentWeekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
        if (mmrState.lastWeekIdUpdated === currentWeekId) return;
        return updateGlobalMmrUpToCurrentWeek(user.uid);
      })
      .catch((err) => {
        console.error('[MMR Auto-Update Error]', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setMmrError(`Failed to update MMR: ${errorMessage}`);
      })
      .finally(() => setMmrBusy(false));
  }, [mmrBusy, mmrState, refreshing, user]);

  useEffect(() => {
    if (!user) return;
    const ref = query(collection(db, 'users', user.uid, 'weights'), orderBy('ts', 'desc'), limit(14));
    return onSnapshot(ref, (snap) => {
      const items = snap.docs
        .map((d) => {
          const data = d.data() as any;
          const w = Number(data?.weight);
          const date = String(data?.date ?? '');
          const ms = typeof data?.ts?.toMillis === 'function' ? data.ts.toMillis() : null;
          if (!Number.isFinite(w) || w <= 0 || !date) return null;
          return { date, weight: w, tsMs: ms as number | null };
        })
        .filter(Boolean) as { date: string; weight: number; tsMs: number | null }[];
      setWeightEntries(items.reverse()); // oldest -> newest for chart
    });
  }, [user]);

  const weekDates = useMemo(() => {
    const out: string[] = [];
    const start = weekStartMondayLocal();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push(formatYYYYMMDDLocal(d));
    }
    return out;
  }, []);

  const calorieTotalsByDate = useMemo(() => {
    if (!user) return {} as Record<string, number>;
    const weekStart = weekStartMondayLocal();
    const totals: Record<string, number> = {};
    
    // Check all group logs for calorie entries by this user
    for (const l of groupLogs) {
      if (l.uid !== user.uid || l.type !== 'calories') continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      const cals = Number((l.payload as any)?.calories);
      if (!Number.isFinite(cals) || cals <= 0) continue;
      totals[l.date] = (totals[l.date] ?? 0) + cals;
    }
    return totals;
  }, [groupLogs, user]);

  useEffect(() => {
    if (!user || !activeGroupId) {
      setWeekWorkoutDays(Array(7).fill(0));
      setWeekMinutes(0);
      return;
    }
    const weekStart = weekStartMondayLocal();
    const seen = new Set<string>();
    let total = 0;
    
    // Count workouts from group logs only (workout type)
    for (const l of groupLogs) {
      if (l.uid !== user.uid || l.type !== 'workout') continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      seen.add(l.date);
      const mins = Number((l.payload as any)?.durationMinutes);
      if (Number.isFinite(mins) && mins > 0) total += mins;
    }
    
    const days = Array(7).fill(0);
    for (const dateStr of seen.values()) {
      const dt = parseYYYYMMDDLocal(dateStr);
      const idx = dt.getDay();
      days[idx] = 1;
    }
    setWeekWorkoutDays(days);
    setWeekMinutes(Math.round(total));
  }, [user, activeGroupId, groupLogs]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroup(null);
      return;
    }
    return onSnapshot(doc(db, 'groups', activeGroupId), (snap) => {
      setGroup(snap.exists() ? ((snap.data() as any) ?? null) : null);
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupLogs([]);
      return;
    }
    return subscribeGroupLogs(activeGroupId, (items) => setGroupLogs(items), undefined, 200);
  }, [activeGroupId]);

  const streakRule = (group?.streakRule ?? 'workout') as 'workout' | 'any';

  const weekStreak = useMemo(() => {
    if (!user) return Array(7).fill(0);
    if (!activeGroupId) return Array(7).fill(0);
    const weekStart = weekStartMondayLocal();
    const allowed = streakRule === 'any' ? new Set(['workout', 'calories', 'weight', 'photo']) : new Set(['workout']);
    const dateSet = new Set<string>();
    for (const l of groupLogs) {
      if (l.uid !== user.uid) continue;
      if (!allowed.has(l.type)) continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      dateSet.add(l.date);
    }
    const days = Array(7).fill(0);
    for (const dateStr of dateSet.values()) {
      const dt = parseYYYYMMDDLocal(dateStr);
      days[dt.getDay()] = 1;
    }
    return days;
  }, [activeGroupId, groupLogs, streakRule, user]);

  const weekStreakCount = useMemo(() => weekStreak.reduce((a, b) => a + b, 0), [weekStreak]);

  // Weight chart should be "one point per day" (latest entry that day).
  // Users can log weight multiple times in a day; plotting duplicates makes the chart/labels confusing.
  const dailyWeightEntries = useMemo(() => {
    const byDate: Record<string, { date: string; weight: number; tsMs: number | null }> = {};
    for (const e of weightEntries) {
      const prev = byDate[e.date];
      // If the newest entry is still pending serverTimestamp, tsMs can be null.
      // Treat null as "newest" so same-day updates show immediately.
      const prevMs = prev?.tsMs ?? -1;
      const nextMs = e.tsMs ?? Number.MAX_SAFE_INTEGER;
      if (!prev || nextMs >= prevMs) byDate[e.date] = e;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [weightEntries]);

  const weightSeries = useMemo(() => dailyWeightEntries.map((e) => e.weight), [dailyWeightEntries]);

  // Calculate weight delta for sparkline (first vs last of last 7 days)
  const weightDelta = useMemo(() => {
    if (dailyWeightEntries.length < 2) return null;
    const last7 = dailyWeightEntries.slice(-7);
    if (last7.length < 2) return null;
    const first = last7[0].weight;
    const last = last7[last7.length - 1].weight;
    return last - first;
  }, [dailyWeightEntries]);

  const dailyCalorieGoal = Number(profile?.dailyCalorieGoal ?? 0);
  const calorieDayDots = useMemo(() => {
    return weekDates.map((d) => {
      const total = calorieTotalsByDate[d] ?? 0;
      return total > 0 ? 1 : 0;
    });
  }, [calorieTotalsByDate, weekDates]);

  const calorieDaysLogged = useMemo(
    () => calorieDayDots.reduce((sum: number, v: number) => sum + (v ? 1 : 0), 0),
    [calorieDayDots],
  );

  if (!user) {
    return (
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  const photoURL = String(profile?.photoURL ?? '').trim() || null;
  const name = String(profile?.displayName ?? user.displayName ?? user.email ?? 'You');

  const statItems = [
    { key: 'weightCurrent', label: 'Current weight', value: profile?.weightCurrent == null ? '—' : formatWeightLb(profile.weightCurrent), focusField: 'weightCurrent' as const },
    { key: 'weightGoal', label: 'Goal weight', value: profile?.weightGoal == null ? '—' : formatWeightLb(profile.weightGoal), focusField: 'weightGoal' as const },
    { key: 'height', label: 'Height', value: profile?.height == null ? '—' : formatHeightInches(profile.height), focusField: 'height' as const },
    { key: 'age', label: 'Age', value: profile?.age == null ? '—' : String(profile.age), focusField: 'age' as const },
  ];

  const prevWeekStreakRef = useRef<number[]>(Array(7).fill(0));
  const circleAnim = useRef(Array.from({ length: 7 }, () => new Animated.Value(1))).current;

  useEffect(() => {
    const prev = prevWeekStreakRef.current;
    const next = weekStreak;
    const newlyFilledIdx = next.findIndex((v, idx) => v === 1 && prev[idx] === 0);
    prevWeekStreakRef.current = next;
    if (newlyFilledIdx >= 0) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(circleAnim[newlyFilledIdx], { toValue: 1.15, duration: 140, useNativeDriver: true }),
        Animated.timing(circleAnim[newlyFilledIdx], { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [circleAnim, weekStreak]);

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={() => {
        if (!user) return;
        setMmrError(null);
        setRefreshing(true);
        void ensureSeasonRollover(user.uid)
          .then(() => updateGlobalMmrUpToCurrentWeek(user.uid))
          .catch((err) => {
            console.error('[MMR Refresh Error]', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setMmrError(`Failed to refresh MMR: ${errorMessage}`);
          })
          .finally(() => setRefreshing(false));
      }}
    >
      <Card>
        <Card.Content>
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                padding: 4,
                borderRadius: 24,
                borderWidth: 2,
                borderColor: theme.colors.primary,
              }}
            >
              {photoURL ? (
                <Image
                  source={{ uri: photoURL }}
                  style={{ width: 112, height: 112, borderRadius: 20, backgroundColor: '#111' }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 20,
                    backgroundColor: theme.colors.surfaceVariant,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text variant="headlineSmall">{name.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <IconButton
                icon="pencil"
                size={18}
                style={{ position: 'absolute', right: -6, bottom: -6, backgroundColor: theme.colors.surfaceVariant }}
                onPress={() => nav.navigate('EditProfile', undefined)}
              />
            </View>
            <View style={{ height: 12 }} />
            <Text variant="headlineSmall">{name}</Text>
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: spacing.base }} />

      {/* Section 1: Rank Header */}
      <RankHeroCard
        mmrState={mmrState}
        onPress={() => setRankDetailsVisible(true)}
        onViewLeaderboard={
          activeGroupId
            ? () => {
                nav.navigate('MainTabs' as any, {
                  screen: 'HomeTab',
                  params: { screen: 'Leaderboard', params: { groupId: activeGroupId } },
                } as any);
              }
            : undefined
        }
      />

      {mmrError ? (
        <>
          <View style={{ height: spacing.sm }} />
          <Card>
            <Card.Content>
              <Text style={{ color: 'crimson' }}>{mmrError}</Text>
            </Card.Content>
          </Card>
        </>
      ) : null}

      <View style={{ height: spacing.base }} />

      {/* Section 2: Weekly Trajectory */}
      <WeeklyTrajectoryCard
        projection={projection}
        onViewDetails={() => setProjectionDetailsVisible(true)}
      />

      <View style={{ height: spacing.base }} />

      {/* Section 3: Risk / Safety State */}
      <RiskBanner mmrState={mmrState} latestWeekly={latestWeekly} projection={projection} />

      <View style={{ height: spacing.base }} />

      {/* Section 4: Consistency */}
      <ConsistencyStrip
        title="Workouts"
        activeDays={weekWorkoutDays.reduce((sum, v) => sum + v, 0)}
        totalDays={7}
        streakDots={[weekWorkoutDays[1], weekWorkoutDays[2], weekWorkoutDays[3], weekWorkoutDays[4], weekWorkoutDays[5], weekWorkoutDays[6], weekWorkoutDays[0]]} // Reorder: Monday first
        countLabel="active days"
        footerText={`Total time this week: ${formatMinutesHM(weekMinutes)}`}
        onPress={() => {
          nav.navigate('MainTabs' as any, {
            screen: 'ProgressTab',
            params: { screen: 'Progress' },
          } as any);
        }}
      />

      <View style={{ height: spacing.base }} />

      {/* Section 5: Calorie Goals (only show if calories goal is enabled) */}
      {(mmrGoals.calorieDays?.status ?? 'active') === 'active' && (
        <>
          <ConsistencyStrip
            title="Calorie goals"
            activeDays={calorieDaysLogged}
            totalDays={7}
            streakDots={calorieDayDots}
            countLabel="days logged"
          />
          <View style={{ height: spacing.base }} />
        </>
      )}

      <View style={{ height: spacing.base }} />

      <Card>
        <Card.Title title="Stats" />
        <Card.Content>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {statItems.slice(0, 2).map((s) => (
              <TouchableOpacity
                key={s.key}
                style={{ flex: 1 }}
                onPress={() => nav.navigate('EditProfile', { focusField: s.focusField })}
              >
                <View style={{ borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)' }}>
                  <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                    {s.label}
                  </Text>
                  <Text variant="titleLarge" style={{ marginTop: 4 }}>
                    {s.value}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {statItems.slice(2, 4).map((s) => (
              <TouchableOpacity
                key={s.key}
                style={{ flex: 1 }}
                onPress={() => nav.navigate('EditProfile', { focusField: s.focusField })}
              >
                <View style={{ borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)' }}>
                  <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                    {s.label}
                  </Text>
                  <Text variant="titleLarge" style={{ marginTop: 4 }}>
                    {s.value}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="Settings & Controls" />
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <NavList
            items={[
              { title: 'Edit profile', icon: 'account-edit', onPress: () => nav.navigate('EditProfile', undefined) },
              { title: 'Goals', icon: 'target', onPress: () => nav.navigate('MMRGoals') },
              { title: 'Season history', icon: 'trophy', onPress: () => (nav as any).navigate('SeasonHistory') },
              { title: 'MMR history', icon: 'chart-line', onPress: () => (nav as any).navigate('MMRHistory') },
              {
                title: 'Notifications',
                icon: 'bell',
                onPress: () => nav.navigate('Notifications', undefined),
              },
              {
                title: 'Health & Fitness',
                icon: 'heart-pulse',
                onPress: () => (nav as any).navigate('HealthSettings'),
              },
              {
                title: 'Units',
                icon: 'ruler-square',
                description: 'lb/in (for now)',
                onPress: () => nav.navigate('EditProfile', { focusField: 'units' }),
              },
              {
                title: 'Privacy',
                icon: 'shield-lock',
                description: 'Coming soon',
                onPress: async () => {
                  await Haptics.selectionAsync();
                },
              },
              {
                title: 'Export data',
                icon: 'download',
                description: 'Coming soon',
                onPress: async () => {
                  await Haptics.selectionAsync();
                },
              },
              {
                title: 'Sign out',
                icon: 'logout',
                onPress: () => void logout(),
              },
            ]}
          />
        </Card.Content>
      </Card>

      {/* Modals */}
      <RankDetailsModal
        visible={rankDetailsVisible}
        mmrState={mmrState}
        badges={badges}
        onDismiss={() => setRankDetailsVisible(false)}
      />
      <ProjectionDetailsModal
        visible={projectionDetailsVisible}
        projection={projection}
        onDismiss={() => setProjectionDetailsVisible(false)}
      />
    </Screen>
  );
}


