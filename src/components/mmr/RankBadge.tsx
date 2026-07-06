import React from 'react';
import { View } from 'react-native';

import type { Tier } from '../../mmr/types';
import RankEmblem from '../ui/RankEmblem';

/**
 * Legacy rank badge shim. The old PNG fantasy-badge art is retired — every
 * remaining RankBadge usage now renders the Midnight Blue faceted-diamond
 * RankEmblem (no division numeral/pips at this call level).
 */
export default function RankBadge({ tier, size = 44 }: { tier: Tier; size?: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <RankEmblem tier={tier} size={size} />
    </View>
  );
}
