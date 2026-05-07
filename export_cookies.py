#!/usr/bin/env python3
"""Export market-radar.com session state for use in CI.

Captures the Firebase auth state (api_key + refresh token) from the
``firebaseLocalStorageDb`` IndexedDB store, plus cookies + localStorage,
and writes the bundle to ``cookies.json`` at the repo root.

Auth design: market-radar protects its data API with a Firebase JWT that
expires every hour. Replicating IndexedDB across Playwright contexts is
fragile, so CI mints a fresh access token at runtime via
``securetoken.googleapis.com`` using a long-lived **refresh token** plus
the public Firebase web API key — no headless browser required.

Tries the real Chrome profile first (so brand-new setups still work). On
Chrome 136+ the default profile rejects CDP access — in that case we fall
back to the dedicated ``.chrome-profile`` directory used by
``fetch_inflation_swaps.py``.

IMPORTANT: close all Chrome windows before running, otherwise Playwright
cannot acquire the profile lock.
"""

from __future__ import annotations

import json
import re
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

JS_READ_FIREBASE_DB = """
async () => new Promise((resolve, reject) => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
      db.close();
      resolve([]);
      return;
    }
    const tx = db.transaction('firebaseLocalStorage', 'readonly');
    const r = tx.objectStore('firebaseLocalStorage').getAll();
    r.onsuccess = () => { db.close(); resolve(r.result); };
    r.onerror = () => { db.close(); reject(String(r.error)); };
  };
  req.onerror = () => reject(String(req.error));
  req.onblocked = () => reject('blocked');
});
"""


def ensure_gitignored(*entries: str) -> None:
    existing = GITIGNORE_PATH.read_text(encoding="utf-8").splitlines() if GITIGNORE_PATH.exists() else []
    additions = [e for e in entries if e not in existing]
    if not additions:
        return
    text = "\n".join(existing + additions) + "\n"
    GITIGNORE_PATH.write_text(text, encoding="utf-8")


def try_click(page, text: str, timeout_ms: int = 4000) -> bool:
    try:
        page.get_by_text(re.compile(re.escape(text), re.I)).first.click(timeout=timeout_ms)
        return True
    except Exception:
        return False


def warm_up(page) -> None:
    """Walk the dashboard tabs so any lazy storage gets populated."""
    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:
        pass
    if try_click(page, "MACRO MONITOR"):
        print("  clicked MACRO MONITOR")
        page.wait_for_timeout(1500)
    if try_click(page, "INFLATION"):
        print("  clicked INFLATION")
        page.wait_for_timeout(1500)
    page.wait_for_timeout(8_000)


def extract_firebase_creds(entries: list[dict]) -> dict | None:
    """Pull api_key + refresh_token from a firebaseLocalStorage dump."""
    for ent in entries or []:
        key = ent.get("fbase_key") or ent.get("key") or ""
        if not key.startswith("firebase:authUser:"):
            continue
        parts = key.split(":")
        if len(parts) < 3:
            continue
        api_key = parts[2]
        value = ent.get("value") or {}
        stm = value.get("stsTokenManager") or {}
        refresh = stm.get("refreshToken")
        if api_key and refresh:
            return {
                "api_key": api_key,
                "refresh_token": refresh,
                "uid": value.get("uid"),
                "email": value.get("email"),
            }
    return None


def export_with_profile(profile_dir: str) -> dict | None:
    """Launch Chrome with the given persistent profile and return market-radar state."""
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            channel="chrome",
            headless=False,
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)
            warm_up(page)

            state = ctx.storage_state()

            try:
                fb_entries = page.evaluate(JS_READ_FIREBASE_DB)
                firebase = extract_firebase_creds(fb_entries)
            except Exception as exc:
                print(f"  warning: could not read Firebase IDB: {exc}")
                firebase = None
            state["firebase"] = firebase
        finally:
            ctx.close()

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
    ensure_gitignored("cookies.json", "inspect_request.py", "inspect_idb.py")

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

        firebase = state.get("firebase")
        n_cookies = len(state.get("cookies", []))
        n_ls = sum(len(o.get("localStorage", [])) for o in state.get("origins", []))

        if not firebase:
            print(f"  no Firebase auth state found in {label}")
            continue

        COOKIES_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(
            f"\nsaved firebase auth + {n_cookies} cookies + {n_ls} localStorage entries -> {COOKIES_PATH}"
        )
        print(f"  firebase.api_key:       {firebase['api_key']}")
        print(f"  firebase.refresh_token: {len(firebase['refresh_token'])} chars")
        print(f"  firebase.email:         {firebase.get('email')}")
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
