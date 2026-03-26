import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { fetchAllSOFRFutures, groupByYear, computeMeetingProbsFromSOFR } from '@/lib/yahoo';
import { FALLBACK_RATES, FALLBACK_CPI, FALLBACK_MEETINGS, FALLBACK_STRIP, DOT_PLOT } from '@/lib/constants';

export const dynamic = 'force-dynamic'; // always run server-side, no static cache

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key') || process.env.FRED_API_KEY;

  // ── SOFR FUTURES (Yahoo Finance — free, no key) ──
  let sofrContracts = [];
  let sofrStrip = [];
  let sofrError = null;

  try {
    console.log('[SOFR] Fetching from Yahoo Finance...');
    sofrContracts = await fetchAllSOFRFutures();
    console.log(`[SOFR] Got ${sofrContracts.length} contracts`);
    if (sofrContracts.length > 0) {
      sofrStrip = groupByYear(sofrContracts);
      // Log first contract to verify data
      const first = sofrContracts[0];
      console.log(`[SOFR] First: ${first.ticker} px=${first.lastPx} bp1d=${first.bp1d} bp5d=${first.bp5d} bp1m=${first.bp1m}`);
    }
  } catch (err) {
    sofrError = err.message;
    console.error('[SOFR] Yahoo fetch error:', err);
  }

  // ── FRED DATA (rates + inflation) ──
  if (!apiKey) {
    const currentEFFR = FALLBACK_RATES.EFFR;
    const meetings = sofrContracts.length > 0
      ? computeMeetingProbsFromSOFR(sofrContracts, currentEFFR)
      : FALLBACK_MEETINGS;

    return NextResponse.json({
      live: false,
      sofrLive: sofrContracts.length > 0,
      sofrCount: sofrContracts.length,
      sofrError,
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
      meetings,
      strip: sofrStrip.length > 0 ? sofrStrip : FALLBACK_STRIP,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
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

    const [rateData, cpiData] = await Promise.all([
      fetchMultipleSeries(rateSeries, 5, apiKey),
      fetchMultipleSeries(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'], 36, apiKey),
    ]);

    const rates = {};
    for (const [key, obs] of Object.entries(rateData)) {
      rates[key] = obs?.[0]?.value ?? FALLBACK_RATES[key] ?? null;
    }

    const cpiYoY = cpiData?.CPIAUCSL
      ? computeInflationYoY(cpiData.CPIAUCSL)
      : FALLBACK_CPI;

    const currentEFFR = rates.EFFR || FALLBACK_RATES.EFFR;
    const meetings = sofrContracts.length > 0
      ? computeMeetingProbsFromSOFR(sofrContracts, currentEFFR)
      : FALLBACK_MEETINGS;

    return NextResponse.json({
      live: true,
      sofrLive: sofrContracts.length > 0,
      sofrCount: sofrContracts.length,
      sofrError,
      lastUpdate: new Date().toISOString(),
      rates,
      meetings,
      strip: sofrStrip.length > 0 ? sofrStrip : FALLBACK_STRIP,
      cpi: cpiYoY.length > 0 ? cpiYoY : FALLBACK_CPI,
      coreCpi: cpiData?.CPILFESL ? computeInflationYoY(cpiData.CPILFESL) : [],
      pce: cpiData?.PCEPI ? computeInflationYoY(cpiData.PCEPI) : [],
      corePce: cpiData?.PCEPILFE ? computeInflationYoY(cpiData.PCEPILFE) : [],
      dotPlot: DOT_PLOT,
    });
  } catch (error) {
    console.error('[FRED] API error:', error);
    return NextResponse.json({
      live: false,
      sofrLive: sofrContracts.length > 0,
      sofrCount: sofrContracts.length,
      error: error.message,
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
      meetings: sofrContracts.length > 0
        ? computeMeetingProbsFromSOFR(sofrContracts, FALLBACK_RATES.EFFR)
        : FALLBACK_MEETINGS,
      strip: sofrStrip.length > 0 ? sofrStrip : FALLBACK_STRIP,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
    });
  }
}
