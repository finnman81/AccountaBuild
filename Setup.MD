# AccountaBuild — Setup Guide

This repo is an Expo (SDK 54) React Native app backed by Firebase (Auth + Firestore + Storage).

## What’s implemented (current state)
- Email/password auth (Firebase Auth)
- Profiles (display name + stats): height, age, current weight, goal weight
- Groups: create + join via 6-char join code (secure join-code lookup)
- Group visibility: members can see each other’s logs, photos, chat
- Daily logs: calories, workouts (duration required), weight
- Goals: weekly goals (workouts/week, calorie log days/week, weight log days/week) + daily calorie goal
- Charts:
  - Group progress toward weekly goals (Sun 00:00 local → now)
- Photos:
  - Upload from camera or library
  - Optional caption
  - Group photo feed
- Group chat (Firestore realtime)
- UI theme: dark charcoal base, electric blue primary, muted red secondary, Inter font

## Requirements

### Common
- **Node.js 18+**
- **npm**
- **Git**

### For iOS Simulator (macOS only)
- **Xcode** + **iOS Simulator**

### For Android Emulator (optional)
- **Android Studio** + Android SDKs

### Accounts
- **Firebase project** (required)
- **Expo account** (recommended for EAS Update / EAS Build)
- **Apple Developer Program** ($99/yr) is required for TestFlight/App Store distribution (optional)

## 1) Clone and install

### macOS
```bash
git clone <YOUR_REPO_URL>
cd AccountaBuild
npm install
```

### Windows (PowerShell)
```powershell
git clone <YOUR_REPO_URL>
cd AccountaBuild
npm install
```

## 2) Firebase setup (required)

### Create Firebase project
1. Go to Firebase Console: `https://console.firebase.google.com/`
2. Create a project
3. Authentication → Sign-in method → enable **Email/Password**
4. Firestore Database → create database
5. Storage → enable

### Add Firestore/Storage Rules
- Firestore rules: copy/paste from `firestore.rules` into Firebase Console → Firestore → Rules → Publish
- Storage rules: copy/paste from `storage.rules` into Firebase Console → Storage → Rules → Publish

### Create `.env` (local only)
Create a file named `.env` at the repo root (it is gitignored) and add:
```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```
Important:
- **No quotes** around values.
- Restart Expo after editing `.env`.

## 3) Run locally (development)

### Start Expo
```bash
npm run start
```

### iOS Simulator (macOS)
- With Expo running, press `i` in the terminal, or run:
```bash
npx expo start --ios
```

### Android (emulator or device)
```bash
npx expo start --android
```

### Real iPhone device troubleshooting (common)
If the QR/link **times out**, it is usually a network restriction.
- Try connecting your Mac and iPhone to the same non-restricted network (or Personal Hotspot) and start with:
```bash
npx expo start --lan
```

## 4) Photo feed Firestore index (required for View Photos)
The photo feed query uses:
- `where type == "photo"`
- `orderBy ts desc`

Firestore may require a composite index; Firebase will show a one-click link when it errors.
Create the index in Firebase Console when prompted.

## 5) EAS Build (installable builds)

### Configure once
```bash
npm i -g eas-cli
eas login
npm run eas:configure
```

### Environment variables for cloud builds
EAS builds do NOT use your local `.env`.
You must create the same variables in the EAS environment you are building with.

Example:
- `eas build --profile production` uses the **production** environment.
- `eas build --profile preview` uses the **preview** environment.

Create variables via:
```bash
eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_FIREBASE_API_KEY
```
Repeat for the other 5 Firebase variables.

### Android build
- Production:
```bash
eas build --platform android --profile production
```
- Preview (internal distribution):
```bash
eas build --platform android --profile preview
```
When prompted: **Generate a new Android Keystore?** → type `Y`.

Note:
- EAS often produces an **.aab** by default (Play Store upload). For direct install, configure APK build type.

### iOS build (TestFlight/App Store)
Requires Apple Developer Program membership.
```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

## 6) Share via Expo Go (no App Store)
With SDK 54, the old `expo publish` is replaced by **EAS Update**:

1. Configure updates (once):
```bash
eas update:configure
```
2. Publish an update to a branch (ex: `preview`):
```bash
eas update --branch preview --message "Beta update"
```

Friends must install **Expo Go**, then open the project link/QR from the EAS dashboard update page.

## Useful links
- EAS project dashboard: `https://expo.dev/accounts/<expo_username>/projects/accountabuild`
- Firebase console: `https://console.firebase.google.com/`


