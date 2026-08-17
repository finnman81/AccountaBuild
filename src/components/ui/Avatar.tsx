import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { colors } from '../../theme/colors';
import HibernationPod from './HibernationPod';

/**
 * expo-image when the native module exists (build ≥37: disk-cached avatars, no
 * re-download flicker), RN Image otherwise. The gate matters because this file
 * ships OTA to builds that predate the module — an unguarded import would
 * crash them on launch (the exact trap Sentry's wizard almost sprang on us).
 */
const hasExpoImage = !!requireOptionalNativeModule('ExpoImage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoImage: React.ComponentType<any> | null = hasExpoImage ? require('expo-image').Image : null;

export type AvatarStatus = 'logged' | 'notLogged' | 'streakLeader' | 'streak' | 'danger';

type AvatarProps = {
  photoURL: string | null;
  name: string;
  size?: number;
  /** Draw a 2px status ring around the avatar (Team Today rail). */
  status?: AvatarStatus;
  /** Red "at risk" badge dot in the top-right corner. */
  atRisk?: boolean;
  /** Asleep: overlay the healing-pod treatment on their real photo. */
  hibernating?: boolean;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '');
  return letters.toUpperCase();
}

const RING_COLOR: Record<AvatarStatus, string> = {
  logged: colors.ringLogged,
  notLogged: colors.ringNotLogged,
  streakLeader: colors.ringStreakLeader,
  streak: colors.ringStreak,
  danger: colors.ringDanger,
};

export default function Avatar({ photoURL, name, size = 40, status, atRisk, hibernating }: AvatarProps) {
  const base = photoURL ? (
    ExpoImage ? (
      <ExpoImage
        source={{ uri: photoURL }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
        cachePolicy="disk"
        transition={80}
        recyclingKey={photoURL}
      />
    ) : (
      <Image source={{ uri: photoURL }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} resizeMode="cover" />
    )
  ) : (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2 }]}>
      <Text style={{ fontSize: size * 0.4, color: colors.textSecondary, fontWeight: '600' }}>{initialsFromName(name).slice(0, 2)}</Text>
    </View>
  );

  const inner = hibernating ? (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      {base}
      <HibernationPod size={size} />
    </View>
  ) : (
    base
  );

  if (!status && !atRisk) return inner;

  const ringPad = 2;
  const ringBorder = 2;
  return (
    <View style={{ width: size + (ringPad + ringBorder) * 2, height: size + (ringPad + ringBorder) * 2 }}>
      <View
        style={{
          padding: ringPad,
          borderRadius: (size + (ringPad + ringBorder) * 2) / 2,
          borderWidth: status ? ringBorder : 0,
          borderColor: status ? RING_COLOR[status] : 'transparent',
        }}
      >
        {inner}
      </View>
      {atRisk && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: colors.riskDot,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
