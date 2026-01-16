import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';

type AvatarProps = {
  photoURL: string | null;
  name: string;
  size?: number;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '');
  return letters.toUpperCase();
}

export default function Avatar({ photoURL, name, size = 40 }: AvatarProps) {
  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surface2,
        },
      ]}
    >
      <Text
        variant="titleMedium"
        style={{
          fontSize: size * 0.4,
          color: colors.textSecondary,
        }}
      >
        {initialsFromName(name).slice(0, 2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    backgroundColor: colors.surface2,
  },
});
