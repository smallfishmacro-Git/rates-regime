// Yahoo Finance SOFR Futures — robust fetcher with explicit date ranges

const MONTH_CODES = { H: 'Mar', M: 'Jun', U: 'Sep', Z: 'Dec' };
const CODE_MONTHS = { H: 3, M: 6, U: 9, Z: 12 };

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
 * Fetch chart with explicit epoch timestamps (more reliable than range param)
 */
async function fetchYahooChart(ticker) {
  const now = Math.floor(Date.now() / 1000);
  const sixWeeksAgo = now - 45 * 86400; // 45 days back for reliable 1M

  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${sixWeeksAgo}&period2=${now}&interval=1d&includePrePost=false`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${sixWeeksAgo}&period2=${now}&interval=1d&includePrePost=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
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
          prices.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: closes[i], volume: volumes[i] || 0 });
        }
      }
      if (prices.length === 0) continue;

      return computeChanges(prices);
    } catch (e) {
      console.error(`[Yahoo] ${ticker} attempt failed:`, e.message);
    }
  }
  return null;
}

/**
 * Fetch 1Y of daily data for popup chart (only for front contracts)
 */
export async function fetchYahoo1YChart(ticker) {
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 86400;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${oneYearAgo}&period2=${now}&interval=1d&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp?.length) return null;

    const ts = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const prices = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        prices.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: closes[i] });
      }
    }
    return prices;
  } catch {
    return null;
  }
}

function computeChanges(prices) {
  const n = prices.length;
  const latest = prices[n - 1];
  const get = (back) => (n - 1 - back >= 0 ? prices[n - 1 - back].close : null);

  const prev1d = get(1);
  const prev5d = get(5);
  // ~22 trading days = 1 month; fall back to whatever we have
  const prev1m = get(22) ?? get(21) ?? get(20) ?? get(n - 1);

  const bp = (cur, prev) => prev != null ? parseFloat((-(cur - prev) * 100).toFixed(1)) : null;

  return {
    lastPx: latest.close,
    lastDate: latest.date,
    volume: latest.volume,
    bp1d: bp(latest.close, prev1d),
    bp5d: bp(latest.close, prev5d),
    bp1m: bp(latest.close, prev1m),
    historyLength: n,
  };
}

export async function fetchAllSOFRFutures() {
  const contracts = generateSOFRTickers();

  // Fetch front 4 contracts with 1Y history, rest with 45d
  const results = await Promise.allSettled(
    contracts.map(async (contract, idx) => {
      const data = await fetchYahooChart(contract.ticker);
      if (!data) return null;

      // For the first 4 contracts, also fetch 1Y chart data
      let history1y = null;
      if (idx < 4) {
        history1y = await fetchYahoo1YChart(contract.ticker);
      }

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
        bp1d: data.bp1d,
        bp5d: data.bp5d,
        bp1m: data.bp1m,
        lastDate: data.lastDate,
        historyLength: data.historyLength,
        history1y: history1y, // array of {date, close} or null
      };
    })
  );

  return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
}

export function groupByYear(contracts) {
  const groups = {};
  for (const c of contracts) {
    if (!groups[c.year]) groups[c.year] = [];
    groups[c.year].push(c);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a - b)
    .map(([year, cs]) => ({
      year: parseInt(year),
      contracts: cs.sort((a, b) => CODE_MONTHS[a.monthCode] - CODE_MONTHS[b.monthCode]),
    }));
}

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
  const sorted = [...sofrContracts].sort((a, b) => new Date(a.settlementDate) - new Date(b.settlementDate));
  if (!sorted.length) return [];

  return meetings.map(m => {
    const mDate = new Date(m.date);
    let before = null, after = null;
    for (const c of sorted) {
      if (new Date(c.settlementDate) <= mDate) before = c;
      if (new Date(c.settlementDate) > mDate && !after) after = c;
    }
    let impliedRate;
    if (before && after) {
      const ratio = (mDate - new Date(before.settlementDate)) / (new Date(after.settlementDate) - new Date(before.settlementDate));
      impliedRate = before.impRate + ratio * (after.impRate - before.impRate);
    } else impliedRate = (before || after)?.impRate || currentEFFR;

    const adjustedRate = impliedRate + 0.05;
    const cutsImplied = Math.max(0, (currentEFFR - adjustedRate) / 0.25);
    let hold, cut25, cut50;
    if (cutsImplied <= 0) { hold = 100; cut25 = 0; cut50 = 0; }
    else if (cutsImplied < 1) { hold = Math.round((1 - cutsImplied) * 100); cut25 = 100 - hold; cut50 = 0; }
    else if (cutsImplied < 2) { hold = 0; cut25 = Math.round((2 - cutsImplied) * 100); cut50 = 100 - cut25; }
    else { hold = 0; cut25 = 0; cut50 = 100; }

    return { meeting: m.label, date: m.date, contract: m.contract, impliedRate: parseFloat(impliedRate.toFixed(3)), hold, cut25, cut50, hike25: 0, cumCuts: cutsImplied.toFixed(1) };
  });
}
