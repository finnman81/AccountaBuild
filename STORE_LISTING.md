# App Store Listing — AccountaBuild

Draft metadata for App Store Connect, version 1.0 public release.
Character limits are Apple's; counts noted where tight.
Register: rugged, plain, no em dashes, no "crew" (matches the 2026-08-11
onboarding rewrite).

---

## Name (30 chars max)

**AccountaBuild** (13 ✓)

## Subtitle (30 chars max)

**Group fitness accountability** (28 ✓)

Alternatives, all fit:
- "Nobody left behind" (18) — brand line, weaker for search
- "Train together. Stay honest." (28)

## Category

- Primary: **Health & Fitness**
- Secondary: **Social Networking**

## Promotional Text (170 chars, editable without review)

> Your group sees every workout, every streak, every rank-up. Log it, earn
> Fitness Points, and climb from Iron to Challenger. Nobody left behind. (143 ✓)

## Description (4,000 chars max)

> **The workout app that makes quitting embarrassing.**
>
> AccountaBuild is fitness accountability with the people you actually know.
> Join a small group: your friends, your gym buddies, your family. Every
> workout, weigh-in, and logged meal shows up for all of them. No followers,
> no influencers, no strangers. Just your people, watching you show up.
>
> **EARN FITNESS POINTS. CLIMB THE RANKS.**
> Every log earns Fitness Points, scored against goals you set yourself.
> Tougher goals are worth more. Climb a competitive ladder from Iron to
> Challenger, division by division, exactly like a ranked game. Miss a week
> and you slip. Your group will notice. That's the point.
>
> **A WEEKLY RACE THAT RESETS EVERY MONDAY.**
> The leaderboard isn't about who joined first. Everyone re-enters at zero
> each week. Streaks build multipliers. Hit checkpoints on your weight goal
> and bank points along the way, not just at the finish line.
>
> **SIGN YOUR WEEK.**
> Every Monday, hold to sign. A small ritual that tells your group you're in
> this week. Everyone sees who signed. Everyone sees who didn't.
>
> **CHEER. NUDGE. CELEBRATE.**
> Send hype when a teammate logs. Nudge them when they haven't. When someone
> hits their goal weight or jumps a rank tier, the whole group celebrates,
> automatically.
>
> **SYNCS WHILE YOUR PHONE IS IN YOUR POCKET.**
> Connect Apple Health and workouts appear on their own. Finish a session on
> your watch and your group sees it minutes later, before you've touched the
> app. Manual logging takes seconds when you'd rather type it.
>
> **YOUR WEIGHT STAYS PRIVATE.**
> Teammates see your workouts, streaks, points, and progress. Never your
> body weight. Health data is never sold, never used for ads, never shared.
>
> **BUILT FOR SMALL, REAL GROUPS.**
> • Group chat with your group's logs woven into the feed
> • Weekly report every Monday: what you earned and why
> • "See the math": every point is explainable, no black box
> • Badges for streaks, comebacks, goals crushed, and marathon weeks
> • Progress dashboards: you vs your group, week by week
>
> Nobody left behind. Sign your week. Show up.

## Keywords (100 chars max, comma-separated, no spaces after commas)

`fitness,accountability,workout,group,friends,streak,habit,weight,tracker,gym,challenge,leaderboard` (99 ✓)

(Don't waste characters on "app", "free", "health" — Apple indexes name/subtitle already; "health" is in the category.)

## What's New (first release)

> Welcome to AccountaBuild 1.0. Group fitness accountability with Fitness
> Points, weekly races, streaks, and celebrations. Grab your people and sign
> your first week.

## Age Rating questionnaire

Answer **None/No** to everything (violence, medical/treatment info, gambling,
etc.) EXCEPT:
- **Unrestricted Web Access: No**
- If asked about user-generated content / social features: answer honestly
  (yes, chat/photos) — we qualify for the standard UGC allowances because all
  four required controls exist: report content, block users, zero-tolerance
  terms, and a support contact.

## App Review Information (the notes field)

> AccountaBuild is a group fitness accountability app. Accounts are required
> (all content is group-scoped).
>
> DEMO ACCOUNT:
>   email:    demo.reviewer@munitor.ai
>   password: Crew-Demo-2026!
> The demo account is a member of an active group ("Morning Grind", 4 members)
> with three weeks of workouts, weigh-ins, chat, a live leaderboard, and rank
> history, so all social features are visible immediately after sign-in.
>
> Health data: HealthKit is read-only and optional (Settings → Health). The
> app functions fully without granting it.
> Account deletion: Settings → Delete account.
> Moderation: long-press any message, log, or photo to report or block;
> Settings → Blocked users to manage.

**Demo account: DONE (2026-08-10).** Built by `scripts/_seed-demo-group.js`
(re-runnable; deterministic seed). Group `demo-review-crew` is fully isolated:
demo members belong to no other group and carry no push tokens, so nothing it
does can ever notify a real user. Ranks/FP/badges were produced by the real
scorer over 3 weeks of seeded logs — re-run the script any time the data needs
refreshing before a future review. (Group display name "Morning Grind",
renamed from "Morning Crew" 2026-08-11.)

## Screenshots — shot list (6.9" required; 6.7" reuses)

Order sells the story: social proof first, mechanics second.

1. **Today screen, full group** — rail of avatars with streaks, "This week's
   race" card. Caption: *"Your group sees you show up"*
2. **Leaderboard, weekly race** — podium view. Caption: *"Everyone starts at
   zero on Monday"*
3. **Profile rank card** — Gold emblem, "27 / 200 FP", progress bar. Caption:
   *"Climb from Iron to Challenger"*
4. **A celebration pop-up** — "Watto reached Gold" with hype buttons. Caption:
   *"Wins get loud"*
5. **Sign your week card** — hold-to-sign. Caption: *"Commit out loud"*
6. **Progress screen** — consistency dot matrix + you-vs-group chart. Caption:
   *"The whole week at a glance"*
7. (optional) **Group chat** with logs + reactions inline.

Capture: real device or simulator, dark mode (the app's native look), a
seeded demo group so nothing is empty. Status bar clean (full battery, no
carrier weirdness) — Apple's device frames via Fastlane frameit or
screenshots.pro if wanted, plain screenshots are also acceptable.

## Remaining ASC form fields (quick answers)

| Field | Value |
|---|---|
| Copyright | © 2026 Munitor AI |
| Routing app coverage file | skip (not a routing app) |
| Content rights | Does not use third-party content |
| Price | Free |
| App uses IDFA? | **No** (matches Tracking=No labels) |
