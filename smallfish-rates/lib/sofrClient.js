// Client-side SOFR futures fetcher — calls /api/yahoo proxy

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
      const d = new Date(year, contractMonth - 1, 1);
      while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + 14);

      contracts.push({
        ticker: `SR3${code}${yy}.CME`,
        label: `${MONTH_CODES[code]}${yy}`,
        tvTicker: `SFR${code}${year % 10}`,
        year,
        month: contractMonth,
        monthCode: code,
        settlementDate: d.toISOString().slice(0, 10),
      });
      if (contracts.length >= 20) break;
    }
    if (contracts.length >= 20) break;
  }
  return contracts;
}

/**
 * Fetch one contract through our /api/yahoo proxy
 */
async function fetchContract(ticker, range = '2mo') {
  try {
    const res = await fetch(`/api/yahoo?ticker=${encodeURIComponent(ticker)}&range=${range}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.prices?.length) return null;
    return data.prices; // array of {date, close, volume}
  } catch {
    return null;
  }
}

function computeChanges(prices) {
  const n = prices.length;
  if (n === 0) return null;
  const latest = prices[n - 1];
  const get = (back) => (n - 1 - back >= 0 ? prices[n - 1 - back].close : null);

  const prev1d = get(1);
  const prev5d = get(5);
  const prev1m = get(22) ?? get(21) ?? get(20) ?? (n > 2 ? prices[0].close : null);

  const bp = (cur, prev) => prev != null ? parseFloat((-(cur - prev) * 100).toFixed(1)) : null;

  return {
    lastPx: latest.close,
    lastDate: latest.date,
    volume: latest.volume || 0,
    bp1d: bp(latest.close, prev1d),
    bp5d: bp(latest.close, prev5d),
    bp1m: bp(latest.close, prev1m),
  };
}

/**
 * Fetch all SOFR contracts — called from client side
 */
export async function fetchAllSOFR() {
  const contracts = generateSOFRTickers();

  // Fetch all in parallel through proxy
  const results = await Promise.allSettled(
    contracts.map(async (contract, idx) => {
      // First 4 contracts: get 1Y history, rest: 2mo
      const range = idx < 4 ? '1y' : '2mo';
      const prices = await fetchContract(contract.ticker, range);
      if (!prices || prices.length === 0) return null;

      const changes = computeChanges(prices);
      if (!changes) return null;

      return {
        ...contract,
        lastPx: changes.lastPx,
        impRate: parseFloat((100 - changes.lastPx).toFixed(4)),
        volume: changes.volume,
        bp1d: changes.bp1d,
        bp5d: changes.bp5d,
        bp1m: changes.bp1m,
        lastDate: changes.lastDate,
        // For first 4: full price history for chart
        history1y: idx < 4 ? prices : null,
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

export function computeMeetingProbs(sofrContracts, currentEFFR) {
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

    const adj = impliedRate + 0.05;
    const cuts = Math.max(0, (currentEFFR - adj) / 0.25);
    let hold, cut25, cut50;
    if (cuts <= 0) { hold = 100; cut25 = 0; cut50 = 0; }
    else if (cuts < 1) { hold = Math.round((1 - cuts) * 100); cut25 = 100 - hold; cut50 = 0; }
    else if (cuts < 2) { hold = 0; cut25 = Math.round((2 - cuts) * 100); cut50 = 100 - cut25; }
    else { hold = 0; cut25 = 0; cut50 = 100; }
    return { meeting: m.label, date: m.date, contract: m.contract, impliedRate: parseFloat(impliedRate.toFixed(3)), hold, cut25, cut50, hike25: 0, cumCuts: cuts.toFixed(1) };
  });
}
