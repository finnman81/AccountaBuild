import React, { useContext, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../navigation/types';
import { AuthContext } from '../store/AuthContext';
import { uploadGroupPhoto } from '../services/photos';
import { addPhotoLog } from '../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'AddPhoto'>;

export default function AddPhotoScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

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
      const url = await uploadGroupPhoto({ groupId, uid: user.uid, uri });
      await addPhotoLog({ groupId, uid: user.uid, url, caption });
      navigation.goBack();
    } catch (e) {
      setError('Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 16 + insets.bottom,
          justifyContent: 'center',
        }}
      >
        <Card>
          <Card.Title title="Upload a photo" subtitle="Share with your group" />
          <Card.Content>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button mode="contained" onPress={takePhoto} disabled={isSubmitting} style={{ flex: 1 }}>
                Take photo
              </Button>
              <Button mode="outlined" onPress={choosePhoto} disabled={isSubmitting} style={{ flex: 1 }}>
                Choose photo
              </Button>
            </View>

            {uri ? (
              <>
                <View style={{ height: 12 }} />
                <Image
                  source={{ uri }}
                  style={{ width: '100%', height: 240, borderRadius: 12, backgroundColor: '#eee' }}
                  resizeMode="cover"
                />
                <View style={{ height: 12 }} />
                <TextInput
                  label="Description (optional)"
                  value={caption}
                  onChangeText={setCaption}
                  disabled={isSubmitting}
                  multiline
                />
              </>
            ) : null}

            {error ? (
              <>
                <View style={{ height: 12 }} />
                <Text style={{ color: 'crimson' }}>{error}</Text>
              </>
            ) : null}

            <View style={{ height: 16 }} />
            <Button mode="contained" onPress={upload} disabled={!uri || isSubmitting} loading={isSubmitting}>
              Upload
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


