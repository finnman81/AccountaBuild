import React, { useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { subscribeActiveContest, subscribeContestTop, subscribeMyStanding, type Contest, type Standing } from '../../services/contest';
import { buildInviteMessage } from '../../services/groups';
import { todayYYYYMMDD } from '../../utils/dates';
import { colors } from '../../theme/colors';

const DAY_MS = 24 * 60 * 60 * 1000;
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
}

/**
 * Recruit contest on Today: days left, your qualified/pending count, the top
 * five, the prize, Share invite, official rules (Apple 5.3 wants them in-app).
 * Visible while it runs and through results day; hidden for drafts.
 */
export default function ContestCard({ uid, groupName, joinCode }: { uid: string; groupName: string | null; joinCode: string | null }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [top, setTop] = useState<Standing[]>([]);
  const [mine, setMine] = useState<Standing | null>(null);

  useEffect(() => subscribeActiveContest(setContest), []);
  useEffect(() => (contest ? subscribeContestTop(contest.id, 5, setTop) : undefined), [contest?.id]);
  useEffect(() => (contest && uid ? subscribeMyStanding(contest.id, uid, setMine) : undefined), [contest?.id, uid]);

  const today = todayYYYYMMDD();
  if (!contest || contest.status === 'draft' || today < contest.startYmd || today > contest.resultsYmd) return null;

  const running = today <= contest.endYmd;
  const left = daysBetween(today, contest.endYmd);
  const status = running
    ? left === 0
      ? 'Last day to recruit'
      : `${left} ${left === 1 ? 'day' : 'days'} left`
    : `Recruiting closed. Winners ${new Date(`${contest.resultsYmd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const share = async () => {
    if (!joinCode) return;
    await Share.share({ message: buildInviteMessage(groupName, joinCode) }).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Icon source="trophy-outline" size={20} color={colors.rankGold} />
        <Text style={styles.title}>{contest.name}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      {contest.prizes?.first ? <Text style={styles.prize}>#1 recruiter wins {contest.prizes.first}.</Text> : null}
      {contest.prizes?.drawing ? <Text style={styles.prizeSub}>Bring in 1 or more and you're in the drawing for {contest.prizes.drawing}.</Text> : null}

      <View style={styles.mine}>
        <Text style={styles.mineBig}>{mine?.qualified ?? 0}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.mineLabel}>your recruits</Text>
          <Text style={styles.mineSub}>
            {mine?.pending
              ? `${mine.pending} more counting once they log ${contest.qualifyDays} days in their first ${contest.qualifyWindowDays}`
              : `Counts when someone new names you and logs ${contest.qualifyDays} days in their first ${contest.qualifyWindowDays}`}
          </Text>
        </View>
      </View>

      {top.length ? (
        <View style={styles.board}>
          {top.map((s, i) => (
            <View key={s.uid} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={[styles.name, s.uid === uid && { color: colors.primary }]} numberOfLines={1}>
                {s.name}
                {s.uid === uid ? ' (you)' : ''}
              </Text>
              <Text style={styles.count}>{s.qualified}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No recruits yet. First one takes the lead.</Text>
      )}

      <View style={styles.actions}>
        {contest.rulesUrl ? (
          <TouchableOpacity onPress={() => void Linking.openURL(contest.rulesUrl!)} style={styles.rules} activeOpacity={0.8}>
            <Text style={styles.rulesText}>Official rules</Text>
          </TouchableOpacity>
        ) : null}
        {running && joinCode ? (
          <TouchableOpacity onPress={() => void share()} style={styles.btn} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.btnText}>Share invite</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.apple}>Apple is not a sponsor of, and is not involved in, this contest.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(233,181,66,0.45)', padding: 16, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', flex: 1 },
  status: { color: colors.rankGold, fontSize: 12, fontWeight: '700' },
  prize: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 8 },
  prizeSub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  mineBig: { color: colors.rankGold, fontSize: 32, fontWeight: '800', minWidth: 36, textAlign: 'center' },
  mineLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  mineSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  board: { marginTop: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { color: colors.textMuted, fontSize: 13, fontWeight: '700', width: 16 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  count: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 },
  rules: { paddingHorizontal: 8, paddingVertical: 9, marginRight: 'auto' },
  rulesText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  apple: { color: colors.textMuted, fontSize: 10, marginTop: 10, textAlign: 'center' },
});
