# Pre-Launch Plan — App Store & User Expansion

Status as of 2026-08-02. What must happen before AccountaBuild goes from
7 friends (BPM) to the public App Store, split by what actually breaks.
Companion docs: [README.md](README.md) for architecture, `Notes/` for proposals.

---

## 🚫 Tier 1 — Apple will reject the app without these

### 1. ~~In-app account deletion~~ ✅ DONE 2026-08-04
`deleteMyAccount` callable (`functions/account-deletion.js`) + Settings row
with a two-step confirm. Auth-scoped to the caller — there is deliberately no
"delete user X" parameter. Requires a literal 'DELETE' confirmation so a
mis-wired button can't destroy an account.

DELETED: users/{uid} + all 13 subcollections, publicUsers + weeklyPublic,
visibility + canSee, group memberships & goals, their own logs, signatures,
poll responses, username, auth record.
KEPT + ANONYMIZED: chat messages (uid -> 'deleted', name -> 'Deleted user') —
ripping them out would leave replies dangling. Apple requires the ACCOUNT be
deleted, not that shared conversation be rewritten.

Verified end-to-end on a throwaway account seeded across every collection:
25/25 orphan checks clean.

**Roster counts RECOUNT, never `increment(-1)`** — the test exposed a drift
bug (BPM read 6 with 8 real members) and repaired it. Any future
membership change should recount too.

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

### 4. ~~Group-scoped celebrations~~ ✅ DONE 2026-08-03
Celebrations now write to `groups/{gid}/announcements` (server-only, members
read). WhatsNewModal merges global app-news + every group the user belongs to.
`config/app` is app-wide news + polls ONLY.

Verified by building a real second group and firing a celebration: it landed
in BPM's queue only, the outsider's group stayed empty, global config stayed
clean, the outsider got no push, and reading BPM's queue over the wire
returned 403.

NOTE: old bundles (pre-2026-08-03) read only `config/app`, so they see app
news but not group celebrations. Acceptable — everyone in BPM is current.

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
> POLL FINDING (2026-08-03, `invite-ready`): nobody picked "I've got someone
> in mind" — the yeses were all "once it's on the App Store". So there are no
> natural TestFlight recruits. Consider shrinking Phase 1 to a small
> multi-group smoke test and pushing straight at the Tier 1 store blockers.
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
