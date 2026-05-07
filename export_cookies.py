#!/usr/bin/env python3
"""Export market-radar.com session state for use in CI.

Captures the full Playwright ``storage_state`` (cookies + localStorage) for
``market-radar.com`` and writes it to ``cookies.json`` at the repo root. The
filename is preserved for the documented GitHub Secret name
(``MARKET_RADAR_COOKIES``), but the payload is the full storage state since
market-radar holds its auth token in localStorage.

Tries the real Chrome profile first (so brand-new setups still work). On
Chrome 136+ the default profile rejects CDP access — in that case we fall
back to the dedicated ``.chrome-profile`` directory used by
``fetch_inflation_swaps.py``, which is already logged in once the user has
run the local fetch at least once.

IMPORTANT: close all Chrome windows before running, otherwise Playwright
cannot acquire the profile lock.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

DASHBOARD_URL = "https://www.market-radar.com/dashboard/quantbase?workspace=macro-monitor"
COOKIE_DOMAIN_NEEDLE = "market-radar.com"

ROOT = Path(__file__).resolve().parent
COOKIES_PATH = ROOT / "cookies.json"
GITIGNORE_PATH = ROOT / ".gitignore"

REAL_PROFILE = Path(r"C:\Users\bmonchablon\AppData\Local\Google\Chrome\User Data")
DEDICATED_PROFILE = ROOT / ".chrome-profile"


def ensure_gitignored(entry: str = "cookies.json") -> None:
    if GITIGNORE_PATH.exists():
        lines = GITIGNORE_PATH.read_text(encoding="utf-8").splitlines()
        if entry in lines:
            return
        text = GITIGNORE_PATH.read_text(encoding="utf-8")
        if text and not text.endswith("\n"):
            text += "\n"
        text += entry + "\n"
        GITIGNORE_PATH.write_text(text, encoding="utf-8")
    else:
        GITIGNORE_PATH.write_text(entry + "\n", encoding="utf-8")


def export_with_profile(profile_dir: str) -> dict | None:
    """Launch Chrome with the given persistent profile and return market-radar storage state."""
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            channel="chrome",
            headless=False,
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(8_000)
            state = ctx.storage_state()
        finally:
            ctx.close()

    # Filter to market-radar.com only
    state["cookies"] = [
        c for c in state.get("cookies", [])
        if COOKIE_DOMAIN_NEEDLE in c.get("domain", "")
    ]
    state["origins"] = [
        o for o in state.get("origins", [])
        if COOKIE_DOMAIN_NEEDLE in o.get("origin", "")
    ]
    return state


def main() -> None:
    ensure_gitignored("cookies.json")

    candidates: list[tuple[str, Path]] = []
    if REAL_PROFILE.exists():
        candidates.append(("real Chrome profile", REAL_PROFILE))
    if DEDICATED_PROFILE.exists():
        candidates.append(("dedicated .chrome-profile", DEDICATED_PROFILE))

    if not candidates:
        sys.exit(
            "no Chrome profile found.\n"
            f"  expected one of: {REAL_PROFILE} or {DEDICATED_PROFILE}\n"
            "  for the dedicated profile, run fetch_inflation_swaps.py first to seed it"
        )

    last_err: Exception | None = None
    for label, path in candidates:
        print(f"\ntrying {label}: {path}")
        print("  if Chrome is open, close all windows first")
        try:
            state = export_with_profile(str(path))
        except Exception as exc:
            last_err = exc
            print(f"  failed: {exc}")
            continue

        n_cookies = len(state.get("cookies", []))
        n_ls = sum(len(o.get("localStorage", [])) for o in state.get("origins", []))
        if n_cookies == 0 and n_ls == 0:
            print(f"  no market-radar.com state found in {label}")
            continue

        COOKIES_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(
            f"\nsaved {n_cookies} cookies + {n_ls} localStorage entries -> {COOKIES_PATH}"
        )
        print("Done. Copy the contents of cookies.json into GitHub Secret MARKET_RADAR_COOKIES")
        return

    sys.exit(
        "\ncould not export from any available Chrome profile.\n"
        f"  last error: {last_err}\n"
        "  Chrome 136+ blocks CDP on the default User Data dir; the dedicated\n"
        "  .chrome-profile is the supported path."
    )


if __name__ == "__main__":
    main()
