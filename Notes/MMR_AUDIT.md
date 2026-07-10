# MMR System Deep-Dive Audit (July 2026)

Requested by Jake ("I think it has some deeper calculation flaws as well").
Every module in the scoring pipeline was read end-to-end (constants, difficulty,
scoring, ranks, progression, adherence, time, mmrUpdate, mmrProjection,
mmrSeason) and validated against live production data.

## FIXED in this pass

| # | Finding | Fix |
|---|---------|-----|
| F1 | **Goal edits retroactively rescored weeks.** `goalsEffectiveWeekId` was written by the Goals screen but consumed by NOTHING — editing goals rescored the in-progress week immediately and catch-up recomputes of past weeks used the new goals. | Each weekly doc now snapshots the goals it was first scored against (`goalsSnapshot`); every recompute (client + server) reuses the snapshot. Snapshot written only once goals exist so a new user's first week isn't frozen empty. |
| F2 | **MMR only recomputed on the user's own device** (Profile-screen catch-up). Anyone who didn't open the app kept a frozen score forever — verified: Watto logging daily yet stuck at 1800 while one profile-opener climbed to 1973. | `updateMmrScheduled` Cloud Function (every 6h) runs the same idempotent compute for ALL users. Ported math parity-tested (`mmr_parity.test.ts`); server dry-run reproduced the client's 1973 for Jake exactly before deploy. |
| F9 | **Bulk users scored BACKWARDS on calories** — `calorieDaysHitFromTotals` counted at-or-UNDER budget for everyone, so hitting a bulking surplus counted as a miss. | Direction follows `goalMode`: bulk counts days ≥ budget; cut/maintenance unchanged (≤ budget). |
| F15 | **MMR reset scripts silently reverted** — setting `users/{uid}.mmr` alone got clobbered by the next recompute's stale weekly `mmrBefore` baseline, and the missing `firstWeekId` re-applied missed-week penalties. | Both reset scripts now set `firstWeekId` + clear the weekly subcollection. |
| — | **Phantom streaks** (same session): zero-activity users showed 3–5 day streaks because pace-aware streak counted no-log days while the weekly target was "still reachable." | A day only counts when actually logged; on-pace gap days preserve without counting. |

## FLAGGED — needs Jake's decision (not fixed)

1. **Season rollover is still client-only** (`ensureSeasonRollover` runs on
   Profile open). Inactive users won't soft-reset at the quarter boundary —
   next one is **Oct 1 (Q3→Q4)**. Recommend porting into the scheduled function
   before then (moderate effort; mapping table already spec'd in mmr.txt).
2. **Timezone is hardcoded** to `America/New_York` (`DEFAULT_TZ`). Week
   boundaries are wrong for users elsewhere. Fine for the current US beta;
   needs a per-user tz before international users.
3. **Jake's own weekly history predates the Silver reset** (e.g. the 2026-W27
   doc carries a 513 baseline → recomputes show `513→606 Iron II` for that
   week). Harmless — the newest week always recomputes last and restores the
   true value — but his MMR-history screen shows the odd old numbers. A durable
   re-reset would clean it but ERASE his weekly history; left alone pending his
   call.

## Noted, acceptable for beta

- Weekly log reads are capped (client 800/group, server 1500/group, newest
  first). Heavy health-sync groups could theoretically undercount a week; fine
  at current scale.
- `mmrProjection` (the display-only "trajectory" card) intentionally uses
  pace-aware A and does NOT apply the calorie budget direction or goals
  snapshot — minor divergence from the real scorer, display-only.
- Mid-week the user doc's `streakWeeks` can flicker to 0 until A_total crosses
  0.7 (cosmetic; weekly-doc baselines make the final close correct).
- Current-week "live" partial scoring is now UNIFORM (scheduler computes it for
  everyone), so mid-week leaderboard movement is fair rather than favoring
  whoever opens Profile.

## Other issues found during the sweep (not MMR)

- **6 accounts display as "Explorer"** — some sign-up path defaults the display
  name; they're indistinguishable on leaderboards. Worth tracing the source.
- Several obvious **test accounts** in production (`test`, `Test`, `Test
  User`, `Tmfin`, Explorer×6) pollute group views — a cleanup pass needs
  Jake's confirmation on which are disposable.
- Goals screen weight-goal INPUT fields are still lb-only for metric users
  (display side was fixed earlier; input side flagged, not built).

## How it was tested (no app deploy needed)

- `testing/unit/mmr_parity.test.ts` — client TS and server JS run identical
  fixtures (bands sweep 0–8000, demotion/hysteresis/shield cases, scoring,
  difficulty tables, penalties, adherence incl. bulk, ISO week math).
- `scripts/mmr-recompute.js --dry-run --all` against production — server
  output matched the client's real computed values (Jake 1973 exact).
- Applied to Watto first (1800→1936), re-applied to prove idempotency (same
  number), then applied to all 21 users. Firestore transactions rejected a
  serialization bug cleanly before any partial write (dual firebase-admin
  instance; fixed by resolving admin from functions/node_modules).
