#!/usr/bin/env python3
"""Fetch US 2Y/5Y/10Y/30Y nominal Treasury yields from market-radar.com.

Mirror of ``fetch_inflation_swaps.py`` — same Firebase refresh-token logic
for CI, same persistent-Chrome XHR-capture path for LOCAL, same CSV
append+deduplicate persistence. Only the series IDs, output path, and
column rename differ.

Market-radar's series IDs for nominal Treasury yields are
``US2YT, US5YT, US10YT, US30YT`` (the ``T`` suffix means Treasury). The
CSV is written with the simpler ``US2Y, US5Y, US10Y, US30Y`` column names
so the dashboard route can read it without renaming.

A dedicated ``.chrome-profile`` is reused in LOCAL mode because Chrome
136+ refuses DevTools/CDP access on the default Google Chrome ``User
Data`` directory.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
import requests

DASHBOARD_URL = "https://www.market-radar.com/dashboard/quantbase?workspace=macro-monitor"
API_URL = "https://www.market-radar.com/api/data"
TOKEN_REFRESH_URL = "https://securetoken.googleapis.com/v1/token"
SERIES = ["US2YT", "US5YT", "US10YT", "US30YT"]
COLUMN_RENAME = {"US2YT": "US2Y", "US5YT": "US5Y", "US10YT": "US10Y", "US30YT": "US30Y"}
OUTPUT_COLUMNS = ["US2Y", "US5Y", "US10Y", "US30Y"]

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "nominal_yields.csv"
CHROME_USER_DATA = ROOT / ".chrome-profile"

COOKIES_ENV = "MARKET_RADAR_COOKIES"

CAPTURE_TIMEOUT_LOCAL_S = 300

CI_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _matched_series(url: str) -> list[str]:
    parsed = urlparse(url)
    if not parsed.path.endswith("/api/data"):
        return []
    qs = parse_qs(parsed.query)
    if qs.get("provider", [None])[0] != "US":
        return []
    raw = qs.get("series", [""])[0]
    return [s.strip() for s in raw.split(",") if s.strip() in SERIES]


def fetch_local() -> dict | None:
    """LOCAL mode — open Chrome with a dedicated profile, capture the API response."""
    from playwright.sync_api import sync_playwright  # lazy: not needed in CI

    payload: dict | None = None
    first_run = not CHROME_USER_DATA.exists()
    CHROME_USER_DATA.mkdir(parents=True, exist_ok=True)

    if first_run:
        print("first run — sign in to market-radar.com when the window opens")
        print(f"profile dir: {CHROME_USER_DATA}")

    with sync_playwright() as p:
        try:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=str(CHROME_USER_DATA),
                channel="chrome",
                headless=False,
            )
        except Exception as exc:
            sys.exit(f"failed to launch Chrome.\n  {exc}")

        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        debug_path = CHROME_USER_DATA / "_debug_urls.log"
        debug_seen: set[str] = set()
        debug_f = debug_path.open("w", encoding="utf-8")

        def on_response(response):
            nonlocal payload
            req = response.request
            if req.resource_type in ("xhr", "fetch") and response.url not in debug_seen:
                debug_seen.add(response.url)
                debug_f.write(f"{response.status} {response.url}\n")
                debug_f.flush()
            if payload is not None:
                return
            matches = _matched_series(response.url)
            if not matches:
                return
            try:
                payload = response.json()
                print(f"  captured {matches} from {response.url}", flush=True)
            except Exception as exc:
                print(f"  failed to parse: {exc}", flush=True)

        page.on("response", on_response)
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)
        print(
            "  if the yields XHR isn't captured automatically, click the tab/workspace\n"
            "  that loads nominal yields in the Chrome window that just opened.",
            flush=True,
        )

        deadline = time.time() + CAPTURE_TIMEOUT_LOCAL_S
        while time.time() < deadline and payload is None:
            page.wait_for_timeout(1000)

        page.remove_listener("response", on_response)
        ctx.close()
        debug_f.close()
        if payload is None:
            print(f"\nno matches — XHR URLs dumped to {debug_path}", flush=True)

    return payload


def _refresh_access_token(api_key: str, refresh_token: str) -> str:
    """Exchange a Firebase refresh token for a fresh access token (~1h lifetime)."""
    r = requests.post(
        f"{TOKEN_REFRESH_URL}?key={api_key}",
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        timeout=30,
    )
    if r.status_code != 200:
        sys.exit(
            f"firebase refresh failed: HTTP {r.status_code}\n"
            f"  {r.text[:300]}\n"
            "  the refresh token may have been revoked — re-run export_cookies.py"
        )
    data = r.json()
    return data["access_token"]


def fetch_ci(state_json: str) -> dict | None:
    """CI mode — refresh Firebase JWT and call /api/data directly. No browser."""
    try:
        state = json.loads(state_json)
    except json.JSONDecodeError as exc:
        sys.exit(f"MARKET_RADAR_COOKIES is not valid JSON: {exc}")

    if not isinstance(state, dict):
        sys.exit("MARKET_RADAR_COOKIES must be a JSON object")

    fb = state.get("firebase") or {}
    api_key = fb.get("api_key")
    refresh = fb.get("refresh_token")
    if not api_key or not refresh:
        sys.exit(
            "MARKET_RADAR_COOKIES missing firebase.api_key or firebase.refresh_token.\n"
            "  re-run export_cookies.py and update the secret."
        )

    print(
        f"CI mode — refreshing Firebase token "
        f"(uid={fb.get('uid', '?')}, email={fb.get('email', '?')})",
        flush=True,
    )
    access_token = _refresh_access_token(api_key, refresh)
    print(f"  got access token ({len(access_token)} chars)", flush=True)

    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": CI_USER_AGENT,
        "Referer": DASHBOARD_URL,
        "Accept": "application/json",
    }
    params = {"provider": "US", "series": ",".join(SERIES), "years": 6}
    r = requests.get(API_URL, params=params, headers=headers, timeout=60)
    if r.status_code != 200:
        sys.exit(
            f"market-radar API failed: HTTP {r.status_code}\n"
            f"  {r.text[:300]}"
        )
    print(f"  api response 200 ({len(r.content)} bytes)", flush=True)
    return r.json()


def _walk_to_data(payload):
    body = payload
    for _ in range(4):
        if not isinstance(body, dict):
            break
        if any(s in body for s in SERIES):
            break
        for key in ("data", "result", "series", "rows", "points", "response"):
            if key in body:
                body = body[key]
                break
        else:
            break
    return body


def _series_frame(rows, series: str) -> pd.DataFrame:
    if isinstance(rows, dict):
        if "dates" in rows and ("values" in rows or "value" in rows):
            return pd.DataFrame({"date": rows["dates"], series: rows.get("values") or rows["value"]})
        if "x" in rows and "y" in rows:
            return pd.DataFrame({"date": rows["x"], series: rows["y"]})
    if isinstance(rows, list) and rows:
        first = rows[0]
        if isinstance(first, dict):
            df = pd.DataFrame(rows)
            date_col = next(
                (c for c in df.columns if c.lower() in ("date", "timestamp", "time", "t", "x")),
                df.columns[0],
            )
            val_col = next(
                (
                    c
                    for c in df.columns
                    if c != date_col
                    and c.lower() in ("value", "v", "close", "price", "rate", "y")
                ),
                None,
            )
            if val_col is None:
                val_col = next(c for c in df.columns if c != date_col)
            return df[[date_col, val_col]].rename(columns={date_col: "date", val_col: series})
        if isinstance(first, (list, tuple)) and len(first) >= 2:
            return pd.DataFrame([(r[0], r[1]) for r in rows], columns=["date", series])
    raise ValueError(f"unrecognized rows shape for {series}: {type(rows).__name__}")


def to_dataframe(payload) -> pd.DataFrame:
    body = _walk_to_data(payload)

    if isinstance(body, list) and body and isinstance(body[0], dict):
        cols = set(body[0].keys())

        id_col = next((c for c in ("series_id", "series", "id", "name") if c in cols), None)
        val_col = next((c for c in ("value", "v", "close", "rate") if c in cols), None)
        date_col = next((c for c in ("date", "timestamp", "time", "t") if c in cols), None)
        if id_col and val_col and date_col:
            df = pd.DataFrame(body)
            df = df[df[id_col].isin(SERIES)]
            wide = df.pivot_table(index=date_col, columns=id_col, values=val_col, aggfunc="last")
            wide = wide.reset_index().rename(columns={date_col: "date"})
            wide.columns.name = None
            return _finalize(wide)

        if any(s in cols for s in SERIES):
            df = pd.DataFrame(body)
            dcol = next(
                (c for c in df.columns if c.lower() in ("date", "timestamp", "time", "t")),
                df.columns[0],
            )
            keep = [c for c in df.columns if c in SERIES]
            df = df[[dcol] + keep].rename(columns={dcol: "date"})
            return _finalize(df)

    if isinstance(body, dict):
        per = {s: body[s] for s in SERIES if s in body}
        if per:
            frames = [_series_frame(per[s], s) for s in SERIES if s in per]
            out = frames[0]
            for f in frames[1:]:
                out = out.merge(f, on="date", how="outer")
            return _finalize(out)

    raise ValueError(
        f"unrecognized payload shape: type={type(payload).__name__} "
        f"keys={list(payload.keys()) if isinstance(payload, dict) else 'n/a'}"
    )


def _finalize(df: pd.DataFrame) -> pd.DataFrame:
    parsed = pd.to_datetime(df["date"], errors="coerce", utc=True)
    if parsed.isna().all():
        nums = pd.to_numeric(df["date"], errors="coerce")
        unit = "ms" if nums.dropna().gt(10**11).all() else "s"
        parsed = pd.to_datetime(nums, unit=unit, utc=True, errors="coerce")
    df = df.copy()
    df["date"] = parsed.dt.strftime("%Y-%m-%d")
    df = df.dropna(subset=["date"]).sort_values("date")
    df = df.rename(columns=COLUMN_RENAME)
    return df


def save(df: pd.DataFrame) -> pd.DataFrame:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        existing = pd.read_csv(OUTPUT_PATH)
        df = pd.concat([existing, df], ignore_index=True)
    df = df.drop_duplicates(subset=["date"], keep="last").sort_values("date")
    cols = ["date"] + [c for c in OUTPUT_COLUMNS if c in df.columns]
    df = df[cols]
    df.to_csv(OUTPUT_PATH, index=False)
    return df


def main():
    ci_state = os.environ.get(COOKIES_ENV)

    if ci_state:
        payload = fetch_ci(ci_state)
        if payload is None:
            print("warning: no payload captured — exiting cleanly", flush=True)
            sys.exit(0)
    else:
        payload = fetch_local()
        if payload is None:
            sys.exit("no data captured — confirm the dashboard loaded and you're logged in")

    df = to_dataframe(payload)
    df = save(df)

    print(f"\nsaved {len(df)} rows -> {OUTPUT_PATH}")
    print("\nlast 5 rows:")
    print(df.tail(5).to_string(index=False))


if __name__ == "__main__":
    main()
