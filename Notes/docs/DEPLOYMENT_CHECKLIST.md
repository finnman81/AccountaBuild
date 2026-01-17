# AccountaBuild Deployment Checklist

This checklist tracks progress for deploying AccountaBuild to iOS TestFlight and Google Play Internal Testing.

## Pre-Deployment Setup

### Accounts
- [ ] Apple Developer Program enrollment ($99/year)
  - [ ] Apple ID created/verified
  - [ ] Two-Factor Authentication enabled
  - [ ] Developer Program enrollment completed
  - [ ] Payment processed
  - [ ] App Store Connect access verified
- [ ] Google Play Developer account ($25 one-time)
  - [ ] Google account created/verified
  - [ ] Two-Step Verification enabled
  - [ ] Developer account registration completed
  - [ ] Payment processed
  - [ ] Play Console access verified

### EAS Configuration
- [ ] EAS CLI installed: `npm i -g eas-cli`
- [ ] EAS CLI logged in: `eas login`
- [ ] EAS project verified: `eas project:info`
- [ ] iOS credentials configured: `eas credentials` → iOS → Production
- [ ] Android credentials configured: `eas credentials` → Android → Production
- [ ] Environment variables set in EAS preview environment:
  - [ ] `EXPO_PUBLIC_FIREBASE_API_KEY`
  - [ ] `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - [ ] `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  - [ ] `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - [ ] `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - [ ] `EXPO_PUBLIC_FIREBASE_APP_ID`

### Configuration Files
- [ ] `eas.json` updated with `autoIncrement: true` in preview profile
- [ ] `app.json` verified:
  - [ ] iOS bundleIdentifier: `com.accountabuild.app`
  - [ ] Android package: `com.accountabuild.app`
  - [ ] Version: `1.0.0` (or current version)
  - [ ] App name: `AccountaBuild`
  - [ ] Icon and splash assets exist

## iOS Deployment

### App Store Connect Setup
- [ ] App record created in App Store Connect
  - [ ] Bundle ID: `com.accountabuild.app`
  - [ ] App name: AccountaBuild
  - [ ] SKU: `accountabuild-001` (or unique value)
- [ ] App Information completed
  - [ ] Category selected
  - [ ] Privacy Policy URL (if required)
  - [ ] Support URL (optional)
- [ ] App Privacy questionnaire completed
  - [ ] Data collection declared (User ID, Email, Photos, Health & Fitness)
- [ ] Export Compliance (handled automatically during build submission)

### iOS Build
- [ ] Pre-build validation:
  - [ ] In `AccountaBuild/` directory
  - [ ] EAS credentials verified
  - [ ] Environment variables verified
- [ ] Build initiated: `npm run build:ios:preview` or `eas build --platform ios --profile preview`
- [ ] Build completed successfully
- [ ] Build ID noted: `_________________`
- [ ] Build number verified (auto-incremented)
- [ ] `.ipa` file downloaded and validated

### TestFlight Submission
- [ ] Build uploaded to App Store Connect
  - [ ] Method: `eas submit --platform ios --profile preview --latest` OR manual upload
- [ ] Build processing completed (10-60 minutes)
- [ ] External Testing group created: "Beta Testers"
- [ ] Build added to testing group
- [ ] Test information completed:
  - [ ] What to Test
  - [ ] App Access (login credentials if needed)
  - [ ] Notes
- [ ] Tester emails added (up to 10,000 for external)
- [ ] Invitations sent
- [ ] First build review completed (if required, 24-48 hours)

### iOS Testing
- [ ] TestFlight build installed on physical iOS device
- [ ] Core flows tested:
  - [ ] Sign up / Login
  - [ ] Create/join group
  - [ ] Log workout
  - [ ] Log weight
  - [ ] Upload photo
  - [ ] View profile
  - [ ] Group chat
- [ ] Firebase connection verified
- [ ] No crashes on launch
- [ ] Icons and splash screen display correctly

## Android Deployment

### Play Console Setup
- [ ] App record created in Play Console
  - [ ] Package name: `com.accountabuild.app`
  - [ ] App name: AccountaBuild
  - [ ] Default language: English (United States)
- [ ] Store Listing completed (minimal for internal testing)
  - [ ] App name
  - [ ] Short description
  - [ ] Full description
  - [ ] App icon uploaded
- [ ] Content Rating completed
  - [ ] Questionnaire answered
  - [ ] Rating approved
- [ ] Data Safety completed
  - [ ] Data collection declared (User IDs, Email, Photos, Health & Fitness)
- [ ] App Access completed (if login required)
  - [ ] Instructions provided
  - [ ] Test account credentials (if needed)
- [ ] Play App Signing enabled (recommended)
  - [ ] Google-managed signing key configured

### Android Build
- [ ] Pre-build validation:
  - [ ] In `AccountaBuild/` directory
  - [ ] EAS credentials verified
  - [ ] Environment variables verified
- [ ] Build initiated: `npm run build:android:preview` or `eas build --platform android --profile preview`
- [ ] Build completed successfully
- [ ] Build ID noted: `_________________`
- [ ] Version code verified (auto-incremented)
- [ ] `.aab` file downloaded and validated

### Internal Testing Setup
- [ ] Internal Testing track created
- [ ] New release created
- [ ] `.aab` file uploaded
- [ ] Release name: `Beta 1.0.0` (or version)
- [ ] Release notes added
- [ ] Tester list created: "Beta Testers"
- [ ] Tester emails added (<10 users)
- [ ] Release reviewed (all sections green)
- [ ] Release rolled out to Internal Testing
- [ ] Opt-in URL copied and shared with testers

### Android Testing
- [ ] Internal Testing build installed on physical Android device
- [ ] Core flows tested:
  - [ ] Sign up / Login
  - [ ] Create/join group
  - [ ] Log workout
  - [ ] Log weight
  - [ ] Upload photo
  - [ ] View profile
  - [ ] Group chat
- [ ] Firebase connection verified
- [ ] No crashes on launch
- [ ] Adaptive icon displays correctly
- [ ] Tested on different Android versions (if possible)

## Cross-Platform Validation

- [ ] iOS and Android versions match: `1.0.0`
- [ ] Build numbers are sequential and unique per platform
- [ ] Same features work on both platforms
- [ ] UI looks consistent (accounting for platform differences)
- [ ] Data syncs correctly between platforms (if users test both)

## Version Tracking

### Current Deployment
- **Version:** `1.0.0`
- **iOS Build Number:** `_________________`
- **Android Version Code:** `_________________`
- **Build Date:** `_________________`
- **Deployment Date:** `_________________`

### Build History
| Version | iOS Build # | Android Version Code | Date | Notes |
|---------|-------------|---------------------|------|-------|
| 1.0.0   |             |                      |      | Initial beta release |

## Post-Deployment Monitoring

### iOS TestFlight
- [ ] TestFlight metrics monitored
  - [ ] Number of testers
  - [ ] Install count
  - [ ] Crash reports reviewed
- [ ] Tester feedback collected
- [ ] Issues documented and prioritized

### Android Play Console
- [ ] Play Console statistics monitored
  - [ ] Number of testers
  - [ ] Install count
  - [ ] Crash reports reviewed
  - [ ] ANR reports reviewed
- [ ] Tester feedback collected
- [ ] Issues documented and prioritized

## Common Issues & Resolutions

### Version Conflicts
- [ ] **Issue:** "Version code already used" (Android)
  - [ ] **Resolution:** Verified `autoIncrement: true` in preview profile
  - [ ] **Resolution:** Manually incremented version if needed
- [ ] **Issue:** "Bundle version already used" (iOS)
  - [ ] **Resolution:** Verified `autoIncrement: true` in preview profile
  - [ ] **Resolution:** Manually incremented build number if needed

### Firebase Configuration
- [ ] **Issue:** "Firebase not configured" in build
  - [ ] **Resolution:** Verified all 6 environment variables in EAS
  - [ ] **Resolution:** Recreated missing variables

### Credentials
- [ ] **Issue:** "Credentials not found"
  - [ ] **Resolution:** Ran `eas credentials` and set up missing credentials
  - [ ] **Resolution:** Verified Apple Developer account linked (iOS)

### Submission Issues
- [ ] **Issue:** "App Store Connect build processing failed"
  - [ ] **Resolution:** Checked build logs in App Store Connect
  - [ ] **Resolution:** Verified export compliance completed
  - [ ] **Resolution:** Verified app record fully set up
- [ ] **Issue:** "Play Console rejection - missing information"
  - [ ] **Resolution:** Completed all required sections
  - [ ] **Resolution:** Checked Play Console → Release → Issues

## Next Steps

After successful beta deployment:
- [ ] Collect and prioritize tester feedback
- [ ] Plan next build iteration
- [ ] Update version number for next release
- [ ] Document any platform-specific learnings
- [ ] Update deployment documentation with actual steps

## Notes

_Add any deployment-specific notes, gotchas, or learnings here:_
