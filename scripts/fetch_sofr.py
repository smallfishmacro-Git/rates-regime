#!/usr/bin/env python3
"""
Fetch SOFR futures from Yahoo Finance using CSV download for full history.
Saves to smallfish-rates/public/data/sofr.json
"""

import json
import urllib.request
import urllib.parse
import time
import os
import csv
import io
from datetime import datetime, timedelta

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


def get_yahoo_crumb():
    try:
        req = urllib.request.Request('https://fc.yahoo.com', headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'})
        try:
            resp = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            resp = e
        cookies = ''
        for header in resp.headers.get_all('Set-Cookie') or []:
            cookies += ('; ' if cookies else '') + header.split(';')[0]
        req2 = urllib.request.Request('https://query2.finance.yahoo.com/v1/test/getcrumb', headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': cookies})
        resp2 = urllib.request.urlopen(req2, timeout=10)
        crumb = resp2.read().decode('utf-8').strip()
        if crumb and '<' not in crumb:
            print(f'[Auth] Got crumb: {crumb[:8]}...')
            return crumb, cookies
    except Exception as e:
        print(f'[Auth] Failed: {e}')
    return None, None


def fetch_csv(ticker, days, crumb, cookies):
    """Download CSV history from Yahoo - most reliable for futures."""
    now = int(time.time())
    p1 = now - days * 86400
    url = (f'https://query1.finance.yahoo.com/v7/finance/download/{urllib.parse.quote(ticker)}'
           f'?period1={p1}&period2={now}&interval=1d&events=history')
    if crumb:
        url += f'&crumb={urllib.parse.quote(crumb)}'

    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    if cookies:
        headers['Cookie'] = cookies

    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        text = resp.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        prices = []
        for row in reader:
            try:
                close = float(row['Close'])
                vol = int(float(row.get('Volume', 0)))
                if close > 0:
                    prices.append({'date': row['Date'], 'close': round(close, 4), 'volume': vol})
            except (ValueError, KeyError):
                continue
        return prices
    except Exception as e:
        print(f'  [CSV] {ticker}: {e}')
        return None


def fetch_chart(ticker, days, crumb, cookies):
    """Fallback: chart API."""
    now = int(time.time())
    p1 = now - days * 86400
    url = f'https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?period1={p1}&period2={now}&interval=1d'
    if crumb:
        url += f'&crumb={urllib.parse.quote(crumb)}'
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    if cookies:
        headers['Cookie'] = cookies
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode('utf-8'))
        result = data.get('chart', {}).get('result', [{}])[0]
        ts = result.get('timestamp', [])
        closes = result.get('indicators', {}).get('quote', [{}])[0].get('close', [])
        volumes = result.get('indicators', {}).get('quote', [{}])[0].get('volume', [])
        prices = []
        for i in range(len(ts)):
            c = closes[i] if i < len(closes) else None
            v = volumes[i] if i < len(volumes) else 0
            if c is not None and not (isinstance(c, float) and c != c):
                prices.append({'date': datetime.utcfromtimestamp(ts[i]).strftime('%Y-%m-%d'),
                               'close': round(c, 4), 'volume': v or 0})
        return prices
    except Exception as e:
        print(f'  [Chart] {ticker}: {e}')
        return None


def fetch(ticker, days, crumb, cookies):
    """Try CSV first, then chart API."""
    prices = fetch_csv(ticker, days, crumb, cookies)
    if prices and len(prices) > 1:
        return prices, 'CSV'
    prices = fetch_chart(ticker, days, crumb, cookies)
    if prices and len(prices) > 1:
        return prices, 'Chart'
    if prices:
        return prices, 'Single'
    return None, None


def compute(prices):
    n = len(prices)
    if n == 0:
        return {}
    latest = prices[-1]
    g = lambda d: prices[n-1-d]['close'] if n-1-d >= 0 else None
    bp = lambda c, p: round(-(c - p) * 100, 1) if p is not None else None
    p1m = g(22) or g(21) or g(20) or (prices[0]['close'] if n > 2 else None)
    return {
        'lastPx': latest['close'], 'lastDate': latest['date'], 'volume': latest['volume'],
        'bp1d': bp(latest['close'], g(1)),
        'bp5d': bp(latest['close'], g(5)),
        'bp1m': bp(latest['close'], p1m),
        'pts': n,
    }


def main():
    print(f'[SOFR] Start {datetime.now().isoformat()}')
    crumb, cookies = get_yahoo_crumb()
    tickers = generate_tickers()
    print(f'[SOFR] Fetching {len(tickers)} contracts...')

    results = []
    for i, t in enumerate(tickers):
        days = 380 if i < 4 else 50
        prices, method = fetch(t['yahoo'], days, crumb, cookies)
        if not prices:
            print(f'  ✗ {t["yahoo"]}')
            continue

        c = compute(prices)
        rate = round(100 - c['lastPx'], 4)
        entry = {
            'ticker': t['ticker'], 'yahooTicker': t['yahoo'], 'label': t['label'],
            'year': t['year'], 'monthCode': t['monthCode'], 'month': t['month'],
            'settlementDate': t['settlementDate'],
            'lastPx': c['lastPx'], 'impRate': rate, 'volume': c['volume'],
            'bp1d': c['bp1d'], 'bp5d': c['bp5d'], 'bp1m': c['bp1m'],
            'lastDate': c['lastDate'],
        }
        if i < 4 and len(prices) > 10:
            entry['history1y'] = prices
        results.append(entry)
        print(f'  ✓ {t["ticker"]:8s} [{method:5s} {c["pts"]:3d}pts] px={c["lastPx"]:.3f} rate={rate:.3f}% 1d={c["bp1d"]} 5d={c["bp5d"]} 1m={c["bp1m"]} vol={c["volume"]}')
        time.sleep(0.3)

    groups = {}
    for c in results:
        groups.setdefault(c['year'], []).append(c)
    strip = [{'year': y, 'contracts': sorted(cs, key=lambda x: {'H':0,'M':1,'U':2,'Z':3}[x['monthCode']])}
             for y, cs in sorted(groups.items())]

    out_path = os.path.join('smallfish-rates', 'public', 'data')
    os.makedirs(out_path, exist_ok=True)
    filepath = os.path.join(out_path, 'sofr.json')
    with open(filepath, 'w') as f:
        json.dump({'count': len(results), 'contracts': results, 'strip': strip,
                   'timestamp': datetime.now().isoformat()}, f, indent=2)
    print(f'\n[SOFR] Done — {len(results)}/{len(tickers)} saved to {filepath}')


if __name__ == '__main__':
    main()
