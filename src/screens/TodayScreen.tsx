import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon, Snackbar, Text } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';

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
import { useYesterdayFp } from '../hooks/useYesterdayFp';
import { buildLeaderboardPreview, buildTeamToday, buildTodayChecklist, type ChecklistType } from '../viewmodels/today';
import TodayHeader from '../components/today/TodayHeader';
import TodaysLogCard from '../components/today/TodaysLogCard';
import TodayEntriesSheet from '../components/today/TodayEntriesSheet';
import TeamTodayRail from '../components/today/TeamTodayRail';
import LeaderboardPreviewCard from '../components/today/LeaderboardPreviewCard';
import WeeklyRecapBanner from '../components/today/WeeklyRecapBanner';
import SetupChecklistCard from '../components/today/SetupChecklistCard';
import TargetReviewCard from '../components/today/TargetReviewCard';
import GoalReachedCard from '../components/today/GoalReachedCard';
import UpdateBanner from '../components/today/UpdateBanner';
import VacationCard from '../components/today/VacationCard';
import { deleteGroupLogById } from '../services/logs';
import { enqueueSocialPush } from '../services/socialPush';
import HypePickerSheet from '../components/social/HypePickerSheet';
import type { Hype } from '../services/hypeCatalog';
import { fetchGroupWeekDeltas } from '../services/publicUsers';
import { recomputeMyMmr } from '../services/mmrRecompute';
import { DEFAULT_TZ, isoWeekIdInTz } from '../mmr/time';
import { notifyLogsChanged } from '../services/fpEvents';
import { getCachedDisplayName, getCachedGroupName, rememberDisplayName, rememberGroupName } from '../services/profileCache';
import { getHydrated, setHydrated } from '../services/hydrationCache';
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
  onJoinGroup?: () => void;
  onCreateGroup?: () => void;
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

export default function TodayScreen({ onOpenLog, onViewLeaderboard, onOpenMember, onSwitchGroup, onChat, onBell, onOpenChallenge, onOpenWeeklyRecap, onEditEntry, onJoinGroup, onCreateGroup }: Props) {
  const { user, group, memberUids, canSee, publicUsers, logs, myProfile } = useTodayData();
  const { activeGroupId, isReady: activeGroupReady, groupsLoaded } = useActiveGroup();
  const [entriesItem, setEntriesItem] = useState<ChecklistItem | null>(null);
  const [cheerSnack, setCheerSnack] = useState<string | null>(null);
  const [hypeTarget, setHypeTarget] = useState<{ uid: string; name: string } | null>(null);
  const [cheeredToday, setCheeredToday] = useState<Set<string>>(new Set());

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
  const yesterdayFp = useYesterdayFp(myUid);

  // This week's FP race (weeklyPublic deltas) — powers the weekly-first
  // leaderboard preview. Refreshed when logs change (the live settler updates
  // your own delta within seconds of logging).
  const weekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
  const [weekDeltas, setWeekDeltas] = useState<Record<string, number>>(
    () => (activeGroupId ? getHydrated<Record<string, number>>(`weekDeltas:${activeGroupId}:${weekId}`) ?? {} : {}),
  );
  // Refetch on FOCUS too, not just mount/log-change: Today is a tab that stays
  // mounted for the whole session, so without this its race card kept whatever
  // it fetched hours ago while Leaderboard (a stack screen, remounted on every
  // visit) showed the live number — the two boards then disagreed on screen at
  // the same moment (prod 2026-07-26).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!activeGroupId || !isFocused) return;
    setWeekDeltas(getHydrated<Record<string, number>>(`weekDeltas:${activeGroupId}:${weekId}`) ?? {});
    let cancelled = false;
    const t = setTimeout(() => {
      fetchGroupWeekDeltas(activeGroupId, weekId)
        .then((rows) => {
          if (cancelled) return;
          const map = Object.fromEntries(rows.map((r) => [r.uid, r.delta]));
          setWeekDeltas(map);
          setHydrated(`weekDeltas:${activeGroupId}:${weekId}`, map);
        })
        .catch(() => {});
    }, 1500); // small debounce: log bursts and the settler write settle first
    return () => { cancelled = true; clearTimeout(t); };
  }, [activeGroupId, weekId, logs.length, isFocused]);

  useEffect(() => {
    if (!activeGroupId) setWeekDeltas({});
  }, [activeGroupId]);

  // Pull-to-refresh. Everything else on this screen is a live listener, so the
  // only things a manual refresh can genuinely do are (a) ask the server to
  // resettle my FP now instead of after the settler's debounce, and (b) refetch
  // the one-shot week-race deltas. Both are cheap and idempotent.
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = async () => {
    if (!activeGroupId || refreshing) return;
    setRefreshing(true);
    try {
      await recomputeMyMmr('week').catch(() => {}); // offline-safe; 6h run covers
      const rows = await fetchGroupWeekDeltas(activeGroupId, weekId);
      const map = Object.fromEntries(rows.map((r) => [r.uid, r.delta]));
      setWeekDeltas(map);
      setHydrated(`weekDeltas:${activeGroupId}:${weekId}`, map);
    } catch {
      /* listeners keep the rest of the screen honest */
    } finally {
      setRefreshing(false);
    }
  };

  const checklist = useMemo(
    () => buildTodayChecklist({ logs, myUid, today, dailyCalorieGoal, units }),
    [logs, myUid, today, dailyCalorieGoal, units],
  );
  const team = useMemo(
    () => buildTeamToday({ memberUids, publicUsers, canSee, myUid, logs, today, streakRule, pastCutoff }),
    [memberUids, publicUsers, canSee, myUid, logs, today, streakRule, pastCutoff],
  );
  const preview = useMemo(
    () => buildLeaderboardPreview({ memberUids, publicUsers, canSee, myUid, limit: 3, weekDeltas }),
    [memberUids, publicUsers, canSee, myUid, weekDeltas],
  );

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>You must be signed in.</Text>
      </View>
    );
  }

  // Name resolution order: live -> last-known (disk cache) -> NOTHING.
  // Never fall back to `uid.slice(0,6)` here: greeting a user with their own
  // database key on every cold start is worse than an unnamed greeting.
  const liveName = publicUsers[myUid]?.displayName ?? myProfile?.displayName ?? null;
  rememberDisplayName(myUid, liveName);
  const resolvedName = liveName ?? getCachedDisplayName(myUid);
  const userName = resolvedName ? friendlyNameFromDisplayName(resolvedName, undefined) : '';
  const greeting = greetingFor(now.getHours());
  const greetingLine = userName ? `${greeting}, ${userName}` : greeting;

  // No active group: the checklist/log flow can't work (logs live under a
  // group), so show a "find your crew" state instead of dead buttons.
  // CRITICAL: only once the stored id AND the groups list have loaded —
  // otherwise every launch flashes this at members for a beat.
  if (!activeGroupId && (!activeGroupReady || !groupsLoaded)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>{dateLabel(now).toUpperCase()}</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 }}>
          {greetingLine}
        </Text>
      </ScrollView>
    );
  }
  if (!activeGroupId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>{dateLabel(now).toUpperCase()}</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 }}>
          {greetingLine}
        </Text>
        <View
          style={{
            marginTop: 28,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderCard,
            borderRadius: 16,
            padding: spacing.lg,
            alignItems: 'center',
          }}
        >
          <Icon source="account-group" size={40} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 12 }}>Find your crew</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
            Fitness is a team sport. Join a group with a code from a friend, or start your own — logging unlocks once you're in.
          </Text>
          <Pressable
            onPress={onJoinGroup ?? (() => {})}
            accessibilityRole="button"
            style={{ alignSelf: 'stretch', marginTop: 18, height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Join with a code</Text>
          </Pressable>
          <Pressable
            onPress={onCreateGroup ?? (() => {})}
            accessibilityRole="button"
            style={{ alignSelf: 'stretch', marginTop: 10, height: 48, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>Create a group</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
  // Group selected but its doc/members haven't arrived yet: hold a calm
  // greeting-only frame instead of painting the header with an empty body
  // that pops in piecewise ("BPM (blank)" launch flash).
  if (!group || memberUids.length === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted }}>{dateLabel(now).toUpperCase()}</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 }}>
          {greetingLine}
        </Text>
      </ScrollView>
    );
  }

  // Same treatment for the group name — cached value beats "Your group".
  rememberGroupName(activeGroupId, group?.name ?? null);
  const groupName = group?.name ?? getCachedGroupName(activeGroupId) ?? 'Your group';

  const rankTier = asTier(publicUsers[myUid]?.rankTierPublic);
  const rankDivision = typeof publicUsers[myUid]?.rankDivisionPublic === 'number' ? publicUsers[myUid]?.rankDivisionPublic : null;
  const myMember = team.members.find((m) => m.uid === myUid);
  const myStreak = myMember?.streakDays ?? 0;

  // Long-press a teammate on the rail to fire a quick cheer. Deduped per-session
  // so you can't spam the same person; the recipient sees it in-app + as a push.
  // Long-press a teammate on the rail -> pick which hype to send.
  const onCheer = (uid: string) => {
    if (!myUid || uid === myUid) return;
    const target = team.members.find((m) => m.uid === uid);
    setHypeTarget({ uid, name: target?.name ?? 'your teammate' });
  };

  const sendHype = (h: Hype) => {
    const target = hypeTarget;
    setHypeTarget(null);
    if (!target || !myUid) return;
    void enqueueSocialPush({ toUid: target.uid, fromUid: myUid, fromName: userName, type: h.kind, hypeId: h.id }).catch(() => {});
    setCheeredToday((prev) => new Set(prev).add(target.uid));
    setCheerSnack(`${h.emoji} sent to ${target.name}`);
  };

  return (
    <>

    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: 56, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onPullRefresh()} tintColor={colors.textSecondary} />}
    >
      <TodayHeader
        groupName={groupName}
        groupLogoURL={group?.logoURL ?? null}
        userName={userName}
        dateLabel={dateLabel(now)}
        greeting={greetingFor(now.getHours())}
        rankTier={rankTier}
        rankDivision={rankDivision}
        streakDays={myStreak}
        streakAtRisk={myMember?.atRisk ?? false}
        unreadChat={hasUnreadChat ? 1 : 0}
        unreadCount={unreadActivity}
        onSwitchGroup={onSwitchGroup ?? (() => {})}
        onChat={onChat ?? (() => {})}
        onBell={onBell ?? (() => {})}
      />
      <WeeklyRecapBanner onOpen={onOpenWeeklyRecap ?? (() => {})} />
      <UpdateBanner />
      <SetupChecklistCard />
      <GoalReachedCard />
      <TargetReviewCard />
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
      <VacationCard uid={myUid} myLogDates={logs.filter((l) => l.uid === myUid).map((l) => l.date)} />
      {yesterdayFp != null && yesterdayFp !== 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 2 }}>
          <Icon source={yesterdayFp > 0 ? 'trending-up' : 'trending-down'} size={16} color={yesterdayFp > 0 ? colors.rankGold : colors.danger} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: yesterdayFp > 0 ? colors.rankGold : colors.danger }}>
            {yesterdayFp > 0 ? `Yesterday: +${yesterdayFp} FP` : `Yesterday: ${yesterdayFp} FP`}
          </Text>
        </View>
      ) : null}
      <TodaysLogCard checklist={checklist} onLog={onOpenLog ?? (() => {})} onOpenEntries={setEntriesItem} />
      <TeamTodayRail team={team} onMemberPress={onOpenMember ?? (() => {})} onMemberLongPress={onCheer} />
      <LeaderboardPreviewCard rows={preview} onViewAll={onViewLeaderboard ?? (() => {})} />

      <TodayEntriesSheet
        item={entriesItem}
        onClose={() => setEntriesItem(null)}
        onEdit={(entry) => { setEntriesItem(null); onEditEntry?.(entry); }}
        onDelete={async (entry) => {
          if (activeGroupId) {
            try {
              await deleteGroupLogById(activeGroupId, entry.logId);
              notifyLogsChanged(); // re-settle banked FP without save-side effects (toast, reminder-clear)
            } catch { /* non-fatal */ }
          }
          setEntriesItem(null);
        }}
        onAdd={(type) => { setEntriesItem(null); onOpenLog?.(type); }}
      />
    </ScrollView>
    <HypePickerSheet
      visible={!!hypeTarget}
      targetName={hypeTarget?.name}
      allowNudges={hypeTarget ? publicUsers[hypeTarget.uid]?.allowNudges === true : false}
      onPick={sendHype}
      onClose={() => setHypeTarget(null)}
    />
    <Snackbar visible={!!cheerSnack} onDismiss={() => setCheerSnack(null)} duration={2200}>
      {cheerSnack ?? ''}
    </Snackbar>
    </>
  );
}
