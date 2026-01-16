import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Divider, List, Text } from 'react-native-paper';

import Screen from '../components/layout/Screen';
import { AuthContext } from '../store/AuthContext';
import { subscribeMySeasonResults, type SeasonResult } from '../services/mmrSeasonResults';
import { subscribeMyBadges, type EarnedBadge } from '../services/mmrBadges';
import RankBadge from '../components/mmr/RankBadge';

type SeasonRankBadge = Extract<EarnedBadge, { type: 'seasonRank' }>;

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
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Card.Title title="Season history" subtitle="Quarterly snapshots" />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Each season awards a badge and applies a soft reset at rollover.
          </Text>
        </Card.Content>
        <Divider />
        {results.length === 0 ? (
          <Card.Content>
            <Text>No past seasons yet.</Text>
            <Text variant="bodySmall" style={{ opacity: 0.75, marginTop: 4 }}>
              When the quarter changes, we’ll snapshot your final rank into this page.
            </Text>
          </Card.Content>
        ) : (
          results.map((r) => {
            const badge = badgeBySeason[r.seasonId] ?? null;
            const tier = badge?.tier ?? r.final?.tier ?? null;
            const division = badge?.division ?? r.final?.division ?? null;
            const mp = r.final?.mp ?? null;
            const mmr = r.final?.mmr ?? null;
            return (
              <List.Item
                key={r.id}
                title={r.seasonId}
                description={[
                  tier ? `Final: ${rankLabel(tier, division ?? undefined, mp ?? undefined)}` : 'Final: —',
                  mmr != null ? `MMR: ${Math.round(mmr)}` : null,
                ]
                  .filter(Boolean)
                  .join('\n')}
                left={() => (
                  <View style={{ marginLeft: 8, justifyContent: 'center' }}>{tier ? <RankBadge tier={tier} size={40} /> : null}</View>
                )}
              />
            );
          })
        )}
      </Card>
    </Screen>
  );
}

