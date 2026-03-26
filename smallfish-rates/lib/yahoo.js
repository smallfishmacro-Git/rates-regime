// Yahoo Finance SOFR Futures scraper
// Multiple fetch strategies for reliability from Vercel serverless

const MONTH_CODES = { H: 'Mar', M: 'Jun', U: 'Sep', Z: 'Dec' };
const CODE_MONTHS = { H: 3, M: 6, U: 9, Z: 12 };

/**
 * Generate SOFR futures tickers to fetch (quarterly contracts)
 */
export function generateSOFRTickers() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const contracts = [];
  const codes = ['H', 'M', 'U', 'Z'];

  for (let year = currentYear; year <= currentYear + 4; year++) {
    for (const code of codes) {
      const contractMonth = CODE_MONTHS[code];
      if (year === currentYear && contractMonth < currentMonth - 1) continue;

      const yy = String(year).slice(2);
      contracts.push({
        ticker: `SR3${code}${yy}.CME`,
        label: `${MONTH_CODES[code]}${yy}`,
        tvTicker: `SFR${code}${year % 10}`,
        year,
        month: contractMonth,
        monthCode: code,
        settlementDate: getIMM(year, contractMonth),
      });

      if (contracts.length >= 20) break;
    }
    if (contracts.length >= 20) break;
  }
  return contracts;
}

function getIMM(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch chart data from Yahoo Finance with multiple URL strategies
 */
async function fetchYahooChart(ticker) {
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2mo&interval=1d&includePrePost=false`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2mo&interval=1d&includePrePost=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp?.length) continue;

      const timestamps = result.timestamp;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];

      // Build price array, filter nulls
      const prices = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          prices.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            close: closes[i],
            volume: volumes[i] || 0,
          });
        }
      }

      if (prices.length === 0) continue;

      const latest = prices[prices.length - 1];
      const n = prices.length;

      // Find price N trading days ago
      const get = (daysBack) => {
        const idx = n - 1 - daysBack;
        return idx >= 0 ? prices[idx].close : null;
      };

      const prev1d = get(1);
      const prev5d = get(5);
      // For 1M, look back ~22 trading days, or use earliest available
      const prev1m = get(22) || get(Math.min(21, n - 1));

      return {
        lastPx: latest.close,
        lastDate: latest.date,
        volume: latest.volume,
        // Price changes (in price terms)
        px1d: prev1d != null ? parseFloat((latest.close - prev1d).toFixed(4)) : null,
        px5d: prev5d != null ? parseFloat((latest.close - prev5d).toFixed(4)) : null,
        px1m: prev1m != null ? parseFloat((latest.close - prev1m).toFixed(4)) : null,
        // Rate changes in basis points (rate = 100 - price, so rate change = -price change * 100)
        bp1d: prev1d != null ? parseFloat((-(latest.close - prev1d) * 100).toFixed(1)) : null,
        bp5d: prev5d != null ? parseFloat((-(latest.close - prev5d) * 100).toFixed(1)) : null,
        bp1m: prev1m != null ? parseFloat((-(latest.close - prev1m) * 100).toFixed(1)) : null,
      };
    } catch (err) {
      console.error(`Yahoo fetch attempt failed for ${ticker}:`, err.message);
      continue;
    }
  }

  // If Yahoo API fails, try the download CSV endpoint
  try {
    return await fetchYahooCSV(ticker);
  } catch {
    return null;
  }
}

/**
 * Fallback: fetch from Yahoo download CSV endpoint
 */
async function fetchYahooCSV(ticker) {
  const now = Math.floor(Date.now() / 1000);
  const twoMonthsAgo = now - 60 * 86400;
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(ticker)}?period1=${twoMonthsAgo}&period2=${now}&interval=1d&events=history`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!res.ok) return null;
  const text = await res.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;

  // Parse CSV: Date,Open,High,Low,Close,Adj Close,Volume
  const prices = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const close = parseFloat(parts[4]);
    const volume = parseInt(parts[6]) || 0;
    if (!isNaN(close)) {
      prices.push({ date: parts[0], close, volume });
    }
  }

  if (prices.length === 0) return null;

  const latest = prices[prices.length - 1];
  const n = prices.length;
  const get = (d) => n - 1 - d >= 0 ? prices[n - 1 - d].close : null;

  const prev1d = get(1);
  const prev5d = get(5);
  const prev1m = get(22) || get(Math.min(21, n - 1));

  return {
    lastPx: latest.close,
    lastDate: latest.date,
    volume: latest.volume,
    px1d: prev1d != null ? parseFloat((latest.close - prev1d).toFixed(4)) : null,
    px5d: prev5d != null ? parseFloat((latest.close - prev5d).toFixed(4)) : null,
    px1m: prev1m != null ? parseFloat((latest.close - prev1m).toFixed(4)) : null,
    bp1d: prev1d != null ? parseFloat((-(latest.close - prev1d) * 100).toFixed(1)) : null,
    bp5d: prev5d != null ? parseFloat((-(latest.close - prev5d) * 100).toFixed(1)) : null,
    bp1m: prev1m != null ? parseFloat((-(latest.close - prev1m) * 100).toFixed(1)) : null,
  };
}

/**
 * Fetch all SOFR futures contracts in parallel
 */
export async function fetchAllSOFRFutures() {
  const contracts = generateSOFRTickers();

  const results = await Promise.allSettled(
    contracts.map(async (contract) => {
      const data = await fetchYahooChart(contract.ticker);
      if (!data) return null;

      return {
        ticker: contract.tvTicker,
        yahooTicker: contract.ticker,
        month: contract.label,
        year: contract.year,
        monthCode: contract.monthCode,
        settlementDate: contract.settlementDate,
        lastPx: data.lastPx,
        impRate: parseFloat((100 - data.lastPx).toFixed(4)),
        volume: data.volume,
        px1d: data.px1d,
        px5d: data.px5d,
        px1m: data.px1m,
        bp1d: data.bp1d,
        bp5d: data.bp5d,
        bp1m: data.bp1m,
        lastDate: data.lastDate,
      };
    })
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

/**
 * Group contracts by year
 */
export function groupByYear(contracts) {
  const groups = {};
  for (const c of contracts) {
    if (!groups[c.year]) groups[c.year] = [];
    groups[c.year].push(c);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a - b)
    .map(([year, contracts]) => ({
      year: parseInt(year),
      contracts: contracts.sort((a, b) => CODE_MONTHS[a.monthCode] - CODE_MONTHS[b.monthCode]),
    }));
}

/**
 * Compute meeting probabilities from SOFR futures
 */
export function computeMeetingProbsFromSOFR(sofrContracts, currentEFFR) {
  const meetings = [
    { label: 'Apr 29', date: '2026-04-29', contract: 'FFJ6' },
    { label: 'Jun 10', date: '2026-06-10', contract: 'FFM6' },
    { label: 'Jul 29', date: '2026-07-29', contract: 'FFN6' },
    { label: 'Sep 16', date: '2026-09-16', contract: 'FFU6' },
    { label: 'Oct 28', date: '2026-10-28', contract: 'FFV6' },
    { label: 'Dec 09', date: '2026-12-09', contract: 'FFZ6' },
    { label: 'Jan 27', date: '2027-01-27', contract: 'FFF7' },
    { label: 'Mar 17', date: '2027-03-17', contract: 'FFH7' },
    { label: 'Apr 28', date: '2027-04-28', contract: 'FFJ7' },
    { label: 'Jun 09', date: '2027-06-09', contract: 'FFM7' },
  ];

  const sorted = [...sofrContracts].sort(
    (a, b) => new Date(a.settlementDate) - new Date(b.settlementDate)
  );
  if (sorted.length === 0) return [];

  return meetings.map((m) => {
    const mDate = new Date(m.date);
    let before = null, after = null;
    for (const c of sorted) {
      const sDate = new Date(c.settlementDate);
      if (sDate <= mDate) before = c;
      if (sDate > mDate && !after) after = c;
    }

    let impliedRate;
    if (before && after) {
      const ratio = (mDate - new Date(before.settlementDate)) / (new Date(after.settlementDate) - new Date(before.settlementDate));
      impliedRate = before.impRate + ratio * (after.impRate - before.impRate);
    } else if (before) {
      impliedRate = before.impRate;
    } else if (after) {
      impliedRate = after.impRate;
    } else {
      impliedRate = currentEFFR;
    }

    // SOFR trades ~5bp below EFFR, adjust
    const adjustedRate = impliedRate + 0.05;
    const diff = (currentEFFR - adjustedRate) / 0.25;
    const cutsImplied = Math.max(0, diff);

    let hold, cut25, cut50;
    if (cutsImplied <= 0) { hold = 100; cut25 = 0; cut50 = 0; }
    else if (cutsImplied < 1) { hold = Math.round((1 - cutsImplied) * 100); cut25 = 100 - hold; cut50 = 0; }
    else if (cutsImplied < 2) { hold = 0; cut25 = Math.round((2 - cutsImplied) * 100); cut50 = 100 - cut25; }
    else { hold = 0; cut25 = 0; cut50 = 100; }

    return {
      meeting: m.label, date: m.date, contract: m.contract,
      impliedRate: parseFloat(impliedRate.toFixed(3)),
      hold, cut25, cut50, hike25: 0,
      cumCuts: cutsImplied.toFixed(1),
    };
  });
}
