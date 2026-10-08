#!/usr/bin/env python3
"""Schedule daily boards: writes content/schedule/YYYY-MM-DD.json.

Per day: 4 typed questions with set sizes inside the round bands and strictly shrinking, all from different
datasets, no dataset reused within datasetCooldownDays, no question reused within questionCooldownDays,
win rate inside winRateGuard, and an activity that differs from yesterday's.

Examples:
  python3 scripts/generate.py                      # make sure today + aheadDays are scheduled
  python3 scripts/generate.py --start 2026-10-07 --days 60
  python3 scripts/generate.py --start 2026-11-01 --days 7 --overwrite   # redo unapproved days
  python3 scripts/generate.py --date 2026-10-07 --dry-run              # print one day, write nothing
"""

from __future__ import annotations

import argparse
import json
import sys

from gen_lib import (
    add_days,
    generate_day,
    history_for,
    load_activities,
    load_catalog,
    load_config,
    load_schedule,
    schedule_path,
    today_in_zone,
    write_json,
)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", help="first date (default: today in the game timezone)")
    ap.add_argument("--days", type=int, help="number of days (default: config aheadDays)")
    ap.add_argument("--date", help="single date (same as --start D --days 1)")
    ap.add_argument("--overwrite", action="store_true", help="regenerate existing unapproved days in range")
    ap.add_argument("--dry-run", action="store_true", help="print instead of writing")
    args = ap.parse_args()

    config = load_config()
    catalog = load_catalog()
    activities = load_activities()
    start = args.date or args.start or today_in_zone(config["timezone"])
    days = 1 if args.date else (args.days or config["aheadDays"])

    generated: dict[str, dict] = {}
    written = skipped = 0
    for i in range(days):
        d = add_days(start, i)
        existing = load_schedule(d)
        if existing and (existing.get("approved") or not args.overwrite):
            skipped += 1
            continue
        history = history_for(d, config, generated)
        try:
            day = generate_day(d, config, catalog, activities, history)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            sys.exit(1)
        generated[d] = day
        if args.dry_run:
            print(json.dumps({**day, "rounds": [{k: v for k, v in r.items() if k != "answers"} for r in day["rounds"]]}, indent=2))
        else:
            write_json(schedule_path(d), day, compact_lists=True)
            written += 1
            sizes = " > ".join(str(r["size"]) for r in day["rounds"])
            print(f"{d}  win {day['winRate']:.2%}  sizes {sizes}  activity {day['activity']}")
    if not args.dry_run:
        print(f"wrote {written} day(s), kept {skipped} existing")


if __name__ == "__main__":
    main()
