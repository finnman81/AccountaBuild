# Android push is broken — FCM V1 credentials missing (found 2026-07-21)

## Symptom

Sending a bulk push to the group: **5 of 6 delivered, Regmong failed** with an
Expo ticket error of `InvalidCredentials`. Regmong is our only Android user.

## What this means

`InvalidCredentials` is not a bad device token — it means **Expo has no valid
FCM credentials to authenticate with Google's push service for our Android app.**
Expo can accept the send request and register a token, then fail at delivery,
which is why this stayed invisible: nothing in the app errors, the push simply
never arrives.

**Implication: Android push has likely NEVER worked.** Every cheer, nudge, chat
notification, streak-risk reminder, weekly recap, and Yesterday's Champion
announcement we've sent Regmong has silently gone nowhere. He's been using the
app with none of the social loop for weeks — worth knowing before reading
anything into his engagement.

## What is and isn't already in place

| Piece | State |
|---|---|
| `google-services.json` (project `accountabuild`, package `com.munitor.accountabuild`) | ✅ present, wired in `app.config.js` |
| Android build with FCM baked in (vc17) | ✅ built and submitted |
| Expo push token registered for Regmong | ✅ (`expoPushToken` present, starts with `Expo`) |
| **FCM V1 service account key uploaded to EAS** | ❌ **missing — this is the fix** |

Note the distinction: `google-services.json` lets the *app* receive pushes;
the *service account key* lets **Expo's servers** authenticate to Google to
*send* them. We have the first, not the second.

## The fix (needs Jake — requires Expo/Firebase dashboard login)

Two steps, ~5 minutes.

### 1. Get the service account key from Firebase
Firebase Console → **Project settings** → **Service accounts** →
**Generate new private key** → confirm → save the JSON.

> You may already have a suitable file:
> `accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json` in the repo root is a
> Firebase Admin SDK service account and normally carries the Cloud Messaging
> permission, so it can likely be uploaded as-is. Generating a fresh key is the
> cleaner option if you'd rather not reuse the admin credential.

### 2. Upload it to EAS
**Either** CLI (interactive — must be run by a human, not by me):
```
npx eas-cli credentials
  → Android → production → Google Service Account
  → "Set up a Google Service Account Key for Push Notifications (FCM V1)"
  → "Upload a new service account key"
```
**or** dashboard: expo.dev → project → **Credentials** → Android app identifier
→ **Service Credentials → FCM V1 service account key** → *Add a service account
key* → upload → Save.

No rebuild required — this is server-side credential config. Pushes should work
on the next send.

## Verifying afterwards

Re-run a targeted push and confirm zero `InvalidCredentials` tickets:

```
node scripts/_e2e-push-test.js ./accountabuild-firebase-adminsdk-fbsvc-9310efcafb.json
```

or ask Claude to send a one-off to Regmong and report the ticket result. The
`sendExpoPushes` helper already parses tickets and logs per-user errors, so a
clean run means it's genuinely fixed.

## Why nobody noticed

`functions/push-helper.js` only clears tokens on `DeviceNotRegistered` and logs
other ticket errors to Cloud Functions logs — which nobody reads. Consider
surfacing repeated ticket failures somewhere visible (the `clientErrors`
collection, or a Sentry message) so a whole platform silently failing can't hide
again.
