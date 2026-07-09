#!/usr/bin/env python3
"""Fetch daily adjusted closes for the CURVE REGIME backtest module.

Same GitHub-Actions-on-GitHub-IPs pattern as fetch_curve_regime.py (Yahoo
throttles Vercel IPs): pull once a day in CI, commit static JSON, serve via
raw.githubusercontent through /api/backtest.

Seven ETFs cover the playbook asset classes:

    SPY  S&P 500       QQQ  Nasdaq 100    TLT  20Y+ Treasuries
    UUP  USD index     GLD  Gold          USO  WTI oil
    BITO Bitcoin futures (inception 2021-10)

Prices are yfinance auto-adjusted closes (splits + dividends reinvested) so
per-regime CAGRs are total-return comparable across equity/bond/commodity legs.
Column-oriented output, ascending, null before a ticker's inception:

Output: data/backtest_assets.json
    { "as_of", "generated", "tickers", "dates":[...], "SPY":[...], ... }

START matches the curve pipeline floor (DGS30 resumes 2006-02) so regime and
asset history line up. Env override BACKTEST_ASSETS_START.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

TICKERS = ["SPY", "QQQ", "TLT", "UUP", "GLD", "USO", "BITO"]
START = os.environ.get("BACKTEST_ASSETS_START", "2006-03-01").strip()

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "backtest_assets.json"

# minimum observations per ticker before we trust the pull
MIN_OBS = {"SPY": 4500, "QQQ": 4500, "TLT": 4500, "UUP": 4000,
           "GLD": 4500, "USO": 4000, "BITO": 800}


def fetch_one(ticker):
    """Return {date: adj close float} for one ticker, ascending. Retries."""
    last_err = None
    for attempt in range(3):
        try:
            df = yf.download(ticker, start=START, auto_adjust=True,
                             progress=False, threads=False)
            if df is not None and len(df):
                close = df["Close"]
                if isinstance(close, pd.DataFrame):  # newer yfinance: MultiIndex cols
                    close = close.iloc[:, 0]
                close = close.dropna()
                return {d.strftime("%Y-%m-%d"): float(v) for d, v in close.items()}
            last_err = "empty frame"
        except Exception as e:  # yfinance raises many types
            last_err = str(e)
        time.sleep(3 * (attempt + 1))
    print(f"  !! {ticker} failed: {last_err}", file=sys.stderr)
    return {}


def main():
    maps = {}
    for t in TICKERS:
        m = fetch_one(t)
        maps[t] = m
        first = min(m) if m else "-"
        print(f"  {t}: {len(m)} obs (first {first})")
        time.sleep(1.0)

    bad = [t for t in TICKERS if len(maps[t]) < MIN_OBS[t]]
    if bad:
        print(f"ERROR: too few observations for {bad} - not writing", file=sys.stderr)
        return 1

    dates = sorted(set().union(*[set(m.keys()) for m in maps.values()]))
    out = {
        "as_of": dates[-1],
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tickers": TICKERS,
        "dates": dates,
    }
    for t in TICKERS:
        m = maps[t]
        out[t] = [round(m[d], 4) if d in m else None for d in dates]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUTPUT_PATH}: {len(dates)} rows, as_of {out['as_of']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
