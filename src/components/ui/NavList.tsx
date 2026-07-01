import React from 'react';
import { View } from 'react-native';
import { List, useTheme } from 'react-native-paper';

export type NavListItem = {
  title: string;
  description?: string;
  icon?: string;
  badge?: boolean;
  onPress: () => void;
};

export default function NavList({ items }: { items: NavListItem[] }) {
  const theme = useTheme();
  return (
    <List.Section style={{ marginVertical: 0 }}>
      {items.map((it) => {
        const iconName = it.icon;
        return (
        <List.Item
          key={it.title}
          title={it.title}
          description={it.description}
          left={iconName ? (props) => <List.Icon {...props} icon={iconName} /> : undefined}
          right={(props) => {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {it.badge ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: theme.colors.secondary,
                      borderWidth: 2,
                      borderColor: theme.colors.background,
                    }}
                  />
                ) : null}
                <List.Icon {...props} icon="chevron-right" />
              </View>
            );
          }}
          onPress={it.onPress}
        />
        );
      })}
    </List.Section>
  );
}

