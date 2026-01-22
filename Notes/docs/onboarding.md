# AccountaBuild — ReciMe-Style Onboarding (Customizable 5-Screen Flow)

This spec is tailored to AccountaBuild’s current architecture:
- Expo React Native + React Navigation
- react-native-paper
- Firebase Auth + Firestore
- `AuthContext` provides `user?.uid`
- User docs live at `users/{uid}`
- Global MMR system is already part of the app

---

## 0) Locked decisions (from Jake)

### Activation event
- Activation = “Set goals + lands on Dashboard”

### Finish destination
- Finish should route to the Profile screen (inside MainTabs)

### Skip behavior
- No skip
- Exactly 5 screens

### Persistence + resume behavior
- Save after each screen
- If user drops mid-onboarding:
  - Restart onboarding on next open (show Screen 1 again)
  - (Optional: prefill saved values, but do not “resume” at the last step)

### Groups / social
- Groups optional but strongly encouraged
- Group onboarding not included in this first 5-screen flow
- Users can be in multiple groups
- MMR is global (not per-group)

### Analytics
- Firebase Analytics

### Style / interaction
- Dark mode
- Top progress bar + back arrow on every screen
- Large tap targets
- Dynamic type support
- Haptics on selection/continue
- Require network (no offline support)

---

## 1) Best-practice architecture for your codebase

### Navigation gating (AppNavigator.tsx)
Current logic:
- `user ? <MainTabs /> : <AuthScreens />`

New best-practice logic:
- If no user: AuthScreens
- If user and onboarding not completed: OnboardingStack
- Else: MainTabs

This keeps onboarding isolated and avoids mixing onboarding screens into your main stack.

### Where onboarding state lives
Add `onboarding` metadata under `users/{uid}`.
Actual profile fields remain in the existing user doc (single source of truth).

---

## 2) Firestore schema updates

### Add to `users/{uid}`
```ts
onboarding: {
  version: number;           // hidden
  completed: boolean;        // gate flag
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  lastStep?: number;         // 1..5 (optional tracking only)
}
Profile fields (already exist in your doc shape)
Used by onboarding Screen 2 + 4:

displayName (required)

age (required)

height (required)

weightCurrent (optional)

weightGoal (required)

weightTargetDate (recommended required)

dailyCalorieGoal (required)

workoutsPerWeek (required)

logCaloriesDaysPerWeek (optional)

logWeightDaysPerWeek (optional)

New fields you want to collect (not currently listed)
Add these to users/{uid}:

username: string;                 // required, unique
sex: "male" | "female" | "other"; // required (your wording: sex)
units: "imperial" | "metric";     // recommended (you requested units)
goalMode: "cut" | "bulk";         // store cut/bulk selection
3) Restart behavior (your requirement)
When app opens and user is authenticated:

If onboarding.completed === true: go to MainTabs

Else: always show Onboarding Screen 1 (Welcome)

Optional UX improvement (still counts as restart):

Prefill form inputs with previously saved values

Do not auto-advance to the last step

4) Screen-by-screen spec (5 screens)
Global UI rules (all screens)
Dark mode theme

Header: back arrow + progress bar

Primary CTA at bottom

Haptics:

light impact on option select

medium impact on Continue

Screen 1 — Welcome / Overview
Type: Welcome / Value prop
Progress: 20%

Headline:

“Welcome to AccountaBuild”

Subtext:

“Set goals, stay accountable, and turn consistency into progress.”

Content:

2–3 bullet cards:

“Set goals that guide your week”

“Log calories, workouts, and weight in seconds”

“Stay consistent with accountability and MMR”

Collects:

None

Required:

Yes

CTA:

“Get started”

Back behavior:

No back (or back exits to previous app state)

Save on continue:

users/{uid}.onboarding.startedAt if missing

users/{uid}.onboarding.lastStep = 1

Analytics: onboarding_screen_view, onboarding_continue

Screen 2 — Basic Info
Type: Input form + selection cards
Progress: 40%

Headline:

“Basic info”

Subtext:

“This helps set realistic targets.”

Collects (required):

Display name (displayName)

Username (username) — must be unique

Sex (sex) — male/female/other

Age (age)

Height (height)

Units (units) — imperial/metric (recommended to show first because it affects height/weight inputs)

Collects (optional):

Current weight (weightCurrent)

Validation:

displayName: 2–32 chars

username: 3–20 chars, letters/numbers/underscore only

username uniqueness: required (Firestore transaction)

age: 13–99

height:

imperial: 4'0"–7'6"

metric: 120–230 cm

weightCurrent (if provided):

imperial: 80–450 lbs

metric: 35–205 kg

CTA:

“Continue”

Back:

Yes

Save on continue:

Write fields to users/{uid}

Reserve username in usernames/{normalizedUsername} (transaction)

users/{uid}.onboarding.lastStep = 2

Analytics: onboarding_basic_info_saved

Screen 3 — Accountability “Research-backed” Transition Screen
Type: Transition / value screen
Progress: 60%

Headline:

“Accountability changes outcomes”

Subtext:

“A simple system makes consistency easier.”

Content:

A single “stat card” and short explanation text

IMPORTANT: the stat text should be configurable from a constants file (so you can update later when you choose the exact research)

Example placeholder (no hard % yet):

“People who track behaviors consistently are more likely to stick to their goals.”

Optional: subtle animation (progress line or MMR badge glow)

Collects:

None

CTA:

“Continue”

Back:

Yes

Save on continue:

users/{uid}.onboarding.lastStep = 3

Analytics: onboarding_transition_viewed

Screen 4 — Goals
Type: Single select + numeric inputs + chips/cards
Progress: 80%

Headline:

“Set your goals”

Subtext:

“These power your dashboard.”

Collects (required):

Goal mode: cut/bulk (goalMode)

Daily calorie goal (dailyCalorieGoal)

Workouts per week (workoutsPerWeek)

Weight goal (weightGoal)

Target date (weightTargetDate) — recommended required because your schema supports it and it enables timeline goals

Collects (optional but recommended):

Log calories days/week (logCaloriesDaysPerWeek)

Log weight days/week (logWeightDaysPerWeek)

Validation:

dailyCalorieGoal:

cut: 1200–3500

bulk: 1800–4500

workoutsPerWeek: 1–7

weightGoal: same sanity range as weightCurrent

weightTargetDate:

min: today + 7 days

max: today + 365 days

UI suggestions:

Cut/Bulk: two large cards

Calories: numeric input + helper copy

Workouts/week: segmented 1–7 or slider

Weight goal: numeric input

Target date: date picker

Logging frequency: chip selectors

CTA:

“Continue”

Back:

Yes

Save on continue:

Write goal fields to users/{uid}

users/{uid}.onboarding.lastStep = 4

Analytics: onboarding_goals_saved

Screen 5 — Let’s Get Started (Finish)
Type: Confirmation / finish
Progress: 100%

Headline:

“You’re set.”

Subtext:

“Let’s start building consistency.”

Content:

Summary preview (read-only):

Mode (cut/bulk)

Calories/day

Workouts/week

Weight goal + target date

CTA:

“Go to Profile”

Back:

Yes (optional)

Save on CTA:

users/{uid}.onboarding.completed = true

users/{uid}.onboarding.completedAt = serverTimestamp()

users/{uid}.onboarding.version = <CURRENT_VERSION>

Analytics: onboarding_completed

Navigate to MainTabs → Profile screen

5) Username uniqueness (Firestore)
Recommended uniqueness pattern:

Collection: usernames/{normalizedUsername}

Document data: { uid, createdAt }

Reservation flow (transaction):

Normalize: lowercase + trim

If usernames/{name} exists → fail

Else create it with { uid, createdAt }

Update users/{uid}.username = name

This guarantees uniqueness at scale.

6) Analytics events (Firebase Analytics)
Minimum funnel events:

onboarding_screen_view { stepNumber, screenName, version }

onboarding_continue { fromStep, toStep }

onboarding_basic_info_saved

onboarding_goals_saved

onboarding_completed

Optional:

onboarding_username_conflict

onboarding_validation_error { field }

7) Implementation checklist (what Cursor should build)
Create:

src/navigation/OnboardingNavigator.tsx

src/screens/onboarding/

OnboardingWelcomeScreen.tsx

OnboardingBasicInfoScreen.tsx

OnboardingAccountabilityScreen.tsx

OnboardingGoalsScreen.tsx

OnboardingFinishScreen.tsx

src/components/onboarding/OnboardingHeader.tsx

src/services/onboarding.ts

src/services/username.ts

src/constants/onboardingCopy.ts (for the Screen 3 stat text)

Modify:

src/navigation/AppNavigator.tsx to gate onboarding between Auth and MainTabs

Add a hook or helper to read onboarding completion from users/{uid}

Done criteria:

New users are forced through 5 screens

Data is written after each screen

App restarts onboarding from Screen 1 if not completed

On completion, user is routed to Profile

Username uniqueness enforced

Firebase Analytics events emitted

