# Deploy Android (Google Play) — AccountaBuild

This doc covers **how to ship AccountaBuild to Android via Google Play**, using **Expo + EAS Build** (recommended for this project).

---

## What “deploy to Android” means (high level)

To ship on Android you typically:

- Build a **signed Android release** (`.aab` is preferred for Play Store).
- Upload it to **Google Play Console**.
- Create the **store listing** + compliance answers.
- Roll out to production (optionally staged).

For Expo apps, the most practical path is:

- **EAS Build** to produce the `.aab`
- **EAS Submit** (or Play Console upload) to publish

---

## Requirements & prerequisites

### Current AccountaBuild identifiers (as configured)
- **Android package (applicationId)**: `com.accountabuild.app` (from `AccountaBuild/app.json`)
- **App version**: `1.0.0` (from `AccountaBuild/app.json`)
- **EAS projectId**: `2eb5bba7-f824-45c6-8d64-28aa2ab30d60`
- **OTA updates**:
  - `runtimeVersion`: `{"policy":"sdkVersion"}`
  - `updates.url`: `https://u.expo.dev/2eb5bba7-f824-45c6-8d64-28aa2ab30d60`
  - Channels configured in `AccountaBuild/eas.json`: `development`, `preview`, `production`

### Accounts
- **Google Play Developer** account (paid, required to publish).

### Tooling
- Node.js + npm
- Expo + EAS CLI
- You do **not** need Android Studio to build if you use **EAS Build**, but it’s helpful for debugging and Play Console tasks.

### App identifiers / configuration
- A unique **Android applicationId**, e.g. `com.yourcompany.accountabuild`.
- `app.json` (or `app.config.*`) must have correct:
  - `expo.android.package`
  - icons/splash
  - permissions (camera/photos) as needed

### Signing keys (Android Keystore)
Android requires signing. Best practices:
- Use **Play App Signing** (recommended) and keep your upload key safe.
- Let EAS manage the keystore at first if you want speed; export/backup credentials if needed.

---

## Recommended approach for AccountaBuild: EAS Build + Play Internal testing + Production

### 1) Decide distribution tracks
Google Play offers tracks:

- **Internal testing** (fastest, ideal for your team)
- **Closed testing** (small external group)
- **Open testing** (larger audience)
- **Production**

Best practice:
- Start with **Internal** → then **Closed** for your broader testers → then **Production**.

### 2) Ensure `eas.json` build profiles exist
Typical profiles:
- `preview` (internal/closed testing)
- `production` (Play Store)

**Current AccountaBuild state**:
- `production` has `"autoIncrement": true` ✅
- `preview` does **not** currently set auto-increment ⚠️ (recommended so Play uploads don’t fail due to versionCode collisions)

### 3) Build an Android App Bundle (`.aab`)
Recommended:
- `eas build -p android --profile production`

You can also build a `preview` artifact for testing.

### 4) Upload to Google Play Console
Options:
- `eas submit -p android --profile production`
- Or manually upload `.aab` in Play Console.

### 5) Store listing and compliance
You’ll need:
- App name, short description, full description
- Screenshots (phone, and optionally tablet)
- High-res icon, feature graphic
- Privacy policy URL
- Data safety section (what data you collect/share)

### 6) Release and staged rollout
Best practice:
- Use staged rollout (e.g., 10% → 25% → 50% → 100%) to reduce risk.

---

## Things to keep in mind (Android best practices & pitfalls)

### App signing is permanent
Once published, changing signing keys is difficult. Enable:
- **Play App Signing**

### Versioning is strict
Every upload must increment:
- `android.versionCode`

### OTA updates (EAS Update) vs binary updates
- OTA updates can change JS/TS and assets
- New native dependencies/permissions require a new build

### Permissions & media access
Android permission behavior can vary by OS version. Verify:
- photo upload + camera flows
- background behavior (if you add it later)

### Firebase rules & abuse prevention
Ensure production rules are deployed and tested, especially for group visibility and public profile access.

---

## AccountaBuild-specific implementation plan (from where we are today)

This plan assumes the current repo structure:
- App lives in `AccountaBuild/`
- Uses Expo + React Native + Firebase
- Has `eas.json`, `app.json`

### Step 0 — Confirm Android package name (one-time)
- Confirm `expo.android.package` is final: `com.accountabuild.app`.
- Confirm `expo.version` in `AccountaBuild/app.json`: `1.0.0`.
- Confirm Android **versionCode** strategy:
  - Best practice: auto-increment for both preview and production builds.

### Step 1 — Verify icons/splash and required permissions
- Confirm app icon + splash in `assets/` are acceptable.
- Ensure permissions/usage match features (photos/camera).

### Step 2 — Confirm EAS profiles
- Review `AccountaBuild/eas.json`:
  - `preview` for internal/closed testing
  - `production` for Play Store
- Ensure versionCode increments (auto or manual).

**Recommended tweak (best practice)**:
- Add `"autoIncrement": true` to the `preview` profile too, so repeated Play uploads don’t require manual `versionCode` bumps.

### Step 3 — Prepare Firebase for production
- Confirm Firestore + Storage rules are deployed.
- Confirm production Firebase project configuration is used for release builds.

### Step 4 — Create Play Console app + enable Play App Signing
- Create the app record in Play Console.
- Enable **Play App Signing** early.
- Set up internal testing track.

### Step 5 — Produce the first internal testing build
- Run: `eas build -p android --profile preview`
  - Shortcut script (already in `AccountaBuild/package.json`): `npm run build:android:preview`
- Upload: `eas submit -p android --profile preview`
- Install via internal testing link; validate core flows.

### Step 6 — Move to closed testing for your broader testers
- Promote build to **Closed testing**.
- Gather crash reports and address UI/device-specific issues.

### Step 7 — Production rollout
- Run: `eas build -p android --profile production`
- Upload: `eas submit -p android --profile production`
- Complete store listing, Data Safety, and policy items.
- Roll out staged to production.

