# Implementation notes

How v1 maps to [PLAN.md](PLAN.md), and the calls made where the plan left something open.

## Built

| Plan phase | Status |
|---|---|
| 1. Core loop | Done. Typed rounds with server resolution, activity, RPS, coin, share card, one run per day. |
| 2. Content pipeline | Done. 42 datasets (~2,300 entities), templates, catalog builder, generator with win-rate guard, review tool, seeded server fallback. 60 days scheduled from launch (2026-10-07 to 2026-12-05). |
| 3. Activity library | Done. 8 modules (tap, swipe, hold-and-release, timing, drag, drag-to-target, flick, press-and-hold), rotation, activity name on the share card. |
| 4. Stats and retention | Partly. Survivor counts, per-round deaths and localStorage streaks are in. The winners wall needs accounts, which are out of scope for v1. |
| 5. Crowd pick rule | Not started, as planned. `pickDeadly` in `lib/pick.ts` is the single swap point, and every submission is logged for it. |

## Decisions on open items (section 15)

- **Per-player outcomes.** Activity, RPS and coin outcomes are crypto-random per player at lock-in, as assumed.
- **Timed typed rounds (replaces attempts).** Each typed round has a 30-second clock (`typedRoundSeconds` in
  `content/config.json`). The clock starts when the question is first shown (`POST /api/round/start`), and the
  prompt is only sent then, so nobody can read ahead. Refreshing resumes the same clock. Unrecognized answers cost
  nothing but time. A lock-in more than 2 seconds past the deadline, or the client's `POST /api/round/timeout`,
  loses the round and reveals the villain's answer. Declining a fuzzy "We read this as X" confirm is free. Checks
  are capped at 40 per round per run, plus 60 per minute per IP.
- **Launch date.** Set to 2026-10-07 (puzzle #1) in `content/config.json`. Change `launchDate` to renumber.
- **Win-rate guard.** 12% to 15%, as written.
- **First datasets.** Geography (countries, capitals, US states and capitals, parks, regions of Canada, Australia,
  Mexico, India and Germany), science (elements, amino acids, SI units, solar system, constellations), sports (NFL, NBA,
  MLB, NHL, Olympic hosts, World Cup), pop culture (Pokémon, Pixar, Best Picture, film series, Harry Potter, famous
  groups), plus calendar, alphabets, numbers, board games, Bible books, Shakespeare, Greek myth, tarot and zodiac.

## Deviations worth knowing

- **Round 1 band is 50 to 250, not ~60+.** Only a handful of closed datasets have 60+ answers. With a 7-day dataset
  cooldown, round 1 needs a fresh large dataset every day, and that ran dry within a week at 60. At 50, round 1
  survival is at least 98% instead of ~99%. The win-rate guard still holds every day between 12% and 15%.
- **Lower rounds usually avoid round-1-capable datasets.** For 3 out of 4 picks in rounds 2-4, the scheduler skips
  datasets that can supply round 1. This keeps the scarce round-1 pool fresh. Hand-written questions are preferred
  over letter filters ("starts with M") half the time.
- **Relaxed cooldowns as a last resort.** If a day can't be filled under the real rules, the generator retries with
  shorter cooldowns and marks the day `"relaxed"`. This happens about 10 times a year with the current catalog, first
  around 2026-12-17. More datasets or templates will push that out. `content:check` reports these days as warnings.
- **Ambiguous names.** An alias shared by two entities ("Bush", "Adams") only counts when exactly one of them is in
  today's set. Otherwise it is "not recognized", per the no-guessing rule. A real answer outside today's set is never
  fuzzed onto a lookalike inside it (Australia never becomes Austria).
- **Time-sensitive sets are pinned in the prompt** ("before 2026", "through 2024"), so new releases don't make the
  answer list wrong.
- **Run token as player id.** The token cookie (with a localStorage copy) is long-lived, and runs are keyed by
  `date + token`. That gives one run per day now and leaves room for server-side streaks later.

- **Daily villain.** The hidden picker is a character, not "the site". Seven villains rotate by weekday
  (`content/villains.json`). Each has a color, a death stamp, and lines shown after each round. The villain is
  cosmetic only and never affects picks or odds.

- **Health.** Nine rounds: six typed questions (the last three with 5–6, 4–5 and 3–4 answers, so the final question always has at least three), then the activity,
  RPS and the coin flip. The player has `playerHits` hearts (3); losing a round costs one, and the run ends
  when they run out. The boss has 9 health, one per round, and loses one per round survived, so
  every run plays all nine rounds. Reaching the end with a heart left wins and the last round finishes off
  whatever boss health remains. The scheduler's win rate is the chance of losing fewer than `playerHits` rounds, kept
  in `winRateGuard` (50–65%). Six datasets a day forced the dataset cooldown down from 7 days to 5.

- **Hints.** One free hint per typed round: three clues describing different valid answers without naming
  them, plus the letters answers start with. Clues are hand-written in `content/clues/<dataset>.json` or
  generated from dataset props in `lib/hints.ts` (capitals, Olympic years, number riddles). Clue picks are
  seeded by date and question, never use the hidden pick, and any clue containing a valid answer's name or
  alias is skipped. Every catalog question currently gets three clues.

## Fairness and leaks

- The valid set and the hidden answer never reach the client before lock-in. `/check` never reads the secret, so its
  response is identical for deadly and safe answers (covered by a test).
- Typed picks are `HMAC(SERVER_SECRET, date:questionId)` over the sorted valid set. That makes them the same for
  everyone and uniform across days (covered by a test).
- Schedule files freeze each day's answer set, so later dataset edits can't change a past or published board.
- Known v1 limit (accepted in the plan): clearing storage and cookies starts a new run.
