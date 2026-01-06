import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { subscribeGroupGoals, UserGoals } from '../services/goals';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupCharts'>;

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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function colorForPercent(percent: number, redHex: string, greenHex: string) {
  const t = Math.max(0, Math.min(1, percent / 100));
  const a = hexToRgb(redHex);
  const b = hexToRgb(greenHex);
  return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

export default function GroupChartsScreen({ route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [members, setMembers] = useState<Record<string, { displayName?: string | null }>>({});
  const [goals, setGoals] = useState<UserGoals[]>([]);

  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 500), [groupId]);
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const map: Record<string, { displayName?: string | null }> = {};
      for (const d of snap.docs) {
        const data = d.data() as any;
        map[data.uid ?? d.id] = { displayName: data.displayName ?? null };
      }
      setMembers(map);
    });
  }, [groupId]);
  useEffect(() => {
    return subscribeGroupGoals(groupId, setGoals);
  }, [groupId]);

  const compliance = useMemo(() => {
    const memberUids = Object.keys(members);
    const total = memberUids.length || 1;
    const weekStart = weekStartSundayLocal();

    const workoutsCount: Record<string, number> = {};
    const caloriesDays: Record<string, Set<string>> = {};
    const weightDays: Record<string, Set<string>> = {};

    for (const l of logs) {
      const d = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(d.valueOf()) || d < weekStart) continue;
      if (l.type === 'workout') workoutsCount[l.uid] = (workoutsCount[l.uid] ?? 0) + 1;
      if (l.type === 'calories') {
        caloriesDays[l.uid] = caloriesDays[l.uid] ?? new Set<string>();
        caloriesDays[l.uid].add(l.date);
      }
      if (l.type === 'weight') {
        weightDays[l.uid] = weightDays[l.uid] ?? new Set<string>();
        weightDays[l.uid].add(l.date);
      }
    }

    const goalsByUid: Record<string, UserGoals> = {};
    for (const g of goals) goalsByUid[g.uid] = g;

    let hasGoalsCount = 0;
    let sumWeightDone = 0;
    let sumWeightGoal = 0;
    let sumCaloriesDone = 0;
    let sumCaloriesGoal = 0;
    let sumWorkoutsDone = 0;
    let sumWorkoutsGoal = 0;

    for (const uid of memberUids) {
      const g = goalsByUid[uid];
      if (!g) continue;
      hasGoalsCount += 1;

      const wDays = weightDays[uid]?.size ?? 0;
      const cDays = caloriesDays[uid]?.size ?? 0;
      const wCount = workoutsCount[uid] ?? 0;

      const weightGoal = Math.max(0, Number(g.logWeightDaysPerWeek ?? 0));
      const caloriesGoal = Math.max(0, Number(g.logCaloriesDaysPerWeek ?? 0));
      const workoutsGoal = Math.max(0, Number(g.workoutsPerWeek ?? 0));

      if (weightGoal > 0) {
        sumWeightGoal += weightGoal;
        sumWeightDone += Math.min(wDays, weightGoal);
      }
      if (caloriesGoal > 0) {
        sumCaloriesGoal += caloriesGoal;
        sumCaloriesDone += Math.min(cDays, caloriesGoal);
      }
      if (workoutsGoal > 0) {
        sumWorkoutsGoal += workoutsGoal;
        sumWorkoutsDone += Math.min(wCount, workoutsGoal);
      }
    }

    const weightPct = sumWeightGoal > 0 ? Math.round((sumWeightDone / sumWeightGoal) * 100) : 0;
    const caloriesPct = sumCaloriesGoal > 0 ? Math.round((sumCaloriesDone / sumCaloriesGoal) * 100) : 0;
    const workoutPct = sumWorkoutsGoal > 0 ? Math.round((sumWorkoutsDone / sumWorkoutsGoal) * 100) : 0;

    return {
      totalMembers: memberUids.length,
      membersWithGoals: hasGoalsCount,
      weightPct,
      caloriesPct,
      workoutPct,
      weightRatio: sumWeightGoal > 0 ? `${sumWeightDone}/${sumWeightGoal}` : '—',
      caloriesRatio: sumCaloriesGoal > 0 ? `${sumCaloriesDone}/${sumCaloriesGoal}` : '—',
      workoutRatio: sumWorkoutsGoal > 0 ? `${sumWorkoutsDone}/${sumWorkoutsGoal}` : '—',
    };
  }, [logs, members, goals]);

  const bars = useMemo(
    () => [
      { label: 'Weight', pct: compliance.weightPct, ratio: compliance.weightRatio },
      { label: 'Calories', pct: compliance.caloriesPct, ratio: compliance.caloriesRatio },
      { label: 'Workouts', pct: compliance.workoutPct, ratio: compliance.workoutRatio },
    ],
    [compliance],
  );

  const red = theme.colors.secondary;
  const green = '#22C55E';
  const width = Math.max(260, windowWidth - 32); // ScrollView padding is 16 on each side
  const height = 140;
  const gap = Math.max(12, Math.round(width * 0.05));
  const chartLeft = 16;
  const baseline = 110;
  const maxH = 80;
  const barW = Math.max(56, Math.floor((width - chartLeft * 2 - gap * 2) / 3));

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Card.Title title="Charts" subtitle="Group compliance (this week)" />
        <Card.Content>
          <Text variant="bodySmall">
            Group progress toward weekly goals since Sunday at midnight (local time).
          </Text>
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title
          title="This week"
          subtitle={
            compliance.totalMembers
              ? `${compliance.membersWithGoals}/${compliance.totalMembers} members set goals`
              : 'No members yet'
          }
        />
        <Card.Content>
          <Svg width={width} height={height}>
            {bars.map((b, idx) => {
              const x = chartLeft + idx * (barW + gap);
              const h = Math.round((b.pct / 100) * maxH);
              const y = baseline - h;
              const fill = colorForPercent(b.pct, red, green);
              return (
                <React.Fragment key={b.label}>
                  <Rect x={x} y={y} width={barW} height={h} rx={10} ry={10} fill={fill} />
                  <SvgText x={x + barW / 2} y={baseline + 18} fontSize="12" fill={theme.colors.onSurface} textAnchor="middle">
                    {b.label}
                  </SvgText>
                  <SvgText x={x + barW / 2} y={baseline + 34} fontSize="12" fill={theme.colors.onSurfaceVariant} textAnchor="middle">
                    {b.ratio}
                  </SvgText>
                  <SvgText x={x + barW / 2} y={y - 6} fontSize="12" fill={theme.colors.onSurface} textAnchor="middle">
                    {b.pct}%
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
          <Text variant="bodySmall">
            Weight: {compliance.weightRatio} ({compliance.weightPct}%) • Calories: {compliance.caloriesRatio} ({compliance.caloriesPct}%) • Workouts: {compliance.workoutRatio} ({compliance.workoutPct}%)
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}


