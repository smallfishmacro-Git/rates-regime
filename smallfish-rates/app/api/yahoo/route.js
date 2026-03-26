import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Cache crumb + cookies across requests (survives ~30min in serverless)
let cachedCrumb = null;
let cachedCookies = null;
let crumbExpiry = 0;

/**
 * Get Yahoo Finance crumb + cookies (required for API access from servers)
 */
async function getYahooCrumb() {
  if (cachedCrumb && cachedCookies && Date.now() < crumbExpiry) {
    return { crumb: cachedCrumb, cookies: cachedCookies };
  }

  try {
    // Step 1: Get consent cookies
    const consentRes = await fetch('https://fc.yahoo.com', {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    
    let cookies = '';
    const setCookies = consentRes.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      cookies = setCookies.map(c => c.split(';')[0]).join('; ');
    }

    // Step 2: Get crumb using cookies
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': cookies,
      },
    });

    if (!crumbRes.ok) {
      console.log('[Yahoo] Crumb fetch status:', crumbRes.status);
      return null;
    }

    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('<')) {
      console.log('[Yahoo] Invalid crumb:', crumb?.slice(0, 50));
      return null;
    }

    cachedCrumb = crumb;
    cachedCookies = cookies;
    crumbExpiry = Date.now() + 30 * 60 * 1000; // 30 min
    console.log('[Yahoo] Got crumb:', crumb.slice(0, 8) + '...');
    return { crumb, cookies };
  } catch (err) {
    console.error('[Yahoo] Crumb error:', err.message);
    return null;
  }
}

/**
 * Fetch a single ticker's chart data with auth
 */
async function fetchWithAuth(ticker, range, crumb, cookies) {
  const now = Math.floor(Date.now() / 1000);
  const period1 = range === '1y' ? now - 380 * 86400 : now - 50 * 86400;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1d&crumb=${encodeURIComponent(crumb)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Cookie': cookies,
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;

  const ts = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const volumes = result.indicators?.quote?.[0]?.volume || [];

  const prices = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null && !isNaN(closes[i])) {
      prices.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        close: parseFloat(closes[i].toFixed(4)),
        volume: volumes[i] || 0,
      });
    }
  }

  return prices;
}

/**
 * Fallback: try without crumb (sometimes works)
 */
async function fetchWithoutAuth(ticker, range) {
  const now = Math.floor(Date.now() / 1000);
  const period1 = range === '1y' ? now - 380 * 86400 : now - 50 * 86400;

  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp?.length) continue;

      const ts = result.timestamp;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      const prices = [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] != null && !isNaN(closes[i])) {
          prices.push({
            date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
            close: parseFloat(closes[i].toFixed(4)),
            volume: volumes[i] || 0,
          });
        }
      }
      if (prices.length > 0) return prices;
    } catch { continue; }
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const range = searchParams.get('range') || '2mo';

  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  // Try with crumb auth first
  const auth = await getYahooCrumb();
  let prices = null;

  if (auth) {
    try {
      prices = await fetchWithAuth(ticker, range, auth.crumb, auth.cookies);
      if (prices?.length) {
        console.log(`[Yahoo] ${ticker} OK via crumb: ${prices.length} pts`);
      }
    } catch (err) {
      console.log(`[Yahoo] ${ticker} crumb failed:`, err.message);
    }
  }

  // Fallback: try without auth
  if (!prices?.length) {
    try {
      prices = await fetchWithoutAuth(ticker, range);
      if (prices?.length) {
        console.log(`[Yahoo] ${ticker} OK without auth: ${prices.length} pts`);
      }
    } catch (err) {
      console.log(`[Yahoo] ${ticker} no-auth failed:`, err.message);
    }
  }

  if (!prices?.length) {
    console.log(`[Yahoo] ${ticker} ALL METHODS FAILED`);
    return NextResponse.json({ ticker, count: 0, prices: [] });
  }

  return NextResponse.json({ ticker, count: prices.length, prices });
}
