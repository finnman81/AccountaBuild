import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { subscribeMyActivity, markAllActivityRead, type ActivityItem, type ActivityType } from '../services/activity';
import AppText from '../components/ui/AppText';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Activity'>;

const META: Record<ActivityType, { icon: string; tint: string; bg: string }> = {
  cheer: { icon: 'arm-flex', tint: colors.primary, bg: colors.primaryTint },
  nudge: { icon: 'hand-wave', tint: colors.rankGold, bg: 'rgba(233,181,66,0.14)' },
  promotion: { icon: 'chevron-double-up', tint: colors.success, bg: colors.successTint },
  demotion: { icon: 'chevron-double-down', tint: colors.danger, bg: 'rgba(255,90,90,0.12)' },
};

function relativeTime(ms: number | null): string {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ActivityScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyActivity(user.uid, setItems);
  }, [user?.uid]);

  // Mark everything read when the feed is opened.
  useEffect(() => {
    if (!user?.uid) return;
    void markAllActivityRead(user.uid).catch(() => {});
  }, [user?.uid]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Activity</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Icon source="bell-outline" size={30} color={colors.textMuted} />
            <AppText variant="rowTitle" color="primary" style={{ marginTop: spacing.sm }}>Nothing yet</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.emptyText}>
              Cheers, nudges, and rank changes from your crew show up here.
            </AppText>
          </View>
        ) : (
          <View style={styles.group}>
            {items.map((it, i) => {
              const meta = META[it.type] ?? META.cheer;
              return (
                <View key={it.id} style={[styles.row, i < items.length - 1 && styles.divider]}>
                  <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                    <Icon source={meta.icon} size={20} color={meta.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="rowTitle" color="primary">{it.title}</AppText>
                    <AppText variant="rowSubtitle" color="muted">{it.body}</AppText>
                  </View>
                  <AppText variant="label" color="muted">{relativeTime(it.createdAtMs)}</AppText>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 60 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconWrap: { width: 40, height: 40, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyText: { textAlign: 'center', marginTop: spacing.xs, lineHeight: 18, paddingHorizontal: spacing.lg },
});
