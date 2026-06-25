export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Reuse the two already-committed CSVs. real = nominal - inflation_swap, per tenor.
const NOMINAL_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/nominal_yields.csv';
const SWAPS_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/inflation_swaps.csv';

function parseCsv(text) {
  const lines = (text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;
    const obj = {};
    header.forEach((h, j) => { obj[h] = cols[j]; });
    rows.push(obj);
  }
  return { header, rows };
}

// FRED-style missing sentinels -> null
function num(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '.' || s === 'null' || s === 'NaN') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const [nomRes, swpRes] = await Promise.all([
      fetch(NOMINAL_URL, { cache: 'no-store' }),
      fetch(SWAPS_URL, { cache: 'no-store' }),
    ]);
    const nom = parseCsv(await nomRes.text());
    const swp = parseCsv(await swpRes.text());

    const nomMap = new Map();
    for (const r of nom.rows) {
      const d = (r.date || '').trim();
      if (!d) continue;
      nomMap.set(d, { n2: num(r.US2Y), n5: num(r.US5Y), n10: num(r.US10Y) });
    }
    const swpMap = new Map();
    for (const r of swp.rows) {
      const d = (r.date || '').trim();
      if (!d) continue;
      swpMap.set(d, { i2: num(r.US2YIS), i5: num(r.US5YIS), i10: num(r.US10YIS) });
    }

    const dates = [...nomMap.keys()].filter((d) => swpMap.has(d)).sort();

    const out = {
      generated: new Date().toISOString(),
      tenors: ['2Y', '5Y', '10Y'],
      dates: [],
      r2y: [], i2y: [], r5y: [], i5y: [], r10y: [], i10y: [],
    };

    for (const d of dates) {
      const n = nomMap.get(d);
      const s = swpMap.get(d);
      out.dates.push(d);
      out.i2y.push(s.i2);
      out.i5y.push(s.i5);
      out.i10y.push(s.i10);
      out.r2y.push(n.n2 != null && s.i2 != null ? +(n.n2 - s.i2).toFixed(4) : null);
      out.r5y.push(n.n5 != null && s.i5 != null ? +(n.n5 - s.i5).toFixed(4) : null);
      out.r10y.push(n.n10 != null && s.i10 != null ? +(n.n10 - s.i10).toFixed(4) : null);
    }
    out.as_of = out.dates.length ? out.dates[out.dates.length - 1] : null;

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
}
