import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Icon, Snackbar } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';

import { GroupsStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import {
  challengeProgress,
  setGroupChallenge,
  endGroupChallenge,
  clearGroupChallenge,
  type GroupChallenge,
} from '../services/challenges';
import { buildChallengeStandings } from '../viewmodels/challengeStandings';
import { subscribeGroupMembers, type GroupMember } from '../services/groups';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId } from '../mmr/time';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import PrimaryButton from '../components/ui/PrimaryButton';
import TextField from '../components/ui/TextField';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<GroupsStackParamList, 'Challenge'>;

const DURATIONS = [4, 8, 12, 16];

function prettyDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.valueOf())) return ymd;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChallengeScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const { user } = useContext(AuthContext);
  const myUid = user?.uid ?? '';

  const [challenge, setChallenge] = useState<GroupChallenge | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pub, setPub] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [snack, setSnack] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [startWhen, setStartWhen] = useState<'this' | 'next'>('next');
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(db, 'groups', groupId), (s) => {
        const data = s.exists() ? (s.data() as any) : null;
        setChallenge(data?.challenge ?? null);
        setCreatedBy(data?.createdBy ?? null);
      }),
    [groupId],
  );
  useEffect(() => subscribeGroupMembers(groupId, setMembers), [groupId]);
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 1500), [groupId]);
  useEffect(() => {
    if (!myUid) return;
    return subscribeMyCanSeeUids(myUid, (uids) => setCanSee(new Set(uids)));
  }, [myUid]);

  const memberUids = useMemo(() => members.map((m) => m.uid), [members]);
  useEffect(() => {
    if (memberUids.length === 0) return;
    return subscribePublicUsers(memberUids, setPub);
  }, [memberUids.join(',')]);

  const myRole = members.find((m) => m.uid === myUid)?.role ?? 'member';
  const isOwner = createdBy === myUid || myRole === 'admin';

  const progress = useMemo(() => (challenge ? challengeProgress(challenge) : null), [challenge]);

  const standings = useMemo(() => {
    if (!challenge || !progress) return [];
    const elapsed = progress.phase === 'upcoming' ? [] : progress.weekIds.slice(0, progress.phase === 'ended' ? progress.total : progress.week);
    if (elapsed.length === 0) return [];
    return buildChallengeStandings({ elapsedWeekIds: elapsed, memberUids, publicUsers: pub, canSee, myUid, logs });
  }, [challenge, progress, memberUids, pub, canSee, myUid, logs]);

  const startEditor = (existing?: GroupChallenge | null) => {
    setName(existing?.name ?? 'Group Challenge');
    setDurationWeeks(existing?.durationWeeks ?? 12);
    setStartWhen('next');
    setEditing(true);
  };

  const startDatesFor = () => {
    const cur = isoWeekIdInTz(new Date(), DEFAULT_TZ);
    const thisMon = isoWeekRangeInTz(cur, DEFAULT_TZ).start;
    const nextMon = isoWeekRangeInTz(nextIsoWeekId(cur, DEFAULT_TZ), DEFAULT_TZ).start;
    return { thisMon, nextMon };
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { thisMon, nextMon } = startDatesFor();
      await setGroupChallenge({
        groupId,
        uid: user.uid,
        name,
        startDate: startWhen === 'this' ? thisMon : nextMon,
        durationWeeks,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      setSnack('Challenge saved');
    } catch (e) {
      setSnack(e instanceof Error ? e.message : 'Failed to save challenge');
    } finally {
      setSaving(false);
    }
  };

  const confirmEnd = () => {
    Alert.alert('End challenge?', 'Standings stay visible, but the challenge stops tracking new weeks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: async () => { try { await endGroupChallenge(groupId); setSnack('Challenge ended'); } catch (e) { setSnack(String(e)); } } },
    ]);
  };

  const confirmClear = () => {
    Alert.alert('Remove challenge?', 'This clears the challenge and its standings for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { try { await clearGroupChallenge(groupId); setSnack('Challenge removed'); } catch (e) { setSnack(String(e)); } } },
    ]);
  };

  const statusLine = () => {
    if (!progress) return '';
    if (progress.phase === 'upcoming') return `Starts ${prettyDate(progress.startDate)}`;
    if (progress.phase === 'ended') return `Ended · ${progress.total} weeks`;
    return `Week ${progress.week} of ${progress.total}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="rowTitle" color="primary" style={{ flex: 1 }}>Challenge</AppText>
        {isOwner && challenge && !editing ? (
          <TouchableOpacity onPress={() => startEditor(challenge)} style={styles.back} hitSlop={8} accessibilityLabel="Edit challenge">
            <Icon source="pencil-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : <View style={styles.back} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {editing ? (
          <View style={styles.group}>
            <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>{challenge ? 'Edit challenge' : 'Start a challenge'}</AppText>
            <TextField label="Name" value={name} onChangeText={setName} editable={!saving} />

            <AppText variant="eyebrow" color="muted" style={styles.editLabel}>Starts</AppText>
            <View style={styles.chipRow}>
              {(['this', 'next'] as const).map((w) => {
                const { thisMon, nextMon } = startDatesFor();
                const active = startWhen === w;
                return (
                  <TouchableOpacity key={w} onPress={() => setStartWhen(w)} style={[styles.chip, active && styles.chipActive]}>
                    <AppText variant="rowSubtitle" style={{ color: active ? colors.primaryOnDark : colors.textSecondary, fontWeight: '600' }}>
                      {w === 'this' ? `This week · ${prettyDate(thisMon)}` : `Next week · ${prettyDate(nextMon)}`}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <AppText variant="eyebrow" color="muted" style={styles.editLabel}>Duration</AppText>
            <View style={styles.chipRow}>
              {DURATIONS.map((d) => {
                const active = durationWeeks === d;
                return (
                  <TouchableOpacity key={d} onPress={() => setDurationWeeks(d)} style={[styles.chip, styles.chipFlex, active && styles.chipActive]}>
                    <AppText variant="rowSubtitle" style={{ color: active ? colors.primaryOnDark : colors.textSecondary, fontWeight: '600' }}>{d} wk</AppText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <PrimaryButton onPress={save} loading={saving} disabled={saving} style={{ marginTop: spacing.lg }}>Save challenge</PrimaryButton>
            <TouchableOpacity onPress={() => setEditing(false)} style={styles.cancelBtn}><AppText variant="rowSubtitle" color="muted">Cancel</AppText></TouchableOpacity>
          </View>
        ) : !challenge ? (
          <View style={styles.emptyWrap}>
            <Icon source="flag-checkered" size={30} color={colors.textMuted} />
            <AppText variant="rowTitle" color="primary" style={{ marginTop: spacing.sm }}>No active challenge</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.emptyText}>
              A challenge puts the whole group on the same clock so you can compare week-for-week.
            </AppText>
            {isOwner ? (
              <PrimaryButton onPress={() => startEditor(null)} style={{ marginTop: spacing.base, alignSelf: 'stretch' }}>Start a challenge</PrimaryButton>
            ) : (
              <AppText variant="rowSubtitle" color="muted" style={{ marginTop: spacing.sm }}>Your group owner can start one.</AppText>
            )}
          </View>
        ) : (
          <>
            {/* Challenge header card */}
            <View style={styles.heroCard}>
              <AppText variant="pageTitle" color="primary" numberOfLines={1}>{challenge.name}</AppText>
              <AppText variant="rowSubtitle" color="accent" style={{ marginTop: 2 }}>{statusLine()}</AppText>
              <AppText variant="rowSubtitle" color="muted" style={{ marginTop: 2 }}>
                {prettyDate(progress!.startDate)} – {prettyDate(progress!.endDate)}
              </AppText>
              {progress!.phase !== 'upcoming' ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((progress!.week / progress!.total) * 100))}%` }]} />
                </View>
              ) : null}
            </View>

            {/* Standings */}
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Standings</AppText>
            {standings.length === 0 ? (
              <View style={styles.group}>
                <AppText variant="rowSubtitle" color="muted">
                  {progress!.phase === 'upcoming' ? 'Standings appear once the challenge starts.' : 'No logged activity yet.'}
                </AppText>
              </View>
            ) : (
              <View style={styles.group}>
                {standings.map((r, i) => (
                  <View key={r.uid} style={[styles.row, i < standings.length - 1 && styles.rowDivider]}>
                    <AppText variant="rowTitle" color={r.rank <= 3 ? 'accent' : 'muted'} style={styles.rankNum}>{r.rank}</AppText>
                    <Avatar photoURL={r.photoURL} name={r.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="rowTitle" color="primary" numberOfLines={1}>{r.name}{r.isMe ? ' (You)' : ''}</AppText>
                      <AppText variant="rowSubtitle" color="muted">{r.weeksCompleted}/{r.weeksElapsed} wks · {r.avgCompliance}% avg</AppText>
                    </View>
                    <AppText variant="numberMd" color="primary">{r.points}</AppText>
                  </View>
                ))}
                <AppText variant="label" color="muted" style={styles.pointsNote}>Points = weekly compliance summed across elapsed weeks, scored vs each member's own goals.</AppText>
              </View>
            )}

            {isOwner ? (
              <View style={styles.ownerActions}>
                {progress!.phase !== 'ended' ? (
                  <TouchableOpacity onPress={confirmEnd} style={styles.ownerBtn}><AppText variant="rowSubtitle" color="secondary">End challenge</AppText></TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={confirmClear} style={styles.ownerBtn}><AppText variant="rowSubtitle" color="danger">Remove challenge</AppText></TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={2000}>{snack ?? ''}</Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, padding: spacing.base },
  heroCard: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderCard, padding: spacing.base, marginTop: spacing.sm },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: colors.surface2, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: colors.primary },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rankNum: { width: 22, textAlign: 'center' },
  pointsNote: { marginTop: spacing.md, lineHeight: 15 },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.base },
  emptyText: { textAlign: 'center', marginTop: spacing.xs, lineHeight: 18 },
  editLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderCard },
  chipFlex: { flex: 1, alignItems: 'center', minWidth: 56 },
  chipActive: { backgroundColor: colors.primaryTint, borderColor: 'rgba(62,139,255,0.5)' },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  ownerActions: { marginTop: spacing.lg, gap: spacing.sm },
  ownerBtn: { alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderCard },
});
