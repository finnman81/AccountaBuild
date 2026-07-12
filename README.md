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

- Core math / helpers: `AccountaBuild/src/mmr/`
  - `types.ts`, `constants.ts`, `difficulty.ts`, `scoring.ts`, `ranks.ts`, `time.ts`, `risk.ts`, `badges.ts`
- Firestore services:
  - Weekly computation + transactional update: `AccountaBuild/src/services/mmrUpdate.ts`
  - Season rollover + reset: `AccountaBuild/src/services/mmrSeason.ts`
  - Weekly read helpers: `AccountaBuild/src/services/mmrWeekly.ts`
  - Goals: `AccountaBuild/src/services/mmrGoals.ts`
  - Badges: `AccountaBuild/src/services/mmrBadges.ts`
  - Season history: `AccountaBuild/src/services/mmrSeasonResults.ts`
  - Global season metadata (countdown): `AccountaBuild/src/services/mmrGlobalSeasons.ts`
- UI / navigation:
  - Goals UI: `AccountaBuild/src/screens/MMRGoalsScreen.tsx` (modal)
  - Leaderboard: `AccountaBuild/src/screens/LeaderboardScreen.tsx`
  - Season history: `AccountaBuild/src/screens/SeasonHistoryScreen.tsx`
  - MMR history: `AccountaBuild/src/screens/MMRHistoryScreen.tsx`
  - Profile integration: `AccountaBuild/src/screens/ProfileScreen.tsx`
  - Navigation wiring: `AccountaBuild/src/navigation/TabsNavigator.tsx`

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
- `AccountaBuild/Pictures/` (one PNG per tier)

## Setup

### 1) Install dependencies

From the repo root:

```powershell
cd .\AccountaBuild
npm install
```

### 2) Firebase configuration

This app requires Firebase to run.

- **Setup doc**: `AccountaBuild/Notes/docs/Setup.MD`
- **Firebase setup details**: `AccountaBuild/Notes/docs/FIREBASE_SETUP.md`

You’ll need:
- a Firebase project
- Auth enabled
- Firestore enabled
- Storage enabled
- correct config in `AccountaBuild/src/firebase/firebase.ts`

### 3) Start the app (Expo)

```powershell
cd .\AccountaBuild
npm run start
```

Then use:
- Expo Go on a phone (LAN or Tunnel)
- or an emulator/simulator (if configured)

## Scripts

Run from `AccountaBuild/`:

- **Start dev server**: `npm run start`
- **Run tests**: `npm test`
- **Run tests (CI)**: `npm run test:ci`
- **Build Android (preview)**: `npm run build:android:preview`
- **Build iOS (preview)**: `npm run build:ios:preview`

## Testing

Tests live in:
- `AccountaBuild/testing/`

Docs:
- `AccountaBuild/testing/README.md`

Run:

```powershell
cd .\AccountaBuild
npm test
```

MMR-specific unit tests live in:
- `AccountaBuild/testing/unit/mmr_*.test.ts`

## Firebase rules

Rules are in:
- Firestore: `AccountaBuild/firestore.rules`
- Storage: `AccountaBuild/storage.rules`

When you change rules, deploy them from your Firebase tooling flow (per your Firebase project setup).

## Deployment (store builds)

Deployment docs:
- iOS: `AccountaBuild/Notes/docs/Deploy_IOS.md`
- Android: `AccountaBuild/Notes/docs/Deploy_Android.md`

This project uses **EAS Build** with `AccountaBuild/eas.json` profiles (`development`, `preview`, `production`) and OTA updates via `runtimeVersion` policy `sdkVersion`.

## Common pitfalls / troubleshooting

- **Wrong directory**: if you see “Could not read package.json”, you’re probably in the repo root. `cd AccountaBuild` first.
- **Port already in use**: Expo defaults to `8081`; stop the old process or run a different port.
- **Permission denied (Firestore)**: confirm rules are deployed and visibility index is populated (sign out/in if needed).

## Contributing / housekeeping

- Notes live in `AccountaBuild/Notes/`
- Deployment + setup docs live in `AccountaBuild/Notes/docs/`
- Generated build output (like `dist/`) should not be committed

