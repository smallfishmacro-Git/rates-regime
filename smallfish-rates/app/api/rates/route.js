import { NextResponse } from 'next/server';
import { computeInflationYoY } from '@/lib/fred';
import { FALLBACK_RATES, FALLBACK_CPI, DOT_PLOT } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

const FRED_JSON_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/fred.json';
const INFLATION_SWAPS_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/inflation_swaps.csv';
const NOMINAL_YIELDS_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/nominal_yields.csv';

const EMPTY_YC = { nominal: {}, real: {}, swaps: {}, history: [] };

const RATE_SERIES = [
  'EFFR', 'SOFR', 'DFEDTARU', 'DFEDTARL',
  'DGS1MO', 'DGS3MO', 'DGS6MO', 'DGS1', 'DGS2', 'DGS3',
  'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30',
  'T10Y2Y', 'T10Y3M',
  'T5YIE', 'T10YIE', 'T5YIFR', 'DFII10',
];

async function fetchCsv(url, parser) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { console.warn(`[rates] ${url} -> HTTP ${res.status}`); return []; }
    return parser(await res.text());
  } catch (err) {
    console.warn(`[rates] failed to fetch ${url}:`, err.message);
    return [];
  }
}

async function readFredJson() {
  try {
    const res = await fetch(FRED_JSON_URL, { cache: 'no-store' });
    if (!res.ok) { console.warn(`[rates] fred.json -> HTTP ${res.status}`); return null; }
    const data = await res.json();
    return data?.series ? data : null;
  } catch (err) {
    console.warn('[rates] failed to fetch fred.json:', err.message);
    return null;
  }
}

const readInflationSwapsCsv = () => fetchCsv(INFLATION_SWAPS_URL, parseInflationSwapsCsv);
const readNominalYieldsCsv  = () => fetchCsv(NOMINAL_YIELDS_URL, parseNominalYieldsCsv);

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

  const history = [];
  for (const s of swaps) {
    const y = yieldsMap.get(s.date);
    if (!y) continue;
    const n1 = dgs1.get(s.date);
    const r30 = dfii30.get(s.date);
    history.push({
      date: s.date,
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

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const pick = (row, prefix) => row ? {
    '1Y': row[`${prefix}1y`] ?? null,
    '2Y': row[`${prefix}2y`], '5Y': row[`${prefix}5y`],
    '10Y': row[`${prefix}10y`], '30Y': row[`${prefix}30y`],
  } : {};

  return {
    nominal: { latest: pick(latest, 'n'), prev: pick(prev, 'n') },
    real:    { latest: pick(latest, 'r'), prev: pick(prev, 'r') },
    swaps:   { latest: pick(latest, 'i'), prev: pick(prev, 'i') },
    history,
  };
}

export async function GET() {
  const [fred, swaps, yields] = await Promise.all([
    readFredJson(),
    readInflationSwapsCsv(),
    readNominalYieldsCsv(),
  ]);

  const series = fred?.series || {};
  const getSeries = (id) => (Array.isArray(series[id]) ? series[id] : null);

  const rates = {};
  for (const id of RATE_SERIES) {
    const arr = getSeries(id);
    rates[id] = arr?.at(-1)?.value ?? FALLBACK_RATES[id] ?? null;
  }

  const latestYield = yields[yields.length - 1];
  if (latestYield) {
    rates.DGS2 = latestYield.us2y;
    rates.DGS5 = latestYield.us5y;
    rates.DGS10 = latestYield.us10y;
    rates.DGS30 = latestYield.us30y;
  }

  const ycRateData = { DGS1: getSeries('DGS1'), DFII30: getSeries('DFII30') };
  const yieldCurve = (swaps.length && yields.length)
    ? buildYieldCurve(ycRateData, swaps, yields)
    : EMPTY_YC;

  const cpiObs = getSeries('CPIAUCSL');
  const coreCpiObs = getSeries('CPILFESL');
  const pceObs = getSeries('PCEPI');
  const corePceObs = getSeries('PCEPILFE');

  return NextResponse.json({
    live: !!fred,
    asOf: fred?.as_of || null,
    lastUpdate: new Date().toISOString(),
    rates,
    cpi: cpiObs?.length ? computeInflationYoY(cpiObs) : FALLBACK_CPI,
    coreCpi: coreCpiObs?.length ? computeInflationYoY(coreCpiObs) : [],
    pce: pceObs?.length ? computeInflationYoY(pceObs) : [],
    corePce: corePceObs?.length ? computeInflationYoY(corePceObs) : [],
    dotPlot: DOT_PLOT,
    yieldCurve,
  }, { headers: NO_CACHE_HEADERS });
}
