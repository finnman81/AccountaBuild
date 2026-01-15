import React from 'react';
import { Image, View } from 'react-native';

import type { Tier } from '../../mmr/types';
import { rankBadgeForTier } from '../../mmr/badges';

export default function RankBadge({ tier, size = 44 }: { tier: Tier; size?: number }) {
  const src = rankBadgeForTier(tier);
  return (
    <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      <Image source={src} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

