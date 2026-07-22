import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribeGroupLogs, setLogReaction, type GroupLog, type LogType } from '../services/logs';
import { enqueueSocialPush } from '../services/socialPush';
import HypePickerSheet from '../components/social/HypePickerSheet';
import type { Hype } from '../services/hypeCatalog';
import { computeGoalStreak } from '../viewmodels/today';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { DEFAULT_TZ, isoWeekDatesInTz, isoWeekIdInTz, yyyyMmDdInTz } from '../mmr/time';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import RankEmblem from '../components/ui/RankEmblem';
import StatTile from '../components/ui/StatTile';
import { colors, radius, spacing } from '../theme';
import type { Tier } from '../mmr/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MemberDetail'>;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
const asTier = (x: unknown): Tier | null => (TIERS as string[]).includes(String(x ?? '').trim()) ? (String(x).trim() as Tier) : null;

export default function MemberDetailScreen({ route, navigation }: Props) {
  const { groupId, uid } = route.params;
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();

  const [pub, setPub] = useState<PublicUser | null>(null);
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<{ streakRule?: 'workout' | 'any' } | null>(null);
  const [cheered, setCheered] = useState(false);
  const [nudged, setNudged] = useState(false);

  const isMe = uid === user?.uid;
  const myName = friendlyNameFromDisplayName(user?.displayName ?? null, user?.uid ?? '');

  useEffect(() => subscribePublicUsers([uid], (m) => setPub(m[uid] ?? null)), [uid]);
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 400), [groupId]);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);
  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (s) => setGroup(s.exists() ? ((s.data() as any) ?? null) : null)), [groupId]);

  const visible = isMe || canSee.has(uid);
  const name = friendlyNameFromDisplayName(pub?.displayName ?? null, uid);
  const tier = asTier(pub?.rankTierPublic);
  const division = typeof pub?.rankDivisionPublic === 'number' ? pub.rankDivisionPublic : null;

  const stats = useMemo(() => {
    const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
    const weekDates = isoWeekDatesInTz(isoWeekIdInTz(new Date(), DEFAULT_TZ), DEFAULT_TZ);
    const rule = (group?.streakRule ?? 'any') as 'workout' | 'any';
    const allowedTypes: Set<LogType> = rule === 'any' ? new Set(['calories', 'workout', 'weight', 'photo']) : new Set(['workout']);
    const mine = logs.filter((l) => l.uid === uid);
    const streak = computeGoalStreak({
      logs: mine,
      uid,
      today,
      streakRule: rule,
      targets: {
        workout: Number(pub?.workoutsPerWeek ?? 0),
        calories: Number(pub?.logCaloriesDaysPerWeek ?? 0),
        weight: Number(pub?.logWeightDaysPerWeek ?? 0),
      },
    });
    const weekWorkouts = mine.filter((l) => l.type === 'workout' && weekDates.includes(l.date)).length;
    const loggedByDate = new Set(mine.filter((l) => allowedTypes.has(l.type)).map((l) => l.date));
    const week = weekDates.map((d) => ({ date: d, logged: loggedByDate.has(d), today: d === today }));
    const todayTypes = new Set(mine.filter((l) => l.date === today).map((l) => l.type));
    const checklist = (['calories', 'workout', 'weight'] as const).map((t) => ({ type: t, logged: todayTypes.has(t) }));
    return { streak, weekWorkouts, week, checklist };
  }, [logs, uid, group?.streakRule, pub?.workoutsPerWeek, pub?.logCaloriesDaysPerWeek, pub?.logWeightDaysPerWeek]);

  // Tapping Cheer opens the hype picker; the chosen variant is what gets sent.
  const [hypeOpen, setHypeOpen] = useState(false);

  const sendHype = async (h: Hype) => {
    setHypeOpen(false);
    if (!user || isMe) return;
    try {
      if (h.kind === 'cheer') {
        // Still react to their latest log so the cheer shows up in-feed too.
        const mine = logs.filter((l) => l.uid === uid);
        const latest = mine.reduce<GroupLog | null>((a, b) => {
          const at = (a?.ts as any)?.seconds ?? 0;
          const bt = (b?.ts as any)?.seconds ?? 0;
          return bt >= at ? b : a;
        }, null);
        if (latest) await setLogReaction(groupId, latest.id, user.uid, h.emoji);
      }
      await enqueueSocialPush({ toUid: uid, fromUid: user.uid, fromName: myName, type: h.kind, hypeId: h.id });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (h.kind === 'cheer') setCheered(true);
      else setNudged(true);
    } catch {
      /* non-fatal */
    }
  };

  const cheer = async () => {
    if (!user || isMe) return;
    const mine = logs.filter((l) => l.uid === uid);
    const latest = mine.reduce<GroupLog | null>((a, b) => {
      const at = (a?.ts as any)?.seconds ?? 0;
      const bt = (b?.ts as any)?.seconds ?? 0;
      return bt >= at ? b : a;
    }, null);
    try {
      // React to their latest log if there is one, and always send the cheer push.
      if (latest) await setLogReaction(groupId, latest.id, user.uid, '💪');
      await enqueueSocialPush({ toUid: uid, fromUid: user.uid, fromName: myName, type: 'cheer' });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCheered(true);
    } catch {
      /* non-fatal */
    }
  };

  const nudge = async () => {
    if (!user || isMe) return;
    try {
      await enqueueSocialPush({ toUid: uid, fromUid: user.uid, fromName: myName, type: 'nudge' });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setNudged(true);
    } catch {
      /* non-fatal */
    }
  };

  const message = () => {
    navigation.goBack();
    (navigation as any).navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'GroupChat', initial: false, params: { groupId } } });
  };

  return (
    <View style={styles.overlay}>
      {/* Tap the dimmed backdrop to dismiss. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} />
      <View style={[styles.sheet, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
        <View style={styles.grabber} />
        <TouchableOpacity style={styles.closeX} onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Close">
          <AppText variant="rowTitle" color="muted">✕</AppText>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Avatar photoURL={pub?.photoURL ?? null} name={name} size={58} status={stats.streak >= 7 ? 'streakLeader' : undefined} />
            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <AppText variant="rowTitle" color="primary">{name}</AppText>
                {stats.streak >= 7 ? (
                  <View style={styles.streakChip}><AppText variant="eyebrow" style={styles.streakChipText}>STREAK LEADER</AppText></View>
                ) : null}
              </View>
              <View style={styles.tierRow}>
                {tier ? <RankEmblem tier={tier} inline size={12} /> : null}
                <AppText variant="rowSubtitle" color="secondary">
                  {tier ? `${tier}${division ? ` ${ROMAN[division]}` : ''}` : 'Unranked'}
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.tiles}>
            <StatTile label="Streak" value={stats.streak} unit="d" />
            <StatTile label="This week" value={visible ? stats.weekWorkouts : '—'} unit={visible ? 'workouts' : ''} />
            <StatTile label="Rank" value={tier ? `${tier[0]}${division ?? ''}` : '—'} />
          </View>

          <TouchableOpacity
            style={styles.fullProfileBtn}
            activeOpacity={0.85}
            onPress={() => (navigation as any).replace('MemberProfile', { groupId, uid })}
          >
            <AppText variant="rowTitle" color="accent">View full profile & KPIs</AppText>
          </TouchableOpacity>

          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Today</AppText>
          <View style={styles.group}>
            {stats.checklist.map((c, i) => (
              <View key={c.type} style={[styles.checkRow, i < 2 && styles.checkDivider]}>
                <View style={[styles.checkDot, c.logged && styles.checkDotDone]}>
                  {c.logged ? <AppText variant="label" style={{ color: '#FFF' }}>✓</AppText> : null}
                </View>
                <AppText variant="rowTitle" color="primary" style={{ flex: 1, textTransform: 'capitalize' }}>{c.type}</AppText>
                <AppText variant="rowSubtitle" color={c.logged ? 'success' : 'muted'}>{c.logged ? 'Logged' : 'Not yet'}</AppText>
              </View>
            ))}
          </View>

          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>This week</AppText>
          <View style={styles.weekStrip}>
            {stats.week.map((d, i) => (
              <View key={d.date} style={styles.dayCell}>
                <View style={[styles.dayBox, d.logged ? styles.dayDone : d.today ? styles.dayToday : undefined]} />
                <AppText variant="label" color="muted">{DAY_LABELS[i]}</AppText>
              </View>
            ))}
          </View>
        </ScrollView>

        {!isMe && (
          <>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.cheerBtn, cheered && styles.cheerBtnDone]} onPress={() => setHypeOpen(true)} activeOpacity={0.85}>
                <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>{cheered ? '💪 Cheered' : '💪 Cheer'}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgBtn} onPress={message} activeOpacity={0.85}>
                <AppText variant="rowTitle" color="primary">Message</AppText>
              </TouchableOpacity>
            </View>
            {(pub as any)?.allowNudges ? (
              <TouchableOpacity style={[styles.nudgeBtn, nudged && styles.nudgeBtnDone]} onPress={nudge} activeOpacity={0.85} disabled={nudged}>
                <AppText variant="rowTitle" color={nudged ? 'success' : 'primary'}>{nudged ? '👋 Nudged' : '👋 Nudge to log'}</AppText>
              </TouchableOpacity>
            ) : null}
          </>
        )}
        <TouchableOpacity style={styles.close} onPress={() => navigation.goBack()}>
          <AppText variant="rowSubtitle" color="muted">Close</AppText>
        </TouchableOpacity>
      </View>
    <HypePickerSheet
      visible={hypeOpen}
      targetName={name}
      allowNudges={pub?.allowNudges !== false}
      onPick={(h) => void sendHype(h)}
      onClose={() => setHypeOpen(false)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.faint, marginTop: spacing.md, marginBottom: spacing.base },
  closeX: { position: 'absolute', top: spacing.md, right: spacing.base, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  content: { paddingBottom: spacing.base },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  headerInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakChip: { backgroundColor: 'rgba(233,181,66,0.14)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  streakChipText: { color: colors.rankGold, fontSize: 9 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  fullProfileBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.md, borderRadius: radius.tile, backgroundColor: colors.primaryTint },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  group: { backgroundColor: colors.surface2, borderRadius: radius.tile, paddingHorizontal: spacing.base },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  checkDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  checkDot: { width: 24, height: 24, borderRadius: 999, borderWidth: 1.5, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  checkDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', gap: 6, flex: 1 },
  dayBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surface2 },
  dayDone: { backgroundColor: colors.successTint, borderWidth: 1, borderColor: colors.success },
  dayToday: { borderWidth: 1.5, borderColor: colors.faint, borderStyle: 'dashed' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.base },
  cheerBtn: { flex: 1, height: 50, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cheerBtnDone: { backgroundColor: colors.success },
  nudgeBtn: { height: 48, borderRadius: radius.button, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  nudgeBtnDone: { backgroundColor: colors.successTint },
  msgBtn: { flex: 1, height: 50, borderRadius: radius.button, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  close: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
});
