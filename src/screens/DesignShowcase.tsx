import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';

import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import type { Tier } from '../mmr/types';
import RankEmblem from '../components/ui/RankEmblem';
import SegmentedControl from '../components/ui/SegmentedControl';
import StatTile from '../components/ui/StatTile';
import ComplianceRing from '../components/ui/ComplianceRing';
import Avatar from '../components/ui/Avatar';
import Card from '../components/ui/Card';
import PrimaryButton from '../components/ui/PrimaryButton';
import TodayHeader from '../components/today/TodayHeader';
import TodaysLogCard from '../components/today/TodaysLogCard';
import TeamTodayRail from '../components/today/TeamTodayRail';
import LeaderboardPreviewCard from '../components/today/LeaderboardPreviewCard';
import type { TeamToday, TodayChecklist, LeaderboardPreviewRow } from '../viewmodels/today';
import LogComposer from '../components/log/LogComposer';

const MOCK_CHECKLIST: TodayChecklist = {
  doneCount: 2,
  total: 3,
  items: [
    { type: 'calories', title: 'Calories', logged: true, loggedAtMs: new Date(2026, 6, 1, 8, 12).getTime(), valueLine: '1,840 / 2,200 kcal' },
    { type: 'workout', title: 'Workout', logged: true, loggedAtMs: new Date(2026, 6, 1, 7, 5).getTime(), valueLine: 'Push day · 52m' },
    { type: 'weight', title: 'Weight', logged: false, loggedAtMs: null, valueLine: 'Not logged yet' },
  ],
};

const MOCK_TEAM: TeamToday = {
  loggedCount: 4,
  total: 6,
  members: [
    { uid: 'marcus', name: 'Marcus', photoURL: null, status: 'logged', streakLeader: true, atRisk: false, streakDays: 14, valueLine: '14d streak' },
    { uid: 'jules', name: 'Jules', photoURL: null, status: 'logged', streakLeader: false, atRisk: false, streakDays: 5, valueLine: '5d streak' },
    { uid: 'sam', name: 'Sam', photoURL: null, status: 'logged', streakLeader: false, atRisk: false, streakDays: 2, valueLine: '2d streak' },
    { uid: 'ray', name: 'Ray', photoURL: null, status: 'logged', streakLeader: false, atRisk: false, streakDays: 1, valueLine: '1d streak' },
    { uid: 'kira', name: 'Kira', photoURL: null, status: 'notLogged', streakLeader: false, atRisk: true, streakDays: 0, valueLine: 'at risk' },
    { uid: 'dev', name: 'Dev', photoURL: null, status: 'notLogged', streakLeader: false, atRisk: false, streakDays: 0, valueLine: '' },
  ],
};

const MOCK_LEADERBOARD: LeaderboardPreviewRow[] = [
  { rank: 1, uid: 'marcus', name: 'Marcus', tier: 'Gold', division: 1, mmr: 1872, isMe: false },
  { rank: 2, uid: 'me', name: 'You', tier: 'Gold', division: 2, mmr: 1654, isMe: true },
  { rank: 3, uid: 'jules', name: 'Jules', tier: 'Silver', division: 1, mmr: 1601, isMe: false },
];

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, marginBottom: 12 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export default function DesignShowcase() {
  const [seg, setSeg] = useState('weight');
  const [seg2, setSeg2] = useState('workout');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingTop: 60 }}>
      <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginBottom: 20 }}>
        Midnight Blue
      </Text>

      <Section title="Rank emblems · hero (66) with pips">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          {(['Iron', 'Silver', 'Gold', 'Diamond'] as Tier[]).map((t, i) => (
            <RankEmblem key={t} tier={t} size={66} division={((i % 4) + 1) as 1 | 2 | 3 | 4} />
          ))}
        </View>
      </Section>

      <Section title="Rank emblems · all tiers inline (28)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          {TIERS.map((t) => (
            <View key={t} style={{ alignItems: 'center', width: 64 }}>
              <RankEmblem tier={t} size={40} inline />
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>{t}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Segmented control">
        <SegmentedControl
          value={seg}
          onChange={setSeg}
          options={[{ value: 'weight', label: 'Weight' }, { value: 'workouts', label: 'Workouts' }, { value: 'calories', label: 'Calories' }]}
        />
        <View style={{ height: 12 }} />
        <SegmentedControl
          variant="primary"
          value={seg2}
          onChange={setSeg2}
          options={[{ value: 'calories', label: 'Calories' }, { value: 'workout', label: 'Workout' }, { value: 'weight', label: 'Weight' }, { value: 'photo', label: 'Photo' }]}
        />
      </Section>

      <Section title="Stat tiles">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile label="This week" value={3} unit="workouts" />
          <StatTile label="Avg intake" value="1,980" unit="kcal" />
          <StatTile label="30-day" value="−4.2" unit="lb" delta="▾ on track" deltaColor={colors.success} />
        </View>
      </Section>

      <Section title="Compliance rings">
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <ComplianceRing pct={0.67} />
          <ComplianceRing pct={0.45} />
          <ComplianceRing pct={0.9} />
        </View>
      </Section>

      <Section title="Avatars · status rings + at-risk">
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <Avatar name="Marcus" photoURL={null} size={52} status="streakLeader" />
          <Avatar name="Jules" photoURL={null} size={52} status="logged" />
          <Avatar name="Sam" photoURL={null} size={52} status="notLogged" />
          <Avatar name="Kira" photoURL={null} size={52} status="notLogged" atRisk />
        </View>
      </Section>

      <Section title="Card + CTA">
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 }}>Today's log</Text>
          <Text style={{ fontSize: 15, color: colors.textPrimary, marginBottom: 16 }}>2 of 3 done — weight still to log.</Text>
          <PrimaryButton onPress={() => {}}>Log weight</PrimaryButton>
          <View style={{ height: 10 }} />
          <PrimaryButton secondary mode="outlined" onPress={() => {}}>Skip for now</PrimaryButton>
        </Card>
      </Section>

      <Section title="Today screen · assembled">
        <TodayHeader
          groupName="Iron Circle"
          userName="Danny"
          dateLabel="Tuesday, July 1"
          greeting="Good morning"
          unreadCount={2}
          rankTier="Silver"
          rankDivision={4}
          onSwitchGroup={() => {}}
          onChat={() => {}}
          onBell={() => {}}
        />
        <View style={{ height: 20 }} />
        <TodaysLogCard checklist={MOCK_CHECKLIST} onLog={() => {}} />
        <TeamTodayRail team={MOCK_TEAM} onMemberPress={() => {}} />
        <LeaderboardPreviewCard rows={MOCK_LEADERBOARD} onViewAll={() => {}} />
      </Section>

      <Section title="Log composer · weight (dial + tap-to-type)">
        <View style={{ height: 560, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderCard }}>
          <LogComposer initialType="weight" onClose={() => {}} />
        </View>
      </Section>
    </ScrollView>
  );
}
