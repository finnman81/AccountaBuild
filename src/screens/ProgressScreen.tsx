import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, useWindowDimensions, View } from 'react-native';
import { Button, Card, IconButton, List, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import EmptyState from '../components/state/EmptyState';
import SimpleLineChart from '../components/charts/SimpleLineChart';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { db } from '../firebase/firebase';
import { subscribeGroupLogs, subscribeGroupPhotoLogs, type GroupLog } from '../services/logs';
import { formatMinutesHM } from '../utils/formatters';
import type { ProgressStackParamList } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ProgressStackParamList, 'Progress'>;

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

function weekStartSundayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

function toMillis(t: any | null) {
  if (!t) return null;
  try {
    if (typeof t?.toMillis === 'function') return t.toMillis();
  } catch {}
  const d = t instanceof Date ? t : null;
  return d ? d.getTime() : null;
}

function formatYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayShort(idx: number) {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][idx] ?? '';
}

export default function ProgressScreen({ navigation }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = React.useContext(AuthContext);
  const { activeGroupId, groups, isReady, setActiveGroupId } = useActiveGroup();
  const [metric, setMetric] = useState<'weight' | 'workout' | 'calories'>('weight');

  const [photoLogs, setPhotoLogs] = useState<GroupLog[]>([]);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [groupMeta, setGroupMeta] = useState<{ name?: string | null; memberCount?: number | null } | null>(null);

  const activeGroupName = useMemo(() => {
    if (!activeGroupId) return null;
    return groups.find((g) => g.groupId === activeGroupId)?.name ?? 'Group';
  }, [activeGroupId, groups]);

  useEffect(() => {
    if (!activeGroupId) {
      setPhotoLogs([]);
      return;
    }
    return subscribeGroupPhotoLogs(
      activeGroupId,
      (items) => setPhotoLogs(items),
      undefined,
      60,
    );
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupLogs([]);
      return;
    }
    return subscribeGroupLogs(
      activeGroupId,
      (items) => setGroupLogs(items),
      undefined,
      250,
    );
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setMemberUids([]);
      return;
    }
    return onSnapshot(collection(db, 'groups', activeGroupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupMeta(null);
      return;
    }
    return onSnapshot(doc(db, 'groups', activeGroupId), (snap) => {
      if (!snap.exists()) {
        setGroupMeta(null);
        return;
      }
      const data = snap.data() as any;
      setGroupMeta({
        name: data?.name ?? null,
        memberCount: typeof data?.memberCount === 'number' ? data.memberCount : null,
      });
    });
  }, [activeGroupId]);

  const photoStrip = useMemo(() => photoLogs.slice(0, 12), [photoLogs]);

  const weekDates = useMemo(() => {
    const start = weekStartSundayLocal();
    const out: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(formatYYYYMMDD(d));
    }
    return out;
  }, []);

  const aggregates = useMemo(() => {
    if (!activeGroupId) return { series: [] as number[], history: [] as any[], yLabel: '', title: '' };
    const weekStart = weekStartSundayLocal();
    const memberCount = memberUids.length || groupMeta?.memberCount || 0;
    const divisor = Math.max(1, memberCount);

    const workoutMinsByDate: Record<string, number> = {};
    const caloriesByDate: Record<string, number> = {};

    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        workoutMinsByDate[l.date] = (workoutMinsByDate[l.date] ?? 0) + mins;
      }
      if (l.type === 'calories') {
        const c = Number((l.payload as any)?.calories);
        if (!Number.isFinite(c) || c <= 0) continue;
        caloriesByDate[l.date] = (caloriesByDate[l.date] ?? 0) + c;
      }
    }

    const weightByDateByUid: Record<string, Record<string, { w: number; tsMs: number }>> = {};
    for (const l of groupLogs) {
      if (l.type !== 'weight') continue;
      const w = Number((l.payload as any)?.weight);
      if (!Number.isFinite(w) || w <= 0) continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      const ms = toMillis(l.ts ?? null) ?? 0;
      weightByDateByUid[l.date] = weightByDateByUid[l.date] ?? {};
      const prev = weightByDateByUid[l.date][l.uid];
      if (!prev || ms >= prev.tsMs) weightByDateByUid[l.date][l.uid] = { w, tsMs: ms };
    }
    const baselineByUid: Record<string, number> = {};
    for (const d of Object.keys(weightByDateByUid).sort()) {
      for (const [uid, entry] of Object.entries(weightByDateByUid[d])) {
        if (baselineByUid[uid] == null) baselineByUid[uid] = entry.w;
      }
    }

    const avgPercentLossByDate: Record<string, number | null> = {};
    for (const d of weekDates) {
      const day = weightByDateByUid[d] ?? {};
      const vals: number[] = [];
      for (const [uid, entry] of Object.entries(day)) {
        const base = baselineByUid[uid];
        if (!Number.isFinite(base) || base <= 0) continue;
        const pct = ((base - entry.w) / base) * 100;
        if (Number.isFinite(pct)) vals.push(pct);
      }
      avgPercentLossByDate[d] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    }

    const history = weekDates.map((d) => {
      const avgMins = Math.round(((workoutMinsByDate[d] ?? 0) / divisor) * 10) / 10;
      const avgCals = Math.round(((caloriesByDate[d] ?? 0) / divisor) * 10) / 10;
      const avgPct = avgPercentLossByDate[d];
      return { date: d, avgPct, avgMins, avgCals };
    });

    if (metric === 'workout') {
      return { title: 'Workout (Avg minutes)', yLabel: 'Minutes', series: history.map((h) => h.avgMins), history };
    }
    if (metric === 'calories') {
      return { title: 'Calories under goal (avg)', yLabel: 'Calories', series: history.map((h) => h.avgCals), history };
    }
    // weight
    return {
      title: 'Weight trend (Avg Percent Loss)',
      yLabel: 'Percent',
      series: history.map((h) => (h.avgPct == null ? 0 : h.avgPct)),
      history,
    };
  }, [activeGroupId, groupLogs, groupMeta?.memberCount, memberUids.length, metric, weekDates]);

  const yTicks = useMemo(() => {
    if (!aggregates.series.length) return { top: '—', mid: '—', bot: '—' };
    const vals = aggregates.series.filter((n) => Number.isFinite(n));
    if (!vals.length) return { top: '—', mid: '—', bot: '—' };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mid = (min + max) / 2;
    const fmt = (n: number) => {
      if (metric === 'weight') return `${Math.round(n * 100) / 100}%`;
      if (metric === 'workout') return `${Math.round(n)}`;
      return `${Math.round(n)}`;
    };
    return { top: fmt(max), mid: fmt(mid), bot: fmt(min) };
  }, [aggregates.series, metric]);

  const formatPointLabel = useMemo(() => {
    if (metric === 'weight') return (v: number) => `${Math.round(v * 100) / 100}%`;
    if (metric === 'workout') return (v: number) => `${Math.round(v)}m`;
    return (v: number) => `${Math.round(v)}`;
  }, [metric]);

  if (!user) {
    return (
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  if (!isReady) {
    return (
      <Screen>
        <Text>Loading…</Text>
      </Screen>
    );
  }

  if (!activeGroupId) {
    return (
      <Screen>
        <EmptyState
          title="Pick a group"
          message="Create or join a group to unlock group progress and photo history."
          ctaLabel="Go to Groups"
          onCta={() => rootNav.navigate('MainTabs', { screen: 'GroupsTab' } as any)}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll safeTop={false}>
      <Card>
        <Card.Title title="Progress" subtitle={activeGroupName ?? undefined} />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75, marginBottom: 8 }}>
            Group
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {groups.map((g) => (
              <Button
                key={g.groupId}
                mode={g.groupId === activeGroupId ? 'contained' : 'outlined'}
                compact
                onPress={() => void setActiveGroupId(g.groupId)}
              >
                {g.name}
              </Button>
            ))}
          </ScrollView>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="Trend" subtitle="Group averages" />
        <Card.Content>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Button mode={metric === 'weight' ? 'contained' : 'outlined'} compact onPress={() => setMetric('weight')}>
              Bodyweight
            </Button>
            <Button mode={metric === 'workout' ? 'contained' : 'outlined'} compact onPress={() => setMetric('workout')}>
              Workout
            </Button>
            <Button mode={metric === 'calories' ? 'contained' : 'outlined'} compact onPress={() => setMetric('calories')}>
              Calories
            </Button>
          </ScrollView>

          <View style={{ height: 12 }} />

          <Text variant="titleMedium">{aggregates.title}</Text>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            {metric === 'weight'
              ? 'This week vs first weigh-in this week'
              : `This week • averaged across ${Math.max(1, memberUids.length || groupMeta?.memberCount || 0)} members`}
          </Text>

          <View style={{ height: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/**
             * Layout math:
             * - Screen adds 16px padding on each side => 32 total
             * - Card.Content has its own horizontal padding (Paper default ~16 each side => 32)
             * - We also have a Y-axis tick column to the left (yAxisW)
             */}
            {(() => {
              const yAxisW = 56;
              const estimatedCardPadding = 32;
              const chartW = Math.max(240, width - 32 - estimatedCardPadding - yAxisW);
              return (
                <>
                  <View style={{ width: yAxisW, justifyContent: 'space-between', height: 160, paddingVertical: 8 }}>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {yTicks.top}
                    </Text>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {yTicks.mid}
                    </Text>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'right' }}>
                      {yTicks.bot}
                    </Text>
                  </View>
                  <View style={{ flex: 1, overflow: 'hidden' }}>
                    <SimpleLineChart
                      values={aggregates.series}
                      height={160}
                      width={chartW}
                      color={theme.colors.primary}
                      showPointLabels
                      formatPointLabel={formatPointLabel}
                      labelColor={theme.colors.onSurface}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                      {weekDates.map((d) => {
                        const idx = parseYYYYMMDDLocal(d).getDay();
                        return (
                          <Text key={d} variant="labelSmall" style={{ opacity: 0.75 }}>
                            {weekdayShort(idx)}
                          </Text>
                        );
                      })}
                    </View>
                    <Text variant="labelSmall" style={{ opacity: 0.75, textAlign: 'center', marginTop: 4 }}>
                      Day
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="History" />
        <Card.Content style={{ paddingHorizontal: 0 }}>
          {aggregates.history.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ opacity: 0.75 }}>No data yet.</Text>
            </View>
          ) : (
            aggregates.history
              .slice()
              .reverse()
              .map((h: any) => (
                <List.Item
                  key={h.date}
                  title={h.date}
                  description={[
                    `Avg % loss: ${h.avgPct == null ? '—' : `${h.avgPct}%`}`,
                    `Avg minutes: ${formatMinutesHM(h.avgMins)}`,
                    `Avg calories: ${Math.round(h.avgCals)}`,
                  ].join('\n')}
                />
              ))
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title
          title="Progress pictures"
          right={() => (
            <Button
              mode="text"
              onPress={() =>
                rootNav.navigate(
                  'MainTabs',
                  {
                    screen: 'HomeTab',
                    params: { screen: 'ViewPhotos', params: { groupId: activeGroupId } },
                  } as any,
                )
              }
            >
              See all
            </Button>
          )}
        />
        <Card.Content>
          {photoStrip.length === 0 ? (
            <Text style={{ opacity: 0.75 }}>No photos yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {photoStrip.map((l) => {
                const uri = String((l.payload as any)?.url ?? '').trim();
                if (!uri) return null;
                return (
                  <View key={l.id} style={{ width: 92, height: 92, borderRadius: 16, overflow: 'hidden' }}>
                    <IconButton
                      icon="magnify-plus-outline"
                      size={18}
                      style={{ position: 'absolute', top: 2, right: 2, zIndex: 2, backgroundColor: '#00000066' }}
                      iconColor="#fff"
                      onPress={() => setViewerUri(uri)}
                    />
                    <Image source={{ uri }} style={{ width: 92, height: 92 }} />
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Card.Content>
      </Card>

      <Portal>
        <Modal
          visible={Boolean(viewerUri)}
          onDismiss={() => setViewerUri(null)}
          contentContainerStyle={{ margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.surface }}
        >
          {viewerUri ? <Image source={{ uri: viewerUri }} style={{ width: '100%', height: 420 }} /> : null}
        </Modal>
      </Portal>
    </Screen>
  );
}

