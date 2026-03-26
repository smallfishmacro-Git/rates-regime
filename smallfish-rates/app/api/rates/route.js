import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { FALLBACK_RATES, FALLBACK_CPI, DOT_PLOT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key') || process.env.FRED_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      live: false,
      lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES,
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

    return NextResponse.json({
      live: true,
      lastUpdate: new Date().toISOString(),
      rates,
      cpi: cpiData?.CPIAUCSL ? computeInflationYoY(cpiData.CPIAUCSL) : FALLBACK_CPI,
      coreCpi: cpiData?.CPILFESL ? computeInflationYoY(cpiData.CPILFESL) : [],
      pce: cpiData?.PCEPI ? computeInflationYoY(cpiData.PCEPI) : [],
      corePce: cpiData?.PCEPILFE ? computeInflationYoY(cpiData.PCEPILFE) : [],
      dotPlot: DOT_PLOT,
    });
  } catch (error) {
    console.error('[FRED] error:', error);
    return NextResponse.json({
      live: false, error: error.message, lastUpdate: new Date().toISOString(),
      rates: FALLBACK_RATES, cpi: FALLBACK_CPI, dotPlot: DOT_PLOT,
    });
  }
}
