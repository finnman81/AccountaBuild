import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Avatar, Button, Card, IconButton, Text, useTheme } from 'react-native-paper';
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
import SimpleLineChart from '../components/charts/SimpleLineChart';
import PlaceholderLineChart from '../components/charts/PlaceholderLineChart';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import type { RootStackParamList } from '../navigation/types';
import { subscribeCalorieDays, setCalorieDay } from '../services/calorieDays';
import { DEFAULT_TZ, isoWeekIdInTz, yyyyMmDdInTz } from '../mmr/time';
import { subscribeMyMmrState, type MmrState } from '../services/mmrState';
import { updateGlobalMmrUpToCurrentWeek } from '../services/mmrUpdate';
import { subscribeLatestMmrWeeklySummary, type MmrWeeklySummary } from '../services/mmrWeekly';
import { ensureSeasonRollover } from '../services/mmrSeason';
import { subscribeMyBadges, type EarnedBadge } from '../services/mmrBadges';
import RankBadge from '../components/mmr/RankBadge';
import { demotionRisk } from '../mmr/risk';
import { ensureGlobalSeasonDoc, subscribeGlobalSeason, type GlobalSeason } from '../services/mmrGlobalSeasons';

function weekStartSundayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

function weekdayShort(idx: number) {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][idx] ?? '';
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { user, logout } = useContext(AuthContext);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeGroupId } = useActiveGroup();

  const [profile, setProfile] = useState<any | null>(null);
  const [mmrState, setMmrState] = useState<MmrState | null>(null);
  const [mmrError, setMmrError] = useState<string | null>(null);
  const [mmrBusy, setMmrBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [latestWeekly, setLatestWeekly] = useState<MmrWeeklySummary | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [globalSeason, setGlobalSeason] = useState<GlobalSeason | null>(null);

  const [weightEntries, setWeightEntries] = useState<{ date: string; weight: number; tsMs: number | null }[]>([]);
  const [calorieDays, setCalorieDays] = useState<Record<string, { met: boolean }>>({});
  const [weekWorkoutDays, setWeekWorkoutDays] = useState<number[]>(Array(7).fill(0)); // circles
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [group, setGroup] = useState<{ streakRule?: 'workout' | 'any'; name?: string } | null>(null);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);

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
    if (!user?.uid) return;
    if (!mmrState?.currentSeasonId) return;
    // Best-effort initialize global season doc for countdown UI.
    void ensureGlobalSeasonDoc(user.uid, mmrState.currentSeasonId).catch(() => {});
  }, [mmrState?.currentSeasonId, user?.uid]);

  useEffect(() => {
    if (!mmrState?.currentSeasonId) {
      setGlobalSeason(null);
      return;
    }
    return subscribeGlobalSeason(mmrState.currentSeasonId, setGlobalSeason);
  }, [mmrState?.currentSeasonId]);

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
      .catch(() => setMmrError('Failed to update MMR.'))
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

  const last7DatesNY = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      out.push(yyyyMmDdInTz(d));
    }
    return out;
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeCalorieDays(user.uid, last7DatesNY, setCalorieDays);
  }, [last7DatesNY, user]);

  useEffect(() => {
    if (!user) return;
    const ref = query(collection(db, 'users', user.uid, 'workouts'), orderBy('ts', 'desc'), limit(100));
    return onSnapshot(ref, (snap) => {
      const weekStart = weekStartSundayLocal();
      const seen = new Set<string>();
      let total = 0;
      for (const d of snap.docs) {
        const data = d.data() as any;
        const date = String(data?.date ?? '');
        if (!date) continue;
        const dt = parseYYYYMMDDLocal(date);
        if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
        seen.add(date);
        const mins = Number(data?.durationMinutes);
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
    });
  }, [user]);

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
    const weekStart = weekStartSundayLocal();
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

  const recentWeightText = useMemo(() => {
    if (dailyWeightEntries.length === 0) return '';
    const last = dailyWeightEntries.slice(-6).map((e) => Math.round(e.weight));
    return `Recent (lb): ${last.join(', ')}`;
  }, [dailyWeightEntries]);

  const weightSeries = useMemo(() => dailyWeightEntries.map((e) => e.weight), [dailyWeightEntries]);
  const weightDates = useMemo(() => dailyWeightEntries.map((e) => e.date), [dailyWeightEntries]);

  // Default the weight chart to a 10 lb window, centered on current weight (rounded to nearest 5).
  const weightAxis = useMemo(() => {
    const vals = weightSeries.filter((n) => Number.isFinite(n));
    if (!vals.length) {
      return { yMin: null as number | null, yMax: null as number | null, ticks: { top: '—', mid: '—', bot: '—' } };
    }
    const last = vals[vals.length - 1];
    const center = Math.round(last / 5) * 5; // 189 -> 190
    const yMin = center - 5;
    const yMax = center + 5;
    const fmt = (n: number) => `${Math.round(n)}`;
    return { yMin, yMax, ticks: { top: fmt(yMax), mid: fmt(center), bot: fmt(yMin) } };
  }, [weightSeries]);

  const formatShortDate = (yyyyMMdd: string) => {
    const d = parseYYYYMMDDLocal(yyyyMMdd);
    if (Number.isNaN(d.valueOf())) return yyyyMMdd;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day}`;
  };

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

  const rankLabel = useMemo(() => {
    if (!mmrState) return 'Unranked';
    const div = mmrState.rankDivision;
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const tier = mmrState.rankTier;
    const lp = mmrState.lp ?? 0;
    return div ? `${tier} ${roman} • ${lp} LP` : `${tier} • ${lp} LP`;
  }, [mmrState]);

  const weeklyStatusLabel = useMemo(() => {
    if (!latestWeekly) return null;
    if (latestWeekly.missedWeek) return 'Missed week';
    if (latestWeekly.completedWeek) return 'Completed week';
    return 'Partial week';
  }, [latestWeekly]);

  const isSeasonBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'seasonRank' | 'seasonPeak' }> =>
    b.type === 'seasonRank' || b.type === 'seasonPeak';
  const isAchievementBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'achievement' }> => b.type === 'achievement';

  const risk = useMemo(() => {
    if (!mmrState) return { level: 'none' as const, message: '' };
    return demotionRisk({
      mmr: mmrState.mmr,
      consecutiveMissedWeeks: mmrState.consecutiveMissedWeeks,
      tierShieldWeeksRemaining: mmrState.tierShieldWeeksRemaining,
      missedLastWeek: Boolean(latestWeekly?.missedWeek),
    });
  }, [latestWeekly?.missedWeek, mmrState]);

  const seasonCountdown = useMemo(() => {
    if (!mmrState?.currentSeasonId) return null;
    const end = (globalSeason?.endDate ?? '').trim();
    if (!end) return null;
    const endDate = new Date(`${end}T23:59:59`);
    if (Number.isNaN(endDate.valueOf())) return null;
    const ms = endDate.getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    return { seasonId: mmrState.currentSeasonId, days };
  }, [globalSeason?.endDate, mmrState?.currentSeasonId]);

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
          .catch(() => setMmrError('Failed to refresh MMR.'))
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
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              🔥 {weekStreakCount}-day streak
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="My progress" subtitle={activeGroupId ? (group?.name ?? 'This group') : 'This week'} />
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                Global rank
              </Text>
              <Text variant="titleMedium">{rankLabel}</Text>
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                MMR: {mmrState?.mmr ?? '—'}
              </Text>
            </View>
            {mmrState ? <RankBadge tier={mmrState.rankTier} size={54} /> : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {activeGroupId ? (
                <Button
                  mode="outlined"
                  compact
                  onPress={() => {
                    // Jump into the HomeTab stack and open the leaderboard for the active group.
                    nav.navigate('MainTabs' as any, {
                      screen: 'HomeTab',
                      params: { screen: 'Leaderboard', params: { groupId: activeGroupId } },
                    } as any);
                  }}
                >
                  Leaderboard
                </Button>
              ) : null}
              <Button
                mode="outlined"
                compact
                loading={mmrBusy}
                disabled={mmrBusy || !user}
                onPress={() => {
                  if (!user) return;
                  setMmrError(null);
                  setMmrBusy(true);
                  void ensureSeasonRollover(user.uid)
                    .then(() => updateGlobalMmrUpToCurrentWeek(user.uid))
                    .catch(() => setMmrError('Failed to update MMR.'))
                    .finally(() => setMmrBusy(false));
                }}
              >
                Update
              </Button>
            </View>
          </View>
          {mmrError ? (
            <>
              <View style={{ height: 8 }} />
              <Text style={{ color: 'crimson' }}>{mmrError}</Text>
            </>
          ) : null}

          {latestWeekly ? (
            <>
              <View style={{ height: 12 }} />
              <View style={{ borderRadius: 14, padding: 12, backgroundColor: theme.colors.surfaceVariant }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text variant="titleSmall">Last week recap</Text>
                  <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                    {latestWeekly.weekId}
                  </Text>
                </View>
                <View style={{ height: 6 }} />
                <Text variant="bodyMedium">
                  {latestWeekly.deltaMMR >= 0 ? '+' : ''}
                  {Math.round(latestWeekly.deltaMMR)} MMR
                  {typeof (latestWeekly as any)?.deltaLP === 'number'
                    ? ` (${(latestWeekly as any).deltaLP >= 0 ? '+' : ''}${Math.round((latestWeekly as any).deltaLP)} LP)`
                    : ''}
                  {' • '}
                  {weeklyStatusLabel}
                </Text>
                <Text variant="bodySmall" style={{ opacity: 0.75, marginTop: 2 }}>
                  Penalty: {Math.round(latestWeekly.penalty)} • Bonus: {Math.round(latestWeekly.bonus)} • Streak ×{latestWeekly.streakMultiplier.toFixed(2)}
                </Text>
                {(latestWeekly as any)?.promotion ? (
                  <Text variant="bodySmall" style={{ opacity: 0.75, marginTop: 2 }}>
                    Promotion
                  </Text>
                ) : (latestWeekly as any)?.demotion ? (
                  <Text variant="bodySmall" style={{ opacity: 0.75, marginTop: 2 }}>
                    Demotion
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {seasonCountdown ? (
            <>
              <View style={{ height: 10 }} />
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                Season {seasonCountdown.seasonId} ends in {seasonCountdown.days} day{seasonCountdown.days === 1 ? '' : 's'}.
              </Text>
            </>
          ) : null}

          {risk.level !== 'none' ? (
            <>
              <View style={{ height: 10 }} />
              <View
                style={{
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor: risk.level === 'danger' ? 'rgba(220, 20, 60, 0.18)' : 'rgba(255, 165, 0, 0.18)',
                  borderWidth: 1,
                  borderColor: risk.level === 'danger' ? 'rgba(220, 20, 60, 0.45)' : 'rgba(255, 165, 0, 0.45)',
                }}
              >
                <Text variant="titleSmall">Demotion risk</Text>
                <View style={{ height: 4 }} />
                <Text variant="bodySmall" style={{ opacity: 0.85 }}>
                  {risk.message}
                </Text>
              </View>
            </>
          ) : null}

          {badges.length ? (
            <>
              <View style={{ height: 12 }} />
              <Text variant="titleSmall">Badges</Text>
              <View style={{ height: 8 }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {badges.filter(isSeasonBadge).map((b) => (
                    <View key={b.id} style={{ alignItems: 'center' }}>
                      <RankBadge tier={b.tier} size={48} />
                      <View style={{ height: 6 }} />
                      <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                        {b.seasonId}
                        {b.type === 'seasonPeak' ? ' Peak' : ''}
                      </Text>
                    </View>
                  ))}
              </ScrollView>
              {badges.some(isAchievementBadge) ? (
                <>
                  <View style={{ height: 10 }} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {badges.filter(isAchievementBadge).map((b) => (
                        <View
                          key={b.id}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            backgroundColor: theme.colors.surfaceVariant,
                            borderWidth: 1,
                            borderColor: theme.colors.outlineVariant,
                          }}
                        >
                          <Text variant="labelSmall">{b.title}</Text>
                        </View>
                      ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          <View style={{ height: 12 }} />
          <Text variant="titleMedium">{weekStreakCount}/7 streak days</Text>
          <Text variant="bodySmall" style={{ opacity: 0.75, marginTop: 2 }}>
            {streakRule === 'any' ? 'Counts any log' : 'Counts workouts only'} (set by group admin)
          </Text>

          <View style={{ height: 10 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            {weekStreak.map((v, idx) => (
              <View key={idx} style={{ alignItems: 'center', width: 34 }}>
                <Animated.View style={{ transform: [{ scale: circleAnim[idx] }] }}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      backgroundColor: v ? theme.colors.primary : theme.colors.surfaceVariant,
                      borderWidth: v ? 0 : 1,
                      borderColor: theme.colors.outlineVariant,
                    }}
                  />
                </Animated.View>
                <View style={{ height: 6 }} />
                <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                  {weekdayShort(idx)}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ height: 12 }} />
          <Text variant="bodyMedium">Total minutes trained this week: {weekMinutes > 0 ? formatMinutesHM(weekMinutes) : '—'}</Text>

          <View style={{ height: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text variant="titleMedium">Calorie goal days</Text>
            <Button mode="text" compact onPress={() => nav.navigate('MMRGoals')}>
              MMR goals
            </Button>
          </View>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Tap a day to mark “met calorie goal” (self-reported).
          </Text>
          <View style={{ height: 10 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {last7DatesNY.map((d) => {
              const met = Boolean(calorieDays[d]?.met);
              const dt = parseYYYYMMDDLocal(d);
              const label = weekdayShort(dt.getDay());
              return (
                <View key={d} style={{ alignItems: 'center', width: 40 }}>
                  <Button
                    mode={met ? 'contained' : 'outlined'}
                    compact
                    onPress={() => {
                      if (!user) return;
                      // Optimistic UI
                      setCalorieDays((prev) => ({ ...prev, [d]: { met: !met } }));
                      void setCalorieDay({ uid: user.uid, date: d, met: !met }).catch(() => {
                        // revert
                        setCalorieDays((prev) => ({ ...prev, [d]: { met } }));
                      });
                    }}
                    style={{ minWidth: 36, height: 34, justifyContent: 'center' }}
                    contentStyle={{ height: 34 }}
                  >
                    {met ? '✓' : ''}
                  </Button>
                  <View style={{ height: 6 }} />
                  <Text variant="labelSmall" style={{ opacity: 0.75 }}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={{ height: 16 }} />
          <Text variant="titleMedium">Weight trend (lb)</Text>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            {dailyWeightEntries.length ? `Last ${dailyWeightEntries.length} days` : 'Start tracking to see your progress curve.'}
          </Text>
          <View style={{ height: 8 }} />
          {dailyWeightEntries.length === 0 ? (
            <PlaceholderLineChart height={140} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 64, height: 160, paddingVertical: 8 }}>
                  <Text variant="labelSmall" style={{ opacity: 0.6, textAlign: 'right' }}>
                    lb
                  </Text>
                  <View style={{ flex: 1, justifyContent: 'space-between', marginTop: 4 }}>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {weightAxis.ticks.top}
                    </Text>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {weightAxis.ticks.mid}
                    </Text>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {weightAxis.ticks.bot}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <SimpleLineChart
                    values={weightSeries}
                    height={160}
                    width={Math.max(240, windowWidth - 32 - 32 - 64)}
                    showPointLabels={weightSeries.length <= 7}
                    formatPointLabel={(v) => `${Math.round(v)}`}
                    labelColor={theme.colors.onSurface}
                    color={theme.colors.primary}
                    yMin={weightAxis.yMin ?? undefined}
                    yMax={weightAxis.yMax ?? undefined}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                    {weightDates.map((d, i) => (
                      <Text key={`${d}-${i}`} variant="labelSmall" style={{ opacity: 0.75 }}>
                        {formatShortDate(d)}
                      </Text>
                    ))}
                  </View>
                  <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'center', marginTop: 4 }}>
                    Date
                  </Text>
                </View>
              </View>
              <View style={{ height: 8 }} />
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                {recentWeightText}
              </Text>
            </>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

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
                <View style={{ borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceVariant }}>
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
                <View style={{ borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceVariant }}>
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
              { title: 'Season history', icon: 'trophy', onPress: () => (nav as any).navigate('SeasonHistory') },
              { title: 'MMR history', icon: 'chart-line', onPress: () => (nav as any).navigate('MMRHistory') },
              {
                title: 'Notifications',
                icon: 'bell',
                description: 'Coming soon',
                onPress: async () => {
                  await Haptics.selectionAsync();
                },
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
    </Screen>
  );
}


