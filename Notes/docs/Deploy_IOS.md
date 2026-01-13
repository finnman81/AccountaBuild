# Deploy iOS (App Store) — AccountaBuild

This doc covers **how to ship AccountaBuild to iOS via the Apple App Store**, using **Expo + EAS Build** (recommended for this project).

---

## What “deploy to iOS” means (high level)

To ship on iOS you typically:

- Build a **signed iOS app binary** (`.ipa`) with the correct identifiers, entitlements, and credentials.
- Upload it to **App Store Connect**.
- Create the **store listing** + compliance answers.
- Pass **App Review** and release to production.

For Expo apps, the most practical path is:

- **EAS Build** to produce the `.ipa`
- **EAS Submit** (or Transporter) to upload to App Store Connect
- TestFlight → App Store release

---

## Requirements & prerequisites

### Current AccountaBuild identifiers (as configured)
- **Bundle identifier**: `com.accountabuild.app` (from `AccountaBuild/app.json`)
- **App version**: `1.0.0` (from `AccountaBuild/app.json`)
- **EAS projectId**: `2eb5bba7-f824-45c6-8d64-28aa2ab30d60`
- **OTA updates**:
  - `runtimeVersion`: `{"policy":"sdkVersion"}`
  - `updates.url`: `https://u.expo.dev/2eb5bba7-f824-45c6-8d64-28aa2ab30d60`
  - Channels configured in `AccountaBuild/eas.json`: `development`, `preview`, `production`

### Accounts
- **Apple Developer Program** membership (paid, required for App Store/TestFlight distribution).
- **App Store Connect** access for the same Apple developer team.

### Tooling
- **Node.js + npm** (already used by the project).
- **Expo CLI** (used for local dev) and **EAS CLI** (`eas`).
- You do **not** need a Mac if you use **EAS Build** (cloud builds). A Mac is only required for certain local workflows.

### App identifiers / configuration
- A unique **iOS bundle identifier**, e.g. `com.yourcompany.accountabuild`.
- `app.json` (or `app.config.*`) must have correct:
  - `expo.name`, `expo.slug`
  - `expo.ios.bundleIdentifier`
  - icons/splash
  - permissions usage descriptions (if you use photos/camera/etc)

### Firebase (common “store blockers”)
- Ensure any Firebase keys/config are handled correctly. (Firebase config is not a “secret” by itself, but avoid committing private service credentials.)
- Confirm Firestore/Storage rules are correct and deployed.
- If you use Apple Sign-In later, you must also configure Apple capabilities.

---

## Recommended approach for AccountaBuild: EAS Build + TestFlight + App Store

### 1) Choose distribution model
- **Internal testing**: quick testing for your team (TestFlight Internal).
- **External testing**: invite more testers (TestFlight External → Apple review for TestFlight builds).
- **Production**: App Store release.

For a fitness app with iterative UI changes, best practice is:

- Use **TestFlight** for staged rollout and quick feedback.
- Use **EAS Update** for OTA JS updates **only when safe** (see “Things to keep in mind”).

### 2) Create/verify EAS project linkage
You should be able to run:
- `eas init`

This links the local Expo project to an Expo account/project used by EAS.

### 3) Configure `eas.json` build profiles
Typical profiles:

- **development**: for simulator/dev client (optional if you rely on Expo Go).
- **preview**: for TestFlight-like builds (ad-hoc/internal distribution).
- **production**: for App Store submission.

Key best-practice settings:

- Use a **fixed runtimeVersion strategy** (Expo runtime versioning) for stable OTA updates.
- Enable **auto-increment** build numbers to avoid App Store upload failures.

**Current AccountaBuild state**:
- `production` has `"autoIncrement": true` ✅
- `preview` does **not** currently set auto-increment ⚠️ (recommended to add so repeated TestFlight uploads don’t fail due to build number collisions)

### 4) Credentials & signing
For iOS, you need:

- Distribution certificate
- Provisioning profile
- App ID (bundle ID)

Best practice with EAS:

- Let EAS manage credentials initially (fastest path).
- Later, consider moving to a controlled credentials flow if you have compliance needs.

### 5) Build the `.ipa` in the cloud
Run an iOS production build (cloud):

- `eas build -p ios --profile production`

This produces a signed `.ipa`.

### 6) Upload to App Store Connect
Recommended:

- `eas submit -p ios --profile production`

Alternative:

- Download `.ipa` and upload via Apple Transporter (Mac) or App Store Connect tooling.

### 7) App Store Connect setup
In App Store Connect:

- Create the app record (name, bundle ID, SKU).
- Fill metadata:
  - Description, keywords, support URL, privacy policy URL
  - Screenshots for required device sizes
- Set pricing/availability.

### 8) Compliance & privacy (must-do)
You will need to answer:

- **App Privacy** (“nutrition/fitness data”, identifiers, diagnostics, etc.)
- **Export compliance** (encryption) — usually “yes” because HTTPS/TLS is used; follow Apple’s questions carefully.
- If you integrate HealthKit later, you must provide additional disclosures.

### 9) TestFlight validation
Before App Review:

- Verify login flows, permissions prompts, and core logging features.
- Ensure crashes are resolved and navigation is stable.

### 10) Submit for App Review and release
After approval:

- Release manually or schedule.
- Consider phased release for safety.

---

## Things to keep in mind (iOS best practices & pitfalls)

### OTA updates (EAS Update) vs binary updates
- **OTA updates** can change JS/TS and assets, but **cannot** add new native dependencies/capabilities without a new build.
- Any change that touches native code (new Expo modules, new permissions, new config plugin) requires a **new EAS Build**.

### Bundle ID and build numbers are strict
- Changing `bundleIdentifier` after shipping is painful. Decide early.
- Each upload must increment:
  - `ios.buildNumber`
  - and usually `version` changes for releases

### Permissions strings
iOS requires human-readable usage descriptions for permissions (camera/photos). Missing or vague strings can block review.

### Apple review expectations for auth/paywalls
- If you have login-only experiences, Apple usually allows it, but you must provide a working account for review if needed.
- If you add subscriptions later, follow Apple IAP rules.

### Crash-free + performance
Apple review is sensitive to:
- crashes on launch
- broken authentication
- obvious UI layout bugs

### Firebase rules & abuse prevention
Make sure production rules and indexes are correct and deployed.

---

## AccountaBuild-specific implementation plan (from where we are today)

This plan assumes the current repo structure:
- App lives in `AccountaBuild/`
- Uses Expo + React Native + Firebase
- Has `eas.json`, `app.json`, and Expo dark theme already

### Step 0 — Confirm identifiers (one-time)
- Confirm **bundle identifier** is final: `com.accountabuild.app`.
- Confirm naming/version in `AccountaBuild/app.json`:
  - `expo.name`: `AccountaBuild`
  - `expo.slug`: `accountabuild`
  - `expo.version`: `1.0.0`

### Step 1 — Confirm icons/splash and required metadata
- Verify `assets/` icons are final enough.
- Add/verify iOS permission strings if using:
  - Camera (progress photos)
  - Photo library access

### Step 2 — Confirm EAS profiles
- Review `AccountaBuild/eas.json` and ensure profiles exist:
  - `preview` (TestFlight testing)
  - `production` (App Store)
- Ensure build numbers auto-increment (or manual but consistent).

**Recommended tweak (best practice)**:
- Add `"autoIncrement": true` to the `preview` profile too, so you can upload multiple TestFlight builds without managing build numbers manually.

### Step 3 — Prepare Firebase for production
- Confirm Firestore + Storage rules are deployed and tested.
- Ensure any dev/test Firebase projects are not accidentally used in production builds.

### Step 4 — Create Apple Developer + App Store Connect app record
- Create the app in App Store Connect with the chosen bundle ID.
- Prepare a **privacy policy** page (required).

### Step 5 — Produce the first TestFlight build (preview)
- Run: `eas build -p ios --profile preview`
  - Shortcut script (already in `AccountaBuild/package.json`): `npm run build:ios:preview`
- Upload: `eas submit -p ios --profile preview`
- Add internal testers; validate end-to-end flows.

### Step 6 — Fix any App Review blockers
Common blockers to check:
- permission prompts
- photo upload flows
- auth persistence
- deleted group edge cases

### Step 7 — Production build & submission
- Run: `eas build -p ios --profile production`
- Upload: `eas submit -p ios --profile production`
- Complete App Store listing metadata + screenshots.
- Submit for review; release with phased rollout if desired.

