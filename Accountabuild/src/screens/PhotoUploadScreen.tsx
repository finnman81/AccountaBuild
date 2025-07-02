import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import ImagePicker from '../components/ImagePicker';
import {uploadAPI, UploadResponse} from '../api/upload';

const PhotoUploadScreen: React.FC = () => {
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const handleImageSelected = (imageUri: string) => {
    console.log('Image selected:', imageUri);
    setSelectedImageUri(imageUri);
    setUploadStatus('Image selected. Ready to upload.');
  };

  const handleUploadStart = async () => {
    if (!selectedImageUri) {
      Alert.alert('Error', 'No image selected');
      return;
    }

    try {
      setUploadStatus('Uploading...');
      
      const result: UploadResponse = await uploadAPI.uploadImage(selectedImageUri);
      
      if (result.success && result.imageUrl) {
        setUploadStatus('Upload completed successfully!');
        Alert.alert('Success', 'Image uploaded successfully!');
        console.log('Uploaded image URL:', result.imageUrl);
        setSelectedImageUri(null);
      } else {
        const errorMessage = result.error || 'Upload failed';
        setUploadStatus(`Upload failed: ${errorMessage}`);
        Alert.alert('Upload Error', errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadStatus(`Upload failed: ${errorMessage}`);
      Alert.alert('Upload Error', errorMessage);
    }
  };

  const handleUploadComplete = () => {
    setUploadStatus('Upload completed successfully!');
    Alert.alert('Success', 'Image uploaded successfully!');
  };

  const handleUploadError = (error: string) => {
    setUploadStatus(`Upload failed: ${error}`);
    Alert.alert('Upload Error', error);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Photo Upload</Text>
          <Text style={styles.subtitle}>
            Share your progress with your accountability group
          </Text>
        </View>

        <View style={styles.content}>
          <ImagePicker
            onImageSelected={handleImageSelected}
            onUploadStart={handleUploadStart}
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
          />

          {uploadStatus ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>{uploadStatus}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
});

export default PhotoUploadScreen; 