#!/usr/bin/env python3
"""
Fetch SOFR futures and build daily history for 1D/5D/1M changes + long-term charts.
Stores 2 years of daily snapshots (~520 trading days).
"""

import json
import os
from datetime import datetime, timedelta
import yfinance as yf

CODES = {'H': ('Mar', 3), 'M': ('Jun', 6), 'U': ('Sep', 9), 'Z': ('Dec', 12)}
DATA_DIR = os.path.join('smallfish-rates', 'public', 'data')
HISTORY_FILE = os.path.join(DATA_DIR, 'sofr_history.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'sofr.json')
MAX_HISTORY_DAYS = 520  # ~2 years of trading days


def generate_tickers():
    now = datetime.now()
    contracts = []
    for year in range(now.year, now.year + 5):
        for code, (name, month) in CODES.items():
            if year == now.year and month < now.month - 1:
                continue
            yy = str(year)[2:]
            d = datetime(year, month, 1)
            while d.weekday() != 2:
                d += timedelta(days=1)
            d += timedelta(days=14)
            contracts.append({
                'yahoo': f'SR3{code}{yy}.CME',
                'ticker': f'SFR{code}{year % 10}',
                'label': f'{name}{yy}',
                'year': year,
                'monthCode': code,
                'month': month,
                'settlementDate': d.strftime('%Y-%m-%d'),
            })
            if len(contracts) >= 20:
                break
        if len(contracts) >= 20:
            break
    return contracts


def fetch_today(tickers):
    snapshot = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t['yahoo'])
            df = tk.history(period='1d', interval='1d')
            if not df.empty:
                row = df.iloc[-1]
                snapshot[t['ticker']] = {
                    'lastPx': round(float(row['Close']), 4),
                    'volume': int(row.get('Volume', 0)),
                }
                print(f'  ✓ {t["ticker"]:8s} px={snapshot[t["ticker"]]["lastPx"]:.3f}  vol={snapshot[t["ticker"]]["volume"]}')
            else:
                print(f'  ✗ {t["yahoo"]} — empty')
        except Exception as e:
            print(f'  ✗ {t["yahoo"]} — {e}')
    return snapshot


def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE) as f:
                return json.load(f)
        except:
            pass
    return {'snapshots': []}


def save_history(history):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f)


def get_historical_price(history, ticker, days_back):
    snapshots = history.get('snapshots', [])
    idx = len(snapshots) - 1 - days_back
    if idx < 0:
        return None
    entry = snapshots[idx].get('data', {}).get(ticker)
    return entry.get('lastPx') if entry else None


def main():
    today = datetime.now().strftime('%Y-%m-%d')
    print(f'[SOFR] Start {datetime.now().isoformat()}')

    tickers = generate_tickers()
    print(f'[SOFR] Fetching {len(tickers)} contracts...')

    snapshot = fetch_today(tickers)
    if not snapshot:
        print('[SOFR] No data fetched, aborting')
        return

    # Update history
    history = load_history()
    snapshots = history.get('snapshots', [])

    if snapshots and snapshots[-1].get('date') == today:
        print(f'[SOFR] Updating existing snapshot for {today}')
        snapshots[-1] = {'date': today, 'data': snapshot}
    else:
        print(f'[SOFR] Adding new snapshot for {today} (total: {len(snapshots) + 1})')
        snapshots.append({'date': today, 'data': snapshot})

    if len(snapshots) > MAX_HISTORY_DAYS:
        snapshots = snapshots[-MAX_HISTORY_DAYS:]

    history['snapshots'] = snapshots
    save_history(history)
    print(f'[SOFR] History: {len(snapshots)} trading days stored')

    # Build output with changes
    results = []
    for t in tickers:
        tk = t['ticker']
        if tk not in snapshot:
            continue

        px = snapshot[tk]['lastPx']
        vol = snapshot[tk]['volume']
        rate = round(100 - px, 4)

        px_1d = get_historical_price(history, tk, 1)
        px_5d = get_historical_price(history, tk, 5)
        px_1m = get_historical_price(history, tk, 22) or get_historical_price(history, tk, 21) or get_historical_price(history, tk, 20)

        bp = lambda c, p: round(-(c - p) * 100, 1) if p is not None else None

        # Build price history array for charts (from all stored snapshots)
        price_history = []
        for snap in snapshots:
            entry = snap.get('data', {}).get(tk)
            if entry:
                price_history.append({
                    'date': snap['date'],
                    'close': entry['lastPx'],
                })

        entry = {
            'ticker': tk,
            'yahooTicker': t['yahoo'],
            'label': t['label'],
            'year': t['year'],
            'monthCode': t['monthCode'],
            'month': t['month'],
            'settlementDate': t['settlementDate'],
            'lastPx': px,
            'impRate': rate,
            'volume': vol,
            'bp1d': bp(px, px_1d),
            'bp5d': bp(px, px_5d),
            'bp1m': bp(px, px_1m),
            'lastDate': today,
            'history': price_history if len(price_history) > 1 else None,
        }
        results.append(entry)

        days_avail = len(snapshots) - 1
        print(f'  → {tk:8s} rate={rate:.3f}%  1d={bp(px, px_1d)}  5d={bp(px, px_5d)}  1m={bp(px, px_1m)}  hist={len(price_history)}pts')

    # Group by year
    groups = {}
    for c in results:
        groups.setdefault(c['year'], []).append(c)
    strip = [
        {'year': y, 'contracts': sorted(cs, key=lambda x: {'H':0,'M':1,'U':2,'Z':3}[x['monthCode']])}
        for y, cs in sorted(groups.items())
    ]

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump({
            'count': len(results),
            'contracts': results,
            'strip': strip,
            'timestamp': datetime.now().isoformat(),
            'historyDays': len(snapshots),
        }, f, indent=2)

    print(f'\n[SOFR] Done — {len(results)} contracts, {len(snapshots)} days of history')
    if len(snapshots) < 2:
        print(f'[SOFR] ⚠ 1D changes available after tomorrow\'s run')
    if len(snapshots) < 6:
        print(f'[SOFR] ⚠ 5D changes available after {6 - len(snapshots)} more runs')
    if len(snapshots) < 22:
        print(f'[SOFR] ⚠ 1M changes available after {22 - len(snapshots)} more runs')


if __name__ == '__main__':
    main()
