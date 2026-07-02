import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import Card from '../ui/Card';
import { colors } from '../../theme/colors';
import type { ChecklistItem, ChecklistType, TodayChecklist } from '../../viewmodels/today';

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

function Row({ item, onLog }: { item: ChecklistItem; onLog: (t: ChecklistType) => void }) {
  return (
    <View style={styles.row}>
      <StatusCircle logged={item.logged} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowSub}>{item.valueLine}</Text>
      </View>
      {item.logged ? (
        <Text style={styles.time}>{fmtTime(item.loggedAtMs)}</Text>
      ) : (
        <Pressable onPress={() => onLog(item.type)} style={styles.logBtn} accessibilityRole="button">
          <Text style={styles.logBtnText}>Log</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function TodaysLogCard({ checklist, onLog }: { checklist: TodayChecklist; onLog: (t: ChecklistType) => void }) {
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.cardLabel}>Today's log</Text>
        <Text style={styles.doneLabel}>
          {checklist.doneCount} of {checklist.total} done
        </Text>
      </View>
      <View style={{ marginTop: 6 }}>
        {checklist.items.map((item, i) => (
          <View key={item.type}>
            {i > 0 && <View style={styles.divider} />}
            <Row item={item} onLog={onLog} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  doneLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  divider: { height: 1, backgroundColor: colors.divider },
  circle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dashedBorder },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 12.5, color: colors.textMuted },
  logBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, height: 32, alignItems: 'center', justifyContent: 'center' },
  logBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
