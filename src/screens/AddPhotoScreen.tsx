import React, { useContext, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { uploadGroupPhoto } from '../services/photos';
import { addPhotoLog } from '../services/logs';
import { isFutureYYYYMMDD, isValidYYYYMMDD, todayYYYYMMDD, yesterdayYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddPhoto'>;

export default function AddPhotoScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [logDate, setLogDate] = useState(todayYYYYMMDD());
  const [uri, setUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosePhoto = async () => {
    setError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Permission to access photos was denied.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (!result.canceled) {
      setUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setError(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Permission to use the camera was denied.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.85,
    });

    if (!result.canceled) {
      setUri(result.assets[0].uri);
    }
  };

  const upload = async () => {
    if (!user || !uri) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const date = logDate.trim();
      if (!isValidYYYYMMDD(date)) {
        setError('Enter a valid log date (YYYY-MM-DD).');
        return;
      }
      if (isFutureYYYYMMDD(date)) {
        setError('Log date cannot be in the future.');
        return;
      }
      const url = await uploadGroupPhoto({ groupId, uid: user.uid, uri });
      await addPhotoLog({ groupId, uid: user.uid, url, caption, date });
      navigation.goBack();
    } catch (e) {
      setError('Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.container}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: spacing.base + insets.bottom }]}
        >
          <Card>
            <AppText variant="rowTitle" color="primary">Upload a photo</AppText>
            <AppText variant="rowSubtitle" color="muted" style={styles.subtitle}>Share with your group</AppText>

            <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Log date</AppText>
            <TextField
              value={logDate}
              onChangeText={setLogDate}
              editable={!isSubmitting}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={todayYYYYMMDD()}
            />
            <View style={styles.dateChips}>
              <TouchableOpacity
                style={styles.dateChip}
                disabled={isSubmitting}
                onPress={() => setLogDate(todayYYYYMMDD())}
                activeOpacity={0.8}
              >
                <AppText variant="rowSubtitle" color="secondary">Today</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateChip}
                disabled={isSubmitting}
                onPress={() => setLogDate(yesterdayYYYYMMDD())}
                activeOpacity={0.8}
              >
                <AppText variant="rowSubtitle" color="secondary">Yesterday</AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.photoActions}>
              <PrimaryButton onPress={takePhoto} disabled={isSubmitting} style={styles.photoBtn}>
                Take photo
              </PrimaryButton>
              <PrimaryButton secondary onPress={choosePhoto} disabled={isSubmitting} style={styles.photoBtn}>
                Choose photo
              </PrimaryButton>
            </View>

            {uri ? (
              <>
                <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
                <AppText variant="eyebrow" color="muted" style={styles.fieldLabel}>Description (optional)</AppText>
                <TextField value={caption} onChangeText={setCaption} editable={!isSubmitting} multiline />
              </>
            ) : null}

            {error ? (
              <AppText variant="rowSubtitle" color="danger" style={styles.error}>{error}</AppText>
            ) : null}

            <PrimaryButton onPress={upload} disabled={!uri || isSubmitting} loading={isSubmitting} style={styles.submit}>
              Upload
            </PrimaryButton>
          </Card>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.base, justifyContent: 'center' },
  subtitle: { marginTop: spacing.xs },
  fieldLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  dateChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dateChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  photoActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.base },
  photoBtn: { flex: 1 },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radius.tile,
    backgroundColor: colors.surface2,
    marginTop: spacing.base,
  },
  error: { marginTop: spacing.md },
  submit: { marginTop: spacing.lg },
});
