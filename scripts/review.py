#!/usr/bin/env python3
"""Weekly review of generated days.

  python3 scripts/review.py list [--from DATE] [--days N]     show upcoming days
  python3 scripts/review.py approve DATE [DATE ...]           mark days approved (generate.py never overwrites them)
  python3 scripts/review.py approve --through DATE            approve every unapproved day up to DATE
  python3 scripts/review.py swap DATE --round N               replace one typed round with another valid question
  python3 scripts/review.py activity DATE ACTIVITY_ID         change a day's activity

To redo a whole unapproved day: python3 scripts/generate.py --date DATE --overwrite
"""

from __future__ import annotations

import argparse
import random
import sys

from gen_lib import (
    add_days,
    days_between,
    load_activities,
    load_catalog,
    load_config,
    load_schedule,
    schedule_dates,
    schedule_path,
    today_in_zone,
    win_rate,
    write_json,
)


def show(day) -> None:
    flag = "approved" if day.get("approved") else "PENDING "
    relaxed = f"  (relaxed level {day['relaxed']})" if day.get("relaxed") else ""
    print(f"{day['date']}  {flag}  win {day['winRate']:.2%}  activity: {day['activity']}{relaxed}")
    for r in day["rounds"]:
        print(f"   R{r['round']}  {r['size']:>3}  {r['prompt']}   [{r['questionId']}]")


def cmd_list(args) -> None:
    config = load_config()
    start = args.start or today_in_zone(config["timezone"])
    for i in range(args.days):
        day = load_schedule(add_days(start, i))
        if day:
            show(day)
        else:
            print(f"{add_days(start, i)}  (not scheduled)")


def cmd_approve(args) -> None:
    targets = list(args.dates)
    if args.through:
        targets += [d for d in schedule_dates() if d <= args.through]
    for d in targets:
        day = load_schedule(d)
        if not day:
            print(f"{d}: not scheduled", file=sys.stderr)
            continue
        if not day.get("approved"):
            day["approved"] = True
            write_json(schedule_path(d), day, compact_lists=True)
            print(f"{d}: approved")


def cmd_swap(args) -> None:
    config = load_config()
    day = load_schedule(args.date)
    if not day:
        sys.exit(f"{args.date}: not scheduled")
    idx = args.round - 1
    if not 0 <= idx < len(day["rounds"]):
        sys.exit("round must be 1-4")
    band = config["typedRounds"][idx]
    others = [r for i, r in enumerate(day["rounds"]) if i != idx]
    upper = day["rounds"][idx - 1]["size"] if idx > 0 else 10**9
    lower = day["rounds"][idx + 1]["size"] if idx + 1 < len(day["rounds"]) else 0

    # Respect cooldowns in both directions against every other scheduled day.
    blocked_ds, blocked_q = set(), set()
    for d in schedule_dates():
        gap = abs(days_between(d, args.date))
        if gap == 0:
            continue
        for r in load_schedule(d)["rounds"]:
            if gap < config["datasetCooldownDays"]:
                blocked_ds.add(r["datasetId"])
            if gap < config["questionCooldownDays"]:
                blocked_q.add(r["questionId"])
    lo, hi = config["winRateGuard"]
    cands = []
    for q in load_catalog():
        if not (band["min"] <= q["size"] <= band["max"] and lower < q["size"] < upper):
            continue
        if q["dataset"] in blocked_ds or q["id"] in blocked_q or q["id"] == day["rounds"][idx]["questionId"]:
            continue
        if q["dataset"] in {r["datasetId"] for r in others}:
            continue
        sizes = [r["size"] for r in day["rounds"]]
        sizes[idx] = q["size"]
        if lo <= win_rate(sizes, config["activitySurvival"], config["playerHits"]) <= hi:
            cands.append(q)
    if args.dataset:
        cands = [q for q in cands if q["dataset"] == args.dataset]
    if not cands:
        sys.exit("no valid replacement question")
    q = random.choice(cands)
    day["rounds"][idx] = {
        "round": band["round"],
        "questionId": q["id"],
        "datasetId": q["dataset"],
        "prompt": q["prompt"],
        "size": q["size"],
        "answers": q["answers"],
    }
    day["winRate"] = round(win_rate([r["size"] for r in day["rounds"]], config["activitySurvival"], config["playerHits"]), 4)
    day["approved"] = False
    write_json(schedule_path(args.date), day, compact_lists=True)
    print(f"{len(cands)} candidates; picked:")
    show(day)


def cmd_activity(args) -> None:
    acts = {a["id"] for a in load_activities() if a["enabled"]}
    if args.activity not in acts:
        sys.exit(f"unknown activity; choose from {sorted(acts)}")
    day = load_schedule(args.date)
    if not day:
        sys.exit(f"{args.date}: not scheduled")
    for n in (-1, 1):
        neighbor = load_schedule(add_days(args.date, n))
        if neighbor and neighbor["activity"] == args.activity:
            sys.exit(f"{neighbor['date']} already uses {args.activity}")
    day["activity"] = args.activity
    write_json(schedule_path(args.date), day, compact_lists=True)
    show(day)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("--from", dest="start")
    p.add_argument("--days", type=int, default=14)
    p.set_defaults(fn=cmd_list)
    p = sub.add_parser("approve")
    p.add_argument("dates", nargs="*")
    p.add_argument("--through")
    p.set_defaults(fn=cmd_approve)
    p = sub.add_parser("swap")
    p.add_argument("date")
    p.add_argument("--round", type=int, required=True)
    p.add_argument("--dataset", help="limit replacements to one dataset")
    p.set_defaults(fn=cmd_swap)
    p = sub.add_parser("activity")
    p.add_argument("date")
    p.add_argument("activity")
    p.set_defaults(fn=cmd_activity)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
