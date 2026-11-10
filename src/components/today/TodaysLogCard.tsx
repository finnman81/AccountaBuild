import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { easeIfChanged } from '../../hooks/useCached';
import Text from '../ui/Text';

import Card from '../ui/Card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { ChecklistItem, ChecklistType, TodayChecklist } from '../../viewmodels/today';
import PressableScale from '../ui/PressableScale';

function fmtTime(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function StatusCircle({ logged }: { logged: boolean }) {
  if (logged) {
    return (
      <View style={[styles.circle, { backgroundColor: colors.successTint }]}>
        <Text style={{ color: colors.success, fontSize: 15, fontWeight: '800', lineHeight: 18 }}>✓</Text>
      </View>
    );
  }
  return <View style={[styles.circle, styles.dashed]} />;
}

function Row({ item, onLog, onOpenEntries }: { item: ChecklistItem; onLog: (t: ChecklistType) => void; onOpenEntries?: (item: ChecklistItem) => void }) {
  const content = (
    <View style={styles.row}>
      <StatusCircle logged={item.logged} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowSub}>{item.valueLine}</Text>
      </View>
      {item.logged ? (
        <View style={styles.loggedRight}>
          <Text style={styles.time}>{fmtTime(item.loggedAtMs)}</Text>
          <Text style={styles.editHint}>Edit</Text>
        </View>
      ) : (
        <PressableScale onPress={() => onLog(item.type)} hitSlop={6} style={styles.logBtn} accessibilityRole="button" accessibilityLabel={`Log ${item.title}`}>
          <Text style={styles.logBtnText}>Log</Text>
        </PressableScale>
      )}
    </View>
  );

  // A logged row is tappable to view/edit/delete its entries.
  if (item.logged && onOpenEntries) {
    return (
      <PressableScale onPress={() => onOpenEntries(item)} accessibilityRole="button" accessibilityHint="View, edit, or delete entries">
        {content}
      </PressableScale>
    );
  }
  return content;
}

export default function TodaysLogCard({ checklist, onLog, onOpenEntries, aside }: { checklist: TodayChecklist; onLog: (t: ChecklistType) => void; onOpenEntries?: (item: ChecklistItem) => void; aside?: React.ReactNode }) {
  // A row flipping to "logged" (a synced workout landing) eases in instead
  // of snapping: the reshuffle-on-open was the visible part of sync lag.
  const sig = checklist.items.map((i) => `${i.type}:${i.logged ? 1 : 0}:${i.valueLine}`).join('|');
  const prevSig = useRef(sig);
  easeIfChanged(prevSig, sig);
  return (
    <Card tier="hero">
      <View style={styles.header}>
        <Text style={styles.cardLabel}>Today</Text>
        {aside ? <View style={{ flex: 1, alignItems: 'center' }}>{aside}</View> : null}
        <Text style={styles.doneLabel}>
          {checklist.doneCount} of {checklist.total}
        </Text>
      </View>
      <View style={{ marginTop: 6 }}>
        {checklist.items.map((item, i) => (
          <View key={item.type}>
            {i > 0 && <View style={styles.divider} />}
            <Row item={item} onLog={onLog} onOpenEntries={onOpenEntries} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { ...typography.cardTitle, color: colors.textPrimary },
  doneLabel: { ...typography.stat, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  divider: { height: 1, backgroundColor: colors.divider },
  circle: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#56607A' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 12.5, color: colors.textSecondary },
  loggedRight: { alignItems: 'flex-end' },
  editHint: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  logBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, height: 40, alignItems: 'center', justifyContent: 'center' },
  logBtnText: { ...typography.button, color: colors.onPrimary },
});
