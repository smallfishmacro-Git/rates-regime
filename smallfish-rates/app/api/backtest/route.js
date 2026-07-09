import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// Served from raw.githubusercontent so a GitHub-Actions data commit shows up
// without a Vercel redeploy - same pattern as /api/curve.
const BACKTEST_JSON_URL =
  'https://raw.githubusercontent.com/smallfishmacro-Git/rates-regime/main/data/backtest_assets.json';

export async function GET() {
  try {
    const res = await fetch(BACKTEST_JSON_URL, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[backtest] backtest_assets.json -> HTTP ${res.status}`);
      return NextResponse.json({ live: false, dates: [] }, { headers: NO_CACHE_HEADERS });
    }
    const data = await res.json();
    return NextResponse.json({ live: true, ...data }, { headers: NO_CACHE_HEADERS });
  } catch (err) {
    console.warn('[backtest] failed to fetch backtest_assets.json:', err.message);
    return NextResponse.json({ live: false, dates: [] }, { headers: NO_CACHE_HEADERS });
  }
}
