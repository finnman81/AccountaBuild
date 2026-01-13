# Firebase setup (AccountaBuild Expo MVP)

This app uses **Firebase Auth (email/password)** + **Firestore** + **Firebase Storage**.

## 1) Create Firebase project
- Create a Firebase project.
- Enable **Authentication → Sign-in method → Email/Password**.
- Create a **Web app** in Firebase (we use the web config values in Expo).

## 2) Local environment variables
Create a local `.env` file at the repo root with:

```
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

Notes:
- These are intentionally `EXPO_PUBLIC_...` so the app can access them at runtime in Expo.
- Do **not** commit `.env` (it is gitignored).

## 3) Run the app
```
npm run start
```

## 4) EAS builds (later)
When we get to EAS, we’ll set these same keys as **EAS environment variables/secrets** for production builds.

## EAS (iOS + Android builds)
This repo includes `eas.json`. Typical flow:
- Install EAS CLI: `npm i -g eas-cli`
- Login: `eas login`
- Configure: `npm run eas:configure`
- Build Android (internal): `npm run build:android:preview`
- Build iOS (internal/TestFlight setup): `npm run build:ios:preview`

## Note on auth persistence (native)
For MVP speed we’re using **in-memory** auth persistence on iOS/Android to stay 100% Expo-managed and avoid native-only modules.
If you want “stay logged in” across app restarts, we can switch to AsyncStorage-backed persistence next.

## Firebase security rules
This repo includes baseline rules you can paste into Firebase:
- Firestore: `firestore.rules`
- Storage: `storage.rules`


