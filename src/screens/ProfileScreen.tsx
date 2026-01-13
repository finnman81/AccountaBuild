import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ScrollView, TouchableOpacity, View } from 'react-native';
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
  const { user, logout } = useContext(AuthContext);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeGroupId } = useActiveGroup();

  const [profile, setProfile] = useState<any | null>(null);

  const [weightEntries, setWeightEntries] = useState<{ date: string; weight: number; tsMs: number | null }[]>([]);
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

  const recentWeightText = useMemo(() => {
    if (weightEntries.length === 0) return '';
    const last = weightEntries.slice(-6).map((e) => Math.round(e.weight));
    return `Recent (lb): ${last.join(', ')}`;
  }, [weightEntries]);

  const weightSeries = useMemo(() => weightEntries.map((e) => e.weight), [weightEntries]);
  const weightDates = useMemo(() => weightEntries.map((e) => e.date), [weightEntries]);

  const weightYTicks = useMemo(() => {
    const vals = weightSeries.filter((n) => Number.isFinite(n));
    if (!vals.length) return { top: '—', mid: '—', bot: '—' };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mid = (min + max) / 2;
    const fmt = (n: number) => `${Math.round(n)} lb`;
    return { top: fmt(max), mid: fmt(mid), bot: fmt(min) };
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
    { key: 'weightCurrent', label: 'Current', value: profile?.weightCurrent == null ? '—' : formatWeightLb(profile.weightCurrent), focusField: 'weightCurrent' as const },
    { key: 'weightGoal', label: 'Goal', value: profile?.weightGoal == null ? '—' : formatWeightLb(profile.weightGoal), focusField: 'weightGoal' as const },
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
    <Screen scroll>
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
              {weekStreakCount}-day streak
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="My progress" subtitle={activeGroupId ? (group?.name ?? 'This group') : 'This week'} />
        <Card.Content>
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
          <Text variant="titleMedium">Weight trend (lb)</Text>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            {weightEntries.length ? `Last ${weightEntries.length} entries` : 'Start tracking to see your progress curve.'}
          </Text>
          <View style={{ height: 8 }} />
          {weightEntries.length === 0 ? (
            <PlaceholderLineChart height={140} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 64, justifyContent: 'space-between', height: 160, paddingVertical: 8 }}>
                  <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                    {weightYTicks.top}
                  </Text>
                  <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                    {weightYTicks.mid}
                  </Text>
                  <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                    {weightYTicks.bot}
                  </Text>
                </View>
                <View style={{ flex: 1, overflow: 'hidden' }}>
                  <SimpleLineChart
                    values={weightSeries}
                    height={160}
                    showPointLabels={weightSeries.length <= 7}
                    formatPointLabel={(v) => `${Math.round(v)}`}
                    labelColor={theme.colors.onSurface}
                    color={theme.colors.primary}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                    {weightDates.map((d) => (
                      <Text key={d} variant="labelSmall" style={{ opacity: 0.75 }}>
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


