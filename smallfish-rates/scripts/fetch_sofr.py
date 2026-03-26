#!/usr/bin/env python3
"""
Fetch SOFR futures data from Yahoo Finance and save to data/sofr.json
Run daily via GitHub Actions.
"""

import json
import urllib.request
import urllib.parse
import time
import os
from datetime import datetime, timedelta

# SOFR quarterly contracts
CODES = {'H': ('Mar', 3), 'M': ('Jun', 6), 'U': ('Sep', 9), 'Z': ('Dec', 12)}

def generate_tickers():
    """Generate SOFR futures tickers to fetch."""
    now = datetime.now()
    contracts = []
    for year in range(now.year, now.year + 5):
        for code, (name, month) in CODES.items():
            # Skip expired
            if year == now.year and month < now.month - 1:
                continue
            yy = str(year)[2:]
            # IMM settlement: 3rd Wednesday of contract month
            d = datetime(year, month, 1)
            while d.weekday() != 2:  # Wednesday
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


def get_yahoo_crumb():
    """Get Yahoo Finance crumb + cookies for authenticated requests."""
    try:
        # Step 1: Get cookies
        req = urllib.request.Request('https://fc.yahoo.com', headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        try:
            resp = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            # fc.yahoo.com often returns 404 but still sets cookies
            resp = e

        cookies = ''
        for header in resp.headers.get_all('Set-Cookie') or []:
            cookie = header.split(';')[0]
            cookies += ('; ' if cookies else '') + cookie

        # Step 2: Get crumb
        req2 = urllib.request.Request('https://query2.finance.yahoo.com/v1/test/getcrumb', headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': cookies,
        })
        resp2 = urllib.request.urlopen(req2, timeout=10)
        crumb = resp2.read().decode('utf-8').strip()

        if crumb and '<' not in crumb:
            print(f'[Auth] Got crumb: {crumb[:8]}...')
            return crumb, cookies
    except Exception as e:
        print(f'[Auth] Failed: {e}')
    return None, None


def fetch_chart(ticker, period_days, crumb=None, cookies=None):
    """Fetch chart data from Yahoo Finance."""
    now = int(time.time())
    period1 = now - period_days * 86400

    url = f'https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?period1={period1}&period2={now}&interval=1d'
    if crumb:
        url += f'&crumb={urllib.parse.quote(crumb)}'

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    }
    if cookies:
        headers['Cookie'] = cookies

    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode('utf-8'))

        result = data.get('chart', {}).get('result', [{}])[0]
        timestamps = result.get('timestamp', [])
        quotes = result.get('indicators', {}).get('quote', [{}])[0]
        closes = quotes.get('close', [])
        volumes = quotes.get('volume', [])

        prices = []
        for i, ts in enumerate(timestamps):
            c = closes[i] if i < len(closes) else None
            v = volumes[i] if i < len(volumes) else 0
            if c is not None and not (isinstance(c, float) and c != c):  # not NaN
                prices.append({
                    'date': datetime.fromtimestamp(ts).strftime('%Y-%m-%d'),
                    'close': round(c, 4),
                    'volume': v or 0,
                })

        return prices
    except Exception as e:
        print(f'[Fetch] {ticker} failed: {e}')
        return None


def compute_changes(prices):
    """Compute 1D, 5D, 1M basis point changes."""
    n = len(prices)
    if n == 0:
        return {}

    latest = prices[-1]

    def get_prev(days_back):
        idx = n - 1 - days_back
        return prices[idx]['close'] if idx >= 0 else None

    def bp_change(current, previous):
        if previous is None:
            return None
        # Rate = 100 - Price, so rate change = -(price change) * 100
        return round(-(current - previous) * 100, 1)

    prev_1d = get_prev(1)
    prev_5d = get_prev(5)
    prev_1m = get_prev(22) or get_prev(21) or get_prev(20) or (prices[0]['close'] if n > 2 else None)

    return {
        'lastPx': latest['close'],
        'lastDate': latest['date'],
        'volume': latest['volume'],
        'bp1d': bp_change(latest['close'], prev_1d),
        'bp5d': bp_change(latest['close'], prev_5d),
        'bp1m': bp_change(latest['close'], prev_1m),
    }


def main():
    print(f'[SOFR] Starting fetch at {datetime.now().isoformat()}')

    # Authenticate
    crumb, cookies = get_yahoo_crumb()

    contracts = generate_tickers()
    print(f'[SOFR] Fetching {len(contracts)} contracts...')

    results = []
    for i, contract in enumerate(contracts):
        # First 4 contracts: 1 year history for charts, rest: 2 months
        days = 380 if i < 4 else 50
        prices = fetch_chart(contract['yahoo'], days, crumb, cookies)

        if not prices:
            print(f'  ✗ {contract["yahoo"]} — no data')
            continue

        changes = compute_changes(prices)
        imp_rate = round(100 - changes['lastPx'], 4)

        entry = {
            'ticker': contract['ticker'],
            'yahooTicker': contract['yahoo'],
            'label': contract['label'],
            'year': contract['year'],
            'monthCode': contract['monthCode'],
            'month': contract['month'],
            'settlementDate': contract['settlementDate'],
            'lastPx': changes['lastPx'],
            'impRate': imp_rate,
            'volume': changes['volume'],
            'bp1d': changes['bp1d'],
            'bp5d': changes['bp5d'],
            'bp1m': changes['bp1m'],
            'lastDate': changes['lastDate'],
        }

        # Include full history for first 4 contracts (for popup charts)
        if i < 4:
            entry['history1y'] = prices

        results.append(entry)
        print(f'  ✓ {contract["ticker"]:8s} px={changes["lastPx"]:.3f}  rate={imp_rate:.3f}%  1d={changes["bp1d"]}  5d={changes["bp5d"]}  1m={changes["bp1m"]}  vol={changes["volume"]}')

        # Small delay to be polite
        time.sleep(0.3)

    # Group by year
    groups = {}
    for c in results:
        y = c['year']
        if y not in groups:
            groups[y] = []
        groups[y].append(c)

    strip = [
        {'year': y, 'contracts': sorted(cs, key=lambda x: {'H': 0, 'M': 1, 'U': 2, 'Z': 3}[x['monthCode']])}
        for y, cs in sorted(groups.items())
    ]

    output = {
        'count': len(results),
        'contracts': results,
        'strip': strip,
        'timestamp': datetime.now().isoformat(),
    }

    # Save to public/data/sofr.json (served statically by Vercel)
    os.makedirs('public/data', exist_ok=True)
    with open('public/data/sofr.json', 'w') as f:
        json.dump(output, f, indent=2)

    print(f'\n[SOFR] Done — {len(results)}/{len(contracts)} contracts saved to public/data/sofr.json')


if __name__ == '__main__':
    main()
