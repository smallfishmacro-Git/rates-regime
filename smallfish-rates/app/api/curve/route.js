import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// Served from raw.githubusercontent so a GitHub-Actions data commit shows up
// without a Vercel redeploy — same pattern as /api/rates reading fred.json.
const CURVE_JSON_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/curve_regime.json';

export async function GET() {
  try {
    const res = await fetch(CURVE_JSON_URL, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[curve] curve_regime.json -> HTTP ${res.status}`);
      return NextResponse.json({ live: false, dates: [] }, { headers: NO_CACHE_HEADERS });
    }
    const data = await res.json();
    return NextResponse.json({ live: true, ...data }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.warn('[curve] failed to fetch curve_regime.json:', err.message);
    return NextResponse.json({ live: false, dates: [] }, { headers: NO_CACHE_HEADERS });
  }
}
