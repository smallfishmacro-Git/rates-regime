import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Proxy Yahoo Finance requests through our server to avoid CORS
// Yahoo blocks based on missing cookies/headers from cloud — we add them here
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const range = searchParams.get('range') || '2mo';

  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const period1 = range === '1y' ? now - 380 * 86400 : now - 50 * 86400;

  // Try multiple Yahoo endpoints
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        },
      });

      if (!res.ok) {
        console.log(`[YahooProxy] ${ticker} status ${res.status} from ${url}`);
        continue;
      }

      const data = await res.json();
      const result = data?.chart?.result?.[0];

      if (!result?.timestamp?.length) {
        console.log(`[YahooProxy] ${ticker} no timestamps from ${url}`);
        continue;
      }

      const timestamps = result.timestamp;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];

      const prices = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null && !isNaN(closes[i])) {
          prices.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            close: parseFloat(closes[i].toFixed(4)),
            volume: volumes[i] || 0,
          });
        }
      }

      console.log(`[YahooProxy] ${ticker} got ${prices.length} data points`);

      return NextResponse.json({
        ticker,
        count: prices.length,
        prices,
      });
    } catch (err) {
      console.error(`[YahooProxy] ${ticker} error:`, err.message);
    }
  }

  // All attempts failed
  return NextResponse.json({ ticker, count: 0, prices: [], error: 'Yahoo unavailable' });
}
