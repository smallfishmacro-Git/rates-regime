// FRED API helper — free key from https://fred.stlouisfed.org/docs/api/api_key.html
// Set FRED_API_KEY in Vercel environment variables

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// All FRED series we need
export const SERIES = {
  // Policy rates
  EFFR: 'EFFR',           // Effective Federal Funds Rate (daily)
  SOFR: 'SOFR',           // Secured Overnight Financing Rate (daily)
  DFEDTARU: 'DFEDTARU',   // Fed Funds Target Upper
  DFEDTARL: 'DFEDTARL',   // Fed Funds Target Lower
  IORB: 'IORB',           // Interest on Reserve Balances

  // Treasury yields
  DGS1MO: 'DGS1MO',
  DGS3MO: 'DGS3MO',
  DGS6MO: 'DGS6MO',
  DGS1: 'DGS1',
  DGS2: 'DGS2',
  DGS3: 'DGS3',
  DGS5: 'DGS5',
  DGS7: 'DGS7',
  DGS10: 'DGS10',
  DGS20: 'DGS20',
  DGS30: 'DGS30',

  // Spreads
  T10Y2Y: 'T10Y2Y',
  T10Y3M: 'T10Y3M',

  // Breakevens & TIPS
  T5YIE: 'T5YIE',
  T10YIE: 'T10YIE',
  T5YIFR: 'T5YIFR',       // 5-Year, 5-Year Forward Inflation
  DFII10: 'DFII10',       // 10-Year TIPS yield

  // Inflation
  CPIAUCSL: 'CPIAUCSL',   // CPI All Urban Consumers (monthly)
  CPILFESL: 'CPILFESL',   // Core CPI (monthly)
  PCEPI: 'PCEPI',         // PCE Price Index (monthly)
  PCEPILFE: 'PCEPILFE',   // Core PCE (monthly)
};

/**
 * Fetch a FRED series with N most recent observations
 */
export async function fetchFredSeries(seriesId, limit = 10, apiKey) {
  const key = apiKey || process.env.FRED_API_KEY;
  if (!key) return null;

  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1hr
    if (!res.ok) return null;
    const data = await res.json();
    return data.observations?.map(o => ({
      date: o.date,
      value: o.value === '.' ? null : parseFloat(o.value),
    })).filter(o => o.value !== null) || [];
  } catch {
    return null;
  }
}

/**
 * Fetch multiple FRED series in parallel
 */
export async function fetchMultipleSeries(seriesIds, limit = 5, apiKey) {
  const results = {};
  const promises = seriesIds.map(async (id) => {
    const data = await fetchFredSeries(id, limit, apiKey);
    results[id] = data;
  });
  await Promise.all(promises);
  return results;
}

/**
 * Compute FedWatch-style meeting probabilities from FRED EFFR data.
 * Uses the CME methodology: binary probability tree from implied EFFR rates.
 * Since we don't have FF futures from FRED, we approximate from the yield curve.
 */
export function computeFedWatchProbabilities(currentEFFR, yieldCurve, meetings) {
  const currentTarget = Math.round(currentEFFR * 8) / 8; // nearest 12.5bp
  const upperBound = currentTarget + 0.125;
  const lowerBound = currentTarget - 0.125;

  return meetings.map((meeting, idx) => {
    // Interpolate expected rate from yield curve for meeting date
    const monthsOut = getMonthsDifference(new Date(), new Date(meeting.date));
    const impliedRate = interpolateRate(yieldCurve, monthsOut);

    // Compute probabilities using binary tree
    const diff = (currentEFFR - impliedRate) * 100; // in basis points
    const cutsImplied = diff / 25; // number of 25bp cuts implied

    // Probability distribution
    const wholeCuts = Math.floor(Math.max(0, cutsImplied));
    const fractional = Math.max(0, cutsImplied) - wholeCuts;

    let probs = {};
    if (cutsImplied <= 0) {
      probs.hold = Math.min(100, Math.round((1 - Math.max(0, cutsImplied)) * 100));
      probs.cut25 = Math.max(0, 100 - probs.hold);
      probs.cut50 = 0;
    } else if (cutsImplied < 1) {
      probs.hold = Math.round((1 - cutsImplied) * 100);
      probs.cut25 = 100 - probs.hold;
      probs.cut50 = 0;
    } else if (cutsImplied < 2) {
      probs.hold = 0;
      probs.cut25 = Math.round((2 - cutsImplied) * 100);
      probs.cut50 = 100 - probs.cut25;
    } else {
      probs.hold = 0;
      probs.cut25 = 0;
      probs.cut50 = 100;
    }

    return {
      meeting: meeting.label,
      date: meeting.date,
      contract: meeting.contract,
      impliedRate: impliedRate,
      hold: probs.hold,
      cut25: probs.cut25,
      cut50: probs.cut50,
      hike25: 0,
      cumCuts: Math.max(0, cutsImplied).toFixed(1),
    };
  });
}

function getMonthsDifference(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function interpolateRate(curve, monthsOut) {
  // Simple interpolation from yield curve
  const tenorMonths = [1, 3, 6, 12, 24, 36, 60, 84, 120, 240, 360];
  const keys = ['DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3', 'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30'];

  let lower = 0, upper = tenorMonths.length - 1;
  for (let i = 0; i < tenorMonths.length - 1; i++) {
    if (monthsOut >= tenorMonths[i] && monthsOut <= tenorMonths[i + 1]) {
      lower = i;
      upper = i + 1;
      break;
    }
  }

  const lowerRate = curve[keys[lower]] || 3.6;
  const upperRate = curve[keys[upper]] || 3.6;
  const ratio = (monthsOut - tenorMonths[lower]) / (tenorMonths[upper] - tenorMonths[lower]);
  return lowerRate + ratio * (upperRate - lowerRate);
}

/**
 * Compute inflation YoY from monthly CPI index values
 */
export function computeInflationYoY(observations) {
  if (!observations || observations.length < 13) return [];
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const results = [];

  for (let i = 12; i < sorted.length; i++) {
    const current = sorted[i].value;
    const yearAgo = sorted[i - 12].value;
    const monthPrev = sorted[i - 1].value;
    if (current && yearAgo && monthPrev) {
      results.push({
        date: sorted[i].date.slice(0, 7),
        yoy: parseFloat((((current - yearAgo) / yearAgo) * 100).toFixed(1)),
        mom: parseFloat((((current - monthPrev) / monthPrev) * 100).toFixed(2)),
      });
    }
  }
  return results;
}
