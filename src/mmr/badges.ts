import type { ImageSourcePropType } from 'react-native';

import type { Tier } from './types';

export function rankBadgeForTier(tier: Tier): ImageSourcePropType {
  switch (tier) {
    case 'Iron':
      return require('../../Pictures/transparent/iron_mmr.png');
    case 'Bronze':
      return require('../../Pictures/transparent/bronze_mmr.png');
    case 'Silver':
      return require('../../Pictures/transparent/silver_mmr.png');
    case 'Gold':
      return require('../../Pictures/transparent/gold_mmr.png');
    case 'Platinum':
      return require('../../Pictures/transparent/plat_mmr.png');
    case 'Diamond':
      return require('../../Pictures/transparent/diamond_mmr.png');
    case 'Master':
      return require('../../Pictures/transparent/master_mmr.png');
    case 'Challenger':
      return require('../../Pictures/transparent/challenger_mmr.png');
    default:
      return require('../../Pictures/transparent/bronze_mmr.png');
  }
}

