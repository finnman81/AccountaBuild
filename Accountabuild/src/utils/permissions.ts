import {Alert, Linking, Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

export const requestCameraPermission = async (): Promise<boolean> => {
  try {
    const permission = Platform.select({
      ios: PERMISSIONS.IOS.CAMERA,
      android: PERMISSIONS.ANDROID.CAMERA,
    });

    if (!permission) {
      console.error('Camera permission not available for this platform');
      return false;
    }

    const result = await request(permission);

    switch (result) {
      case RESULTS.UNAVAILABLE:
        Alert.alert(
          'Camera Unavailable',
          'Camera is not available on this device.',
        );
        return false;
      case RESULTS.DENIED:
        Alert.alert(
          'Camera Permission Denied',
          'Camera permission is required to take photos.',
        );
        return false;
      case RESULTS.LIMITED:
        console.log('Camera permission limited');
        return true;
      case RESULTS.GRANTED:
        console.log('Camera permission granted');
        return true;
      case RESULTS.BLOCKED:
        Alert.alert(
          'Camera Permission Blocked',
          'Camera permission is blocked. Please enable it in Settings.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
          ],
        );
        return false;
      default:
        return false;
    }
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
};

export const requestPhotoLibraryPermission = async (): Promise<boolean> => {
  try {
    const permission = Platform.select({
      ios: PERMISSIONS.IOS.PHOTO_LIBRARY,
      android: PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
    });

    if (!permission) {
      console.error('Photo library permission not available for this platform');
      return false;
    }

    const result = await request(permission);

    switch (result) {
      case RESULTS.UNAVAILABLE:
        Alert.alert(
          'Photo Library Unavailable',
          'Photo library is not available on this device.',
        );
        return false;
      case RESULTS.DENIED:
        Alert.alert(
          'Photo Library Permission Denied',
          'Photo library permission is required to select photos.',
        );
        return false;
      case RESULTS.LIMITED:
        console.log('Photo library permission limited');
        return true;
      case RESULTS.GRANTED:
        console.log('Photo library permission granted');
        return true;
      case RESULTS.BLOCKED:
        Alert.alert(
          'Photo Library Permission Blocked',
          'Photo library permission is blocked. Please enable it in Settings.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
          ],
        );
        return false;
      default:
        return false;
    }
  } catch (error) {
    console.error('Error requesting photo library permission:', error);
    return false;
  }
};

export const checkPermissions = async (): Promise<{
  camera: boolean;
  photoLibrary: boolean;
}> => {
  const cameraPermission = await requestCameraPermission();
  const photoLibraryPermission = await requestPhotoLibraryPermission();

  return {
    camera: cameraPermission,
    photoLibrary: photoLibraryPermission,
  };
}; 