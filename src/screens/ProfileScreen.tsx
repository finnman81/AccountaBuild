import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { updateProfile as updateFirebaseProfile } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';

import { AuthContext } from '../store/AuthContext';
import { subscribeMyProfile, syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';
import { auth } from '../firebase/firebase';
import { formatHeightInches, formatWeightLb } from '../utils/formatters';
import { uploadUserAvatar } from '../services/photos';

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
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const heightPreview = useMemo(() => {
    const n = Number(height);
    return Number.isFinite(n) ? formatHeightInches(n) : '—';
  }, [height]);
  const currentWeightPreview = useMemo(() => {
    const n = Number(weightCurrent);
    return Number.isFinite(n) ? formatWeightLb(n) : '—';
  }, [weightCurrent]);
  const goalWeightPreview = useMemo(() => {
    const n = Number(weightGoal);
    return Number.isFinite(n) ? formatWeightLb(n) : '—';
  }, [weightGoal]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(user.uid, (p) => {
      if (!p) return;
      setDisplayName(p.displayName ?? '');
      setPhotoURL((p as any).photoURL ?? null);
      setHeight(p.height == null ? '' : String(p.height));
      setAge(p.age == null ? '' : String(p.age));
      setWeightCurrent(p.weightCurrent == null ? '' : String(p.weightCurrent));
      setWeightGoal(p.weightGoal == null ? '' : String(p.weightGoal));
    });
  }, [user]);

  const changePhoto = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setIsUploadingPhoto(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access photos was denied.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
        aspect: [1, 1],
      });
      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const url = await uploadUserAvatar({ uid: user.uid, uri });
      setPhotoURL(url);

      // Persist to profile + auth, then sync to group member profiles.
      await updateMyProfile({ uid: user.uid, photoURL: url });
      if (auth.currentUser) {
        await updateFirebaseProfile(auth.currentUser, { photoURL: url });
      }
      await syncMyMemberProfileToAllGroups(user.uid);
      setSaved('Photo updated.');
    } catch (e) {
      setError('Failed to update photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setError(null);
    setSaved(null);
    setIsSaving(true);
    try {
      const next = {
        uid: user.uid,
        displayName: displayName.trim() || null,
        photoURL,
        height: toNumberOrNull(height),
        age: toNumberOrNull(age),
        weightCurrent: toNumberOrNull(weightCurrent),
        weightGoal: toNumberOrNull(weightGoal),
      };
      if (height.trim() && next.height == null) throw new Error('Height must be a number');
      if (age.trim() && next.age == null) throw new Error('Age must be a number');
      if (weightCurrent.trim() && next.weightCurrent == null) throw new Error('Current weight must be a number');
      if (weightGoal.trim() && next.weightGoal == null) throw new Error('Goal weight must be a number');

      // Keep Firebase Auth displayName in sync so UI that reads auth.user.displayName stays correct.
      if (auth.currentUser) {
        await updateFirebaseProfile(auth.currentUser, { displayName: next.displayName ?? '', photoURL: next.photoURL ?? undefined });
      }

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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
          contentContainerStyle={{ flexGrow: 1, padding: 16, justifyContent: 'center' }}
        >
          <Card>
            <Card.Title title="Your profile" subtitle={user.email ?? undefined} />
            <Card.Content>
              <View style={{ alignItems: 'center' }}>
                {photoURL ? (
                  <Image
                    source={{ uri: photoURL }}
                    style={{ width: 96, height: 96, borderRadius: 96, backgroundColor: '#111' }}
                  />
                ) : (
                  <View style={{ width: 96, height: 96, borderRadius: 96, backgroundColor: '#222' }} />
                )}
                <View style={{ height: 12 }} />
                <Button mode="outlined" onPress={changePhoto} disabled={isSaving || isUploadingPhoto} loading={isUploadingPhoto}>
                  Change photo
                </Button>
              </View>
              <View style={{ height: 16 }} />
              <TextInput label="Display name" value={displayName} onChangeText={setDisplayName} disabled={isSaving} />
              <View style={{ height: 12 }} />
              <TextInput
                label="Height (inches)"
                value={height}
                onChangeText={setHeight}
                keyboardType="number-pad"
                disabled={isSaving}
              />
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                Preview: {heightPreview}
              </Text>
              <View style={{ height: 12 }} />
              <TextInput label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" disabled={isSaving} />
              <View style={{ height: 12 }} />
              <TextInput
                label="Current weight (lb)"
                value={weightCurrent}
                onChangeText={setWeightCurrent}
                keyboardType="decimal-pad"
                disabled={isSaving}
              />
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                Preview: {currentWeightPreview}
              </Text>
              <View style={{ height: 12 }} />
              <TextInput
                label="Goal weight (lb)"
                value={weightGoal}
                onChangeText={setWeightGoal}
                keyboardType="decimal-pad"
                disabled={isSaving}
              />
              <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                Preview: {goalWeightPreview}
              </Text>
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
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}


