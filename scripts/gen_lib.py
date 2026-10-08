"""Shared helpers for the content pipeline.

The day scheduler here is mirrored in lib/scheduler.ts (the server fallback). Keep them in lockstep:
same seeded RNG, same iteration order, same arithmetic.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import date as Date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
DATASETS = CONTENT / "datasets"
TEMPLATES = CONTENT / "templates"
SCHEDULE = CONTENT / "schedule"

MAX_ATTEMPTS = 500
MAX_SAFE_INTEGER = 2**53 - 1
RPS_SURVIVAL = 0.5
COIN_SURVIVAL = 0.5


# ---------- io ----------

def read_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data, compact_lists: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if compact_lists:
        # Keep long id lists on one line so schedule files stay readable.
        text = re.sub(r'\[\s+((?:"[^"\n]*",?\s*)+)\]', lambda m: "[" + ", ".join(re.findall(r'"[^"\n]*"', m.group(1))) + "]", text)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text + "\n")


def load_config():
    return read_json(CONTENT / "config.json")


def load_activities():
    return read_json(CONTENT / "activities.json")["activities"]


def load_catalog():
    return read_json(CONTENT / "catalog.json")["questions"]


def load_dataset(dataset_id: str):
    return read_json(DATASETS / f"{dataset_id}.json")


def schedule_path(d: str) -> Path:
    return SCHEDULE / f"{d}.json"


def load_schedule(d: str):
    p = schedule_path(d)
    return read_json(p) if p.exists() else None


def schedule_dates() -> list[str]:
    return sorted(p.stem for p in SCHEDULE.glob("*.json"))


# ---------- dates ----------

def parse_date(s: str) -> Date:
    return Date.fromisoformat(s)


def add_days(d: str, n: int) -> str:
    return (parse_date(d) + timedelta(days=n)).isoformat()


def days_between(a: str, b: str) -> int:
    return (parse_date(b) - parse_date(a)).days


def today_in_zone(tz: str) -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo(tz)).date().isoformat()


# ---------- text (mirrors lib/match.ts normalize) ----------

def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.category(c).startswith("M"))
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[-_/–—]", " ", s)
    s = "".join(c for c in s if c.isalnum() or c.isspace())
    s = re.sub(r"\s+", " ", s).strip()
    stripped = re.sub(r"^(the|a|an)\s+", "", s)
    return stripped or s


def match_key(s: str) -> str:
    return normalize(s).replace(" ", "")


# ---------- odds ----------

def win_rate(sizes: list[int], activity_survival: float, hits: int = 1) -> float:
    """Chance of finishing with fewer than `hits` rounds lost. Mirrors winRate in lib/odds.ts step for step."""
    dist = [1.0] + [0.0] * (hits - 1)  # dist[k]: chance of having lost exactly k rounds so far
    for s in [1 - 1 / n for n in sizes] + [activity_survival, RPS_SURVIVAL, COIN_SURVIVAL]:
        for k in range(hits - 1, -1, -1):
            dist[k] = dist[k] * s + (dist[k - 1] * (1 - s) if k > 0 else 0.0)
    total = 0.0
    for v in dist:
        total += v
    return total


# ---------- seeded rng (mirrors SeededRng in lib/rng.ts) ----------

class SeededRng:
    def __init__(self, seed: str):
        self.seed = seed
        self.counter = 0

    def below(self, n: int) -> int:
        h = hashlib.sha256(f"{self.seed}:{self.counter}".encode()).hexdigest()
        self.counter += 1
        return int(h[:13], 16) % n


# ---------- scheduler (mirrors lib/scheduler.ts) ----------

def pick_activity(d: str, activities, history, rng: SeededRng) -> str:
    ids = sorted(a["id"] for a in activities if a["enabled"])
    last_used: dict[str, int] = {}
    for h in history:
        diff = days_between(h["date"], d)
        if diff >= 1 and (h["activity"] not in last_used or diff < last_used[h["activity"]]):
            last_used[h["activity"]] = diff
    eligible = [i for i in ids if last_used.get(i) != 1]
    age = lambda i: last_used.get(i, MAX_SAFE_INTEGER)  # noqa: E731
    oldest = max(age(i) for i in eligible)
    pool = [i for i in eligible if age(i) == oldest]
    return pool[rng.below(len(pool))]


def recent_sets(d: str, history, dataset_cooldown: int, question_cooldown: int):
    recent_datasets: set[str] = set()
    recent_questions: set[str] = set()
    for h in history:
        diff = days_between(h["date"], d)
        if diff < 1:
            continue
        for r in h["rounds"]:
            if diff < dataset_cooldown:
                recent_datasets.add(r["datasetId"])
            if diff < question_cooldown:
                recent_questions.add(r["questionId"])
    return recent_datasets, recent_questions


def band_pools(config, catalog):
    ordered = sorted(catalog, key=lambda q: q["id"])
    return [[q for q in ordered if band["min"] <= q["size"] <= band["max"]] for band in config["typedRounds"]]


def relax_levels(config) -> list[tuple[int, int]]:
    """Cooldowns to try in order. Level 0 is the real rule; later levels only kick in so the game never goes down."""
    ds, q = config["datasetCooldownDays"], config["questionCooldownDays"]
    return [(ds, q), (ds, q // 2), (max(1, ds - 3), q // 3), (1, 7)]


def make_day(d: str, config, activity: str, chosen, level: int) -> dict:
    wr = win_rate([q["size"] for q in chosen], config["activitySurvival"], config["playerHits"])
    day = {
        "date": d,
        "approved": False,
        "activity": activity,
        "winRate": round(wr, 4),
        "rounds": [
            {
                "round": config["typedRounds"][i]["round"],
                "questionId": q["id"],
                "datasetId": q["dataset"],
                "prompt": q["prompt"],
                "size": q["size"],
                "answers": q["answers"],
            }
            for i, q in enumerate(chosen)
        ],
    }
    if level:
        day["relaxed"] = level
    return day


def try_generate(d: str, config, catalog, activities, history, level: int):
    dataset_cooldown, question_cooldown = relax_levels(config)[level]
    rng = SeededRng(f"{config['generatorSeed']}:{d}" + (f":r{level}" if level else ""))
    recent_datasets, recent_questions = recent_sets(d, history, dataset_cooldown, question_cooldown)
    activity = pick_activity(d, activities, history, rng)
    pools = band_pools(config, catalog)
    # Round-1 sets are scarce, so lower rounds usually steer clear of datasets that can supply round 1.
    reserved = {q["dataset"] for q in pools[0]}
    lo, hi = config["winRateGuard"]

    for _ in range(MAX_ATTEMPTS):
        chosen = []
        used: set[str] = set()
        for i, pool in enumerate(pools):
            prev = chosen[-1] if chosen else None
            cands = [
                q
                for q in pool
                if q["dataset"] not in recent_datasets
                and q["dataset"] not in used
                and q["id"] not in recent_questions
                and (prev is None or q["size"] < prev["size"])
            ]
            if not cands:
                break
            if i > 0 and rng.below(4) != 0:
                preferred = [q for q in cands if q["dataset"] not in reserved]
                if preferred:
                    cands = preferred
            datasets = sorted({q["dataset"] for q in cands})
            ds = datasets[rng.below(len(datasets))]
            qs = [q for q in cands if q["dataset"] == ds]
            # Hand-written filters read better than letter filters; favor them half the time.
            curated = [q for q in qs if q["kind"] == "curated"]
            if curated and rng.below(2) == 0:
                qs = curated
            q = qs[rng.below(len(qs))]
            chosen.append(q)
            used.add(ds)
        if len(chosen) != len(pools):
            continue
        wr = win_rate([q["size"] for q in chosen], config["activitySurvival"], config["playerHits"])
        if wr < lo or wr > hi:
            continue
        return make_day(d, config, activity, chosen, level)
    return None


def generate_day(d: str, config, catalog, activities, history) -> dict:
    for level in range(len(relax_levels(config))):
        day = try_generate(d, config, catalog, activities, history, level)
        if day:
            return day
    raise RuntimeError(f"Could not schedule {d}")


def history_for(d: str, config, extra: dict[str, dict] | None = None):
    """Existing schedule days in the question-cooldown window before d (plus unsaved days in `extra`)."""
    out = []
    for i in range(1, config["questionCooldownDays"]):
        k = add_days(d, -i)
        day = (extra or {}).get(k) or load_schedule(k)
        if day:
            out.append(day)
    return out
