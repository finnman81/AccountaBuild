import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';

import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { todayYYYYMMDD } from '../utils/dates';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { useTodayData } from '../hooks/useTodayData';
import { buildLeaderboardPreview, buildTeamToday, buildTodayChecklist, type ChecklistType } from '../viewmodels/today';
import TodayHeader from '../components/today/TodayHeader';
import TodaysLogCard from '../components/today/TodaysLogCard';
import TeamTodayRail from '../components/today/TeamTodayRail';
import LeaderboardPreviewCard from '../components/today/LeaderboardPreviewCard';

type Props = {
  onOpenLog?: (type: ChecklistType) => void;
  onViewLeaderboard?: () => void;
  onOpenMember?: (uid: string) => void;
  onSwitchGroup?: () => void;
  onBell?: () => void;
};

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function TodayScreen({ onOpenLog, onViewLeaderboard, onOpenMember, onSwitchGroup, onBell }: Props) {
  const { user, group, memberUids, canSee, publicUsers, logs, myProfile } = useTodayData();

  const today = todayYYYYMMDD();
  const now = new Date();
  const pastCutoff = now.getHours() >= 18;
  const streakRule = group?.streakRule ?? 'workout';
  const myUid = user?.uid ?? '';
  const dailyCalorieGoal = myProfile?.dailyCalorieGoal ?? publicUsers[myUid]?.dailyCalorieGoal ?? null;

  const checklist = useMemo(
    () => buildTodayChecklist({ logs, myUid, today, dailyCalorieGoal }),
    [logs, myUid, today, dailyCalorieGoal],
  );
  const team = useMemo(
    () => buildTeamToday({ memberUids, publicUsers, canSee, myUid, logs, today, streakRule, pastCutoff }),
    [memberUids, publicUsers, canSee, myUid, logs, today, streakRule, pastCutoff],
  );
  const preview = useMemo(
    () => buildLeaderboardPreview({ memberUids, publicUsers, canSee, myUid, limit: 3 }),
    [memberUids, publicUsers, canSee, myUid],
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>You must be signed in.</Text>
      </View>
    );
  }

  const userName = friendlyNameFromDisplayName(publicUsers[myUid]?.displayName ?? myProfile?.displayName ?? null, myUid);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}>
      <TodayHeader
        groupName={group?.name ?? 'Your group'}
        groupLogoURL={group?.logoURL ?? null}
        userName={userName}
        dateLabel={dateLabel(now)}
        greeting={greetingFor(now.getHours())}
        onSwitchGroup={onSwitchGroup ?? (() => {})}
        onBell={onBell ?? (() => {})}
      />
      <View style={{ height: 20 }} />
      <TodaysLogCard checklist={checklist} onLog={onOpenLog ?? (() => {})} />
      <TeamTodayRail team={team} onMemberPress={onOpenMember ?? (() => {})} />
      <LeaderboardPreviewCard rows={preview} onViewAll={onViewLeaderboard ?? (() => {})} />
    </ScrollView>
  );
}
