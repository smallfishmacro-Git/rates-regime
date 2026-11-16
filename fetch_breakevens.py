#!/usr/bin/env python3
"""Fetch US 5Y and 10Y breakeven inflation from FRED (T5YIE, T10YIE).

Replaces fetch_inflation_swaps.py: market-radar dropped its inflation swaps in
the Terminal redesign (late Oct 2026). These are TIPS breakevens, not swaps.
There is no 2Y TIPS breakeven, so the 2Y inflation and real legs are dropped.

Runs in GitHub Actions (FRED throttles Vercel) and rewrites the full history
every run, so a missed day backfills itself. Output, data/breakevens.csv:
    date,US5YBE,US10YBE      (percent)
"""
from __future__ import annotations

import csv
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
API_KEY = os.environ.get("FRED_API_KEY", "").strip()

START = "2020-05-11"  # same first date as data/nominal_yields.csv
COLUMNS = {"US5YBE": "T5YIE", "US10YBE": "T10YIE"}

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "breakevens.csv"

MIN_ROWS = 1500        # full history since START is ~1,630 days; fewer = truncated reply
MAX_STALE_DAYS = 10    # newest observation older than this = feed problem
SANE_RANGE = (-3.0, 8.0)


def fetch(series_id: str) -> dict[str, float]:
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "observation_start": START,
        "sort_order": "asc",
    }
    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(FRED_BASE, params=params, timeout=30)
            if r.status_code == 200:
                out: dict[str, float] = {}
                for o in r.json().get("observations", []):
                    v = o.get("value")
                    if v in (None, "", "."):
                        continue
                    try:
                        out[o["date"]] = float(v)
                    except (TypeError, ValueError):
                        continue
                return out
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
        except requests.RequestException as exc:
            last_err = str(exc)
        time.sleep(2 * (attempt + 1))
    sys.exit(f"{series_id}: FRED fetch failed: {last_err}")


def main() -> int:
    if not API_KEY:
        sys.exit("FRED_API_KEY not set")

    data = {col: fetch(sid) for col, sid in COLUMNS.items()}
    for col, obs in data.items():
        print(f"  {COLUMNS[col]}: {len(obs)} obs", flush=True)

    dates = sorted(set().union(*data.values()))
    if len(dates) < MIN_ROWS:
        sys.exit(f"only {len(dates)} dates returned (expected >= {MIN_ROWS}); not writing")

    newest = date.fromisoformat(dates[-1])
    age = (datetime.now(timezone.utc).date() - newest).days
    if age > MAX_STALE_DAYS:
        sys.exit(f"newest observation {newest} is {age} days old; not writing")

    lo, hi = SANE_RANGE
    bad = [(c, d, v) for c, obs in data.items() for d, v in obs.items() if not lo <= v <= hi]
    if bad:
        sys.exit(f"values outside {SANE_RANGE}, first: {bad[0]}; not writing")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["date", *COLUMNS])
        for d in dates:
            w.writerow([d, *("" if data[c].get(d) is None else data[c][d] for c in COLUMNS)])

    last = {c: data[c].get(dates[-1]) for c in COLUMNS}
    print(f"wrote {OUTPUT_PATH.name}: {len(dates)} rows, {dates[0]} -> {dates[-1]}, latest {last}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
