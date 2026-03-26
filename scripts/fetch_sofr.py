#!/usr/bin/env python3
"""
Fetch SOFR futures using yfinance (handles Yahoo auth automatically).
Saves to smallfish-rates/public/data/sofr.json
"""

import json
import os
from datetime import datetime, timedelta
import yfinance as yf

CODES = {'H': ('Mar', 3), 'M': ('Jun', 6), 'U': ('Sep', 9), 'Z': ('Dec', 12)}


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


def fetch_history(ticker_str, period='2mo'):
    """Fetch history using yfinance."""
    try:
        t = yf.Ticker(ticker_str)
        df = t.history(period=period, interval='1d')
        if df.empty:
            return None
        prices = []
        for date, row in df.iterrows():
            close = row.get('Close')
            vol = row.get('Volume', 0)
            if close is not None and close > 0:
                prices.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'close': round(float(close), 4),
                    'volume': int(vol) if vol else 0,
                })
        return prices
    except Exception as e:
        print(f'  [yfinance] {ticker_str}: {e}')
        return None


def compute_changes(prices):
    n = len(prices)
    if n == 0:
        return {}
    latest = prices[-1]

    def get(back):
        idx = n - 1 - back
        return prices[idx]['close'] if idx >= 0 else None

    def bp(cur, prev):
        return round(-(cur - prev) * 100, 1) if prev is not None else None

    p1m = get(22) or get(21) or get(20) or (prices[0]['close'] if n > 2 else None)

    return {
        'lastPx': latest['close'],
        'lastDate': latest['date'],
        'volume': latest['volume'],
        'bp1d': bp(latest['close'], get(1)),
        'bp5d': bp(latest['close'], get(5)),
        'bp1m': bp(latest['close'], p1m),
        'pts': n,
    }


def main():
    print(f'[SOFR] Start {datetime.now().isoformat()}')
    tickers = generate_tickers()
    print(f'[SOFR] Fetching {len(tickers)} contracts via yfinance...')

    results = []
    for i, t in enumerate(tickers):
        # First 4: 1 year for popup charts, rest: 2 months
        period = '1y' if i < 4 else '2mo'
        prices = fetch_history(t['yahoo'], period)

        if not prices:
            print(f'  ✗ {t["yahoo"]} — no data')
            continue

        c = compute_changes(prices)
        rate = round(100 - c['lastPx'], 4)

        entry = {
            'ticker': t['ticker'],
            'yahooTicker': t['yahoo'],
            'label': t['label'],
            'year': t['year'],
            'monthCode': t['monthCode'],
            'month': t['month'],
            'settlementDate': t['settlementDate'],
            'lastPx': c['lastPx'],
            'impRate': rate,
            'volume': c['volume'],
            'bp1d': c['bp1d'],
            'bp5d': c['bp5d'],
            'bp1m': c['bp1m'],
            'lastDate': c['lastDate'],
        }

        if i < 4 and len(prices) > 10:
            entry['history1y'] = prices

        results.append(entry)
        print(f'  ✓ {t["ticker"]:8s} [{c["pts"]:3d}pts] px={c["lastPx"]:.3f} rate={rate:.3f}% 1d={c["bp1d"]} 5d={c["bp5d"]} 1m={c["bp1m"]} vol={c["volume"]}')

    # Group by year
    groups = {}
    for c in results:
        groups.setdefault(c['year'], []).append(c)
    strip = [
        {'year': y, 'contracts': sorted(cs, key=lambda x: {'H':0,'M':1,'U':2,'Z':3}[x['monthCode']])}
        for y, cs in sorted(groups.items())
    ]

    out_path = os.path.join('smallfish-rates', 'public', 'data')
    os.makedirs(out_path, exist_ok=True)
    filepath = os.path.join(out_path, 'sofr.json')
    with open(filepath, 'w') as f:
        json.dump({
            'count': len(results),
            'contracts': results,
            'strip': strip,
            'timestamp': datetime.now().isoformat(),
        }, f, indent=2)

    print(f'\n[SOFR] Done — {len(results)}/{len(tickers)} saved to {filepath}')


if __name__ == '__main__':
    main()
