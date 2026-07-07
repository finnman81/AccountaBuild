import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Icon } from 'react-native-paper';

import AppText from '../ui/AppText';
import Avatar from '../ui/Avatar';
import ComplianceRing from '../ui/ComplianceRing';
import RankEmblem from '../ui/RankEmblem';
import { colors, radius, spacing } from '../../theme';
import type { UserGroupListItem } from '../../services/groups';
import type { GroupOverview } from '../../viewmodels/groups';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

type Props = {
  group: UserGroupListItem;
  overview?: GroupOverview;
  isActive: boolean;
  onPress: () => void;
  onInfo?: () => void;
};

/** A group's summary card (design 06): compliance ring, stake, and today's logged avatars. */
export default function GroupCard({ group, overview, isActive, onPress, onInfo }: Props) {
  const pct = overview?.compliancePct ?? 0;
  const members = overview?.memberTotal ?? group.memberCount ?? 0;
  const loggedToday = overview?.loggedToday ?? 0;
  const avatars = overview?.avatars ?? [];
  const roleLabel = group.role === 'admin' ? 'ADMIN' : isActive ? 'ACTIVE' : null;
  const loggedColor = members > 0 && loggedToday >= Math.ceil(members * 0.6) ? colors.success : colors.warning;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, isActive && styles.cardActive]}>
      <View style={styles.top}>
        <ComplianceRing pct={pct} size={64} strokeWidth={6} />
        <View style={styles.info}>
          <View style={styles.titleRow}>
            {group.logoUrl ? <Image source={{ uri: group.logoUrl }} style={styles.logo} /> : null}
            <AppText variant="rowTitle" color="primary" numberOfLines={1} style={styles.name}>{group.name}</AppText>
            {roleLabel ? (
              <View style={styles.roleChip}>
                <AppText variant="eyebrow" style={styles.roleText}>{roleLabel}</AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="rowSubtitle" color="muted" style={styles.metaLine}>
            {members} member{members === 1 ? '' : 's'} · week {pct}% complete
          </AppText>
          {overview?.myTier ? (
            <View style={styles.stakeRow}>
              <RankEmblem tier={overview.myTier} inline size={12} />
              <AppText variant="rowSubtitle" color="secondary">
                {overview.myTier}{overview.myDivision ? ` ${ROMAN[overview.myDivision]}` : ''}
                {overview.streakDays > 0 ? ` · ${overview.streakDays}d streak` : ''}
              </AppText>
            </View>
          ) : null}
        </View>
        {onInfo ? (
          <TouchableOpacity onPress={onInfo} hitSlop={10} style={styles.gearBtn} accessibilityLabel="Group info & settings">
            <Icon source="cog-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Icon source="chevron-right" size={22} color={colors.textMuted} />
        )}
      </View>

      {(avatars.length > 0 || members > 0) && (
        <>
          <View style={styles.divider} />
          <View style={styles.bottom}>
            <View style={styles.avatarRow}>
              {avatars.map((a, i) => (
                <View key={a.uid} style={[styles.avatarWrap, i > 0 && styles.avatarOverlap]}>
                  {a.photoURL ? (
                    <Image source={{ uri: a.photoURL }} style={styles.avatarImg} />
                  ) : (
                    <Avatar photoURL={null} name={a.name} size={26} status={a.logged ? 'logged' : 'notLogged'} />
                  )}
                </View>
              ))}
            </View>
            <AppText variant="rowSubtitle" style={{ color: loggedColor }}>
              {loggedToday}/{members} logged today
            </AppText>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    padding: spacing.base,
  },
  cardActive: { borderColor: 'rgba(62,139,255,0.35)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  info: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 22, height: 22, borderRadius: 6, backgroundColor: colors.surface2 },
  name: { flexShrink: 1 },
  gearBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  roleChip: { backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { color: colors.primaryOnDark, fontSize: 9 },
  metaLine: {},
  stakeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderRadius: 999 },
  avatarOverlap: { marginLeft: -8 },
  avatarImg: { width: 26, height: 26, borderRadius: 999, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface2 },
});
