import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { FALLBACK_RATES, FALLBACK_CPI, FALLBACK_MEETINGS, FALLBACK_STRIP, DOT_PLOT } from '@/lib/constants';

export const revalidate = 3600; // ISR: revalidate every hour

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key') || process.env.FRED_API_KEY;

  if (!apiKey) {
    // Return fallback data
    return NextResponse.json({
      live: false,
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
      meetings: FALLBACK_MEETINGS,
      strip: FALLBACK_STRIP,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
    });
  }

  try {
    // Fetch all rate series from FRED
    const rateSeries = [
      'EFFR', 'SOFR', 'DFEDTARU', 'DFEDTARL',
      'DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3',
      'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30',
      'T10Y2Y', 'T10Y3M',
      'T5YIE', 'T10YIE', 'T5YIFR', 'DFII10',
    ];

    const [rateData, cpiData] = await Promise.all([
      fetchMultipleSeries(rateSeries, 5, apiKey),
      fetchMultipleSeries(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'], 36, apiKey),
    ]);

    // Extract latest values
    const rates = {};
    for (const [key, obs] of Object.entries(rateData)) {
      rates[key] = obs?.[0]?.value ?? FALLBACK_RATES[key] ?? null;
    }

    // Compute CPI YoY
    const cpiYoY = cpiData?.CPIAUCSL 
      ? computeInflationYoY(cpiData.CPIAUCSL) 
      : FALLBACK_CPI;

    // Compute meeting probabilities from yield curve
    const yieldCurve = {};
    for (const key of rateSeries) {
      yieldCurve[key] = rates[key];
    }

    // Compute implied path from yield curve (simplified FedWatch)
    const currentEFFR = rates.EFFR || FALLBACK_RATES.EFFR;
    const meetings = computeMeetingProbsFromCurve(currentEFFR, yieldCurve);

    // Compute strip from implied path
    const strip = computeStripFromMeetings(currentEFFR, meetings);

    return NextResponse.json({
      live: true,
      lastUpdate: new Date().toISOString(),
      rates,
      meetings,
      strip,
      cpi: cpiYoY.length > 0 ? cpiYoY : FALLBACK_CPI,
      coreCpi: cpiData?.CPILFESL ? computeInflationYoY(cpiData.CPILFESL) : [],
      pce: cpiData?.PCEPI ? computeInflationYoY(cpiData.PCEPI) : [],
      corePce: cpiData?.PCEPILFE ? computeInflationYoY(cpiData.PCEPILFE) : [],
      dotPlot: DOT_PLOT,
    });
  } catch (error) {
    console.error('FRED API error:', error);
    return NextResponse.json({
      live: false,
      error: 'Failed to fetch FRED data',
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
      meetings: FALLBACK_MEETINGS,
      strip: FALLBACK_STRIP,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
    });
  }
}

function computeMeetingProbsFromCurve(currentEFFR, curve) {
  const now = new Date();
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

  // Use front-end of yield curve to imply rate path
  const shortRates = {
    1: curve.DGS1MO || 3.58,
    3: curve.DGS3MO || 3.55,
    6: curve.DGS6MO || 3.48,
    12: curve.DGS1 || 3.42,
    24: curve.DGS2 || 3.68,
  };

  return meetings.map((m) => {
    const mDate = new Date(m.date);
    const monthsOut = (mDate.getFullYear() - now.getFullYear()) * 12 + (mDate.getMonth() - now.getMonth());

    // Interpolate implied rate
    let impliedRate;
    if (monthsOut <= 1) impliedRate = shortRates[1];
    else if (monthsOut <= 3) impliedRate = shortRates[1] + (shortRates[3] - shortRates[1]) * ((monthsOut - 1) / 2);
    else if (monthsOut <= 6) impliedRate = shortRates[3] + (shortRates[6] - shortRates[3]) * ((monthsOut - 3) / 3);
    else if (monthsOut <= 12) impliedRate = shortRates[6] + (shortRates[12] - shortRates[6]) * ((monthsOut - 6) / 6);
    else impliedRate = shortRates[12] + (shortRates[24] - shortRates[12]) * ((monthsOut - 12) / 12);

    const diff = (currentEFFR - impliedRate) / 0.25;
    const cutsImplied = Math.max(0, diff);

    let hold, cut25, cut50;
    if (cutsImplied <= 0) { hold = 100; cut25 = 0; cut50 = 0; }
    else if (cutsImplied < 1) { hold = Math.round((1 - cutsImplied) * 100); cut25 = 100 - hold; cut50 = 0; }
    else if (cutsImplied < 2) { hold = 0; cut25 = Math.round((2 - cutsImplied) * 100); cut50 = 100 - cut25; }
    else { hold = 0; cut25 = 0; cut50 = 100; }

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

function computeStripFromMeetings(currentEFFR, meetings) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const contracts2026 = [];
  const contracts2027 = [];
  const tickers = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];

  // Generate monthly contracts for remaining 2026 and into 2027
  for (let m = 3; m < 12; m++) { // Apr-Dec 2026
    const impRate = interpolateFromMeetings(meetings, 2026, m);
    const lastPx = 100 - impRate;
    contracts2026.push({
      ticker: `FF${tickers[m]}6`,
      month: `${monthNames[m]}26`,
      lastPx: parseFloat(lastPx.toFixed(3)),
      impRate: parseFloat(impRate.toFixed(3)),
      chgOCR: parseFloat((impRate - currentEFFR).toFixed(3)),
    });
  }

  for (let m = 0; m < 6; m++) { // Jan-Jun 2027
    const impRate = interpolateFromMeetings(meetings, 2027, m);
    const lastPx = 100 - impRate;
    contracts2027.push({
      ticker: `FF${tickers[m]}7`,
      month: `${monthNames[m]}27`,
      lastPx: parseFloat(lastPx.toFixed(3)),
      impRate: parseFloat(impRate.toFixed(3)),
      chgOCR: parseFloat((impRate - currentEFFR).toFixed(3)),
    });
  }

  return [
    { year: 2026, contracts: contracts2026 },
    { year: 2027, contracts: contracts2027 },
  ];
}

function interpolateFromMeetings(meetings, year, month) {
  const target = new Date(year, month, 15);
  let prev = null, next = null;

  for (const m of meetings) {
    const d = new Date(m.date);
    if (d <= target) prev = m;
    if (d > target && !next) next = m;
  }

  if (!prev && next) return next.impliedRate;
  if (prev && !next) return prev.impliedRate;
  if (!prev && !next) return 3.58;

  const prevDate = new Date(prev.date);
  const nextDate = new Date(next.date);
  const ratio = (target - prevDate) / (nextDate - prevDate);
  return prev.impliedRate + ratio * (next.impliedRate - prev.impliedRate);
}
