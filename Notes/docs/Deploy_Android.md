# Deploy Android Beta (Google Play Internal Testing) — AccountaBuild

This doc covers the **simplest way to ship a beta build of AccountaBuild to a small group (< 10 users)** using:

- **Expo + EAS Build** to create an Android App Bundle (`.aab`)
- **Google Play Console → Internal testing track** to distribute via the Play Store

---

## IMPORTANT: run commands from the app folder

This repo is a wrapper. Run all Expo/EAS commands from:

- `AccountaBuild/`

---

## What “Android beta” means

Google Play’s equivalent of “TestFlight” is **testing tracks**. For a tiny beta group, use:

- **Internal testing** (recommended): fastest approval flow; easy install via Play Store link

Your users will install the app through the Play Store as a tester, but the app is not public.

---

## Requirements (high level)

### Accounts (required)
- **Google Play Developer account**: **$25 USD one-time** registration fee.
- A Google account with:
  - **2‑Step Verification enabled** (recommended/commonly required)
  - Completed **Play Console account verification** steps when prompted (Google periodically requires developer identity verification)

### App config (already set in this repo)
- **Android package (applicationId)**: `com.accountabuild.app` (from `AccountaBuild/app.json`)
- **Expo app version**: `1.0.0` (from `AccountaBuild/app.json`)
- **EAS projectId**: `2eb5bba7-f824-45c6-8d64-28aa2ab30d60`

### Tooling (required)
- Node.js + npm
- Expo CLI + EAS CLI

---

## One-time setup: create your Play Console app

1) Create the Play Console account
- Go to Play Console and register your developer account (pay the $25 fee)

2) Create the app listing (beta apps still need an “app record”)
- Play Console → **Create app**
- Pick the default language, app name, app type, etc.

3) Enable Play App Signing (recommended)
- Do this early when prompted in Play Console

> Even for internal testing, Play may require some policy fields before it will “publish” a tester build (varies over time). If prompted, complete:
> - Privacy policy URL
> - Data safety
> - Content rating
> - App access instructions (login/test account info)

---

## Build a beta `.aab` with EAS (preview profile)

From `AccountaBuild/`:

- `npm run build:android:preview`

This creates a downloadable `.aab` in the EAS build results.

### Versioning note (common beta blocker)
Google Play requires the Android **versionCode** to increase on every upload.

In this repo:
- `AccountaBuild/eas.json` uses `"appVersionSource": "remote"`
- `production` profile has `"autoIncrement": true`
- `preview` does **not** auto-increment today

If Play rejects an upload with “versionCode already used”, the simplest fix is to add `"autoIncrement": true` to the `preview` profile and rebuild.

---

## Upload to Internal testing (small beta group)

Optional (if you want EAS to submit for you):

- `eas submit -p android --profile preview --latest`

Then continue in Play Console to assign/release to the Internal testing track as needed.

1) Play Console → **Testing** → **Internal testing**
2) Create a tester list (email addresses for your <10 users)
3) Create a new release and **upload the `.aab`**
4) **Review & roll out** to internal testing
5) Copy the **opt-in link** and send it to testers

Your testers will:
- open the opt-in link
- accept tester access
- install/update via the Play Store

---

## If you want the absolute simplest “beta” without Google Play (optional)

You can distribute an internal build directly (outside the Play Store) using EAS internal distribution, but it’s a different install experience and may require manual installs on devices. This doc focuses on the Play Store beta path.

