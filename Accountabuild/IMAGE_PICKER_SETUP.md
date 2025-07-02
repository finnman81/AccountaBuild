# Image Picker and Upload Setup

This document outlines the implementation of image picker and upload functionality for the Accountabuild app.

## Features Implemented

### 1. Image Picker Component (`src/components/ImagePicker.tsx`)
- Camera and photo library access
- Image preview
- Upload and clear functionality
- Permission handling

### 2. Upload API Service (`src/api/upload.ts`)
- Signed URL generation for S3 uploads
- Direct S3 upload functionality
- Error handling and response management

### 3. Photo Upload Screen (`src/screens/PhotoUploadScreen.tsx`)
- Complete upload flow integration
- Status feedback and error handling
- User-friendly interface

### 4. Permissions Utility (`src/utils/permissions.ts`)
- Camera and photo library permission requests
- Platform-specific permission handling
- User guidance for blocked permissions

### 5. Navigation Integration
- AppNavigator with PhotoUploadScreen
- Updated main App.tsx

## Dependencies Installed

```bash
npm install react-native-image-picker
npm install @react-navigation/native @react-navigation/stack react-native-screens react-native-safe-area-context
npm install react-native-permissions
```

## iOS Setup Required

Since you don't have Xcode installed yet, you'll need to:

1. **Install Xcode** from the Mac App Store
2. **Run pod install** in the ios directory:
   ```bash
   cd ios && pod install && cd ..
   ```

## Android Setup (Future)

When you're ready to support Android:

1. Add camera and storage permissions to `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
   <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
   ```

2. Run the Android build:
   ```bash
   npx react-native run-android
   ```

## Usage

The image picker and upload flow works as follows:

1. User opens the Photo Upload screen
2. User taps "Select Image" button
3. User chooses between Camera or Photo Library
4. App requests necessary permissions
5. User selects or takes a photo
6. Image preview is shown with Upload and Clear buttons
7. User taps Upload to send image to backend
8. Backend generates signed URL and uploads to S3
9. Success/error feedback is shown to user

## Backend Integration

The upload API expects your backend to have:
- `/api/upload/signed-url` endpoint for generating S3 signed URLs
- AWS S3 bucket configured for image storage
- Proper authentication middleware

## Testing

To test the implementation:

1. Install Xcode and run `pod install`
2. Start the Metro bundler: `npx react-native start`
3. Run on iOS simulator: `npx react-native run-ios`
4. Test camera and photo library access
5. Test upload functionality (requires backend to be running)

## Next Steps

1. Install Xcode and complete iOS setup
2. Test the image picker functionality
3. Integrate with your backend upload endpoint
4. Add image picker to other screens (profile, group posts, etc.)
5. Implement image compression and optimization
6. Add support for multiple image uploads 