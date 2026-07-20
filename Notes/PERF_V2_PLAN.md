# Performance v2 Plan (drafted 2026-07-21 — investigation only, nothing implemented)

Jake's report: "still a bit laggy / buggy when loading between screens." Screenshots pending.
This plan is grounded in a codebase audit + a light look at how comparable apps handle the same problems.

## What the audit found (measured, not guessed)

| Finding | Evidence | Why it causes the lag Jake feels |
|---|---|---|
| **No Firestore disk cache** | `getFirestore()` plain init; JS SDK persistent cache is unsupported in RN | Every cold start and every first visit to a screen fetches ALL data over the network before anything paints. This is the single biggest cause of blank/slow screens. |
| **56 `onSnapshot` call sites, per-screen** | grep count; mmrProjection alone opens 8 listeners, and it's subscribed independently by FpGainOverlay, Profile, and the trajectory card | Screens duplicate live queries instead of sharing them; navigating re-runs queries that another screen already has open. Also the known tech-debt item: projection needs a singleton. |
| **38 screens on `ScrollView`, 3 files use `FlatList`** | grep count | Chat, leaderboard, history render every row at once — mount cost scales with data, felt as transition jank. |
| **Avatars use plain RN `Image`** | Avatar.tsx; `expo-image` not installed | No disk cache — profile photos re-download and pop in repeatedly. |
| **77 `console.log` calls in prod bundle** | grep count | Minor but free to fix (babel strip in release). |
| **Tabs never freeze** | no `freezeOnBlur` in TabsNavigator | Background tabs keep re-rendering on every subscription tick (every log any member writes re-renders 4+ mounted screens). |
| Healthy already | Hermes + new arch enabled, native-stack navigation, uid+date indexed queries | The foundations are fine; this is a data-layer and render-layer problem, not an architecture rewrite. |

## How comparable apps (Strava/MyFitnessPal-class) handle this

1. **Cache-then-network everywhere**: paint the last-known data instantly from local storage, refresh silently behind. Never show a blank screen for data you've shown before.
2. **Native Firebase SDKs** on RN (react-native-firebase) rather than the JS SDK — disk persistence for free, faster queries, listeners survive offline.
3. **One shared data layer**, not per-screen queries: screens subscribe to an in-memory store; the store owns the (deduped) network listeners.
4. **Virtualized lists + cached images** as table stakes.

## The plan — 4 phases, ordered by lag-relief per effort

### Phase 0 — Measure first (cheap, do before anything)
- Jake's screenshots → name the 3 worst screens/transitions.
- Sentry ships in the 7/22 build anyway: enable **performance tracing** (`tracesSampleRate` small, e.g. 0.2) so we get real cold-start and navigation timings from the group's actual devices, not just Jake's.
- Success metric: define target (e.g. cold start → Today interactive < 2s on cached data; tab switch < 200ms).

### Phase 1 — Data layer (biggest win; mostly OTA-able)
1. **App-level hydration cache** (OTA): tiny wrapper that mirrors key snapshots (group doc, members, publicUsers, my weekly docs, week deltas) into AsyncStorage and hydrates screens instantly on mount while live listeners refresh behind. This is the cache-then-network pattern WITHOUT migrating SDKs — ~a day of work, transforms perceived speed.
2. **Shared subscription store** (OTA): move the ~10 hottest listeners (group logs, members, publicUsers, canSee, my user doc, projection) into a module-level store with ref-counting; screens read from it. Kills duplicate listeners and the projection multi-subscribe tech-debt item in one move.
3. **Decision point — Firestore persistence for real.** Options:
   - **A. Migrate to `react-native-firebase`** (native SDK): disk persistence, faster everything; it's how serious RN Firebase apps ship. Cost: a build, a mechanical-but-wide import migration (~all services), config plugins. Recommended eventually, but NOT bundled into the first perf build — too much risk at once.
   - **B. IndexedDB polyfill** (`expo-firestore-offline-persistence`): quick but community-maintained/stale — NOT recommended for a live group.
   - **C. Skip**: if Phase 1.1's hydration cache kills the perceived lag, native migration can wait. Likely outcome.

### Phase 2 — Render layer (OTA except expo-image)
- Convert the 3 heaviest lists to `FlatList` (chat, leaderboard, history calendar day list) with memoized rows.
- `freezeOnBlur` on tabs (react-freeze already in the tree via react-native-screens).
- **`expo-image` for avatars** (needs the build — ride it with Sentry on 7/22): disk-cached, no more photo pop-in.
- Strip `console.log` in release via `babel-plugin-transform-remove-console`.

### Phase 3 — Startup path (OTA)
- Defer non-critical mounts (WhatsNewModal fetch, UpdateBanner probe, health sync kick) behind `InteractionManager.runAfterInteractions`.
- Launch order: hydrate-from-cache paint → auth → live listeners → background chores.
- Keep the calm greeting frame, but with cached data it should flash past.

### Phase 4 — The native build (7/22+)
Ride ONE build: Sentry (+ perf tracing) + `expo-image` (+ `react-native-firebase` only if Phase 1 decision says so). Everything else in this plan is OTA.

## Explicit non-goals
- No navigation-library change, no state-management framework adoption, no rewrite. The stack is right; the data flow is wasteful.
- No optimizing dormant screens nobody visits (per the avoid-overcomplication rule).

## Sources
- [Firestore persistence FR for Expo/RN (firebase-js-sdk #7947)](https://github.com/firebase/firebase-js-sdk/issues/7947)
- [Firestore offline persistence not working on RN (#436)](https://github.com/firebase/firebase-js-sdk/issues/436)
- [expo-firestore-offline-persistence (polyfill)](https://github.com/nandorojo/expo-firestore-offline-persistence)
- [Expo Firebase guide (JS SDK vs react-native-firebase)](https://docs.expo.dev/guides/using-firebase/)
