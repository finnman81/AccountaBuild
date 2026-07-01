# AccountaBuild Revival Plan

_Authored from a full read of the code, the MMR design doc, git history, and the two TestFlight crash reports. Every finding below is cited to a file and line._

## The honest current state

This project was not abandoned at a clean stopping point. It was left mid-sprint in a **broken, non-compiling state**, on build 22, with two crash fixes written but never shipped. The good news: that makes revival far more tractable than "dead side project" implies. The hard, differentiated part (the ranking engine design and math) is done and high quality. What is standing between here and a relaunch is a finite, well-understood list.

Three facts frame everything:

1. **The app does not currently compile.** `src/services/mmrUpdate.ts` uses a variable `isCurrentWeek` on lines 413 and 477 that is declared nowhere in `src/`. That is a `TS2304` compile error and a runtime `ReferenceError` that throws inside the weekly-update transaction. The entire MMR ladder is dead until this one line is fixed. This is almost certainly the state the project was paused in.
2. **Both beta-killing crashes were "fixed" in commits that never shipped.** Both crash reports are from build 22. The health-permission crash (Jan 20) was followed by a `health sync upates` commit that mitigates it; the leaderboard crash got a `leaderboard crash fix` commit on Jan 23, yet the tester still reported "leaderboard still crashes app" **after** that commit. Neither fix reached a fresh build. One of them is also incomplete (see Phase 2).
3. **There is a large amount of uncommitted, unshipped work.** A whole onboarding flow (~1,630 lines: 5 screens, 5 components, 3 services, a navigator, a hook) is untracked but already wired into `AppNavigator`. Plus real uncommitted changes to group-join logic. The working tree is a sprint frozen in amber.

## Sequencing philosophy

Two milestones, not one:

- **Milestone A "Relaunch to friends":** compiles, builds, does not crash, ladder works and is not trivially exploitable, onboarding shipped. Everything a 5-to-20-person private beta needs.
- **Milestone B "Ready to scale":** server-authoritative MMR (anti-cheat), locked-down security rules, the O(n^2) visibility index reworked, pagination instead of `limit(800)` windows. Everything needed before strangers touch it.

Phases 0-4 get you to Milestone A. Phase 5 is Milestone B. Phase 6 (tests/CI) runs alongside from the start.

---

## Phase 0 — Unbreak the build (half a day)

Nothing else can be verified until the app compiles and runs. Do this first.

- [ ] **Fix the `isCurrentWeek` blocker.** In `src/services/mmrUpdate.ts`, declare it at the top of `updateGlobalMmrForWeek`, almost certainly:
      `const isCurrentWeek = weekId === isoWeekIdInTz(new Date(), DEFAULT_TZ);`
      This was a half-finished "don't penalize the in-progress current week" feature (introduced in the `deployment push` commits). Confirm the two guard sites (413 missed-week, 477 penalty) express the intended behavior, then keep it.
- [x] **Get the app compiling at runtime.** `npx tsc --noEmit` after the fix shows the `isCurrentWeek` error is gone. NOTE (measured 2026-07-01): there are **186 pre-existing type errors**, but they are NOT run-blockers. Expo/Metro bundles via Babel, which strips types without type-checking, so build 22 shipped to TestFlight with all 186 present. Only `isCurrentWeek` (an undefined variable, a real runtime `ReferenceError`) actually broke execution, and it is fixed. Driving `tsc` to zero is a separate, bounded type-hygiene task, not a Phase 0 gate (see below).
- [x] **Clear the `db`-null error class.** DONE (2026-07-01): narrowed the `auth`/`db`/`storage` exports in `src/firebase/firebase.ts` to non-null. This dropped the count from **186 to 53** errors and introduced none. Tests stayed green (25/25).
- [x] **Drive the last 53 `tsc` errors to zero.** DONE (2026-07-01): `tsc --noEmit` is now fully clean (186 -> 0), tests still 25/25. Fixed navigation param-list typing (correct nested stacks + CompositeScreenProps), theme tokens, expo-notifications trigger/permission types, MMR legacy `deltaLP` read, `SeasonHistory` Extract, null guards, and Google Fit dynamic-method casts. Two notable findings surfaced and were addressed:
  - **Native auth persistence is broken** — `getReactNativePersistence` was removed in Firebase v12 (confirmed absent at runtime), so users are logged out on app restart. Compile error fixed and current behavior preserved; the actual persistence restore is flagged inline in `firebase.ts` as a **Phase 2/3** task (needs the Firebase v12 RN persistence approach + device testing).
  - **Onboarding goals prefill was dead code** — the units/goalMode fetch sat after a `return` in the effect and never ran; restructured so it executes (latent bug fixed).
- [ ] **Run the test suite.** `npm test`. There are 9 test files (MMR math, formatters, memberSummary, a few component/smoke). Get them green as the baseline.
- [ ] **Boot it.** `npm start`, load in a dev client, confirm login -> group -> log flow works end to end. Establish "it runs" before changing anything.
- [ ] **Add `.gitattributes`** with `* text=auto eol=lf` (root of the app). The repo has no `.gitattributes`, so Windows CRLF is polluting `git status` (5 files show as modified with only line-ending changes). Fix this now so the diffs in Phase 1 are real.

Exit criterion: `tsc` clean, tests green, app boots.

---

## Phase 1 — Repo and commit hygiene (half a day)

The goal is a clean, legible history and one source-of-truth branch, so the rest of the work is not archaeology.

**Branch reality (measured):** `beta` is the truth. It is ahead of `main` by 36 commits, `MMR_system` by 25, `deployment` by 6. `main` is badly stale.

- [ ] **Make `beta` the integration branch and fast-forward `main` to it** (or open a PR beta -> main and merge). Then delete or archive `MMR_system` and `deployment` locally and on origin. Four divergent branches for a solo project is pure confusion.
- [ ] **Stage the uncommitted work in logical commits, not one dump.** The working tree currently mixes several features:
      - Group-join hardening: `src/services/groups.ts` (+186), `src/screens/GroupListScreen.tsx` (+89), `src/screens/JoinGroupScreen.tsx` (+41), `firestore.rules` (+14), `AppNavigator.tsx`, `navigation/types.ts`. -> one commit: `feat(groups): harden join-by-code flow`.
      - The entire onboarding feature (untracked): `src/screens/onboarding/*`, `src/components/onboarding/*`, `src/services/{onboarding,username,analytics}.ts`, `src/hooks/useOnboardingStatus.ts`, `src/navigation/OnboardingNavigator.tsx`, `src/constants/*`. -> one commit: `feat(onboarding): first-run profile + goals flow`.
      - Discard the pure-CRLF "changes" once `.gitattributes` lands (`HealthAutoSync`, `LeaderboardScreen`, `healthSync`, `mmrProjection`, `mmrUpdate` were showing as modified only due to line endings; re-check after Phase 0's real edits).
- [ ] **Adopt a commit-message convention going forward.** Current history has `latest changes`, `dfeployment bugs`, `major commit for prototype`. Switch to conventional commits (`fix:`, `feat:`, `refactor:`). Cheap, pays off immediately.
- [ ] **Confirm `.env` and secrets are gitignored** and that no Firebase admin key is tracked (history shows two "add firebase admin sdk to gitignore" commits, so double-check it is actually out).

Exit criterion: one clean `beta`/`main`, working tree empty, onboarding committed.

---

## Phase 2 — Crash fixes (2-4 days, needs device builds to verify)

These are what actually killed the beta. Both are native crashes, so they cannot be verified in the web preview or Expo Go; they need a dev-client or TestFlight build on a real device.

### 2a. Health-permission crash (`CoreModule.requestAuthorization`)

**Root cause (from the crash log):** `Thread 8: Swift runtime failure: unhandled C++ / Objective-C exception` at `CoreModule.requestAuthorization(toRequest:) + 564 (CoreModule.swift:183)` inside the `@kingstinct/react-native-healthkit` native module. **This is a native trap, so the JS `try/catch` in `requestHealthKitPermissions` (healthKitService.ts:146) can never catch it.** The team already knew this: the code comment at `healthKitService.ts:85-90` explains they removed the Food correlation type because "some iOS versions can throw an Objective-C exception when requesting correlation types... which would crash the app at auth time." That mitigation (the `health sync upates` commit) was never shipped in a new build.

**PROGRESS (2026-07-01, code side done; device verification remains):**

- [x] **De-duplicated the HealthKit plugin config.** `app.json` was registering the plugin with the WRONG keys (`healthSharePermission`/`healthUpdatePermission`, which the v13 plugin ignores) while `app.config.js` re-added it with the correct keys. Removed the `app.json` duplicate so `app.config.js` is the single source. **Verified via `expo config --type introspect`:** the resolved native config now has `com.apple.developer.healthkit: true`, the correct usage strings, and — importantly — **no `com.apple.developer.healthkit.background-delivery` entitlement** (because `app.config.js` passes `background:false`). A stray, unprovisioned background-delivery entitlement is a classic cause of this exact `requestAuthorization` crash, so this alone may fix it.
- [x] **Confirmed the requested types are valid v13 identifiers.** Checked the installed `@kingstinct/react-native-healthkit@13.1.0` types: `'HKWorkoutTypeIdentifier'`, `'HKQuantityTypeIdentifierDietaryEnergyConsumed'`, `'HKQuantityTypeIdentifierBodyMass'` are all valid `toRead` (`ObjectTypeIdentifier`) entries, so the crash is NOT a malformed-identifier issue. The Food-correlation type (a known thrower) was already removed in `healthKitService.ts`.
- [ ] **(DEVICE, you) Verify the HealthKit capability is provisioned.** This is now the leading remaining suspect. The entitlement is in the config, but if the Apple Developer App ID / provisioning profile does not have HealthKit enabled, `requestAuthorization` throws exactly this native exception. Confirm HealthKit is enabled on the App ID at developer.apple.com and that the EAS build's provisioning profile includes it (`eas credentials`).
- [ ] **(DEVICE, you) Ship a fresh build and test the permission prompt.** Build 22 never shipped the Food-correlation fix; with that plus the clean config, the prompt may now succeed. Consider bumping `@kingstinct/react-native-healthkit` (13.1.0 → 13.x latest; 14.x is a major bump, defer) if it still throws.
- [x] **Guard note:** the permission request is already user-initiated (from HealthSettingsScreen), not on the launch path, and `HealthAutoSync` only calls `checkHealthPermissions` (not `requestAuthorization`). So a failure is contained to an explicit button, not startup.

### 2b. Leaderboard crash (Hermes `instanceOfOperator` segfault)

**Root cause (from the crash log):** `Thread 3: EXC_BAD_ACCESS (SIGSEGV)` deep in Hermes: `instanceOfOperator_RJS` -> `Interpreter::interpretFunction` -> `generatorPrototypeNext`. It is a null-deref inside the JS engine during an `async` function resume doing an `instanceof`. The committed `leaderboard crash fix` did **not** resolve it (tester reported the crash the same day, after the commit).

- [ ] **Reproduce with realistic data.** `LeaderboardScreen` subscribes via `subscribeGroupLogs(groupId, setLogs, undefined, 400)` (line 83) and then does a 365-day backward streak walk per user. Populate a group with a few hundred logs and several members and try to trigger it on device. The streak loop is already wrapped in try/catch, so the segfault is likely below JS (engine or Firebase SDK internal `instanceof` on an async path), not in the visible screen logic.
- [x] **Bumped deps — the cheapest high-probability fix (APPLIED 2026-07-01).** Native Hermes `instanceof` segfaults are frequently engine/SDK bugs fixed in point releases.
  - `firebase` 12.8.0 → **12.15.0** applied (Firestore does heavy internal `instanceof` on async paths — most directly relevant to the crash).
  - `npx expo install --fix` applied: `expo` 54.0.31→54.0.35, `expo-notifications` 0.29→**0.32.17**, `expo-updates` 29.0.16→29.0.18, plus related patches. `expo install --check` now reports "Dependencies are up to date."
  - The `expo-notifications` 0.32 jump changed `NotificationBehavior` (`shouldShowAlert` → `shouldShowBanner` + `shouldShowList`); handler updated.
  - **Verified at JS level:** `tsc --noEmit` clean (0 errors), 25/25 tests pass. **Native effect on the crash is NOT yet verified** — that needs an EAS build + on-device leaderboard testing (yours).
- [ ] **Reduce and defensively shape the data.** Drop the 400-log live subscription in favor of reading pre-aggregated public rank fields (see Phase 5's `publicUsers` mirror) so the leaderboard does not need to stream raw logs at all. Sorting members by `mmrPublic` needs no log stream; the streak number can come from a stored per-user value rather than a client recompute. This removes the entire async/data path implicated in the crash.
- [ ] If still reproducible after the above, isolate by temporarily rendering the list without `RankBadge` (it loads tier PNGs via `require`) to rule the image component in or out.

Exit criterion: a build survives repeated leaderboard opens and health-permission prompts on at least two device models.

---

## Phase 3 — MMR correctness and economy (2-3 days)

The `src/mmr/` engine (constants, difficulty, scoring, ranks, time, risk, badges) is pure, dependency-free, spec-faithful, and well-tested. The problems are all in the service orchestration layer (`mmrUpdate.ts`) and are a mix of the compile blocker, an idempotency race, and test scaffolding that was never removed.

**Must-fix correctness:**

- [ ] **`isCurrentWeek`** — already handled in Phase 0, listed here for completeness since it lives in this subsystem.
- [ ] **Make the weight-goal completion bonus idempotent and race-safe.** Today `weightBonus` (mmrUpdate.ts:374-376, 393-396) is computed **outside** the transaction from a non-transactional read of `weightGoal.completionBonusAwarded`, and the goal doc is written with a blind merge and no `tx.get` precondition. Two overlapping runs (the ProfileScreen mount effect at ~line 120 and the pull-to-refresh at ~line 337 can both fire) can each see `awarded == false` and **both award +300*D_base**. Fix: move the check inside the transaction with a `tx.get` on the goal doc, and gate the bonus on a per-week `bonusAwarded` flag stored in the weekly doc.
- [ ] **Fix calorie-day counting.** `countCalorieDaysHitFromTotals` (mmrUpdate.ts:138-144) ignores its `dailyCalorieGoal` argument and counts any day with *any* calories logged as a "hit," and it overrides the stricter doc-based count when larger (303-306). This inflates adherence, `A_total`, streaks, and MMR. Make it compare against the actual target.

**Economy / tuning (these silently break the design the doc so carefully specified):**

- [ ] **Remove the "5 shields for testing" defaults.** `tierShieldWeeksRemaining` defaults to 5 in five places (`mmrUpdate.ts:451`, `mmrSeason.ts:181`, `mmrProjection.ts:239/307`, `mmrState.ts:38`), with a carve-out at `mmrUpdate.ts:514` preserving manually-set high shields. The spec says 2, granted only on tier promotion. As-is, demotion is nearly impossible and the whole hysteresis/demotion system is neutered. Revert to the spec's 2.
- [ ] **Reconsider `lowerTierBonus`.** At `mmrUpdate.ts:481-494` any completed week (A_total >= 0.70) in Iron-Gold adds a full division-width (200-250 MMR), guaranteeing ~1 division/week **regardless of goal difficulty**. This bypasses the entire `D`/`WeekScore` curve below Platinum: an easy 1-workout goal climbs identically to a hard cut. It is both an exploit surface and a contradiction of the core design. Replace with a small flat encouragement bonus (e.g. +50) or a `deltaMMR` floor that preserves the difficulty signal.

**Structural (high leverage, also unblocks Phase 5):**

- [ ] **Extract one pure `computeWeeklyDelta(inputs) -> result`.** Right now `mmrUpdate.ts` fuses I/O gathering, scoring decisions, and the transactional write in one ~470-line function, and `mmrProjection.ts` re-implements ~150 lines of the same scoring, which has **already drifted** (projection has no completion bonus and lacks the `isCurrentWeek` guard). Pull the scoring decisions into a single pure function that both the projection and the authoritative update call. This kills the duplication, guarantees projection == actual, and is the exact seam the Cloud Function needs in Phase 5.

**Missing spec features (nice-to-have, after the above):**

- [ ] Implement the **Endgame Crusher** badge (final 10% of a cut on time). The `p` progress value it needs is already computed in `D_weightLoss`. It is the marquee thematic badge and it is absent.
- [ ] Implement **Consistency** badges (8+/12+ completed weeks in a season).
- [ ] Confirm the **demotion-risk banner** (`risk.ts` is solid) and a **season countdown** are actually surfaced on Home/Profile per design section 18.

---

## Phase 4 — God-screen refactor (3-5 days)

Four screens carry most of the complexity: `GroupDetailScreen` (1,115), `ProgressScreen` (826), `ProfileScreen` (581), `HealthSettingsScreen` (581). The codebase **already has the right pattern**, it is just under-applied: services (`subscribeX`), a pure viewmodel layer (`viewmodels/memberSummary.ts`), stateful hooks (`hooks/useOnboardingStatus.ts`), and presentational components (`components/profile/*`). `ProfileScreen` is the closest to correct and is the reference shape. The target for each screen: guards -> one `use...Data()` hook -> pure viewmodel call(s) -> JSX composed of extracted cards.

**Do the cross-cutting wins first (low risk, shrinks all four):**

- [ ] **Consolidate date helpers into `utils/dates.ts`.** `weekStartMondayLocal`, `parseYYYYMMDDLocal`, `formatYYYYMMDD`/`todayYYYYMMDD`, `toMillis`, `weekdayShort` are redefined in three screens. Removes ~60 duplicated lines and a class of drift bugs.
- [ ] **Create `components/ui/PillSegmentedButtons.tsx`.** The ~65-line pill-styled `SegmentedButtons` config is verbatim in GroupDetail (844-920) and Progress (549-619).
- [ ] **Adopt the existing `components/ui/Avatar.tsx`** in GroupDetail (deletes the inline `UserAvatar` + `RecentAvatar`, 63 lines) and ProfileScreen's header.

**Then per screen (each: extract a `hooks/use...Data.ts` for subscriptions + a `viewmodels/*.ts` for math + presentational cards). Fix the latent bugs found along the way:**

- [ ] **ProfileScreen (do first, smallest, and it has a real bug):** hooks (`prevWeekStreakRef`, `circleAnim`, the pulse `useEffect`) are declared at lines 312-327 **after** the `if (!user) return` at 294. That is a conditional-hooks violation that can crash on auth toggle. Hoist them above the guard. Then extract `useProfileData`, `useMmrAutoCatchUp` (removes the duplicated MMR-refresh chain at 112-133 vs 333-345), `viewmodels/profileWeek.ts`, and `ProfileHeaderCard`/`StatsGrid`. Also move `weekWorkoutDays`/`weekMinutes` out of the derived-data-in-state effect (181-209) into memos.
- [ ] **GroupDetailScreen (worst offender):** 8+ Firestore subscriptions plus an N-per-member MMR fan-out. The `>15` member guard `return`s from inside a `setTimeout` (161-164) **without cleaning up partial subscriptions** — a leak and a silently-dropped feature. Replace the fan-out with a single batched `useMemberMmrStates(uids)` hook. Extract `useGroupDetailData`, `viewmodels/groupDetail.ts` (rollup, streak, today-summary, team sort), and cards: `GroupHeaderCard`, `GroupSwitcher` (shared with Progress), `TodaySection`, `RecentActivityCard`, `MembersListCard`. Also move the per-swipe dynamic `import('../services/logs')` (986) to a top-level import. Target: ~150 lines.
- [ ] **ProgressScreen:** extract `useGroupProgressData` and `viewmodels/groupProgress.ts` (the two big aggregation memos: `weeklyMetrics` ~100 lines and `aggregates` ~75 lines, plus the JSX-embedded IIFEs at 524-538 and 650-693). Cards: `WeeklyMetricsCard`, `WeeklyInsightCard`, `TrendChartCard`, `HistoryCard`, `PhotoStripCard`.
- [ ] **HealthSettingsScreen:** extract `useHealthSettings` + `useHealthSync` (the ~100-line `handleSync`), move diagnostics string-shaping into `services/health/syncDiagnostics.ts`, and collapse the 3 copy-pasted toggle rows into one `HealthToggleRow`. Fix `platformName` being referenced in a closure textually above its declaration (used at 107, declared at 295).

Every extracted viewmodel is pure and should get a unit test (Phase 6).

---

## Phase 5 — Scaling and integrity (Milestone B, 4-6 days)

Do not open beyond trusted friends until this is done. Today the leaderboard is fully spoofable and the rules have a few abuse vectors.

- [ ] **Move MMR computation server-side (Cloud Functions).** This is the anti-cheat fix the design doc itself calls for. Because `src/mmr/` is pure, it ports into a Node Function **unchanged** — that is the hard part of any scoring migration and it is already done. The work is: (1) the pure `computeWeeklyDelta` extraction from Phase 3, (2) reimplementing the I/O shell with `firebase-admin` instead of the Web SDK (~200 mechanical lines), (3) a callable/triggered Function that owns the write. Estimated ~3-5 days, most of it in the rules inversion below, not the math.
- [ ] **Lock the security rules to server-only for authoritative fields.** Today `users/{uid}` and `publicUsers/{uid}` are fully client-writable (`allow write: if request.auth.uid == uid`), so any user can set their own `mmrPublic`/`rankTierPublic` to anything and the leaderboard believes it. After the Function owns MMR, restrict `mmr`, `rankTier`, `lp/mp`, `weekly/*`, and the `publicUsers` mirror to Function/admin writes only. This will break every current optimistic client write path, which is the real cost of the migration.
- [ ] **Close the smaller rule holes now (cheap, do even before the Function):**
      - `globalSeasons/{id}` allows `create` by any signed-in user (griefable). Restrict to admin or a known writer.
      - `groups/{id}` `update` is allowed for **any** signed-in user via the `isGroupMetaUpdate()` branch (not just members), so anyone can bump `memberCount`/`lastActivityAt` on any group. Tighten to members, or move counters to a Function.
- [ ] **Rework the visibility index.** `publicUsers` reads require a client-maintained `visibility/{me}/canSee/{them}` doc. This is O(n^2) writes per group and fragile enough that the README lists "permission denied, sign out/in" as a known pitfall. Replace with either a group-membership-based rule check or a Function that maintains the index authoritatively on join/leave.
- [ ] **Replace the `limit(800)` / `limit(400)` client windows with pagination or aggregates.** `getWeekWorkoutTotals` and friends pull up to 800 group logs per group and filter client-side (mmrUpdate.ts:87,120,437); the leaderboard streams 400. In an active group a user's week can fall out of the window and silently under-count. Move weekly aggregation server-side and store per-user weekly rollups.

---

## Phase 6 — Tests, CI, and relaunch (ongoing, ~1-2 days of setup)

- [ ] **Backfill tests for the risky logic that has none:** the transactional weekly update (especially idempotency and the bonus race), season rollover, `mmrProjection` parity with the authoritative path, and each new viewmodel from Phase 4. The pure `computeWeeklyDelta` is trivially unit-testable and should get a thorough table of cases.
- [ ] **Add the Firestore rules test harness.** `testing/README.md` already notes `firebase emulators:exec` as an option. Add it so the Phase 5 rule lockdown is verified, not hoped.
- [ ] **Wire CI (GitHub Actions):** `tsc --noEmit` + `npm run test:ci` on every push to `beta`/`main`. The repo builds via EAS already (`eas.json` has development/preview/production profiles); add a manual EAS build trigger.
- [ ] **Relaunch checklist for Milestone A:** fresh build number, health-sync crash confirmed fixed on device, leaderboard confirmed stable, onboarding flows on first run, ladder moves correctly across a real week. Ship to TestFlight, watch the `logs/` feedback the same way you did before (the in-app IssuesScreen + TestFlight feedback loop is a genuine asset — keep using it).

---

## Effort summary

| Phase | Milestone | Rough effort |
|---|---|---|
| 0. Unbreak the build | A | 0.5 day |
| 1. Repo/commit hygiene | A | 0.5 day |
| 2. Crash fixes | A | 2-4 days (device builds) |
| 3. MMR correctness/economy | A | 2-3 days |
| 4. God-screen refactor | A | 3-5 days |
| 5. Scaling/integrity | B | 4-6 days |
| 6. Tests/CI | both | 1-2 days setup, ongoing |

**Milestone A (relaunch to friends): roughly 1.5-2.5 focused weeks.** Milestone B adds about another week. The single most important hour is Phase 0: one variable declaration turns this from "non-compiling" back into "working app."

## The critical path, in order

1. Declare `isCurrentWeek`, get `tsc` and tests green (Phase 0).
2. Commit the onboarding flow and group-join work; collapse the branches (Phase 1).
3. Cut a fresh build and confirm whether the already-written health/leaderboard fixes hold; finish whichever still crashes (Phase 2).
4. Remove the test-scaffolding shields and the `lowerTierBonus`, fix the bonus race and calorie counting (Phase 3).
5. Ship Milestone A to TestFlight.
6. Then, and only before going wider, move MMR to a Cloud Function and lock the rules (Phase 5).
