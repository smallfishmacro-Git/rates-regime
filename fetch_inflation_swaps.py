#!/usr/bin/env python3
"""Fetch US 2Y/5Y/10Y inflation swap rates from market-radar.com.

Two modes are supported:

* **LOCAL** (default): launches a real Chrome window using a dedicated profile
  under ``./.chrome-profile``. First run prompts you to sign in; subsequent
  runs reuse the saved session.
* **CI** (``MARKET_RADAR_COOKIES`` env var set): launches headless Chromium and
  injects the JSON cookies from the env var. Designed for GitHub Actions.

In both modes the script listens for the dashboard's combined API response
(``/api/data?provider=US&series=US2YIS,US5YIS,US10YIS&years=6``) and merges
the captured payload into ``data/inflation_swaps.csv``.

A dedicated Chrome profile is required in LOCAL mode because Chrome 136+
refuses DevTools/CDP access on the default ``User Data`` directory.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
from playwright.sync_api import sync_playwright

DASHBOARD_URL = "https://www.market-radar.com/dashboard/quantbase?workspace=macro-monitor"
SERIES = ["US2YIS", "US5YIS", "US10YIS"]

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "data" / "inflation_swaps.csv"
CHROME_USER_DATA = ROOT / ".chrome-profile"

COOKIES_ENV = "MARKET_RADAR_COOKIES"

CAPTURE_TIMEOUT_LOCAL_S = 300
CAPTURE_TIMEOUT_CI_S = 60

# Real Chrome UA — keeps "HeadlessChrome" out of the user-agent so the
# dashboard doesn't gate the load on a bot check.
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


def _make_response_handler(state: dict, save_debug: Path | None = None):
    """Build a Playwright response listener that fills ``state['payload']``.

    ``state`` is mutated in place because the listener can't return values.
    """
    debug_seen: set[str] = set()
    debug_f = save_debug.open("w", encoding="utf-8") if save_debug else None

    def on_response(response):
        if state.get("payload") is not None:
            return
        req = response.request
        if debug_f and req.resource_type in ("xhr", "fetch") and response.url not in debug_seen:
            debug_seen.add(response.url)
            debug_f.write(f"{response.status} {response.url}\n")
            debug_f.flush()
        matches = _matched_series(response.url)
        if not matches:
            return
        try:
            state["payload"] = response.json()
            print(f"  captured {matches} from {response.url}", flush=True)
        except Exception as exc:
            print(f"  failed to parse: {exc}", flush=True)

    state["_debug_close"] = (lambda: debug_f.close()) if debug_f else (lambda: None)
    return on_response


def fetch_local() -> dict | None:
    """LOCAL mode — open Chrome with a dedicated profile, sign-in interactively."""
    state: dict = {"payload": None}
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
        on_response = _make_response_handler(state, save_debug=debug_path)

        page.on("response", on_response)
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)

        deadline = time.time() + CAPTURE_TIMEOUT_LOCAL_S
        while time.time() < deadline and state["payload"] is None:
            page.wait_for_timeout(1000)

        page.remove_listener("response", on_response)
        ctx.close()
        state["_debug_close"]()
        if state["payload"] is None:
            print(
                f"\nno matches — XHR URLs dumped to {debug_path}",
                flush=True,
            )

    return state["payload"]


def _try_click(page, text: str, timeout_ms: int = 4000) -> bool:
    """Best-effort case-insensitive click on a tab/link by visible text."""
    try:
        loc = page.get_by_text(re.compile(re.escape(text), re.I)).first
        loc.click(timeout=timeout_ms)
        return True
    except Exception:
        return False


def fetch_ci(state_json: str) -> dict | None:
    """CI mode — headless, inject storage state from env var, no Chrome profile.

    The env var contains a Playwright storage_state JSON
    (cookies + localStorage). For backward-compat, a bare cookie array is
    also accepted.
    """
    try:
        parsed = json.loads(state_json)
    except json.JSONDecodeError as exc:
        sys.exit(f"MARKET_RADAR_COOKIES is not valid JSON: {exc}")

    if isinstance(parsed, list):
        storage_state = {"cookies": parsed, "origins": []}
    elif isinstance(parsed, dict) and "cookies" in parsed:
        storage_state = parsed
    else:
        sys.exit(
            "MARKET_RADAR_COOKIES must be a JSON storage_state object "
            "(with 'cookies' and 'origins') or a cookie array"
        )

    n_cookies = len(storage_state.get("cookies", []))
    n_ls = sum(len(o.get("localStorage", [])) for o in storage_state.get("origins", []))
    print(f"CI mode — injecting {n_cookies} cookies + {n_ls} localStorage entries", flush=True)

    state: dict = {"payload": None}
    deadline = time.time() + CAPTURE_TIMEOUT_CI_S

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            ctx = browser.new_context(
                storage_state=storage_state,
                user_agent=CI_USER_AGENT,
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
            )
        except Exception as exc:
            browser.close()
            sys.exit(f"failed to apply storage_state: {exc}")

        page = ctx.new_page()
        on_response = _make_response_handler(state)
        page.on("response", on_response)

        try:
            page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)
            page.reload(wait_until="domcontentloaded", timeout=60_000)
            try:
                page.wait_for_load_state("networkidle", timeout=25_000)
            except Exception:
                print("  networkidle wait timed out, continuing", flush=True)

            print(f"  page title: {page.title()!r}", flush=True)
            print(f"  page url:   {page.url}", flush=True)

            if _try_click(page, "MACRO MONITOR"):
                print("  clicked MACRO MONITOR", flush=True)
                page.wait_for_timeout(1500)
            else:
                print("  MACRO MONITOR tab not found (may already be active)", flush=True)

            if _try_click(page, "INFLATION"):
                print("  clicked INFLATION", flush=True)
                page.wait_for_timeout(1500)
            else:
                print("  INFLATION tab not found", flush=True)

            print("  waiting 15s for API to fire...", flush=True)
            sub_deadline = time.time() + 15
            while time.time() < sub_deadline and state["payload"] is None:
                page.wait_for_timeout(500)

            # remaining slack up to total CAPTURE_TIMEOUT_CI_S
            while time.time() < deadline and state["payload"] is None:
                page.wait_for_timeout(500)
        finally:
            page.remove_listener("response", on_response)
            ctx.close()
            browser.close()

    return state["payload"]


def _walk_to_data(payload):
    """Drill through common wrapper keys until we find series data."""
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

        # long format: rows tagged with series_id + value
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

        # wide format: list of dicts with date + series columns
        if any(s in cols for s in SERIES):
            df = pd.DataFrame(body)
            dcol = next(
                (c for c in df.columns if c.lower() in ("date", "timestamp", "time", "t")),
                df.columns[0],
            )
            keep = [c for c in df.columns if c in SERIES]
            df = df[[dcol] + keep].rename(columns={dcol: "date"})
            return _finalize(df)

    # series-keyed dict: {US2YIS: [...], US5YIS: [...], ...}
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
    return df.dropna(subset=["date"]).sort_values("date")


def save(df: pd.DataFrame) -> pd.DataFrame:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists():
        existing = pd.read_csv(OUTPUT_PATH)
        df = pd.concat([existing, df], ignore_index=True)
    df = df.drop_duplicates(subset=["date"], keep="last").sort_values("date")
    cols = ["date"] + [c for c in SERIES if c in df.columns]
    df = df[cols]
    df.to_csv(OUTPUT_PATH, index=False)
    return df


def main():
    ci_cookies = os.environ.get(COOKIES_ENV)

    if ci_cookies:
        payload = fetch_ci(ci_cookies)
        if payload is None:
            print(
                f"warning: no API response captured within {CAPTURE_TIMEOUT_CI_S}s — "
                "exiting cleanly so the workflow doesn't fail",
                flush=True,
            )
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
