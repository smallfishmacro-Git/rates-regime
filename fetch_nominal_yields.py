#!/usr/bin/env python3
"""Fetch nominal Treasury yields (2/5/10/30Y CMT) from FRED.

Writes data/nominal_yields.csv with schema: date,US2Y,US5Y,US10Y,US30Y

Replaces the market-radar.com source: in Aug 2026 their API moved behind
Cloudflare bot protection that blocks non-browser/datacenter clients
regardless of credentials, and their dashboard switched nominal yields to
a batched endpoint. FRED serves the same H.15 constant-maturity Treasury
series (DGS2/DGS5/DGS10/DGS30) via a stable public API — same pattern as
fetch_fred.py. Runs in GitHub Actions (FRED blocks Vercel IPs, not
Actions runners).
"""

from __future__ import annotations

import csv
import os
import sys
import time
from pathlib import Path

import requests

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
API_KEY = os.environ.get("FRED_API_KEY", "").strip()

START = "2020-05-11"  # first row of the pre-existing CSV; keeps the chart window stable
SERIES = {  # output column -> FRED series id
    "US2Y": "DGS2",
    "US5Y": "DGS5",
    "US10Y": "DGS10",
    "US30Y": "DGS30",
}

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "nominal_yields.csv"


def fetch_series(series_id: str) -> dict[str, str]:
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "observation_start": START,
    }
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(FRED_BASE, params=params, timeout=30)
            r.raise_for_status()
            obs = r.json().get("observations", [])
            out = {}
            for o in obs:
                v = (o.get("value") or "").strip()
                if v and v != ".":
                    out[o["date"]] = v
            return out
        except Exception as exc:
            last_err = exc
            time.sleep(2 * (attempt + 1))
    sys.exit(f"{series_id} failed after 3 attempts: {last_err}")


def main() -> None:
    if not API_KEY:
        sys.exit("FRED_API_KEY not set")

    columns = list(SERIES)
    data: dict[str, dict[str, str]] = {}
    for col, sid in SERIES.items():
        obs = fetch_series(sid)
        if not obs:
            sys.exit(f"{sid} returned no observations")
        data[col] = obs
        print(f"  {sid} -> {col}: {len(obs)} obs, last {max(obs)}", flush=True)

    # keep only dates where all four series have a value (drops holiday rows)
    dates = sorted(set.intersection(*(set(d) for d in data.values())))
    if not dates:
        sys.exit("no overlapping dates across series")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date"] + columns)
        for d in dates:
            w.writerow([d] + [data[c][d] for c in columns])

    print(f"wrote {len(dates)} rows -> {OUT_PATH}")
    print(f"  span: {dates[0]} -> {dates[-1]}")


if __name__ == "__main__":
    main()
