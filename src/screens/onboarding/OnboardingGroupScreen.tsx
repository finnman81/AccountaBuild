import React, { useContext, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Icon } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { OnboardingStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AppText from '../../components/ui/AppText';
import TextField from '../../components/ui/TextField';
import { completeOnboarding } from '../../services/onboarding';
import { createGroup, joinGroupByCode } from '../../services/groups';
import { onboardingAnalytics } from '../../services/analytics';
import { friendlyNameFromDisplayName } from '../../utils/formatters';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Group'>;

type Mode = 'choose' | 'join' | 'create';

/**
 * Final onboarding step: get the new user into a group so the app isn't a dead
 * empty state on first open. Join with a code / create one / skip — any path
 * completes onboarding and lands them on Today.
 */
export default function OnboardingGroupScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { setActiveGroupId } = useActiveGroup();
  const rootNav = useNavigation();

  const [mode, setMode] = useState<Mode>('choose');
  const [joinCode, setJoinCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (groupId?: string) => {
    if (!user?.uid) return;
    try {
      if (groupId) await setActiveGroupId(groupId);
      await completeOnboarding(user.uid);
      onboardingAnalytics.completed();
    } catch (e) {
      console.warn('[Onboarding] completeOnboarding failed', e);
    }
    // Land on Today. AppNavigator swaps to MainTabs now that onboarding is done.
    const nav = rootNav.getParent() ?? rootNav;
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'HomeTab', params: { screen: 'Today' } } }],
      }),
    );
  };

  const onJoin = async () => {
    if (!user?.uid) return;
    setError(null);
    setBusy(true);
    try {
      const displayName = user.displayName ?? friendlyNameFromDisplayName(user.email ?? null, user.uid);
      const res = await joinGroupByCode({ uid: user.uid, displayName, joinCode });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await finish(res.groupId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Check the code.');
      setBusy(false);
    }
  };

  const onCreate = async () => {
    if (!user?.uid) return;
    if (!groupName.trim()) { setError('Give your group a name.'); return; }
    setError(null);
    setBusy(true);
    try {
      const displayName = user.displayName ?? friendlyNameFromDisplayName(user.email ?? null, user.uid);
      const res = await createGroup({ uid: user.uid, displayName, name: groupName.trim() });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await finish(res.groupId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group.');
      setBusy(false);
    }
  };

  const onSkip = async () => {
    setBusy(true);
    await finish();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OnboardingHeader currentStep={6} totalSteps={6} showBack={mode !== 'choose'} onBack={() => (mode === 'choose' ? navigation.goBack() : setMode('choose'))} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AppText variant="pageTitle" color="primary" style={styles.headline}>Find your crew</AppText>
          <AppText variant="body" color="secondary" style={styles.subtext}>
            AccountaBuild works with a group — that's who keeps you honest. Join a friend's group or start your own.
          </AppText>

          {mode === 'choose' ? (
            <View style={styles.choices}>
              <TouchableOpacity style={styles.choice} onPress={() => setMode('join')} activeOpacity={0.85}>
                <View style={styles.choiceIcon}><Icon source="account-multiple-plus-outline" size={22} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="rowTitle" color="primary">Join with a code</AppText>
                  <AppText variant="rowSubtitle" color="muted">Someone shared a 6-character code</AppText>
                </View>
                <Icon source="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.choice} onPress={() => setMode('create')} activeOpacity={0.85}>
                <View style={styles.choiceIcon}><Icon source="plus" size={22} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="rowTitle" color="primary">Create a group</AppText>
                  <AppText variant="rowSubtitle" color="muted">Start one and invite your crew</AppText>
                </View>
                <Icon source="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : mode === 'join' ? (
            <View style={styles.form}>
              <TextField label="Join code" autoCapitalize="characters" autoCorrect={false} value={joinCode} onChangeText={setJoinCode} editable={!busy} placeholder="ABC123" />
              {error ? <AppText variant="rowSubtitle" color="danger" style={styles.error}>{error}</AppText> : null}
              <PrimaryButton onPress={onJoin} loading={busy} disabled={busy || joinCode.trim().length < 6} style={styles.cta}>Join group</PrimaryButton>
            </View>
          ) : (
            <View style={styles.form}>
              <TextField label="Group name" value={groupName} onChangeText={setGroupName} editable={!busy} placeholder="Iron Circle" />
              {error ? <AppText variant="rowSubtitle" color="danger" style={styles.error}>{error}</AppText> : null}
              <PrimaryButton onPress={onCreate} loading={busy} disabled={busy || !groupName.trim()} style={styles.cta}>Create group</PrimaryButton>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onSkip} disabled={busy} style={styles.skip}>
            <AppText variant="rowSubtitle" color="muted">Skip for now</AppText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  headline: { fontSize: 26, fontWeight: '800' },
  subtext: { marginTop: spacing.sm, lineHeight: 22 },
  choices: { marginTop: spacing.xl, gap: spacing.md },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.base,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderCard,
    borderRadius: radius.card, padding: spacing.base,
  },
  choiceIcon: { width: 40, height: 40, borderRadius: radius.tile, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  form: { marginTop: spacing.xl, gap: spacing.md },
  error: { marginTop: spacing.xs },
  cta: { marginTop: spacing.sm },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  skip: { alignItems: 'center', paddingVertical: spacing.md },
});
