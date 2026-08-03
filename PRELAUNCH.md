# Pre-Launch Plan — App Store & User Expansion

Status as of 2026-08-02. What must happen before AccountaBuild goes from
7 friends (BPM) to the public App Store, split by what actually breaks.
Companion docs: [README.md](README.md) for architecture, `Notes/` for proposals.

---

## 🚫 Tier 1 — Apple will reject the app without these

### 1. In-app account deletion
Guideline 5.1.1(v): apps with account creation MUST offer in-app deletion.
Firestore rules deliberately deny client user-doc deletes (delete-recreate was
an FP exploit), so this needs a **Cloud Function**: callable, auth-scoped,
tears down `users/{uid}` + subcollections, `publicUsers/{uid}`, group
memberships, visibility index entries, auth record. Settings gets a
"Delete account" row with a confirm flow.

### 2. UGC moderation (chat + progress photos)
Apple requires, for any user-generated content: a way to **report** content,
a way to **block** users, and zero-tolerance terms. Minimum viable:
- Long-press → "Report" on messages/photos → `reports` collection (create-only)
- Per-user block list that filters chat/feed/photos client-side
- Support email + a moderation pass on reports (manual is fine at this scale)

### 3. Privacy policy + App Privacy labels
HealthKit apps get extra review scrutiny:
- Hosted privacy policy URL (health data handling explicitly covered)
- Accurate App Privacy nutrition labels (health & fitness data, identifiers)
- Health data must never feed advertising (we don't — say so)
- Support URL + terms

---

## 💥 Tier 2 — breaks the moment strangers join

### 4. Group-scoped celebrations  ← biggest engineering item
All announcements live in ONE global queue (`config/app.announcements`).
Today that's fine — one group. The day a second group exists, one group's
goal/tier celebrations pop up on strangers' phones.
- Move celebration pop-ups to `groups/{gid}/announcements`; WhatsNewModal
  merges global (app news only) + per-group queues
- `functions/celebrations.js` writes to the honoree's groups, not the world
- Keep the legacy dual-write rules in mind for old bundles (see README)

### 5. Cheer-push spam guard
`pushQueue` lets any authenticated user push a cheer to ANY uid — no shared-
group check. Harassment vector on a public app. Fix in `sendSocialPush`:
verify sender and recipient share a group before delivering. (~1 hour)

### 6. New-user empty experience + invites
Everything assumes you land in an active group. A stranger lands in an empty
Today with no crew. The core loop REQUIRES a group.
- Polished create-or-join landing state (first-run, no group)
- Shareable invite links (deep link → prefilled join code)
- Empty states for Today/Leaderboard/Chat that sell the loop instead of
  showing blank cards
This is product work as much as engineering — design pass with Jake first.

---

## 📈 Tier 3 — breaks at scale (fine at 50 users, dead at ~1,000)

### 7. Shard the 6h scheduled FP compute
`updateMmrScheduled` walks every user serially in one invocation (540s
timeout). Fine at 24 users; stops finishing around ~500-1,000. Fan out via
Cloud Tasks or per-shard scheduled functions. Not needed for a soft launch;
required before any real growth push.

### 8. Sentry sampling
Tracing is at 100% sample rate — priced for 7 users. Drop to ~10% at launch
(`src/services/sentry.ts`) or the bill beats the users.

### 9. Firebase App Check
Public API surface + scripted abuse insurance. Enforce on Firestore +
Functions once enabled in console + client attestation shipped (needs a
native build — bundle with the next one).

### 10. Read-cost audit (deferred, revisit at ~100 users)
Windowed group-log listeners and per-open weekDeltas fetches are fine now.
The "shared subscription store" idea stays parked until reads actually cost
something.

---

## 📋 In-app surveys (decided approach)

No third-party SDK. Extend the existing announcement pop-up with a `survey`
payload — same pattern as `celebrate` (hype buttons):

```
{ id, emoji, title, lines[], survey: { questionId, options: [ ... ] } }
```

- Tapping an option writes `surveyResponses/{questionId}_{uid}` (create-only
  rule, doc id enforces one answer per user — same pattern as signatures)
- OTA-able, no build, no vendor, results queryable via admin scripts
- Rejected alternatives: survey SDKs (native module + monthly cost + data
  sharing), link-out forms (breaks flow, can't tie answers to users)

---

## 🗺️ Phased rollout plan

**Phase 0 — build the blockers** (current)
Order: group-scoped celebrations (#4) → account deletion + report/block
(#1, #2) → spam guard + App Check + Sentry sampling (#5, #8, #9 — one day
combined) → invite links + empty states (#6, design pass first).
Privacy policy (#3) is writing, not code — can happen in parallel.

**Phase 1 — TestFlight wave (30-50 users, 2-3 stranger groups)**
- Real multi-group test: celebrations scoping, visibility index, invites
- TestFlight imposes no review gate on the moderation/deletion items yet
- Watch: Sentry, `clientErrors`, `pushFailures`, background-sync telemetry
- Run the first in-app survey ("what's missing?") on this cohort

**Phase 2 — App Store submission**
- Tier 1 items done + verified; privacy labels filled; screenshots/metadata
- Android: next native build needs `production-android` profile (local
  keystore — see README) + the Health Connect background-read permission
  already staged in app.json

**Phase 3 — growth** (only after Phase 2 is stable)
- Shard the scheduled compute (#7)
- Dormant-user FP decay policy (parked — see memory/notes)
- Read-cost optimization (#10)

---

## Known landmines for whoever builds this

- **Announcement/capability ordering**: content that needs new client
  rendering must gate on `activeFrom` until the OTA lands (README).
- **Scoring changes**: server-only scorer; week-gated constants; A/B dry-run
  against all users before deploy (README "FP scoring rules").
- **Anything additive to a week's FP delta must anchor on the weekly doc** —
  never gate on external "already done" flags (the revoked-bonus bug class).
- **Old-bundle compat**: legacy `config/app.announcement` single-field
  dual-write until every device is past build 36.
