import React, { useContext, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, ScrollView, View, useWindowDimensions } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers } from '../services/publicUsers';

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
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [publicUsers, setPublicUsers] = useState<Record<string, any>>({});

  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 500), [groupId]);
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
    });
  }, [groupId]);
  useEffect(() => {
    if (!user) return;
    return subscribeMyCanSeeUids(user.uid, (uids) => setCanSee(new Set(uids)), undefined);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const visible = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(visible, setPublicUsers);
  }, [canSee, memberUids, user]);

  const compliance = useMemo(() => {
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

    let hasGoalsCount = 0;
    let sumWeightDone = 0;
    let sumWeightGoal = 0;
    let sumCaloriesDone = 0;
    let sumCaloriesGoal = 0;
    let sumWorkoutsDone = 0;
    let sumWorkoutsGoal = 0;

    for (const uid of memberUids) {
      const g = publicUsers[uid] ?? null;
      if (!g) continue;

      const wDays = weightDays[uid]?.size ?? 0;
      const cDays = caloriesDays[uid]?.size ?? 0;
      const wCount = workoutsCount[uid] ?? 0;

      const weightGoal = Math.max(0, Number(g.logWeightDaysPerWeek ?? 0));
      const caloriesGoal = Math.max(0, Number(g.logCaloriesDaysPerWeek ?? 0));
      const workoutsGoal = Math.max(0, Number(g.workoutsPerWeek ?? 0));
      if (weightGoal > 0 || caloriesGoal > 0 || workoutsGoal > 0) hasGoalsCount += 1;

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
  }, [logs, memberUids, publicUsers]);

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
  const [chartWidth, setChartWidth] = useState(0);
  const height = 140;

  // Plot area insets (same as line chart)
  const paddingLeft = 18;
  const paddingRight = 26;
  const paddingTop = 20;
  const paddingBottom = 22;
  const xDomainPadding = 12; // Outer padding so first/last bars aren't on edge

  // Calculate plot area
  const plotW = chartWidth > 0 ? chartWidth - paddingLeft - paddingRight : 0;
  const plotH = height - paddingTop - paddingBottom;
  const baseline = height - paddingBottom;

  // Calculate bar dimensions with proper spacing
  const barCount = bars.length;
  const gap = Math.max(12, Math.round(plotW * 0.05));
  const availableWidth = plotW - 2 * xDomainPadding;
  const barW = barCount > 0 ? Math.max(56, Math.floor((availableWidth - gap * (barCount - 1)) / barCount)) : 0;
  const maxH = plotH;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setChartWidth(width);
    }
  };

  // Use responsive width, fallback to window width calculation
  const effectiveWidth = chartWidth || Math.max(260, windowWidth - 32);

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
          <View style={{ width: '100%', height }} onLayout={handleLayout}>
            {chartWidth > 0 && (
              <Svg width={chartWidth} height={height}>
                {bars.map((b, idx) => {
                  // Calculate x position with domain padding and proper spacing
                  const startX = paddingLeft + xDomainPadding;
                  const x = startX + idx * (barW + gap);
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
            )}
          </View>
          <Text variant="bodySmall">
            Weight: {compliance.weightRatio} ({compliance.weightPct}%) • Calories: {compliance.caloriesRatio} ({compliance.caloriesPct}%) • Workouts: {compliance.workoutRatio} ({compliance.workoutPct}%)
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}


