import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { todayYYYYMMDD } from '../utils/dates';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { useTodayData } from '../hooks/useTodayData';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeGroupChallenge, challengeProgress, type GroupChallenge } from '../services/challenges';
import { subscribeLatestGroupMessage, type GroupMessage } from '../services/chat';
import { subscribeMyGroupMeta } from '../services/groups';
import { subscribeUnreadActivityCount } from '../services/activity';
import { useMyUnits } from '../hooks/useMyUnits';
import { buildLeaderboardPreview, buildTeamToday, buildTodayChecklist, type ChecklistType } from '../viewmodels/today';
import TodayHeader from '../components/today/TodayHeader';
import TodaysLogCard from '../components/today/TodaysLogCard';
import TodayEntriesSheet from '../components/today/TodayEntriesSheet';
import TeamTodayRail from '../components/today/TeamTodayRail';
import LeaderboardPreviewCard from '../components/today/LeaderboardPreviewCard';
import WeeklyRecapBanner from '../components/today/WeeklyRecapBanner';
import { deleteGroupLogById } from '../services/logs';
import type { ChecklistItem, TodayLogEntry } from '../viewmodels/today';
import type { Tier } from '../mmr/types';

type Props = {
  onOpenLog?: (type: ChecklistType) => void;
  onViewLeaderboard?: () => void;
  onOpenMember?: (uid: string) => void;
  onSwitchGroup?: () => void;
  onChat?: () => void;
  onBell?: () => void;
  onOpenChallenge?: () => void;
  onOpenWeeklyRecap?: () => void;
  onEditEntry?: (entry: TodayLogEntry) => void;
};

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
const asTier = (x: unknown): Tier | null => (TIERS as string[]).includes(String(x ?? '').trim()) ? (String(x).trim() as Tier) : null;

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function TodayScreen({ onOpenLog, onViewLeaderboard, onOpenMember, onSwitchGroup, onChat, onBell, onOpenChallenge, onOpenWeeklyRecap, onEditEntry }: Props) {
  const { user, group, memberUids, canSee, publicUsers, logs, myProfile } = useTodayData();
  const { activeGroupId } = useActiveGroup();
  const [entriesItem, setEntriesItem] = useState<ChecklistItem | null>(null);

  const [challenge, setChallenge] = useState<GroupChallenge | null>(null);
  useEffect(() => {
    if (!activeGroupId) { setChallenge(null); return; }
    return subscribeGroupChallenge(activeGroupId, setChallenge);
  }, [activeGroupId]);
  const challengeInfo = useMemo(() => (challenge ? challengeProgress(challenge) : null), [challenge]);

  // Unread-chat signal: latest message newer than my last-seen, and not mine.
  const [latestMsg, setLatestMsg] = useState<GroupMessage | null>(null);
  const [chatSeenAt, setChatSeenAt] = useState<any>(null);
  useEffect(() => {
    if (!activeGroupId) { setLatestMsg(null); return; }
    return subscribeLatestGroupMessage(activeGroupId, setLatestMsg);
  }, [activeGroupId]);
  useEffect(() => {
    if (!activeGroupId || !user?.uid) { setChatSeenAt(null); return; }
    return subscribeMyGroupMeta(user.uid, activeGroupId, (meta) => setChatSeenAt(meta?.chatLastSeenAt ?? null));
  }, [activeGroupId, user?.uid]);
  const toMs = (t: any) => (t?.toMillis ? t.toMillis() : typeof t?.seconds === 'number' ? t.seconds * 1000 : 0);
  const hasUnreadChat = useMemo(() => {
    if (!latestMsg?.createdAt || latestMsg.uid === user?.uid) return false;
    return toMs(latestMsg.createdAt) > toMs(chatSeenAt);
  }, [latestMsg, chatSeenAt, user?.uid]);

  const [unreadActivity, setUnreadActivity] = useState(0);
  useEffect(() => {
    if (!user?.uid) { setUnreadActivity(0); return; }
    return subscribeUnreadActivityCount(user.uid, setUnreadActivity);
  }, [user?.uid]);

  const today = todayYYYYMMDD();
  const now = new Date();
  const pastCutoff = now.getHours() >= 18;
  const streakRule = group?.streakRule ?? 'workout';
  const myUid = user?.uid ?? '';
  const dailyCalorieGoal = myProfile?.dailyCalorieGoal ?? publicUsers[myUid]?.dailyCalorieGoal ?? null;
  const units = useMyUnits();

  const checklist = useMemo(
    () => buildTodayChecklist({ logs, myUid, today, dailyCalorieGoal, units }),
    [logs, myUid, today, dailyCalorieGoal, units],
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
  const rankTier = asTier(publicUsers[myUid]?.rankTierPublic);
  const rankDivision = typeof publicUsers[myUid]?.rankDivisionPublic === 'number' ? publicUsers[myUid]?.rankDivisionPublic : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}>
      <TodayHeader
        groupName={group?.name ?? 'Your group'}
        groupLogoURL={group?.logoURL ?? null}
        userName={userName}
        dateLabel={dateLabel(now)}
        greeting={greetingFor(now.getHours())}
        rankTier={rankTier}
        rankDivision={rankDivision}
        unreadChat={hasUnreadChat ? 1 : 0}
        unreadCount={unreadActivity}
        onSwitchGroup={onSwitchGroup ?? (() => {})}
        onChat={onChat ?? (() => {})}
        onBell={onBell ?? (() => {})}
      />
      <WeeklyRecapBanner onOpen={onOpenWeeklyRecap ?? (() => {})} />
      {challenge && challengeInfo ? (
        <Pressable
          onPress={onOpenChallenge ?? (() => {})}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderCard,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Icon source="flag-checkered" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>{challenge.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
              {challengeInfo.phase === 'upcoming'
                ? 'Starts soon'
                : challengeInfo.phase === 'ended'
                  ? 'Ended · view standings'
                  : `Week ${challengeInfo.week} of ${challengeInfo.total}`}
            </Text>
          </View>
          <Icon source="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={{ height: 20 }} />
      <TodaysLogCard checklist={checklist} onLog={onOpenLog ?? (() => {})} onOpenEntries={setEntriesItem} />
      <TeamTodayRail team={team} onMemberPress={onOpenMember ?? (() => {})} />
      <LeaderboardPreviewCard rows={preview} onViewAll={onViewLeaderboard ?? (() => {})} />

      <TodayEntriesSheet
        item={entriesItem}
        onClose={() => setEntriesItem(null)}
        onEdit={(entry) => { setEntriesItem(null); onEditEntry?.(entry); }}
        onDelete={async (entry) => {
          if (activeGroupId) {
            try { await deleteGroupLogById(activeGroupId, entry.logId); } catch { /* non-fatal */ }
          }
          setEntriesItem(null);
        }}
        onAdd={(type) => { setEntriesItem(null); onOpenLog?.(type); }}
      />
    </ScrollView>
  );
}
