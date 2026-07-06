import React, { useContext, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { updateProfile as updateFirebaseProfile } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../store/AuthContext';
import { subscribeMyProfile, syncMyMemberProfileToAllGroups, updateMyProfile } from '../services/profile';
import { auth } from '../firebase/firebase';
import { uploadUserAvatar } from '../services/photos';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import EditRow from '../components/ui/EditRow';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

function numOrNull(text: string) {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function EditProfileScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);

  const [displayName, setDisplayName] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeMyProfile(user.uid, (p) => {
      if (!p) return;
      setDisplayName(p.displayName ?? '');
      setPhotoURL((p as any).photoURL ?? null);
      setHeight(p.height == null ? '' : String(p.height));
      setAge(p.age == null ? '' : String(p.age));
    });
  }, [user]);

  const changePhoto = async () => {
    if (!user) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access photos was denied.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsEditing: true,
        quality: 0.9,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const url = await uploadUserAvatar({ uid: user.uid, uri: result.assets[0].uri });
      setPhotoURL(url);
      await updateMyProfile({ uid: user.uid, photoURL: url });
      if (auth.currentUser) await updateFirebaseProfile(auth.currentUser, { photoURL: url });
      await syncMyMemberProfileToAllGroups(user.uid);
      Alert.alert('Photo updated', 'Your new photo is saved.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[EditProfile] photo upload failed:', e);
      setError('Failed to update photo.');
      Alert.alert('Photo upload failed', msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      const patch: Parameters<typeof updateMyProfile>[0] = { uid: user.uid };
      const dn = displayName.trim();
      if (dn) patch.displayName = dn;
      if (photoURL) patch.photoURL = photoURL;

      for (const [text, key] of [
        [height, 'height'],
        [age, 'age'],
      ] as const) {
        if (text.trim()) {
          const n = numOrNull(text);
          if (n == null) throw new Error(`${key} must be a number`);
          (patch as any)[key] = n;
        }
      }

      if (auth.currentUser && patch.displayName !== undefined) {
        await updateFirebaseProfile(auth.currentUser, { displayName: patch.displayName ?? '' });
      }

      await updateMyProfile(patch);
      await syncMyMemberProfileToAllGroups(user.uid);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else (navigation as any).navigate('MainTabs');
          }}
          style={styles.back}
          hitSlop={16}
        >
          <Icon source="chevron-left" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="rowTitle" color="primary" style={styles.headerTitle}>Edit profile</AppText>
        <TouchableOpacity onPress={save} disabled={isSaving} hitSlop={8}>
          <AppText variant="rowTitle" color={isSaving ? 'muted' : 'accent'}>Save</AppText>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.avatarWrap}>
            <View>
              {photoURL ? <Image source={{ uri: photoURL }} style={styles.avatar} /> : <Avatar photoURL={null} name={displayName || 'U'} size={84} />}
              <TouchableOpacity onPress={changePhoto} disabled={isUploadingPhoto} style={styles.cameraBadge}>
                <Icon source="camera" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={changePhoto} disabled={isUploadingPhoto}>
              <AppText variant="rowSubtitle" color="accent" style={{ marginTop: spacing.sm }}>Change photo</AppText>
            </TouchableOpacity>
          </View>

          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Identity</AppText>
          <View style={styles.group}>
            <EditRow label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
            <EditRow label="Height" value={height} onChangeText={setHeight} placeholder="70" suffix="in" keyboardType="number-pad" />
            <EditRow label="Age" value={age} onChangeText={setAge} placeholder="—" keyboardType="number-pad" showDivider={false} />
          </View>

          <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Goals</AppText>
          <View style={styles.group}>
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => (navigation as any).navigate('MMRGoals')}
              activeOpacity={0.7}
            >
              <View style={styles.navRowLeft}>
                <AppText variant="rowTitle" color="primary">Goals</AppText>
                <AppText variant="rowSubtitle" color="muted">Weekly targets, calories, and weight goal</AppText>
              </View>
              <Icon source="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {error ? <AppText variant="rowSubtitle" color="danger" style={styles.footnote}>{error}</AppText> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, marginLeft: spacing.xs },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  avatarWrap: { alignItems: 'center', marginVertical: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 999, backgroundColor: colors.surface2 },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 999,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background,
  },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.listGroup, borderWidth: 1, borderColor: colors.borderCard, paddingHorizontal: spacing.base },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  navRowLeft: { flex: 1, gap: 2 },
  footnote: { marginTop: spacing.base, textAlign: 'center', paddingHorizontal: spacing.base, lineHeight: 18 },
});
