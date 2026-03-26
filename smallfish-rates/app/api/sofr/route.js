import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// SOFR contract generation
const CODES = ['H', 'M', 'U', 'Z'];
const CODE_NAMES = { H: 'Mar', M: 'Jun', U: 'Sep', Z: 'Dec' };
const CODE_MONTHS = { H: 3, M: 6, U: 9, Z: 12 };

function generateTickers() {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const out = [];
  for (let y = cy; y <= cy + 4 && out.length < 20; y++) {
    for (const c of CODES) {
      if (y === cy && CODE_MONTHS[c] < cm - 1) continue;
      const yy = String(y).slice(2);
      const d = new Date(y, CODE_MONTHS[c] - 1, 1);
      while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 14);
      out.push({
        yahoo: `SR3${c}${yy}.CME`,
        tv: `SFR${c}${y % 10}`,
        label: `${CODE_NAMES[c]}${yy}`,
        year: y, monthCode: c, month: CODE_MONTHS[c],
        settlement: d.toISOString().slice(0, 10),
      });
      if (out.length >= 20) break;
    }
  }
  return out;
}

// Yahoo crumb cache
let crumb = null, cookies = null, exp = 0;

async function auth() {
  if (crumb && cookies && Date.now() < exp) return { crumb, cookies };
  try {
    const r1 = await fetch('https://fc.yahoo.com', {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    const sc = r1.headers.getSetCookie?.() || [];
    const ck = sc.map(c => c.split(';')[0]).join('; ');

    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Cookie: ck },
    });
    if (!r2.ok) return null;
    const cr = await r2.text();
    if (!cr || cr.includes('<')) return null;

    crumb = cr; cookies = ck; exp = Date.now() + 25 * 60000;
    return { crumb: cr, cookies: ck };
  } catch { return null; }
}

async function fetchChart(ticker, range, cr, ck) {
  const now = Math.floor(Date.now() / 1000);
  const p1 = range === '1y' ? now - 380 * 86400 : now - 50 * 86400;

  const tryUrls = cr
    ? [`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${now}&interval=1d&crumb=${encodeURIComponent(cr)}`]
    : [];
  tryUrls.push(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${now}&interval=1d`);
  tryUrls.push(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${now}&interval=1d`);

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          ...(ck ? { Cookie: ck } : {}),
        },
      });
      if (!res.ok) continue;
      const d = await res.json();
      const r = d?.chart?.result?.[0];
      if (!r?.timestamp?.length) continue;

      const prices = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const c = r.indicators?.quote?.[0]?.close?.[i];
        const v = r.indicators?.quote?.[0]?.volume?.[i];
        if (c != null && !isNaN(c)) {
          prices.push({
            date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
            close: parseFloat(c.toFixed(4)),
            volume: v || 0,
          });
        }
      }
      if (prices.length > 0) return prices;
    } catch { continue; }
  }
  return null;
}

function computeChanges(prices) {
  const n = prices.length;
  if (!n) return {};
  const last = prices[n - 1];
  const g = b => n - 1 - b >= 0 ? prices[n - 1 - b].close : null;
  const bp = (cur, prev) => prev != null ? parseFloat((-(cur - prev) * 100).toFixed(1)) : null;
  return {
    lastPx: last.close, lastDate: last.date, volume: last.volume,
    bp1d: bp(last.close, g(1)), bp5d: bp(last.close, g(5)),
    bp1m: bp(last.close, g(22) ?? g(21) ?? g(20) ?? (n > 2 ? prices[0].close : null)),
  };
}

export async function GET() {
  const tickers = generateTickers();
  const a = await auth();
  const cr = a?.crumb, ck = a?.cookies;

  console.log(`[SOFR Batch] Fetching ${tickers.length} contracts, crumb: ${cr ? 'yes' : 'no'}`);

  // Fetch all contracts — first 4 get 1Y history
  const results = await Promise.allSettled(
    tickers.map(async (t, idx) => {
      const range = idx < 4 ? '1y' : '2mo';
      const prices = await fetchChart(t.yahoo, range, cr, ck);
      if (!prices?.length) return null;

      const chg = computeChanges(prices);
      return {
        ticker: t.tv, yahooTicker: t.yahoo, label: t.label,
        year: t.year, monthCode: t.monthCode, month: t.month,
        settlementDate: t.settlement,
        lastPx: chg.lastPx, impRate: parseFloat((100 - chg.lastPx).toFixed(4)),
        volume: chg.volume, bp1d: chg.bp1d, bp5d: chg.bp5d, bp1m: chg.bp1m,
        lastDate: chg.lastDate,
        history1y: idx < 4 ? prices : null,
      };
    })
  );

  const contracts = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  console.log(`[SOFR Batch] Got ${contracts.length}/${tickers.length} contracts`);

  // Group by year
  const groups = {};
  for (const c of contracts) {
    if (!groups[c.year]) groups[c.year] = [];
    groups[c.year].push(c);
  }
  const strip = Object.entries(groups)
    .sort(([a], [b]) => a - b)
    .map(([y, cs]) => ({ year: parseInt(y), contracts: cs.sort((a, b) => CODE_MONTHS[a.monthCode] - CODE_MONTHS[b.monthCode]) }));

  return NextResponse.json({
    count: contracts.length,
    contracts,
    strip,
    timestamp: new Date().toISOString(),
  });
}
