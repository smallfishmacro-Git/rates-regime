// Yahoo Finance SOFR Futures scraper
// Fetches real CME SOFR futures quotes with historical price changes

// SOFR futures contract specs (quarterly, CME)
// Yahoo ticker format: SR3{MonthCode}{YY}.CME
// Month codes: H=Mar, M=Jun, U=Sep, Z=Dec
const MONTH_CODES = { H: 'Mar', M: 'Jun', U: 'Sep', Z: 'Dec' };

/**
 * Generate list of SOFR futures tickers to fetch
 * Returns contracts from current quarter out ~3 years
 */
export function generateSOFRTickers() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const contracts = [];
  const codes = ['H', 'M', 'U', 'Z']; // Mar, Jun, Sep, Dec
  const codeMonths = { H: 3, M: 6, U: 9, Z: 12 };

  for (let year = currentYear; year <= currentYear + 4; year++) {
    for (const code of codes) {
      const contractMonth = codeMonths[code];
      const contractDate = new Date(year, contractMonth - 1, 1);

      // Skip expired contracts (before current month)
      if (contractDate < new Date(currentYear, currentMonth - 2, 1)) continue;

      const yy = String(year).slice(2);
      const ticker = `SR3${code}${yy}.CME`;
      const label = `${MONTH_CODES[code]}${yy}`;
      const tradingViewTicker = `SFR${code}${year % 10}`;

      contracts.push({
        ticker,
        label,
        tvTicker: tradingViewTicker,
        year,
        month: contractMonth,
        monthCode: code,
        settlementDate: getSettlementDate(year, contractMonth),
      });

      // Stop after ~20 contracts
      if (contracts.length >= 20) break;
    }
    if (contracts.length >= 20) break;
  }

  return contracts;
}

/**
 * Get IMM settlement date (3rd Wednesday of contract month)
 */
function getSettlementDate(year, month) {
  const d = new Date(year, month - 1, 1);
  // Find first Wednesday
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
  // 3rd Wednesday = first + 14 days
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch a single SOFR futures contract from Yahoo Finance
 * Returns current price + historical data for computing changes
 */
async function fetchYahooChart(ticker, range = '2mo', interval = '1d') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (!res.ok) return null;
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const meta = result.meta || {};

    // Build daily price array (most recent last)
    const prices = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i],
      volume: volumes[i],
    })).filter(p => p.close != null);

    if (prices.length === 0) return null;

    const latest = prices[prices.length - 1];
    const prev1d = prices.length > 1 ? prices[prices.length - 2] : null;
    const prev5d = prices.length > 5 ? prices[prices.length - 6] : null;
    const prev1m = prices.length > 21 ? prices[prices.length - 22] : (prices[0] || null);

    return {
      lastPx: latest.close,
      lastDate: latest.date,
      volume: latest.volume || 0,
      prevClose: meta.chartPreviousClose || prev1d?.close,
      // Price changes
      px1d: prev1d ? latest.close - prev1d.close : 0,
      px5d: prev5d ? latest.close - prev5d.close : 0,
      px1m: prev1m ? latest.close - prev1m.close : 0,
      // Basis point changes (implied rate = 100 - price, so rate change = -price change)
      bp1d: prev1d ? -(latest.close - prev1d.close) * 100 : 0,
      bp5d: prev5d ? -(latest.close - prev5d.close) * 100 : 0,
      bp1m: prev1m ? -(latest.close - prev1m.close) * 100 : 0,
      // Open interest from meta if available
      openInterest: meta.openInterest || 0,
    };
  } catch (err) {
    console.error(`Yahoo fetch error for ${ticker}:`, err.message);
    return null;
  }
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

      const impRate = parseFloat((100 - data.lastPx).toFixed(4));

      return {
        ticker: contract.tvTicker,
        yahooTicker: contract.ticker,
        month: contract.label,
        year: contract.year,
        monthCode: contract.monthCode,
        settlementDate: contract.settlementDate,
        lastPx: data.lastPx,
        impRate,
        volume: data.volume,
        openInterest: data.openInterest,
        // Price changes (in price terms, + = price up = rate down)
        px1d: data.px1d,
        px5d: data.px5d,
        px1m: data.px1m,
        // Rate changes in basis points (+ = rate up)
        bp1d: data.bp1d,
        bp5d: data.bp5d,
        bp1m: data.bp1m,
        lastDate: data.lastDate,
      };
    })
  );

  const valid = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  return valid;
}

/**
 * Group contracts by year for strip display
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
      contracts: contracts.sort((a, b) => {
        const order = { H: 0, M: 1, U: 2, Z: 3 };
        return order[a.monthCode] - order[b.monthCode];
      }),
    }));
}

/**
 * Compute meeting probabilities from SOFR futures
 * Uses the actual futures-implied rates to determine cut/hold probabilities
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

  // Sort SOFR contracts by settlement date
  const sorted = [...sofrContracts].sort(
    (a, b) => new Date(a.settlementDate) - new Date(b.settlementDate)
  );

  if (sorted.length === 0) return [];

  return meetings.map((m) => {
    const mDate = new Date(m.date);

    // Find the two SOFR contracts bracketing this meeting date
    let before = null, after = null;
    for (const c of sorted) {
      const sDate = new Date(c.settlementDate);
      if (sDate <= mDate) before = c;
      if (sDate > mDate && !after) after = c;
    }

    // Interpolate implied rate at meeting date
    let impliedRate;
    if (before && after) {
      const bDate = new Date(before.settlementDate);
      const aDate = new Date(after.settlementDate);
      const ratio = (mDate - bDate) / (aDate - bDate);
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

    // Compute probabilities (CME FedWatch binary tree methodology)
    const diff = (currentEFFR - adjustedRate) / 0.25;
    const cutsImplied = Math.max(0, diff);

    let hold, cut25, cut50;
    if (cutsImplied <= 0) {
      hold = 100; cut25 = 0; cut50 = 0;
    } else if (cutsImplied < 1) {
      hold = Math.round((1 - cutsImplied) * 100);
      cut25 = 100 - hold;
      cut50 = 0;
    } else if (cutsImplied < 2) {
      hold = 0;
      cut25 = Math.round((2 - cutsImplied) * 100);
      cut50 = 100 - cut25;
    } else {
      hold = 0; cut25 = 0; cut50 = 100;
    }

    return {
      meeting: m.label,
      date: m.date,
      contract: m.contract,
      impliedRate: parseFloat(impliedRate.toFixed(3)),
      hold, cut25, cut50,
      hike25: 0,
      cumCuts: cutsImplied.toFixed(1),
    };
  });
}
