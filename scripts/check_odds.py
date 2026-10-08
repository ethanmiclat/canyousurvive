#!/usr/bin/env python3
"""Verify the plan's odds table (section 2), the health math, and every scheduled day's win rate."""

from __future__ import annotations

import sys

from gen_lib import RPS_SURVIVAL, COIN_SURVIVAL, load_config, load_schedule, schedule_dates, win_rate

PLAN_TABLE = [0.99, 0.9405, 0.806, 0.672, 0.537, 0.269, 0.134]


def cumulative(sizes, activity):
    out, p = [], 1.0
    for s in [1 - 1 / n for n in sizes] + [activity, RPS_SURVIVAL, COIN_SURVIVAL]:
        p *= s
        out.append(p)
    return out


def main() -> int:
    config = load_config()
    act = config["activitySurvival"]
    ok = True

    print("Reference run (100 > 20 > 7 > 6):")
    cum = cumulative([100, 20, 7, 6], act)
    for i, (got, want) in enumerate(zip(cum, PLAN_TABLE), start=1):
        flag = "ok" if abs(got - want) < 0.0006 else "MISMATCH"
        ok &= flag == "ok"
        print(f"  after round {i}: {got:.4%}  (plan {want:.2%})  {flag}")
    wr = win_rate([100, 20, 7, 6], act)
    print(f"  win rate {wr:.4%} = 1 in {1 / wr:.2f}")
    # With one hit allowed the run must equal sudden death, so the health math reduces to the plan.
    ok &= abs(win_rate([100, 20, 7, 6], act, 1) - wr) < 1e-15

    hits = config["playerHits"]
    sizes = [100, 20, 8, 5, 4, 3]
    print(f"\nHealth run (100 > 20 > 8 > 5 > 4 > 3, {hits} hits): win rate {win_rate(sizes, act, hits):.2%}")

    # RPS with ties replaying: P(win) = (1/3) / (2/3)
    rps = (1 / 3) / (1 - 1 / 3)
    ok &= abs(rps - RPS_SURVIVAL) < 1e-12

    lo, hi = config["winRateGuard"]
    dates = schedule_dates()
    bad = []
    for d in dates:
        day = load_schedule(d)
        w = win_rate([r["size"] for r in day["rounds"]], act, hits)
        if not lo <= w <= hi:
            bad.append((d, w))
    print(f"\nScheduled days: {len(dates)}; outside {lo:.0%}-{hi:.0%}: {len(bad)}")
    for d, w in bad:
        print(f"  {d}: {w:.2%}")
    ok &= not bad
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
