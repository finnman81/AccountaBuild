import React, { useContext, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';

import { AuthContext } from '../store/AuthContext';
import { subscribeMyProfile, syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';

function toNumberOrNull(text: string) {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function ProfileScreen() {
  const { user } = useContext(AuthContext);
  const [displayName, setDisplayName] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [weightCurrent, setWeightCurrent] = useState('');
  const [weightGoal, setWeightGoal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(user.uid, (p) => {
      if (!p) return;
      setDisplayName(p.displayName ?? '');
      setHeight(p.height == null ? '' : String(p.height));
      setAge(p.age == null ? '' : String(p.age));
      setWeightCurrent(p.weightCurrent == null ? '' : String(p.weightCurrent));
      setWeightGoal(p.weightGoal == null ? '' : String(p.weightGoal));
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setIsSaving(true);
    try {
      const next = {
        uid: user.uid,
        displayName: displayName.trim() || null,
        height: toNumberOrNull(height),
        age: toNumberOrNull(age),
        weightCurrent: toNumberOrNull(weightCurrent),
        weightGoal: toNumberOrNull(weightGoal),
      };
      if (height.trim() && next.height == null) throw new Error('Height must be a number');
      if (age.trim() && next.age == null) throw new Error('Age must be a number');
      if (weightCurrent.trim() && next.weightCurrent == null) throw new Error('Current weight must be a number');
      if (weightGoal.trim() && next.weightGoal == null) throw new Error('Goal weight must be a number');

      await updateMyProfile(next);
      await syncMyMemberProfileToAllGroups(user.uid);
      setSaved('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text>You must be signed in.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Card>
          <Card.Title title="Your profile" subtitle={user.email ?? undefined} />
          <Card.Content>
            <TextInput label="Display name" value={displayName} onChangeText={setDisplayName} disabled={isSaving} />
            <View style={{ height: 12 }} />
            <TextInput label="Height" value={height} onChangeText={setHeight} keyboardType="decimal-pad" disabled={isSaving} />
            <View style={{ height: 12 }} />
            <TextInput label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" disabled={isSaving} />
            <View style={{ height: 12 }} />
            <TextInput
              label="Current weight"
              value={weightCurrent}
              onChangeText={setWeightCurrent}
              keyboardType="decimal-pad"
              disabled={isSaving}
            />
            <View style={{ height: 12 }} />
            <TextInput
              label="Goal weight"
              value={weightGoal}
              onChangeText={setWeightGoal}
              keyboardType="decimal-pad"
              disabled={isSaving}
            />
            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}
            {saved ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'green' }}>{saved}</Text>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={save} loading={isSaving} disabled={isSaving}>
              Save
            </Button>
          </Card.Content>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}


