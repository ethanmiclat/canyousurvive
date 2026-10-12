# Can You Survive?

A daily survival game, the first in the "Can You..." series. Nine rounds, each hiding a deadly outcome:
six typed-trivia rounds, an activity of the day, rock paper scissors, and a coin flip. Losing a round costs
one of three hearts; surviving one damages the boss. Same board for everyone, one run per day, about half
survive. Full spec: [docs/PLAN.md](docs/PLAN.md). Notes on how the
build maps to the plan and the calls made on its open items: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

## Run it locally

```sh
npm install
npm run dev          # API on :3001 (server/dev.ts) + Vite on :5173, proxied
```

Open http://localhost:5173. Local runs are stored in `.data/store.json`; delete it to start over.
To play another day's board: `CYS_DATE=2026-10-12 npm run dev` (ignored in production).

```sh
npm test             # vitest: matching, odds, scheduler parity with Python, game engine
npm run typecheck
npm run build        # typecheck + client build to web/dist
npm run content:check  # odds table + dataset/catalog/schedule validation
```

## Deploy (Vercel)

`vercel.json` builds the client to `web/dist` and serves `api/**/*.ts` as functions with `content/**` bundled.
Set these environment variables:

| Variable | Purpose |
|---|---|
| `SERVER_SECRET` | HMAC secret for the daily typed-round picks. **Required** in production. Changing it changes every hidden answer. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Runs, submission logs, stats and rate limits. Vercel's Upstash integration (`KV_REST_API_*`) also works. Without Redis the API falls back to memory, which loses runs on cold starts. |

## Content workflow

Datasets (`content/datasets/*.json`) are closed entity lists: `id`, `name`, `alt` (alternate full names, used for
matching and letter filters), `aliases` (short forms, matching only), `tags`, `props`. Templates
(`content/templates/<dataset>.json`) turn a dataset into questions; see the docstring in
`scripts/build_catalog.py` for the template types.

```sh
npm run content:catalog                     # templates + datasets -> content/catalog.json
npm run content:generate                    # make sure today + 14 days are scheduled
python3 scripts/generate.py --start 2026-12-06 --days 28
python3 scripts/review.py list --days 14    # weekly review
python3 scripts/review.py swap 2026-10-20 --round 3
python3 scripts/review.py approve --through 2026-10-27
npm run content:check
```

Approved days are never overwritten. A day without a schedule file is generated on the fly by the server
(`lib/scheduler.ts`, a line-for-line port of `scripts/gen_lib.py`; a test keeps them identical).

## Layout

```
api/                 Vercel functions: today, run, round/start, round/check, round/hint, round/lock, round/timeout, stats/today
lib/                 server logic: game engine, matching, pick rule, scheduler, storage
server/dev.ts        local API server for the same handlers
web/src/             React client
  rounds/            typed, activity, rps, coin
  activities/        one folder per activity module (8 at launch)
content/             config, activities, datasets, templates, catalog, schedule
scripts/             catalog builder, generator, review, odds and content checks
tests/               vitest
```
