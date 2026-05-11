import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { FALLBACK_RATES, FALLBACK_CPI, DOT_PLOT } from '@/lib/constants';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const TENORS = ['1Y', '2Y', '5Y', '10Y', '30Y'];
const EMPTY_YC = { nominal: {}, real: {}, swaps: {}, history: [] };

async function readCsv(filename, parser) {
  const candidates = [
    path.join(process.cwd(), 'public', 'data', filename),
    path.join(process.cwd(), 'data', filename),
    path.join(process.cwd(), '..', 'data', filename),
  ];
  for (const p of candidates) {
    try {
      const txt = await fs.readFile(p, 'utf8');
      console.log(`[YC] ${filename} read from: ${p} (${txt.length} bytes)`);
      return parser(txt);
    } catch {}
  }
  console.warn(`[YC] ${filename} NOT FOUND in any candidate path:`, candidates);
  return [];
}

function readInflationSwapsCsv() {
  return readCsv('inflation_swaps.csv', parseInflationSwapsCsv);
}

function readNominalYieldsCsv() {
  return readCsv('nominal_yields.csv', parseNominalYieldsCsv);
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

function parseNominalYieldsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;
    const [date, us2, us5, us10, us30] = cols;
    const n2 = parseFloat(us2), n5 = parseFloat(us5),
          n10 = parseFloat(us10), n30 = parseFloat(us30);
    if (isFinite(n2) && isFinite(n5) && isFinite(n10) && isFinite(n30)) {
      out.push({ date, us2y: n2, us5y: n5, us10y: n10, us30y: n30 });
    }
  }
  return out;
}

function buildYieldCurve(rateData, swaps, yields) {
  const toMap = (arr) => {
    const m = new Map();
    if (Array.isArray(arr)) for (const o of arr) m.set(o.date, o.value);
    return m;
  };
  const dgs1   = toMap(rateData?.DGS1);
  const dfii30 = toMap(rateData?.DFII30);

  const yieldsMap = new Map();
  for (const y of yields) yieldsMap.set(y.date, y);

  console.log('[YC] sources:',
    `DGS1=${dgs1.size}`, `DFII30=${dfii30.size}`,
    `nominal_yields=${yields.length}`, `swaps=${swaps.length}`);

  const history = [];
  for (const s of swaps) {
    const date = s.date;
    const y = yieldsMap.get(date);
    if (!y) continue;  // need market-radar nominal yields
    const n1 = dgs1.get(date);
    const r30 = dfii30.get(date);
    history.push({
      date,
      n1y: n1 ?? null,
      n2y: y.us2y, n5y: y.us5y, n10y: y.us10y, n30y: y.us30y,
      i2y: s.us2yis, i5y: s.us5yis, i10y: s.us10yis,
      i30y: (r30 != null) ? (y.us30y - r30) : null,
      r2y: y.us2y - s.us2yis,
      r5y: y.us5y - s.us5yis,
      r10y: y.us10y - s.us10yis,
      r30y: r30 ?? null,
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
    console.log('[YC] no FRED key — returning fallback (CSV-only data if available)');
    const [swaps, yields] = await Promise.all([
      readInflationSwapsCsv(),
      readNominalYieldsCsv(),
    ]);
    const yieldCurve = (swaps.length && yields.length)
      ? buildYieldCurve({}, swaps, yields)
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

    const [rateData, cpiData, ycRateData, swaps, yields] = await Promise.all([
      fetchMultipleSeries(rateSeries, 5, apiKey),
      // Full history from CPIAUCSL inception (1947-01) — series with later starts
      // (CPILFESL 1957, PCEPI/PCEPILFE 1959) just return their available range.
      fetchMultipleSeries(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'], 5, apiKey, '1947-01-01'),
      fetchMultipleSeries(['DGS1', 'DFII30'], 5, apiKey, '2020-01-01'),
      readInflationSwapsCsv(),
      readNominalYieldsCsv(),
    ]);

    const rates = {};
    for (const [key, obs] of Object.entries(rateData)) {
      rates[key] = obs?.[0]?.value ?? FALLBACK_RATES[key] ?? null;
    }
    const latestYield = yields[yields.length - 1];
    if (latestYield) {
      rates.DGS2 = latestYield.us2y;
      rates.DGS5 = latestYield.us5y;
      rates.DGS10 = latestYield.us10y;
      rates.DGS30 = latestYield.us30y;
    }

    const yieldCurve = buildYieldCurve(ycRateData, swaps, yields);

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
