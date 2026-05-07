import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { FALLBACK_RATES, FALLBACK_CPI, DOT_PLOT } from '@/lib/constants';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const TENORS = ['1Y', '2Y', '5Y', '10Y', '30Y'];
const EMPTY_YC = { nominal: {}, real: {}, swaps: {}, history: [] };

async function readInflationSwapsCsv() {
  const candidates = [
    path.join(process.cwd(), 'public', 'data', 'inflation_swaps.csv'),
    path.join(process.cwd(), 'data', 'inflation_swaps.csv'),
    path.join(process.cwd(), '..', 'data', 'inflation_swaps.csv'),
  ];
  for (const p of candidates) {
    try {
      const txt = await fs.readFile(p, 'utf8');
      console.log(`[YC] inflation_swaps.csv read from: ${p} (${txt.length} bytes)`);
      return parseInflationSwapsCsv(txt);
    } catch {}
  }
  console.warn('[YC] inflation_swaps.csv NOT FOUND in any candidate path:', candidates);
  return [];
}

function parseInflationSwapsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 4) continue;
    const [date, us2, us5, us10] = cols;
    const r2 = parseFloat(us2), r5 = parseFloat(us5), r10 = parseFloat(us10);
    if (isFinite(r2) && isFinite(r5) && isFinite(r10)) {
      out.push({ date, us2yis: r2, us5yis: r5, us10yis: r10 });
    }
  }
  return out;
}

function buildYieldCurve(rateData, swaps) {
  const toMap = (arr) => {
    const m = new Map();
    if (Array.isArray(arr)) for (const o of arr) m.set(o.date, o.value);
    return m;
  };
  const dgs1  = toMap(rateData?.DGS1);
  const dgs2  = toMap(rateData?.DGS2);
  const dgs5  = toMap(rateData?.DGS5);
  const dgs10 = toMap(rateData?.DGS10);
  const dgs30 = toMap(rateData?.DGS30);
  const dfii30 = toMap(rateData?.DFII30);

  console.log('[YC] FRED series sizes:',
    `DGS1=${dgs1.size}`, `DGS2=${dgs2.size}`, `DGS5=${dgs5.size}`, `DGS10=${dgs10.size}`,
    `DGS30=${dgs30.size}`, `DFII30=${dfii30.size}`, `swaps=${swaps.length}`);

  const history = [];
  for (const s of swaps) {
    const date = s.date;
    const n1 = dgs1.get(date);
    const n2 = dgs2.get(date);
    const n5 = dgs5.get(date);
    const n10 = dgs10.get(date);
    const n30 = dgs30.get(date);
    const r30 = dfii30.get(date);
    if (n2 == null || n5 == null || n10 == null || n30 == null || r30 == null) continue;
    history.push({
      date,
      n1y: n1 ?? null,
      n2y: n2, n5y: n5, n10y: n10, n30y: n30,
      i2y: s.us2yis, i5y: s.us5yis, i10y: s.us10yis, i30y: n30 - r30,
      r2y: n2 - s.us2yis,
      r5y: n5 - s.us5yis,
      r10y: n10 - s.us10yis,
      r30y: r30,
    });
  }

  console.log(`[YC] merged history length: ${history.length}`);
  if (history.length) {
    console.log(`[YC] first: ${history[0].date}, last: ${history[history.length - 1].date}`);
  }

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const pick = (row, prefix) => row ? {
    '1Y': row[`${prefix}1y`] ?? null,
    '2Y': row[`${prefix}2y`], '5Y': row[`${prefix}5y`],
    '10Y': row[`${prefix}10y`], '30Y': row[`${prefix}30y`],
  } : {};

  return {
    nominal:   { latest: pick(latest, 'n'), prev: pick(prev, 'n') },
    real:      { latest: pick(latest, 'r'), prev: pick(prev, 'r') },
    swaps:     { latest: pick(latest, 'i'), prev: pick(prev, 'i') },
    history,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key') || process.env.FRED_API_KEY;

  // Even without a FRED key, try to read the swaps CSV so the inflation column
  // can render something. Nominal & real require FRED.
  if (!apiKey) {
    console.log('[YC] no FRED key — returning fallback (CSV-only swaps if available)');
    const swaps = await readInflationSwapsCsv();
    const yieldCurve = swaps.length
      ? buildYieldCurve({}, swaps)
      : EMPTY_YC;
    return NextResponse.json({
      live: false,
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
      yieldCurve,
    });
  }

  try {
    const rateSeries = [
      'EFFR', 'SOFR', 'DFEDTARU', 'DFEDTARL',
      'DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3',
      'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30',
      'T10Y2Y', 'T10Y3M',
      'T5YIE', 'T10YIE', 'T5YIFR', 'DFII10',
    ];

    const [rateData, cpiData, ycRateData, swaps] = await Promise.all([
      fetchMultipleSeries(rateSeries, 5, apiKey),
      // Full history from CPIAUCSL inception (1947-01) — series with later starts
      // (CPILFESL 1957, PCEPI/PCEPILFE 1959) just return their available range.
      fetchMultipleSeries(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'], 5, apiKey, '1947-01-01'),
      fetchMultipleSeries(['DGS1', 'DGS2', 'DGS5', 'DGS10', 'DGS30', 'DFII30'], 5, apiKey, '2020-01-01'),
      readInflationSwapsCsv(),
    ]);

    const rates = {};
    for (const [key, obs] of Object.entries(rateData)) {
      rates[key] = obs?.[0]?.value ?? FALLBACK_RATES[key] ?? null;
    }

    const yieldCurve = buildYieldCurve(ycRateData, swaps);

    return NextResponse.json({
      live: true,
      lastUpdate: new Date().toISOString(),
      rates,
      cpi: cpiData?.CPIAUCSL ? computeInflationYoY(cpiData.CPIAUCSL) : FALLBACK_CPI,
      coreCpi: cpiData?.CPILFESL ? computeInflationYoY(cpiData.CPILFESL) : [],
      pce: cpiData?.PCEPI ? computeInflationYoY(cpiData.PCEPI) : [],
      corePce: cpiData?.PCEPILFE ? computeInflationYoY(cpiData.PCEPILFE) : [],
      dotPlot: DOT_PLOT,
      yieldCurve,
    });
  } catch (error) {
    console.error('[FRED] error:', error);
    return NextResponse.json({
      live: false, error: error.message, lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES, cpi: FALLBACK_CPI, dotPlot: DOT_PLOT,
      yieldCurve: EMPTY_YC,
    });
  }
}
