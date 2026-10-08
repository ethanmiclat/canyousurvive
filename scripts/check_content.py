#!/usr/bin/env python3
"""Validate datasets, templates, the catalog and every schedule file. Exit 1 on errors."""

from __future__ import annotations

import io
import json
import re
import sys
from contextlib import redirect_stdout

import build_catalog
from gen_lib import (
    CONTENT,
    DATASETS,
    TEMPLATES,
    add_days,
    days_between,
    load_activities,
    load_config,
    load_schedule,
    match_key,
    read_json,
    schedule_dates,
    today_in_zone,
    win_rate,
)

errors: list[str] = []
warnings: list[str] = []


def check_datasets():
    ids = {}
    for f in sorted(DATASETS.glob("*.json")):
        ds = read_json(f)
        if ds["id"] != f.stem:
            errors.append(f"{f.name}: id {ds['id']!r} does not match file name")
        ents = ds["entities"]
        seen = set()
        name_keys: dict[str, str] = {}
        for e in ents:
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", e["id"]):
                errors.append(f"{ds['id']}: bad entity id {e['id']!r}")
            if e["id"] in seen:
                errors.append(f"{ds['id']}: duplicate entity id {e['id']}")
            seen.add(e["id"])
            for n in [e["name"], *e.get("alt", [])]:
                k = match_key(n)
                if not k:
                    errors.append(f"{ds['id']}/{e['id']}: name {n!r} normalizes to nothing")
                elif k in name_keys and name_keys[k] != e["id"]:
                    errors.append(f"{ds['id']}: {e['id']} and {name_keys[k]} share the full name {n!r}")
                name_keys.setdefault(k, e["id"])
        # A canonical name that is also another entity's alias can only match while that entity is out of the set.
        for e in ents:
            for a in e.get("aliases", []):
                owner = name_keys.get(match_key(a))
                if owner and owner != e["id"]:
                    warnings.append(f"{ds['id']}: alias {a!r} of {e['id']} equals the name of {owner}")
        ids[ds["id"]] = {e["id"] for e in ents}
    for f in sorted(TEMPLATES.glob("*.json")):
        spec = read_json(f)
        if spec["dataset"] not in ids:
            errors.append(f"templates/{f.name}: unknown dataset {spec['dataset']}")
    return ids


def check_catalog():
    current = read_json(CONTENT / "catalog.json")
    buf = io.StringIO()
    path = CONTENT / "catalog.json"
    before = path.read_text(encoding="utf-8")
    try:
        with redirect_stdout(buf):
            build_catalog.build()
        fresh = path.read_text(encoding="utf-8")
    finally:
        path.write_text(before, encoding="utf-8")
    if json.loads(fresh) != current:
        errors.append("catalog.json is stale: run `npm run content:catalog`")


def check_schedule(dataset_ids):
    config = load_config()
    acts = {a["id"]: a for a in load_activities()}
    bands = config["typedRounds"]
    lo, hi = config["winRateGuard"]
    dates = schedule_dates()
    days = {d: load_schedule(d) for d in dates}
    for d, day in days.items():
        where = f"schedule/{d}"
        if day.get("date") != d:
            errors.append(f"{where}: date field {day.get('date')!r}")
        rounds = day["rounds"]
        if len(rounds) != len(bands):
            errors.append(f"{where}: expected {len(bands)} typed rounds")
            continue
        for r, band in zip(rounds, bands):
            if r["round"] != band["round"]:
                errors.append(f"{where}: round order")
            if not band["min"] <= r["size"] <= band["max"]:
                errors.append(f"{where}: round {r['round']} size {r['size']} outside {band['min']}-{band['max']}")
            if r["size"] != len(r["answers"]) or len(set(r["answers"])) != len(r["answers"]):
                errors.append(f"{where}: round {r['round']} size/answers mismatch")
            unknown = set(r["answers"]) - dataset_ids.get(r["datasetId"], set())
            if unknown:
                errors.append(f"{where}: round {r['round']} answers not in {r['datasetId']}: {sorted(unknown)[:5]}")
        sizes = [r["size"] for r in rounds]
        if any(a <= b for a, b in zip(sizes, sizes[1:])):
            errors.append(f"{where}: sizes not strictly shrinking {sizes}")
        if len({r["datasetId"] for r in rounds}) != len(rounds):
            errors.append(f"{where}: dataset used twice in one day")
        w = win_rate(sizes, config["activitySurvival"], config["playerHits"])
        if not lo <= w <= hi:
            errors.append(f"{where}: win rate {w:.2%} outside {lo:.0%}-{hi:.0%}")
        a = acts.get(day["activity"])
        if not a or not a["enabled"]:
            errors.append(f"{where}: unknown or disabled activity {day['activity']}")
        prev = days.get(add_days(d, -1))
        if prev and prev["activity"] == day["activity"]:
            errors.append(f"{where}: same activity as the day before")
        if day.get("relaxed"):
            warnings.append(f"{where}: generated with relaxed cooldowns (level {day['relaxed']})")
        for other_d, other in days.items():
            gap = days_between(other_d, d)
            if gap < 1:
                continue
            for r in rounds:
                for o in other["rounds"]:
                    if gap < config["datasetCooldownDays"] and o["datasetId"] == r["datasetId"]:
                        (warnings if day.get("relaxed") else errors).append(f"{where}: dataset {r['datasetId']} reused {gap} day(s) after {other_d}")
                    if gap < config["questionCooldownDays"] and o["questionId"] == r["questionId"]:
                        (warnings if day.get("relaxed") else errors).append(f"{where}: question {r['questionId']} reused {gap} day(s) after {other_d}")
    today = today_in_zone(config["timezone"])
    missing = [add_days(today, i) for i in range(config["aheadDays"]) if add_days(today, i) not in days]
    if missing:
        warnings.append(f"only {config['aheadDays'] - len(missing)} of the next {config['aheadDays']} days are scheduled (missing from {missing[0]}); run `npm run content:generate`")
    return len(days)


def main() -> int:
    ids = check_datasets()
    check_catalog()
    n = check_schedule(ids)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}")
    print(f"{len(ids)} datasets, {sum(len(v) for v in ids.values())} entities, {n} scheduled days: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
