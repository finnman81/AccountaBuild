# AccountaBuild — Information Architecture & HCI Audit (July 2026)

User's felt symptoms: "confusing, layered, awkward"; group settings feels embedded/weird; chat feels buried. This audit explains why, structurally, and proposes the fix.

## Current structure

```
Tabs: Today | Progress | [+ Log] | Groups | Profile
├─ Today stack: Today → GroupDetail (LEGACY HUB) → {Leaderboard, GroupCharts, GroupChat, ViewPhotos, Issues, SetGoals, GroupSettings}
├─ Groups stack: GroupList → {CreateGroup, JoinGroup}
└─ Profile stack: Profile → {Settings, SeasonHistory, MMRHistory, Notifications, HealthSettings}
Root modals: LogComposer, MemberDetail, RankUp, EditProfile, MMRGoals, LogToday(legacy), Add*(legacy editors)
```

## Root causes of the "layered/awkward" feeling

1. **GroupDetail is a second home screen.** The 1121-line legacy hub predates the redesign. It duplicates Today's content (member statuses, recent activity) and is the ONLY gateway to chat/charts/photos/settings. The redesign built Today as the home, but never retired the hub — so the app has two competing "centers," and everything social hides behind the old one.
2. **Chat is 3 taps deep.** Today → group chip → GroupDetail → Chat. For a group-accountability app, chat is a core loop and has zero surface presence. (Design mock 10 treats chat as one tap from Today.)
3. **The group chip lies.** Design 04 says the Today group chip = group SWITCHER. It currently navigates to the GroupDetail hub — the single biggest source of "where am I?"
4. **Ownership conflicts (same concept, multiple owners):**
   - Group management: Groups tab AND GroupDetail hub both claim it.
   - Goals: MMRGoals (personal, now consolidated) AND SetGoals (group-scoped, inside hub) — two goal surfaces again after we just unified goals.
   - Logging: LogComposer (new) AND LogToday + Add* screens (legacy) both still routed.
5. **Screen-level fidelity gaps:** GroupSettings is one long embedded form (logo picker + streak rule + rename + delete stacked) instead of the grouped-rows pattern Settings uses; GroupChat inherits an old stack header (mock has a custom header with member count + pinned bar flush beneath).

## Target structure (aligns with the design spec — no new invention)

```
Tabs: Today | Progress | [+ Log] | Groups | Profile

Today (home, single center)
├─ header: group chip → GROUP SWITCHER SHEET (list groups + "Manage groups")
├─ header: 💬 chat icon (1 tap → GroupChat) + 🔔 bell
├─ Team rail → MemberDetail sheet (done)
└─ Leaderboard preview → Leaderboard (podium)

Groups tab (owns ALL group management)
├─ GroupList → tap group = make it active + go Today (current)
├─ per-group "⋯/info" → GroupInfo (slim): members, invite code, chat btn,
│    charts, photos, and ⚙ Group settings (ONE path in)
└─ Create / Join

Profile tab (owns everything personal) — unchanged, already clean.

RETIRE: GroupDetail hub (absorb: members→GroupInfo, activity→chat log-cards),
        SetGoals (fold anything unique into MMRGoals or GroupSettings),
        LogToday + Add* as reachable destinations (composer owns logging;
        keep Add* only as edit-modals launched from log rows until composer
        supports editing).
```

**Rules that keep it un-confusing:**
- One owner per concept: Today=today, Groups=group mgmt, Profile=me, FAB=logging.
- Nothing important >2 taps deep. Chat = 1 tap. Group settings = Groups → group → gear.
- Hubs are forbidden; sheets/modals for quick tasks (switcher, member detail), pushes for destinations.

## Fidelity fixes riding along
- GroupSettings → grouped-rows layout (Identity: name/logo · Rules: streak rule · Danger: delete) matching SettingsScreen.
- GroupChat → custom header (name + "N members", back, overflow) with pinned status bar flush beneath; kill the native title bar.
- GroupCharts/ViewPhotos/Issues get reachable homes inside GroupInfo (charts may later merge into Progress).

## Personal side (Profile + Settings) — same disease, less obvious
Profile "Settings & Controls" list (Settings·Edit profile·Goals·Season history·MMR history·Notifications·Health·Units) DUPLICATES the Settings screen and creates multiple owners:
- **Edit profile reachable 3×** (Profile list + Settings→Account + avatar pencil).
- **TWO different Notifications screens**: Profile→NotificationsScreen (reminder count/times scheduler) vs Settings→Notifications (toggles streak/team/nudges/chat). Disconnected, overlapping.
- **Health reachable 2×** (Profile "Health & Fitness" + Settings "Apple Health sync") — both → HealthSettings.
- **"Units" is a DEAD link** 🐛 — navigates EditProfile?focusField=units, but EditProfile went identity-only (no units field) → goes nowhere useful. FIX or remove.
- Profile's fat list re-implements Settings. Design mock 07 = a SHORT Profile list (Season history / Notifications / Health sync) + gear → full Settings.

Fix: Profile bottom list shrinks to the design's short set (or collapses into gear→Settings); Settings becomes the single home for toggles/account/health/sign-out; the reminder-scheduler screen becomes reachable FROM the Settings "Streak reminder" toggle, not a separate entry; delete the dead Units link.

## Execution order (each shippable alone)
1. Group switcher sheet + chat icon on Today header (kills 90% of the felt confusion; chip stops navigating to the hub).
2. GroupInfo slim screen in the Groups stack + GroupSettings restyle; move charts/photos/issues links there.
3. Retire GroupDetail route (redirect → Today), delete after a release of soak.
4. De-route LogToday/Add* from primary nav; SetGoals fold-in.
```
