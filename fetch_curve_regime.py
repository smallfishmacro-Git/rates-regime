#!/usr/bin/env python3
"""Fetch full-history Treasury constant-maturity yields for the CURVE REGIME tab.

Companion to ``fetch_fred.py``. That script keeps ``data/fred.json`` lean (only
the last ~10 observations of each daily series, which is all the live dashboard
reads via ``.at(-1)``). The CURVE REGIME tab instead needs *years* of daily
history for its scatter / timeline / distribution, so it gets its own dedicated
pipeline and its own static JSON — same GitHub-Actions-on-GitHub-IPs pattern,
committed and served from raw.githubusercontent (FRED throttles Vercel IPs).

Five constant-maturity tenors are pulled so all eight curve pairs the tab
exposes are covered:

    3M  -> DGS3MO        2Y -> DGS2        5Y -> DGS5
    10Y -> DGS10         30Y -> DGS30

The five series are inner-joined on dates present in *all* of them (rare single
series gaps are simply dropped, never fabricated), then written column-oriented
and ascending so the client can compute lookback deltas by plain index offset.

Output: data/curve_regime.json
    { "as_of", "generated", "tenors", "dates":[...],
      "y3m":[...], "y2":[...], "y5":[...], "y10":[...], "y30":[...] }
Yields are in percent, exactly as FRED reports them; the client multiplies the
lookback change by 100 to get basis points.

Tunable: OBSERVATION_START controls how much history is committed (a few years
of buffer beyond the tab's 5Y window so large lookbacks still have data). Env
override CURVE_REGIME_START lets CI change it without a code edit.
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

# ---- tunable constants -------------------------------------------------------
# Earliest observation to commit. 5Y display window + headroom for big lookbacks.
OBSERVATION_START = os.environ.get("CURVE_REGIME_START", "2017-01-01").strip()
# ----------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "curve_regime.json"

# output key -> FRED series id
TENORS = {
    "y3m": "DGS3MO",
    "y2": "DGS2",
    "y5": "DGS5",
    "y10": "DGS10",
    "y30": "DGS30",
}


def fetch_series(series_id, observation_start):
    """Return {date: float} for a FRED series from observation_start, ascending.

    '.'/empty observations (holidays / missing prints) are skipped. Retries a
    few times on transient errors before giving up on that series.
    """
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(FRED_BASE, params=params, timeout=30)
            if r.status_code == 200:
                out = {}
                for o in r.json().get("observations", []):
                    v = o.get("value")
                    if v in (None, ".", ""):
                        continue
                    try:
                        out[o["date"]] = float(v)
                    except (TypeError, ValueError):
                        continue
                return out
            last_err = f"HTTP {r.status_code}: {r.text[:200]}"
        except requests.RequestException as e:
            last_err = str(e)
        time.sleep(2 * (attempt + 1))
    print(f"  !! {series_id} failed: {last_err}", file=sys.stderr)
    return {}


def build_payload(series_maps):
    """Inner-join the per-tenor {date: value} maps on dates present in all."""
    keys = list(TENORS.keys())
    common = None
    for k in keys:
        dates = set(series_maps[k].keys())
        common = dates if common is None else (common & dates)
    common = sorted(common or [])

    payload = {"dates": common}
    for k in keys:
        m = series_maps[k]
        payload[k] = [round(m[d], 3) for d in common]
    return payload


def main():
    if not API_KEY:
        print("FRED_API_KEY not set", file=sys.stderr)
        return 1
    if len(API_KEY) != 32:
        print(f"warning: FRED_API_KEY is {len(API_KEY)} chars (expected 32)", file=sys.stderr)

    series_maps = {}
    for key, sid in TENORS.items():
        m = fetch_series(sid, OBSERVATION_START)
        series_maps[key] = m
        print(f"  {sid} ({key}): {len(m)} obs (from {OBSERVATION_START})")
        time.sleep(0.3)

    if any(len(m) == 0 for m in series_maps.values()):
        empty = [TENORS[k] for k, m in series_maps.items() if not m]
        print(f"ERROR: empty series {empty} — not writing curve_regime.json", file=sys.stderr)
        return 1

    payload = build_payload(series_maps)
    n = len(payload["dates"])
    if n < 300:
        print(f"ERROR: only {n} aligned rows — refusing to write", file=sys.stderr)
        return 1

    out = {
        "as_of": payload["dates"][-1],
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tenors": list(TENORS.keys()),
        **payload,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUTPUT_PATH}: {n} aligned rows, as_of {out['as_of']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
