import type { ImageSourcePropType } from 'react-native';

import type { Tier } from './types';

export function rankBadgeForTier(tier: Tier): ImageSourcePropType {
  switch (tier) {
    case 'Iron':
      return require('../../Pictures/iron_mmr.png');
    case 'Bronze':
      return require('../../Pictures/bronze_mmr.png');
    case 'Silver':
      return require('../../Pictures/silver_mmr.png');
    case 'Gold':
      return require('../../Pictures/gold_mmr.png');
    case 'Platinum':
      return require('../../Pictures/plat_mmr.png');
    case 'Diamond':
      return require('../../Pictures/diamond_mmr.png');
    case 'Master':
      return require('../../Pictures/master_mmr.png');
    case 'Challenger':
      return require('../../Pictures/challenger_mmr.png');
    default:
      return require('../../Pictures/bronze_mmr.png');
  }
}

