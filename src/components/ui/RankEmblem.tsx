import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { Tier } from '../../mmr/types';
import { colors, tierColors } from '../../theme/colors';
import { emblemShadow } from '../../theme/shadows';

type Division = 1 | 2 | 3 | 4;

type Props = {
  tier: Tier;
  /** Bounding-box size in dp. Common: 66 (profile hero), 104 (rank-up), 34 (Today row). */
  size?: number;
  /** 1 = I (top of tier) … 4 = IV (bottom). Master/Challenger have no divisions. */
  division?: Division | null;
  /** Division pips below the emblem. Defaults to on when a division is present. */
  showPips?: boolean;
  /** Small plain diamond for inline use (leaderboards, chips): no numeral, no pips. */
  inline?: boolean;
};

const ROMAN: Record<Division, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/**
 * "Faceted diamond" rank emblem — a 45°-rotated rounded square with a tier
 * gradient, a reversed inner facet, the division numeral, and division pips.
 * Replaces the legacy PNG badge art. Drawn entirely in SVG/vector.
 */
export default function RankEmblem({ tier, size = 66, division = null, showPips, inline = false }: Props) {
  const tc = tierColors[tier];
  const outerId = `re-o-${tier}`;
  const innerId = `re-i-${tier}`;

  if (inline) {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={outerId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tc.start} />
            <Stop offset="1" stopColor={tc.end} />
          </LinearGradient>
        </Defs>
        <Rect x={22} y={22} width={56} height={56} rx={12} fill={`url(#${outerId})`} transform="rotate(45 50 50)" />
      </Svg>
    );
  }

  const pipsVisible = (showPips ?? division != null) && division != null;
  const pip = Math.max(6, Math.round(size * 0.14));
  const filled = division != null ? 5 - division : 0; // I → 4 pips, IV → 1 pip

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[{ width: size, height: size }, emblemShadow(tc.end)]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={outerId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={tc.start} />
              <Stop offset="1" stopColor={tc.end} />
            </LinearGradient>
            <LinearGradient id={innerId} x1="1" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={tc.start} />
              <Stop offset="1" stopColor={tc.end} />
            </LinearGradient>
          </Defs>
          {/* Outer faceted diamond with a subtle top highlight edge. */}
          <Rect
            x={16}
            y={16}
            width={68}
            height={68}
            rx={14.3}
            fill={`url(#${outerId})`}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1.4}
            transform="rotate(45 50 50)"
          />
          {/* Reversed inner facet. */}
          <Rect x={26.2} y={26.2} width={47.6} height={47.6} rx={6.4} fill={`url(#${innerId})`} opacity={0.92} transform="rotate(45 50 50)" />
          {division != null && (
            <SvgText x={50} y={50} dy={12} fontSize={34} fontWeight="800" fill={tc.numeral} textAnchor="middle">
              {ROMAN[division]}
            </SvgText>
          )}
        </Svg>
      </View>
      {pipsVisible && (
        <View style={{ flexDirection: 'row', gap: Math.max(3, Math.round(size * 0.06)), marginTop: Math.max(6, Math.round(size * 0.12)) }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: pip,
                height: pip,
                borderRadius: 2,
                transform: [{ rotate: '45deg' }],
                backgroundColor: i < filled ? tc.start : colors.ringNotLogged,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
