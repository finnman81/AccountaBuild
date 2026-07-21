# Weight-Goal Scoring v2 — Proposal (2026-07-20, not yet implemented)

Prompted by two real incidents on the same day:
1. Regmong: "how did Watto get so many points today without working out?" — a single
   Monday weigh-in (224 → 222.6) maxed his week's weight-outcome credit on day one.
2. Jake: "does 180→170 rate harder than 230→220?" — it should (less spare mass), but
   the current formula separates those cases by only ~2%.

Three changes, all confined to the weight goals. Everything else untouched.

## Change A — BMI-aware difficulty ("fraction of spare weight committed")

Current `D_base = 1 + 0.9·(loss/bodyweight)^0.6` barely distinguishes lean cutters
from heavy ones. Replace the input with **how much of your spare weight the goal
commits**: `spare = startWeight − weightAtBMI22(height)`, `rel = loss/spare`,
`D_base = 1 + 0.9·rel` (linear — interpretable, same 1.0–1.9 output range).
No height on file → fall back to the current formula. Phase and timeline
multipliers unchanged.

Real-group impact (current progress, D_old → D_new):

| user | start BMI | % of spare committed | D_old | D_new | change |
|---|---|---|---|---|---|
| Jake | 25.5 | 50% | 1.40 | 1.73 | **+23%** |
| Regmong | 26.7 | 49% | 1.29 | 1.54 | **+19%** |
| Matt | 31.2 | 50% | 1.77 | 2.00 | +13% |
| Watto | 27.0 | 19% | 1.32 | 1.38 | +4% |
| Alex | 28.3 | 18% | 1.07 | 1.10 | +3% |
| *hypo lean 180→170 (5'10")* | 25.8 | 38% | 1.09 | 1.25 | +15% |
| *hypo heavy 230→220 (6'0")* | 31.2 | 15% | 1.07 | 1.06 | −0% |

Answers Jake's question directly: the lean cutter now rates **18% harder** than the
heavy one for the same 10 lb (was 2%). Aggressive relative cuts (half your spare
weight) rise the most; gentle cuts barely move. Nobody is nerfed.

## Change B — Outcome measured on weekly AVERAGES, not two single days

Current: `Δ = lastWeighOf(prevWeek) − lastWeighOf(thisWeek)` — two individual
mornings, inside normal daily fluctuation (±1–2 lb). One light morning = fake
progress; one salty dinner = fake regression.
New: `Δ = avg(prevWeek weigh-ins) − avg(thisWeek weigh-ins)`. Noise mostly cancels;
real trend remains. Fallback to the endpoint rule when a week has no weigh-ins.
Side benefit: weighing in MORE improves your own signal, rewarding the habit.

## Change C — Current-week outcome drips in with elapsed time

Mid-week `O_effective = O_raw × elapsedFrac` (day/7); at week close it's the full
value, so FINAL scores are unchanged. Same drip concept the projection already
uses — a Monday weigh-in banks a Monday's worth, not the week.

The Watto case under old vs new, day one of W30:
- old: 224 → 222.6 endpoint Δ=1.4 lb ≥ 0.67 target → **O = 1.00 instantly**
- new: avg-vs-avg Δ=1.0 lb → raw O 1.00 → ×(1/7) → **O = 0.14**, ramping to 1.0 by
  Sunday *if the trend holds*. His ~+46 FP Monday spike becomes roughly +25–30,
  converging to the same week-close result.

## Rollout rules (same discipline as the calorie band)

- **Week-gated activation** (`weekId >= 2026-W31`, i.e. next Monday 00:00 ET):
  closed weeks and the in-flight week keep the old math forever; recomputes never
  restate history; no deploy-timing games. Ships via OTA + functions any time.
- Both scorers + projection in lockstep (dual-scorer rule), parity + unit tests
  incl. the exact cases in the tables above.
- A/B dry-run recompute before the flip (verify gate-off == legacy exactly).
- What's New announcement scheduled for the same Monday explaining both changes
  in plain words ("your weight goal now rates harder the leaner you start;
  weekly progress is judged on your weekly average, drip-paid across the week").

## Explicitly NOT changing
- The outcome cap at 1.0 stays (crash-diet weeks shouldn't over-earn).
- Weight-gain goals get the mirrored treatment (spare = leanFloor headroom in
  reverse) only if trivial; otherwise unchanged in v2 — no bulk users currently.
- No new user inputs required — height is already on every profile.
