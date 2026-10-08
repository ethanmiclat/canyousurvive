# Can You Survive: Plan

Status: planning spec v1, to be built in Claude Code. First game in a planned "Can You..." series.

## 1. What it is

A daily survival game. Seven rounds, each a different kind of challenge. In every round the site has a hidden outcome, and matching it (or losing the toss) knocks you out. Everyone gets the same board each day, one run per day, with a shareable result card. Clearing all seven rounds is rare: about 1 in 7.

## 2. Round structure

| Round | Game | Choices | Survive chance |
|---|---|---|---|
| 1 | Typed trivia | about 100 valid answers | about 99% |
| 2 | Typed trivia | about 20 | about 95% |
| 3 | Typed trivia | about 7 | about 86% |
| 4 | Typed trivia | about 6 | about 83% |
| 5 | Activity of the day (new every day) | 5 | 80% |
| 6 | Real rock paper scissors vs the site (ties replay) | 3 | 50% |
| 7 | Real coin flip | 2 | 50% |

Rules
- The number of choices differs every round and shrinks every round.
- Win rate across a full run: about 13.4% (1 in 7).
- Round order is fixed. Rounds 1-4 are brain rounds, 5-7 are nerves rounds.

Cumulative odds (to verify in code)

| After round | Cumulative survival |
|---|---|
| 1 | 99.0% |
| 2 | 94.05% |
| 3 | 80.6% |
| 4 | 67.2% |
| 5 | 53.7% |
| 6 | 26.9% |
| 7 | 13.4% |

Daily win-rate guard: the content generator computes each day's theoretical win rate from the real valid-answer set sizes and rejects any day outside 12%-15%.

## 3. The rounds

### 3.1 Typed trivia (rounds 1-4)

- A question is a prompt plus a category dataset plus filters, which produces a valid-answer set. Examples: "Name a US state" (50), "Name an element" (118), "Name a Great Lake" (5).
- Each day the site secretly picks one entity from the valid set, per round, uniformly at random. The pick is made server-side and is the same for every player that day.
- The player types an answer. If it matches the site's entity, they are out. Any other valid answer survives.
- Target set sizes per round (bands, not exact): R1 about 100, R2 about 20, R3 about 7, R4 about 6. Sizes must differ and shrink across rounds.
- After lock-in, reveal the site's answer.
- The pick rule is one swappable function `pickDeadly(question, context)`. v1 is uniform random. Later it can become crowd-based (see section 9).

### 3.2 Activity of the day (round 5)

- A different activity every day, drawn from a library of plug-in modules.
- Contract: each activity receives a survival chance (0.8 in v1) and realizes it however it wants. Outcome is decided server-side at lock-in, per player. The client only animates it.
- Realizing 0.8: five choices with one deadly (cups, wires, boxes, straws, keys, elevator buttons), or a continuous control such as a stop-the-needle dial with a red zone covering 20%.
- Activities must differ in interaction, not just art: tap, drag, hold-and-release, swipe, timing.
- Starter ideas: poison cups, bomb wires, doors, mystery boxes, draw straws, glass bridge (5 panes wide, one cracked), stop the needle, elevator floors, five keys.
- Launch with 7-10 modules. Add one or two a week. Never the same activity two days in a row.
- One-line rule shown on the round. The activity name appears on the share card.

### 3.3 Rock paper scissors (round 6)

- Real game against the site. Player throws rock, paper, or scissors. The server throws uniformly at random after lock-in.
- Win survives, loss is out, tie means throw again.
- Overall survival is 1/2. Each throw is resolved server-side and independent.

### 3.4 Coin flip (round 7)

- Player calls heads or tails. The server flips after lock-in. Wrong call is out.
- Surviving this round is the win condition.

## 4. Typed-answer matching

Goal: forgive common mistypes without leaking anything about the site's hidden answer or the valid set.

Pipeline
1. Normalize: lowercase, trim, strip punctuation and diacritics, collapse spaces, drop leading articles.
2. Match against the question's valid set by canonical name and alias table (for example "USA", "U.S.", "United States of America").
3. If no exact or alias match, try typo tolerance: Damerau-Levenshtein distance, scaled by length (0 edits for 3 characters or fewer, 1 for 4-7, 2 for 8 or more).
4. Accept a fuzzy match only when exactly one entity in the set is within the threshold. If two or more are, treat as unrecognized. Never guess between them.
5. For a fuzzy match, show a confirm step ("We read this as X, lock it in?"). This echoes only what the player was reaching for.

No-leak rules
- Matching is scoped to the question's valid set. A real answer that falls outside today's set (wrong filter) is treated as unrecognized, the same as gibberish.
- Responses are identical in shape and timing whether the matched entity is deadly or safe. The comparison to the secret happens only on lock-in.
- Unrecognized responses say only "not recognized". No suggestions, no autocomplete, no set size, no hints.
- Rate-limit the check endpoint per run and per IP.
- The valid set is never sent to the client.

Attempts (default, tune in playtesting)
- 3 attempts per typed round. Unrecognized attempts do not survive the round and reveal nothing. If all 3 fail, the round counts as lost.

Logging
- Log every submission: run id, date, round, raw input, normalized input, matched entity id or null, timestamp.
- Use the logs to grow alias tables (frequent unrecognized strings) and as the data for a future crowd-based pick rule.

## 5. Daily content pipeline

Goal: 4 typed questions plus 1 activity per day without hand-writing them.

- Datasets: JSON lists of entities (id, canonical name, aliases, tags). Sources: public data such as Wikidata, with LLM-assisted alias lists and human spot-checks.
- Templates and filters turn a dataset into many questions. Examples: starts with a letter, has a property, before or after a year, in a region.
- The valid-set size of each candidate question is computed automatically.
- Generator script (Python) schedules each day:
  - 4 questions with set sizes inside the round bands and strictly shrinking
  - different datasets within a day, no dataset reused within 7 days, no question reused within 90 days
  - computes the day's win rate and rejects days outside 12%-15%
  - writes `content/schedule/YYYY-MM-DD.json`
- Weekly review: approve or swap a batch of days. Keep at least 14 days generated ahead.
- Activity rotation file picks the activity per day.
- Fallback: if a day has no schedule file, the server generates one from a seeded run of the same generator so the game never goes down.
- Launch target: enough unique questions for 60 days, extended weekly.

## 6. Server, fairness, anti-cheat

- Hidden answers live only on the server. Clients never receive them before lock-in.
- Typed-round picks: derived from a server secret plus the date plus the question id (HMAC), shared by all players that day.
- Activity, RPS, and coin outcomes: server-side cryptographic random per player at lock-in. Each player gets their own result, so there are no spoilers.
- One run per day: a run token (cookie plus localStorage) is tied to the date. The server stores progress. Refresh resumes the run, and it cannot be restarted.
- Known limit: clearing storage can start a new run. Accepted in v1. Later mitigations: IP and device soft limits, optional sign-in (also needed for streaks and a winners wall).
- Day boundary and reset: midnight America/Chicago.

## 7. API sketch

- `GET /api/today`: date, puzzle number, round metadata (prompt, kind, activity id). No answers.
- `POST /api/run`: start or resume today's run.
- `POST /api/round/check`: typed rounds only. Returns `ok`, `confirm` (with the display name), or `unrecognized`, plus attempts left.
- `POST /api/round/lock`: final choice. Returns survived or not, plus the site's answer or outcome.
- Activity, RPS, and coin all use `/lock`. RPS returns "tie" without ending the round.
- `GET /api/stats/today`: survivors and per-round death counts (later).

## 8. Data model (minimal)

- `runs`: id, date, createdAt, results[], status
- `submissions`: runId, date, round, rawInput, normalized, entityId or null, ts
- `schedule`: date, per-round question id, dataset id, valid-set size, activity id
- Datasets, entities, and generated schedule files live in the repo as JSON.
- `stats`: daily aggregate counters (survivors, deaths per round)

## 9. Pick rule roadmap

- v1: uniform random over the valid set. Typed answers act as a trivia gate, and any "reverse psychology" exists only in players' heads.
- v2: crowd-based. The site's pick is weighted by what players actually tend to type, measured from logged submissions per dataset. This makes second-guessing real. Switch when there is enough logged data.
- Keep the pick function swappable so the switch touches nothing else.

## 10. Share card and retention

```
Can You Survive #12 · Poison Cups
🟩🟩🟩🟥⬛⬛⬛
Survived 3 of 7
```

- Seven squares, one per round, with the activity name on the first line.
- After finishing: "X of Y survived today", plus where players died.
- Streak counter in localStorage for v1. Winners wall and accounts later.
- Numbering starts at #1 on the launch date (to be set).

## 11. Suggested tech (Claude Code to confirm)

- Front end: React, Vite, Tailwind, GSAP for activity animations.
- Back end: Vercel serverless functions.
- Storage: Upstash Redis or Supabase for runs, submissions, and stats.
- Content scripts: Python, run on a schedule or by hand.

## 12. Repo structure (suggested)

```
can-you-survive/
  docs/PLAN.md
  web/                 React + Vite client
    src/rounds/        typed, rps, coin
    src/activities/    one folder per activity module
  api/                 serverless functions
  content/
    datasets/          entity lists with aliases
    templates/         question templates and filters
    schedule/          generated days (YYYY-MM-DD.json)
  scripts/             generator, odds checker, alias tools
```

## 13. Build phases

1. Core loop: 4 hard-coded typed questions, server resolution, one activity, RPS, coin, share card, one run per day.
2. Content pipeline: datasets, templates, generator, win-rate guard, scheduling, review flow.
3. Activity library: grow to 7-10 modules, rotation, activity name on share card.
4. Stats and retention: survivor counts, death distribution, streaks, winners wall.
5. Crowd-based pick rule once there are enough logged answers. Series hub for the next "Can You..." games.

## 14. Decisions locked

- Name: Can You Survive. Series: "Can You..."
- Daily, same board for everyone, one run per day, reset at midnight Central.
- 7 rounds in the order in section 2, with all choice counts different and shrinking.
- Typed trivia rounds 1-4, with site picks random now and swappable to crowd-based later.
- Activity round 5 is different every day.
- Round 6 is real RPS with a random site throw, ties replay.
- Round 7 is a real coin flip.
- Mistype handling is smart but leaks nothing.
- Win rate of about 13.4% is accepted.

## 15. Open items and assumptions

- Assumed: activity, RPS, and coin outcomes are per-player random. Confirm.
- Assumed: 3 attempts per typed round, then the round is lost. Tune after playtesting.
- Launch date and puzzle #1 date to be set.
- Win-rate guard window of 12%-15% is a starting choice.
- Per-round time limit for typed rounds (for example 30 seconds)? Not decided.
- Which datasets and themes to build first.
- Accounts and sign-in are out of scope for v1.

## 16. Future "Can You..." games (shared engine)

Reusable pieces: daily schedule, share card, streaks, stats, hub page. Candidate games: Can You Blend In (match the crowd), Can You Outsmart (beat a predictor), Can You Spot It (find the fake), Can You Last (higher/lower chain).
