import React from 'react';
import { RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  safeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export default function Screen({ children, scroll = true, contentStyle, safeTop = true, refreshing, onRefresh }: Props) {
  const theme = useTheme();
  const edges = safeTop ? (['top', 'left', 'right', 'bottom'] as const) : (['left', 'right', 'bottom'] as const);
  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={[{ flex: 1, padding: 16 }, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[{ padding: 16, paddingBottom: 24 }, contentStyle]}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

