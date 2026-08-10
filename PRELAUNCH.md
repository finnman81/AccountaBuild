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

### 2. ~~UGC moderation~~ ✅ DONE 2026-08-04
- Long-press any chat message or log → **Report** or **Block** (`moderation.ts`)
- `reports` is CREATE-ONLY and unreadable by clients: a reporter can't check
  whether a report landed, and a reported user can't discover who filed it.
  Reports snapshot the offending text (authors can edit/delete it).
- Blocks live at `users/{uid}/blocks/{blockedUid}` — owner-only, so nobody can
  enumerate who blocked them. Blocked users vanish from the feed both ways.
- **Blocks enforced SERVER-side** in `sendSocialPush` (both directions):
  client-side filtering alone would let a blocked person keep cheering, which
  is a harassment channel once the app is public.
- Blocked-users screen (Settings → Account → Blocked users) so blocking is
  reversible, not a one-way trapdoor.

Verified with 9 prod probes incl. a control (unblock → cheer delivers again).

Photos covered too (long-press in ViewPhotos; blocked authors filtered out).
Support email + zero-tolerance terms live in Settings → Support.

### 3. Privacy policy + App Privacy labels — 🟡 HOSTED, labels remain
**Privacy policy is LIVE: https://app.munitor.ai/accountabuild/privacy**
(200, no redirects, auth-guard exempted — Apple's reviewer sees the policy,
not a login screen). In-app summary also ships at Settings → Terms & Privacy.

> DEPLOY NOTE (munitor-dashboard): that project has NO GitHub integration —
> pushing to master does NOT deploy. Production ships via `npx vercel --prod`.

**REMAINING — App Store Connect, ~10 min:**
1. Paste the privacy URL into App Store Connect → App Privacy → Privacy Policy URL.
2. **Support URL** (separate ASC field): needs `app.munitor.ai/accountabuild/support`
   — a simple page with support@munitor.ai + a link to the privacy policy.
   (Being added in the munitor-dashboard session.)
3. Fill the App Privacy "nutrition labels". Correct answers for this app:

| Category | Collected | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| Health & Fitness | YES | YES | NO | App Functionality |
| Contact Info (email) | YES | YES | NO | App Functionality |
| User Content (photos, messages) | YES | YES | NO | App Functionality |
| Identifiers (user ID) | YES | YES | NO | App Functionality |
| Diagnostics (crash/perf) | YES | NO | NO | App Functionality |
| Usage Data / Advertising | **NO** | — | — | — |

**Tracking = NO across the board** (no ad networks, no data brokers, no
third-party analytics beyond crash reporting) — so App Tracking Transparency is
NOT required. Health data is never used for advertising; say so if asked.

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

### 5. ~~Cheer-push spam guard~~ ✅ DONE 2026-08-04
`sendSocialPush` now requires sender and recipient to share a group before
delivering anything. Uses the server-maintained visibility index, which already
means exactly "these two share a group" — no member-list scans.

Verified with a control: an outsider's cheer is dropped with no activity item,
while a real teammate's cheer still delivers (guard isn't over-blocking).

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

### 8. ~~Sentry sampling~~ ✅ DONE 2026-08-04
ERRORS stay at 100% forever (low volume, and they're the point). Only TRACES
are sampled — they're the quota driver. Now 0.25, overridable per build via
`EXPO_PUBLIC_SENTRY_TRACES_RATE` so the rate drops at launch with no code
change.

0.25 rather than the textbook 0.10 deliberately: at 7 users, 10% yields roughly
one trace per screen per day — too sparse to catch a regression — and 25% of 7
users is a rounding error on quota. **Drop to ~0.05 once users are in the
hundreds**; that's when cost, not signal, becomes the binding constraint.

### 9. Firebase App Check — ⚠️ NOT a quick win for this stack (investigated 2026-08-04)
Blocked on an architectural mismatch, not effort:

We use the **Firebase JS SDK** (`firebase ^12.15.0`), not `@react-native-firebase`.
The JS SDK's App Check providers are `ReCaptchaV3Provider` /
`ReCaptchaEnterpriseProvider` (both **browser-only** — they need `window`/
`document`) and `CustomProvider`. There is no React Native attestation path in
the JS SDK.

Real options:
- **Add `@react-native-firebase/app` + `/app-check`** alongside the JS SDK.
  Works, but pulls a second Firebase implementation into the app, plus a native
  build and console config (App Attest/DeviceCheck on iOS, Play Integrity on
  Android). Non-trivial and worth doing deliberately, not in passing.
- **CustomProvider** backed by our own attestation endpoint — more code, weaker
  guarantees, not worth it.

**Recommendation: defer past launch.** App Check protects *quota* from scripted
clients; it does NOT gate data access — Firestore rules do that, and ours are
tight and probe-tested (deletion 25/25, moderation 9/9, polls 7/7, signatures
6/6, celebrations isolation). With the shared-group guard (#5) and block
enforcement now in place, the abuse surface is small. Revisit if quota abuse
actually appears.

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
- ✅ #4 group-scoped celebrations
- ✅ #1 account deletion
- ✅ #2 report + block (chat, logs, photos, support email, terms)
- 🟡 #3 privacy policy — written, needs hosting + App Store Connect labels (Jake)
- ✅ #5 cheer spam guard (shared-group check + block enforcement)
- ✅ #8 Sentry sampling (traces 0.25, env-overridable; errors stay 100%)
- ⚠️ #9 App Check — deferred past launch, see Tier 3 for why
- ⬜ #6 invite links + empty states — design pass with Jake first

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
