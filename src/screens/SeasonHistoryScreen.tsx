import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import { AuthContext } from '../store/AuthContext';
import { subscribeMySeasonResults, type SeasonResult } from '../services/mmrSeasonResults';
import { subscribeMyBadges, type EarnedBadge } from '../services/mmrBadges';
import RankBadge from '../components/mmr/RankBadge';
import { colors, spacing } from '../theme';

// EarnedBadge's rank member covers both seasonRank and seasonPeak in one shape,
// so Extract must include both literals or it collapses to never.
type SeasonRankBadge = Extract<EarnedBadge, { type: 'seasonRank' | 'seasonPeak' }>;

function rankLabel(tier: string, division?: number | null, mp?: number | null) {
  const div = division ?? null;
  const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
  const mpTxt = typeof mp === 'number' ? `${Math.round(mp)} MP` : null;
  return [div ? `${tier} ${roman}` : tier, mpTxt].filter(Boolean).join(' • ');
}

export default function SeasonHistoryScreen() {
  const { user } = useContext(AuthContext);
  const [results, setResults] = useState<SeasonResult[]>([]);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeMySeasonResults(user.uid, setResults);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyBadges(user.uid, setBadges);
  }, [user]);

  const badgeBySeason = useMemo(() => {
    const map: Record<string, SeasonRankBadge> = {};
    for (const b of badges) {
      if (b.type !== 'seasonRank') continue;
      map[b.seasonId] = b;
    }
    return map;
  }, [badges]);

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.signedOut}>
          <AppText variant="body" color="secondary">You must be signed in.</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <AppText variant="cardLabel" color="primary">Season history</AppText>
          <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>Quarterly snapshots</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={styles.blurb}>
            Each season awards a badge and applies a soft reset at rollover.
          </AppText>
        </Card>

        {results.length === 0 ? (
          <Card style={styles.spacedCard}>
            <AppText variant="body" color="secondary">No past seasons yet.</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.emptySub}>
              When the quarter changes, we’ll snapshot your final rank into this page.
            </AppText>
          </Card>
        ) : (
          <>
            <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Past seasons</AppText>
            <View style={styles.list}>
              {results.map((r) => {
                const badge = badgeBySeason[r.seasonId] ?? null;
                const tier = badge?.tier ?? r.final?.tier ?? null;
                const division = badge?.division ?? r.final?.division ?? null;
                const mp = r.final?.mp ?? null;
                const mmr = r.final?.mmr ?? null;
                return (
                  <Card key={r.id}>
                    <View style={styles.row}>
                      {tier ? (
                        <View style={styles.badgeWrap}>
                          <RankBadge tier={tier} size={40} />
                        </View>
                      ) : null}
                      <View style={styles.rowText}>
                        <AppText variant="rowTitle" color="primary">{r.seasonId}</AppText>
                        <AppText variant="rowSubtitle" color="secondary" style={styles.rowMeta}>
                          {tier ? `Final: ${rankLabel(tier, division ?? undefined, mp ?? undefined)}` : 'Final: —'}
                        </AppText>
                        {mmr != null ? (
                          <AppText variant="rowSubtitle" color="muted">{`MMR: ${Math.round(mmr)}`}</AppText>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  subLine: { marginTop: 2 },
  blurb: { marginTop: spacing.md, lineHeight: 18 },
  spacedCard: { marginTop: spacing.md },
  emptySub: { marginTop: spacing.xs, lineHeight: 18 },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badgeWrap: { justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowMeta: { marginTop: 2 },
});
