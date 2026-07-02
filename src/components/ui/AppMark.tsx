import React from 'react';
import { View } from 'react-native';
import { Icon } from 'react-native-paper';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../../theme/colors';

type Props = {
  /** Bounding-box size in dp. 84 (welcome), 56 (sign-in), etc. */
  size?: number;
  /** MaterialCommunityIcons glyph centered on the mark. */
  glyph?: string;
};

/**
 * The AccountaBuild app logo: a 45°-rotated rounded square with a blue gradient
 * and a centered (upright) glyph. Same faceted-diamond language as RankEmblem,
 * but the brand-blue app mark used on Welcome / Sign-in. Drawn in SVG + a Paper
 * icon overlay so the glyph stays upright while the tile is rotated.
 */
export default function AppMark({ size = 84, glyph = 'dumbbell' }: Props) {
  const glyphSize = Math.round(size * 0.42);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOpacity: 0.4,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="appmark" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#4E97FF" />
            <Stop offset="1" stopColor="#2F6FD6" />
          </LinearGradient>
        </Defs>
        <Rect
          x={16}
          y={16}
          width={68}
          height={68}
          rx={20}
          fill="url(#appmark)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1.4}
          transform="rotate(45 50 50)"
        />
      </Svg>
      <Icon source={glyph} size={glyphSize} color="#FFFFFF" />
    </View>
  );
}
