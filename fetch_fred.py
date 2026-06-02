#!/usr/bin/env python3
"""Fetch FRED series and write data/fred.json for the rates dashboard.

Replaces the live, server-side FRED calls the /api/rates route used to make
from Vercel (FRED blocks/throttles datacenter IPs). Runs in GitHub Actions on
GitHub's IPs, once per weekday, and commits a static JSON the route reads from
raw.githubusercontent — same pattern as nominal yields / swaps / SOFR.

Each series is a list of {"date","value"} with '.'/null dropped, ascending by
date, so the route's computeInflationYoY and buildYieldCurve consume it as-is.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
API_KEY = os.environ.get("FRED_API_KEY", "").strip()

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "fred.json"

RATE_SERIES = [
    "EFFR", "SOFR", "DFEDTARU", "DFEDTARL",
    "DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS3",
    "DGS5", "DGS7", "DGS10", "DGS20", "DGS30",
    "T10Y2Y", "T10Y3M",
    "T5YIE", "T10YIE", "T5YIFR", "DFII10",
]
HISTORY_SERIES = {
    "CPIAUCSL": "1947-01-01", "CPILFESL": "1947-01-01",
    "PCEPI": "1947-01-01", "PCEPILFE": "1947-01-01",
}
CURVE_SERIES = {"DGS1": "2020-01-01", "DFII30": "2020-01-01"}


def fetch_series(series_id, *, limit=None, observation_start=None):
    params = {"series_id": series_id, "api_key": API_KEY, "file_type": "json"}
    if observation_start:
        params["observation_start"] = observation_start
        params["sort_order"] = "asc"
    else:
        params["sort_order"] = "desc"
        params["limit"] = str(limit or 10)

    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(FRED_BASE, params=params, timeout=30)
            if r.status_code == 200:
                out = []
                for o in r.json().get("observations", []):
                    v = o.get("value")
                    if v in (None, ".", ""):
                        continue
                    try:
                        out.append({"date": o["date"], "value": float(v)})
                    except (TypeError, ValueError):
                        continue
                if observation_start is None:
                    out.reverse()  # store ascending
                return out
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
        except requests.RequestException as e:
            last_err = str(e)
        time.sleep(2 * (attempt + 1))
    print(f"  !! {series_id} failed: {last_err}", file=sys.stderr)
    return []


def main():
    if not API_KEY:
        print("FRED_API_KEY not set", file=sys.stderr)
        return 1
    if len(API_KEY) != 32:
        print(f"warning: FRED_API_KEY is {len(API_KEY)} chars (expected 32)", file=sys.stderr)

    series = {}
    for sid in RATE_SERIES:
        series[sid] = fetch_series(sid, limit=10)
        print(f"  {sid}: {len(series[sid])} obs")
        time.sleep(0.3)
    for sid, start in {**HISTORY_SERIES, **CURVE_SERIES}.items():
        series[sid] = fetch_series(sid, observation_start=start)
        print(f"  {sid}: {len(series[sid])} obs (from {start})")
        time.sleep(0.3)

    populated = sum(1 for v in series.values() if v)
    if populated == 0:
        print("ERROR: every series empty — not writing fred.json", file=sys.stderr)
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(
        {"as_of": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "series": series},
        separators=(",", ":"),
    ))
    print(f"wrote {OUTPUT_PATH} ({populated}/{len(series)} series populated)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
