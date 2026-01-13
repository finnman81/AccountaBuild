# Deploy iOS Beta (TestFlight) — AccountaBuild

This doc covers the **simplest way to ship a beta build of AccountaBuild to a small group (< 10 users)** using:

- **Expo + EAS Build** to create a signed `.ipa`
- **TestFlight** (via App Store Connect) to distribute the beta

---

## IMPORTANT: run commands from the app folder

This repo is a wrapper. Run all Expo/EAS commands from:

- `AccountaBuild/`

---

## What “iOS beta” means

On iOS, the store-native beta system is **TestFlight**.

For a small group (<10), you will usually use:

- **TestFlight External Testing** (invite by email)

> TestFlight “Internal Testing” is only for people who are members of your App Store Connect team (often not what you want for friends/users).

---

## Requirements (high level)

### Accounts (required)
- **Apple Developer Program** membership: **paid yearly** (Apple charges annually).
- **App Store Connect** access under that developer team.
- An Apple ID with:
  - **Two‑factor authentication enabled**

If enrolling as an Organization, Apple may require:
- a D‑U‑N‑S number and verification of legal entity details.

### App config (already set in this repo)
- **Bundle identifier**: `com.accountabuild.app` (from `AccountaBuild/app.json`)
- **Expo app version**: `1.0.0` (from `AccountaBuild/app.json`)
- **EAS projectId**: `2eb5bba7-f824-45c6-8d64-28aa2ab30d60`

### Tooling (required)
- Node.js + npm
- Expo CLI + EAS CLI (`eas`)
- No Mac required if you use EAS Build + EAS Submit (cloud)

---

## One-time setup: Apple accounts + app record

1) Enroll in Apple Developer Program
- Create/choose an Apple ID
- Enable 2FA
- Enroll (Individual or Organization)

2) Create the app in App Store Connect
- App Store Connect → **My Apps** → **New App**
- Choose:
  - Name
  - Bundle ID (`com.accountabuild.app`)
  - SKU (any unique string)

3) Complete the minimum “can’t upload without it” items
You may be prompted for:
- Export compliance (encryption questions)
- App privacy questions (data collection/usage)
- App review contact info / “App Access” notes (especially if login is required)

---

## Build the beta `.ipa` with EAS (preview profile)

From `AccountaBuild/`:

- `npm run build:ios:preview`

This creates a downloadable `.ipa` in the EAS build results.

### Build number note (common beta blocker)
App Store Connect requires `ios.buildNumber` to increase on every upload.

In this repo:
- `AccountaBuild/eas.json` uses `"appVersionSource": "remote"`
- `production` profile has `"autoIncrement": true`
- `preview` does **not** auto-increment today

If App Store Connect rejects an upload with “bundle version already used”, the simplest fix is to add `"autoIncrement": true` to the `preview` profile and rebuild.

---

## Upload to TestFlight and invite your beta users

### Upload the build
Recommended (cloud upload):

- `eas submit -p ios --profile preview --latest`

### Invite <10 testers
In App Store Connect → your app → **TestFlight**:

1) Wait for the build to finish processing
2) Add testers (email addresses)
3) Testers install **TestFlight** from the App Store, accept the invite, and install your beta

> External TestFlight testing may require a quick Apple review of the beta build before invitations can go out (this is normal).

---

## If you want the absolute simplest “beta” without TestFlight (optional)

You can distribute an internal build directly (outside the App Store) using EAS internal distribution, but it’s a different install experience and not “store beta”. This doc focuses on the TestFlight path.
