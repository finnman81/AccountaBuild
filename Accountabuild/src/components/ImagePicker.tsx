import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {launchCamera, launchImageLibrary, MediaType, PhotoQuality} from 'react-native-image-picker';
import {requestCameraPermission, requestPhotoLibraryPermission} from '../utils/permissions';

interface ImagePickerProps {
  onImageSelected: (imageUri: string) => void;
  onUploadStart?: () => void;
  onUploadComplete?: () => void;
  onUploadError?: (error: string) => void;
}

const ImagePicker: React.FC<ImagePickerProps> = ({
  onImageSelected,
  onUploadStart,
  onUploadComplete,
  onUploadError,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const showImagePicker = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: () => openCamera(),
        },
        {
          text: 'Photo Library',
          onPress: () => openImageLibrary(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  const openCamera = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8 as PhotoQuality,
    };

    launchCamera(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled camera');
      } else if (response.errorCode) {
        console.log('Camera Error:', response.errorMessage);
        onUploadError?.(response.errorMessage || 'Camera error');
      } else if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;
        if (imageUri) {
          setSelectedImage(imageUri);
          onImageSelected(imageUri);
        }
      }
    });
  };

  const openImageLibrary = async () => {
    const hasPermission = await requestPhotoLibraryPermission();
    if (!hasPermission) {
      return;
    }

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8 as PhotoQuality,
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.errorCode) {
        console.log('ImagePicker Error:', response.errorMessage);
        onUploadError?.(response.errorMessage || 'Image picker error');
      } else if (response.assets && response.assets[0]) {
        const imageUri = response.assets[0].uri;
        if (imageUri) {
          setSelectedImage(imageUri);
          onImageSelected(imageUri);
        }
      }
    });
  };

  const clearImage = () => {
    setSelectedImage(null);
  };

  return (
    <View style={styles.container}>
      {selectedImage ? (
        <View style={styles.imageContainer}>
          <Image source={{uri: selectedImage}} style={styles.image} />
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.uploadButton]}
              onPress={() => {
                setIsUploading(true);
                onUploadStart?.();
                // The actual upload will be handled by the parent component
              }}
              disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Upload</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={clearImage}>
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.pickerButton} onPress={showImagePicker}>
          <Text style={styles.pickerButtonText}>Select Image</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  pickerButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    alignItems: 'center',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#34C759',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ImagePicker; 