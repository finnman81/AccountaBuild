import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, ScrollView, View } from 'react-native';
import { Avatar, Button, Card, Divider, IconButton, List, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import Screen from '../components/layout/Screen';
import PrimaryButton from '../components/ui/PrimaryButton';
import NavList from '../components/ui/NavList';
import MemberDetailCard from '../components/group/MemberDetailCard';
import MemberDetailModal from '../components/group/MemberDetailModal';
import AvatarStatusChip from '../components/ui/AvatarStatusChip';
import Row from '../components/ui/Row';
import LoadingState from '../components/state/LoadingState';
import EmptyState from '../components/state/EmptyState';
import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { GroupLog, subscribeGroupLogs } from '../services/logs';
import { ensureJoinCodeMapping, subscribeMyGroupMeta } from '../services/groups';
import { formatHeightInches, formatWeightLb, friendlyNameFromDisplayName } from '../utils/formatters';
import { buildMemberSummaries, sortMemberSummaries, type MemberSummary } from '../viewmodels/memberSummary';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribeMyBadges, type EarnedBadge } from '../services/mmrBadges';
import { subscribeMyMmrState, type MmrState } from '../services/mmrState';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadows';
import RankBadge from '../components/mmr/RankBadge';

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

function weekStartMondayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

export default function GroupDetailScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const { groups, setActiveGroupId } = useActiveGroup();
  const theme = useTheme();

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [myMeta, setMyMeta] = useState<any | null>(null);
  const [latestChatAt, setLatestChatAt] = useState<any | null>(null);
  const [latestPhotoAt, setLatestPhotoAt] = useState<any | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [todayMode, setTodayMode] = useState<'calories' | 'workout' | 'weight'>('calories');
  const [myBadges, setMyBadges] = useState<EarnedBadge[]>([]);
  const [mmrStates, setMmrStates] = useState<Record<string, MmrState>>({});
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Sync active group when this screen loads
  useEffect(() => {
    void setActiveGroupId(groupId);
  }, [groupId, setActiveGroupId]);

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
    if (!user) return;
    return subscribeMyBadges(user.uid, setMyBadges);
  }, [user]);

  // Subscribe to MMR states for all members (for streak leader calculation)
  // Note: This is optional - if subscriptions fail, streak leader feature will be skipped
  useEffect(() => {
    if (!user) return;
    
    let unsubs: Array<() => void> = [];
    let timeoutId: NodeJS.Timeout;
    
    // Debounce to avoid rapid re-subscriptions
    timeoutId = setTimeout(() => {
      const allowed = members
        .map((m) => m.uid)
        .filter((uid) => uid === user.uid || canSee.has(uid));
      
      // Limit to reasonable number to avoid Firestore issues
      if (allowed.length > 15) {
        // Only subscribe to first 15 members to avoid overwhelming Firestore
        return;
      }
      
      for (const uid of allowed) {
        const unsub = subscribeMyMmrState(uid, (state) => {
          if (state) {
            setMmrStates((prev) => ({ ...prev, [uid]: state }));
          } else {
            setMmrStates((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }
        });
        unsubs.push(unsub);
      }
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [members, canSee, user]);

  const isSeasonBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'seasonRank' | 'seasonPeak' }> =>
    b.type === 'seasonRank' || b.type === 'seasonPeak';
  const isAchievementBadge = (b: EarnedBadge): b is Extract<EarnedBadge, { type: 'achievement' }> => b.type === 'achievement';

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
    // Fetch more logs (250) to ensure we have enough historical data for streak calculation
    // This covers ~2-3 months of daily logging, which is sufficient for streak calculation
    return subscribeGroupLogs(
      groupId,
      (items) => {
        setLogs(items);
        setIsLogsLoading(false);
      },
      () => setIsLogsLoading(false),
      250,
    );
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
    const mp = p?.mpPublic ?? p?.lpPublic; // Backward compat
    if (!tier) return '—';
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const mpTxt = typeof mp === 'number' ? `${Math.round(mp)} MP` : null;
    return [div ? `${tier} ${roman}` : tier, mpTxt].filter(Boolean).join(' • ');
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
    const weekStart = weekStartMondayLocal();

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

  // Calculate continuous streak days (not resetting at week boundary)
  const streakDaysByUid = useMemo(() => {
    const today = todayYYYYMMDD();
    const todayDate = parseYYYYMMDDLocal(today);
    const allowed = streakRule === 'any' ? new Set(['workout', 'calories', 'weight', 'photo']) : new Set(['workout']);
    
    // Collect all dates with logs for each user
    const datesByUid: Record<string, Set<string>> = {};
    for (const l of logs) {
      if (!allowed.has(l.type)) continue;
      const d = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(d.valueOf())) continue;
      datesByUid[l.uid] = datesByUid[l.uid] ?? new Set<string>();
      datesByUid[l.uid].add(l.date);
    }
    
    // Calculate continuous streak going backwards from today
    const out: Record<string, number> = {};
    for (const [uid, dateSet] of Object.entries(datesByUid)) {
      let streak = 0;
      let currentDate = new Date(todayDate);
      let daysChecked = 0;
      const maxDaysToCheck = 365; // Safety limit: don't check more than a year
      
      // Count backwards day by day until we hit a gap
      while (daysChecked < maxDaysToCheck) {
        const dateStr = formatYYYYMMDD(currentDate);
        if (dateSet.has(dateStr)) {
          streak++;
          // Move to previous day
          currentDate.setDate(currentDate.getDate() - 1);
          daysChecked++;
        } else {
          // Found a gap, streak ends
          break;
        }
      }
      
      out[uid] = streak;
    }
    
    return out;
  }, [logs, streakRule]);

  // Helper function to format date as YYYY-MM-DD
  function formatYYYYMMDD(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

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

  const goalsMembers = useMemo(() => membersSorted.slice(0, LIST_LIMIT), [membersSorted]);

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
    const weekStart = weekStartMondayLocal();
    const summaries = buildMemberSummaries({
      members: members.map((m) => ({
        uid: m.uid,
        displayName: publicUsers[m.uid]?.displayName ?? null,
        photoURL: publicUsers[m.uid]?.photoURL ?? null,
        rankTier: ((publicUsers[m.uid] as any)?.rankTierPublic ?? null) as any,
        dailyCalorieGoal: (publicUsers[m.uid] as any)?.dailyCalorieGoal ?? null,
      })),
      logs,
      todayYYYYMMDD: today,
      weekStart,
      workoutLabel: friendlyWorkout,
    });
    return sortMemberSummaries(summaries);
  }, [logs, members, publicUsers]);

  const isTodayLoading = isMembersLoading || isLogsLoading;
  const nobodyLoggedToday = memberSummaries.length > 0 && memberSummaries.every((m) => !m.loggedToday);

  const todaySummary = useMemo(() => {
    const today = todayYYYYMMDD();
    const totalMembers = members.length;
    const loggedCount = memberSummaries.filter((m) => m.loggedToday).length;
    const workoutDayCount = memberSummaries.filter((m) => m.workoutMinutesToday > 0).length;
    const photosToday = logs.filter((l) => l.type === 'photo' && l.date === today).length;
    return { totalMembers, loggedCount, workoutDayCount, photosToday };
  }, [logs, memberSummaries, members.length]);

  // Determine streak leader (highest streakWeeks, tie-break by MMR)
  const streakLeaderUid = useMemo(() => {
    let maxStreak = -1;
    let leaderUid: string | null = null;
    let leaderMmr = -1;

    for (const [uid, state] of Object.entries(mmrStates)) {
      const streak = state.streakWeeks;
      const mmr = state.mmr;
      if (streak > maxStreak || (streak === maxStreak && mmr > leaderMmr)) {
        maxStreak = streak;
        leaderUid = uid;
        leaderMmr = mmr;
      }
    }

    return maxStreak > 0 ? leaderUid : null;
  }, [mmrStates]);

  // Check if member is at risk (after 6pm local and not logged)
  const isAtRisk = (member: MemberSummary): boolean => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 18 && !member.loggedToday) {
      return true;
    }
    return false;
  };

  // Get current user's summary
  const mySummary = useMemo(() => {
    if (!user) return null;
    return memberSummaries.find((m) => m.uid === user.uid) ?? null;
  }, [memberSummaries, user]);

  // Get team members (excluding current user) with status and sorting
  const teamMembers = useMemo(() => {
    if (!user) return [];
    
    const team = memberSummaries
      .filter((m) => m.uid !== user.uid)
      .map((m) => {
        let status: 'logged' | 'notLogged' | 'streakLeader' = m.loggedToday ? 'logged' : 'notLogged';
        if (m.uid === streakLeaderUid) {
          status = 'streakLeader';
        }
        return { ...m, status, isAtRisk: isAtRisk(m) };
      });

    // Sort: logged first → not logged → streak leader pinned → tie-breakers
    team.sort((a, b) => {
      // Streak leader always near front (but after logged)
      if (a.status === 'streakLeader' && b.status !== 'streakLeader' && b.status === 'logged') return 1;
      if (b.status === 'streakLeader' && a.status !== 'streakLeader' && a.status === 'logged') return -1;
      if (a.status === 'streakLeader' && b.status !== 'streakLeader') return -1;
      if (b.status === 'streakLeader' && a.status !== 'streakLeader') return 1;

      // Logged before not logged
      if (a.status === 'logged' && b.status !== 'logged') return -1;
      if (b.status === 'logged' && a.status !== 'logged') return 1;

      // Tie-breakers: streak weeks, then MMR, then alphabetical
      const aStreak = mmrStates[a.uid]?.streakWeeks ?? 0;
      const bStreak = mmrStates[b.uid]?.streakWeeks ?? 0;
      if (aStreak !== bStreak) return bStreak - aStreak;

      const aMmr = mmrStates[a.uid]?.mmr ?? 0;
      const bMmr = mmrStates[b.uid]?.mmr ?? 0;
      if (aMmr !== bMmr) return bMmr - aMmr;

      return a.name.localeCompare(b.name);
    });

    return team;
  }, [memberSummaries, user, streakLeaderUid, mmrStates]);

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

      {/* Group Selector - only show if user has multiple groups */}
      {groups.length > 1 && (
        <>
          <View style={{ height: 16 }} />
          <Card>
            <Card.Content>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: spacing.md }}>
                Switch Group
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {groups.map((g) => (
                  <Button
                    key={g.groupId}
                    mode={g.groupId === groupId ? 'contained' : 'outlined'}
                    compact
                    onPress={() => {
                      void setActiveGroupId(g.groupId);
                      navigation.replace('GroupDetail', { groupId: g.groupId });
                    }}
                    style={{
                      borderRadius: radius.pill,
                      ...(g.groupId === groupId && {
                        ...shadow,
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 1,
                      }),
                    }}
                  >
                    {g.name}
                  </Button>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        </>
      )}

      <View style={{ height: 16 }} />
      <Card>
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <NavList
            items={[
              { title: 'View charts', icon: 'chart-line', onPress: () => navigation.navigate('GroupCharts', { groupId }) },
              { title: 'Leaderboard', icon: 'trophy', onPress: () => navigation.navigate('Leaderboard', { groupId }) },
              { title: 'Group chat', icon: 'message', badge: hasNewChat, onPress: () => navigation.navigate('GroupChat', { groupId }) },
              { title: 'Progress gallery', icon: 'image-multiple', badge: hasNewPhotos, onPress: () => navigation.navigate('ViewPhotos', { groupId }) },
              { title: 'Issues / Suggestions', icon: 'bug', onPress: () => navigation.navigate('Issues', { groupId }) },
              { title: 'Group settings', icon: 'cog', onPress: () => navigation.navigate('GroupSettings', { groupId }) },
            ]}
          />
        </Card.Content>
      </Card>

      <View style={{ height: spacing.base }} />
      <Card>
        <Card.Title title="Today" />
        <Card.Content>
          {isTodayLoading ? (
            <LoadingState skeletonCount={3} />
          ) : memberSummaries.length === 0 ? (
            <Text>No members yet.</Text>
          ) : (
            <View style={{ gap: spacing.xl }}>
              {/* Section 1: You */}
              {mySummary ? (
                <>
                  <View style={{ marginBottom: -spacing.sm }}>
                    <Text variant="titleSmall" style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
                      You
                    </Text>
                    <MemberDetailCard item={mySummary} mode={todayMode} />
                  </View>
                </>
              ) : null}

              {/* Section 2: Team Today */}
              <View style={{ marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Text variant="titleSmall" style={{ color: colors.textSecondary }}>
                    Team Today
                  </Text>
                  <Text variant="labelSmall" style={{ color: colors.textMuted }}>
                    {todaySummary.loggedCount}/{todaySummary.totalMembers} logged
                  </Text>
                </View>
                <SegmentedButtons
                  value={todayMode}
                  onValueChange={(v) => setTodayMode(v as any)}
                  buttons={[
                    {
                      value: 'calories',
                      label: 'Calories',
                      style: {
                        backgroundColor:
                          todayMode === 'calories' ? colors.surface2 : 'transparent',
                        borderWidth: todayMode === 'calories' ? 0 : 1,
                        borderColor: todayMode === 'calories' ? undefined : colors.divider,
                        minHeight: 40,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.pill,
                        ...(todayMode === 'calories' && {
                          ...shadow,
                          shadowOpacity: 0.1,
                          shadowRadius: 4,
                          elevation: 1,
                        }),
                      },
                      labelStyle: {
                        color:
                          todayMode === 'calories' ? colors.primary : colors.textSecondary,
                        fontWeight: todayMode === 'calories' ? '600' : '400',
                      },
                    },
                    {
                      value: 'workout',
                      label: 'Workout',
                      style: {
                        backgroundColor:
                          todayMode === 'workout' ? colors.surface2 : 'transparent',
                        borderWidth: todayMode === 'workout' ? 0 : 1,
                        borderColor: todayMode === 'workout' ? undefined : colors.divider,
                        minHeight: 40,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.pill,
                        ...(todayMode === 'workout' && {
                          ...shadow,
                          shadowOpacity: 0.1,
                          shadowRadius: 4,
                          elevation: 1,
                        }),
                      },
                      labelStyle: {
                        color:
                          todayMode === 'workout' ? colors.primary : colors.textSecondary,
                        fontWeight: todayMode === 'workout' ? '600' : '400',
                      },
                    },
                    {
                      value: 'weight',
                      label: 'Weight',
                      style: {
                        backgroundColor:
                          todayMode === 'weight' ? colors.surface2 : 'transparent',
                        borderWidth: todayMode === 'weight' ? 0 : 1,
                        borderColor: todayMode === 'weight' ? undefined : colors.divider,
                        minHeight: 40,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.pill,
                        ...(todayMode === 'weight' && {
                          ...shadow,
                          shadowOpacity: 0.1,
                          shadowRadius: 4,
                          elevation: 1,
                        }),
                      },
                      labelStyle: {
                        color:
                          todayMode === 'weight' ? colors.primary : colors.textSecondary,
                        fontWeight: todayMode === 'weight' ? '600' : '400',
                      },
                    },
                  ]}
                  style={{ marginBottom: spacing.md }}
                />
                {teamMembers.length > 0 ? (
                  <FlatList
                    horizontal
                    data={teamMembers}
                    keyExtractor={(item) => item.uid}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingRight: spacing.base }}
                    renderItem={({ item }) => (
                      <AvatarStatusChip
                        member={item}
                        mode={todayMode}
                        status={item.status}
                        isAtRisk={item.isAtRisk}
                        onPress={() => {
                          setSelectedMember(item);
                          setModalVisible(true);
                        }}
                      />
                    )}
                  />
                ) : (
                  <Text variant="bodySmall" style={{ color: colors.textMuted }}>
                    No other members yet.
                  </Text>
                )}
              </View>

              {/* Section 3: View Leaderboard */}
              <Row
                title="View leaderboard"
                icon="trophy"
                onPress={() => navigation.navigate('Leaderboard', { groupId })}
              />
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Member Detail Modal */}
      <MemberDetailModal
        visible={modalVisible}
        member={selectedMember}
        mode={todayMode}
        onDismiss={() => {
          setModalVisible(false);
          setSelectedMember(null);
        }}
      />

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
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton
                      icon="delete"
                      iconColor={theme.colors.error}
                      onPress={async () => {
                        try {
                          const { deleteLog } = await import('../services/logs');
                          await deleteLog(groupId, l.id);
                        } catch (error) {
                          console.error('Failed to delete log:', error);
                        }
                      }}
                    />
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
                  </View>
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
                const n = streakDaysByUid[m.uid] ?? 0;
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


