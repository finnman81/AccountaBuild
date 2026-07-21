# AccountaBuild

AccountaBuild is a **fitness + social accountability** app built with **Expo (React Native)** and **Firebase**. The core loop is:

- Pick an active group
- Log workouts / calories / weight / progress photos
- See group activity + progress dashboards

## Repo layout (important)

The repo root **is** the Expo app root (flattened July 2026 — there is no longer
a nested `AccountaBuild/` wrapper folder). Run all commands from the repo root.

## Tech stack

- **Expo SDK 54** + **React Native**
- **React Navigation** (stack + bottom tabs)
- **react-native-paper** (UI)
- **victory-native (XL) + @shopify/react-native-skia** (charts)
- **Firebase**
  - Auth
  - Firestore (app data)
  - Storage (avatars, group logos, progress photos)
  - Cloud Functions v2 (`functions/`): push delivery + scheduled weekly FP compute
- **Jest + React Native Testing Library** (local testing)

## Key features (current)

- **Auth**: email/password
- **Groups**: create / join via join code, group dashboard, chat, photos, settings, delete group (creator-only)
- **Logging**: calories (with meal type), workouts (multiple types), weight, progress photos
- **Progress**: charts + daily history + photos
- **Profile**: dashboard-style profile view + separate edit modal
- **Universal identity**: user profile data via `publicUsers/{uid}` + visibility index (reduces duplication across groups)
- **Global MMR system** (LoL-style): rank ladder + LP, seasons, badges, leaderboard, history.
  **Displayed to users as "Fitness Points (FP)"** — all internals/schema keep the `mmr` naming.
- **Push notifications** (Cloud Functions → Expo push): cheers/nudges (`pushQueue`),
  chat messages, teammate first-log-of-day, smart streak-at-risk reminder (18:00 ET),
  weekly recap + rank changes. Per-user toggles mirror to `users/{uid}.notifPrefs`.
- **Teammate profiles**: full KPI screen (training, consistency, rank + FP history via
  the `publicUsers/{uid}/weeklyPublic` mirror; body weight deliberately excluded)
- **FP transparency**: per-log FP stamps, a daily FP ledger (`users/{uid}/fpDaily`)
  powering "Yesterday: +N FP", and a "See the math" self-audit showing what your
  NEXT workout / calorie day / weigh-in is worth (end-of-week frame)
- **Weekly report**: full-screen rundown of the week that just closed (delta, rank,
  per-goal breakdown, scoring math, crew standings), auto-opened Mon–Wed
- **Vacation mode**, **streak freezes**, **Monday-only goal changes**
- **Health sync**: Apple Health / Health Connect with tombstones + duplicate
  suppression (including manual-vs-synced twins)

## Global MMR system (LoL-style)

This app includes a **global matchmaking rating (MMR)** system inspired by League of Legends to drive motivation and consistency.

### What it does

- **One global rank per user** (not per-group)
- Weekly scoring across global goals:
  - workouts/week, minutes/week, calorie adherence days/week
  - weight loss/gain timeline goals
- Anti-exploit blending when multiple goals are active (max + average)
- **Rank ladder + LP (0–100)**: Iron → Challenger (Master/Challenger have no divisions)
- **Demotion buffers + tier demotion shield**
- **Quarterly seasons** with rollover + soft reset mapping (per `Notes/mmr.txt`)
- **Badges**: season rank + season peak + achievements
- **Leaderboard** (group view) sorted by each member’s global MMR
- **MMR history** chart + weekly recap list

### Where the code lives

- Core math / helpers: `src/mmr/`
  - `types.ts`, `constants.ts`, `difficulty.ts`, `scoring.ts`, `ranks.ts`, `time.ts`, `risk.ts`, `badges.ts`
- Firestore services:
  - Weekly computation + transactional update: `src/services/mmrUpdate.ts`
  - Season rollover + reset: `src/services/mmrSeason.ts`
  - Weekly read helpers: `src/services/mmrWeekly.ts`
  - Goals: `src/services/mmrGoals.ts`
  - Badges: `src/services/mmrBadges.ts`
  - Season history: `src/services/mmrSeasonResults.ts`
  - Global season metadata (countdown): `src/services/mmrGlobalSeasons.ts`
- UI / navigation:
  - Goals UI: `src/screens/MMRGoalsScreen.tsx` (modal)
  - Leaderboard: `src/screens/LeaderboardScreen.tsx`
  - Season history: `src/screens/SeasonHistoryScreen.tsx`
  - MMR history: `src/screens/MMRHistoryScreen.tsx`
  - Profile integration: `src/screens/ProfileScreen.tsx`
  - Navigation wiring: `src/navigation/TabsNavigator.tsx`

### Firestore data model (MMR-related)

- **User state**: `users/{uid}`
  - `mmr`, `rankTier`, `rankDivision`, `lp`
  - `streakWeeks`, `tierShieldWeeksRemaining`, `consecutiveMissedWeeks`
  - `currentSeasonId`, `lastWeekIdUpdated`, `seasonPeak`
- **Public mirror**: `publicUsers/{uid}`
  - `mmrPublic`, `rankTierPublic`, `rankDivisionPublic`, `lpPublic`, `seasonIdPublic`
- **Goals**: `users/{uid}/goals/{goalId}`
- **Calorie adherence toggles**: `users/{uid}/calorieDays/{YYYY-MM-DD}` (includes `source`)
- **Weekly summaries**: `users/{uid}/weekly/{weekId}` (includes `dataSource`, rank before/after, promo/demotion info)
- **Badges**: `users/{uid}/badges/{badgeId}`
- **Season summaries**:
  - `users/{uid}/seasonResults/{seasonId}`
  - `users/{uid}/seasons/{seasonId}`
- **Global season metadata**: `globalSeasons/{seasonId}` (for countdown)

### How to use it in the app

- **Set goals**: Profile → “Calorie goal days” section → **MMR goals**
- **Recompute / catch up**: Profile → **pull to refresh** or tap **Update**
  - Updates are **idempotent per week** (re-running the same week won’t keep subtracting MMR)
- **Leaderboard**: Group page → **Leaderboard**
- **MMR history**: Profile → Settings & Controls → **MMR history**
- **Season history**: Profile → Settings & Controls → **Season history**

### Badge images

Tier badge images live in:
- `Pictures/` (one PNG per tier)

## FP scoring rules (current)

The FP engine is **duplicated by design** in two places that must stay in lockstep:
`src/services/mmrUpdate.ts` (client scorer) and `functions/mmr-compute.js` (server
scorer), with shared math in `src/mmr/*` mirrored into `functions/mmr-core.js`.
**Every scoring change goes in BOTH, plus `src/services/mmrProjection.ts`** (the
live projection powering "See the math"). Parity tests guard the math modules.

### Week-gated rollouts (the pattern for ANY scoring change)

Never flip scoring by deploy timing. Gate on the ISO week id:

```ts
export const CAL_BAND_FROM_WEEK = '2026-W30';   // src/mmr/adherence.ts
export const WEIGHT_V2_FROM_WEEK = '2026-W31';  // src/mmr/difficulty.ts
```

Ship the code whenever; it activates itself at that Monday 00:00 ET. Weeks before
the gate keep the old math **forever**, so recomputes never restate closed weeks.
Verify with an A/B dry-run (flip the constant, `scripts/mmr-recompute.js --all
--dry-run` both ways, diff). Pair with a scheduled announcement (`activeFrom`).

### Calories
Any logged day at/under **120%** of budget = **full credit**; over = **0.5**
(honesty credit). Bulk mode: at/over budget = full, else 0.5. No lower bound —
a 75% floor was tried and removed (it punished sick/light days). Chronic
under-logging is *flagged* (`lowCalorieDays` on the weekly doc), never punished.

### Weight (v2, from 2026-W31)
- **Difficulty** = fraction of your *spare* weight (above BMI 22 for your height)
  the goal commits. Falls back to v1 (loss/bodyweight) when height is missing.
- **Outcome** compares **weekly average** weigh-ins vs the previous week's average
  (daily fluctuation cancels), endpoint fallback when a week has no weigh-ins.
- Current-week outcome **drips by elapsed days**, so one Monday weigh-in can't
  bank a whole week. Week-close totals are unaffected.
- Rationale + real-user impact tables: `Notes/FP_WEIGHT_V2_PROPOSAL.md`.

### Other mechanics
- **Vacation mode**: 2/season, current week only. No penalty, streak held, no
  freeze spent; anything logged still scores. 🏖️ badge on the leaderboard.
- **Streak freezes**: earn 1 per 4 completed weeks (cap 2), auto-spent to hold a
  streak on a non-completed week (the penalty still applies).
- **Goal changes are Monday-only** once a user has active goals (first-time setup
  is always allowed), so nobody edits targets mid-race.
- **Leaderboards default to THIS WEEK's FP**, with an All-Time toggle.

## Observability

- **Sentry** (`src/services/sentry.ts`) — crash reporting + performance tracing
  (100% sample rate at current scale) + React Navigation screen timing. Init is
  guarded by a `NativeModules.RNSentry` check so builds without the native module
  stay provably inert. **Never run `npx @sentry/wizard`** — it rewrites `App.tsx`
  to a top-level import that would crash pre-Sentry builds via OTA.
  Source maps: `SENTRY_AUTH_TOKEN` lives in **EAS secrets**, org/project in
  `eas.json` (never commit the token).
- **App-health heartbeat** (`src/components/state/Heartbeat.tsx`) — writes
  `users/{uid}.appHealth` (lastOpenedAt, OTA id, platform, `authPersistence`,
  `sentryActive`) on open/foreground. `sentryActive` doubles as the build
  detector because `Constants.nativeBuildVersion` returns null on SDK 54.
- **JS error reporter** (`src/services/errorReporter.ts`) — global handler →
  `clientErrors` collection (create-only). Fatal errors queue to AsyncStorage and
  upload on the NEXT launch. `reportDebug()` is available for remote diagnosis.
  **Never map a listener error to empty data without reporting it** — a silently
  swallowed `failed-precondition` hid a missing-index bug that killed every
  weekly-history surface from birth.

### Push delivery monitoring

`functions/push-helper.js` parses Expo tickets. `DeviceNotRegistered` clears the
dead token; **every other ticket error is aggregated into `pushFailures/{code}`**
(server-only, one rolling doc per error code with a count + recent uids).

**A doc in `pushFailures` means a CLASS of delivery is broken, not one device.**
Check it first when someone says they aren't getting notifications. This exists
because `InvalidCredentials` silently killed *all* Android push for weeks —
every cheer, nudge, chat ping, streak reminder and champion announcement to our
only Android user went nowhere, and the only trace was a Cloud Functions log
line nobody reads.

### EAS Android push credentials (the trap that caused it)

`google-services.json` lets the **app receive** pushes. A separate **FCM V1
service account key**, stored in EAS, lets **Expo's servers send** them — and it
is bound to a specific **applicationIdentifier**. Ours was attached to a stale
package (`com.accountabuild.app`) while the app ships as
`com.munitor.accountabuild`, so Expo found no credentials for the package
devices actually registered under.

**If the Android package name ever changes, re-attach the FCM key to the new
identifier**, or Android push dies silently. EAS credential state is queryable
(and fixable) via the Expo GraphQL API at `https://api.expo.dev/graphql` using
the `expo-session` header from `~/.expo/state.json` — `eas credentials` itself
is interactive-only. Useful fields on `AndroidAppCredentials`:
`applicationIdentifier`, `googleServiceAccountKeyForFcmV1`; useful mutations:
`createAndroidAppCredentials`, `setGoogleServiceAccountKeyForFcmV1`.

## Performance architecture

The Firebase **JS SDK has no disk cache on React Native**, so data-heavy screens
used to block on the network before first paint (measured: Today ~6s,
Leaderboard ~3.5s, GroupChat up to 27s).

**`src/services/hydrationCache.ts`** is the fix: a memory+AsyncStorage mirror of
key snapshots, primed during the startup splash so `getHydrated()` is a
**synchronous** hit on first render. Screens seed initial state from it and write
each live update back — cache-then-network.

- Cached keys: `group:{groupId}`, `members:{groupId}`, `publicUsers:{groupId}`,
  `canSee:{uid}`, `profile:{uid}`, `weekDeltas:{groupId}:{weekId}`,
  `mmrState:{uid}`. Plus `src/services/profileCache.ts` for display/group names.
- **Do NOT cache raw logs/messages** — Firestore Timestamps don't survive a JSON
  round-trip and volume is unbounded.
- Results: Today **~6,000ms → ~90ms**, Leaderboard **~3,576ms → ~57-582ms**.
- Watch for **chained** subscriptions (members → canSee → publicUsers): that
  serialized wait, not rendering, was GroupChat's 27s.
- Full plan + measurements: `Notes/PERF_V2_PLAN.md`.

## In-app announcements ("What's New")

`config/app.announcements` is an **array**; every entry a user hasn't seen is
shown oldest-first, one per app open. Each entry is
`{ id, emoji, title, lines[], activeFrom? }` — `activeFrom` (ISO timestamp)
schedules a reveal. No release needed; it's a pure admin write.

Seen ids are recorded to `users/{uid}.announcementsSeen` (server, via
`arrayUnion` — never assign an array, that wipes history) **and** AsyncStorage;
the check is the union of both.

**ALWAYS dual-write the legacy `config/app.announcement` single field too.**
Clients on an older bundle read only that field, so publishing to the array
alone makes them go silent. Put whichever message matters most to
not-yet-updated users in the legacy slot. (Learned the hard way: migrating to
the array and deleting the field broke announcements for most of the group.)

## Admin scripts

Run with the Firebase **admin SDK key** (never the Play service account):

- `scripts/mmr-recompute.js <key> (--all | --name X | --uid X) [--dry-run]`
- `scripts/_repair-week-anchors.js <key> [--apply]` — weekly baseline chains
- `scripts/_scrub-manual-synced-twins.js <key> [--apply]` — manual/health dupes
- `scripts/_dryrun-streak-risk.js`, `scripts/_e2e-push-test.js`

**After any manual FP correction, also patch that day's `users/{uid}/fpDaily/{date}`
snapshot** — otherwise the next day's "Yesterday: −N FP" reports your fix as a loss.

## Setup

### 1) Install dependencies

From the repo root:

```powershell
npm install
```

### 2) Firebase configuration

This app requires Firebase to run.

- **Setup doc**: `Notes/docs/Setup.MD`
- **Firebase setup details**: `Notes/docs/FIREBASE_SETUP.md`

You’ll need:
- a Firebase project
- Auth enabled
- Firestore enabled
- Storage enabled
- correct config in `src/firebase/firebase.ts`

### 3) Start the app (Expo)

```powershell
npm run start
```

Then use:
- Expo Go on a phone (LAN or Tunnel)
- or an emulator/simulator (if configured)

## Scripts

Run from the repo root:

- **Start dev server**: `npm run start`
- **Run tests**: `npm test`
- **Run tests (CI)**: `npm run test:ci`
- **Build Android (preview)**: `npm run build:android:preview`
- **Build iOS (preview)**: `npm run build:ios:preview`

## Testing

Tests live in:
- `testing/`

Docs:
- `testing/README.md`

Run:

```powershell
npm test
```

MMR-specific unit tests live in:
- `testing/unit/mmr_*.test.ts`

## Firebase rules

Rules are in:
- Firestore: `firestore.rules`
- Storage: `storage.rules`

When you change rules, deploy them from your Firebase tooling flow (per your Firebase project setup).

## Deployment (store builds)

Deployment docs:
- iOS: `Notes/docs/Deploy_IOS.md`
- Android: `Notes/docs/Deploy_Android.md`

This project uses **EAS Build** with `eas.json` profiles (`development`, `preview`, `production`) and OTA updates via `runtimeVersion` policy `sdkVersion`.

## Common pitfalls / troubleshooting

- **Stale docs**: older notes may reference a nested `AccountaBuild/` folder. It no longer exists — the repo root IS the app root.
- **Port already in use**: Expo defaults to `8081`; stop the old process or run a different port.
- **Permission denied (Firestore)**: confirm rules are deployed and visibility index is populated (sign out/in if needed).

## Contributing / housekeeping

- Notes live in `Notes/`
- Deployment + setup docs live in `Notes/docs/`
- Generated build output (like `dist/`) should not be committed

