import { NextResponse } from 'next/server';
import { fetchMultipleSeries, computeInflationYoY } from '@/lib/fred';
import { fetchAllSOFRFutures, groupByYear, computeMeetingProbsFromSOFR } from '@/lib/yahoo';
import { FALLBACK_RATES, FALLBACK_CPI, FALLBACK_MEETINGS, FALLBACK_STRIP, DOT_PLOT } from '@/lib/constants';

export const revalidate = 3600;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const apiKey = searchParams.get('key') || process.env.FRED_API_KEY;

  // Always fetch SOFR futures from Yahoo Finance (free, no key needed)
  let sofrContracts = [];
  let sofrStrip = [];
  let sofrError = null;

  try {
    sofrContracts = await fetchAllSOFRFutures();
    if (sofrContracts.length > 0) {
      sofrStrip = groupByYear(sofrContracts);
    }
  } catch (err) {
    sofrError = err.message;
    console.error('Yahoo SOFR fetch error:', err);
  }

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
      sofrRaw: sofrContracts,
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
      : computeFallbackMeetings(currentEFFR, rates);

    return NextResponse.json({
      live: true,
      sofrLive: sofrContracts.length > 0,
      sofrCount: sofrContracts.length,
      sofrError,
      lastUpdate: new Date().toISOString(),
      rates,
      meetings,
      strip: sofrStrip.length > 0 ? sofrStrip : FALLBACK_STRIP,
      sofrRaw: sofrContracts,
      cpi: cpiYoY.length > 0 ? cpiYoY : FALLBACK_CPI,
      coreCpi: cpiData?.CPILFESL ? computeInflationYoY(cpiData.CPILFESL) : [],
      pce: cpiData?.PCEPI ? computeInflationYoY(cpiData.PCEPI) : [],
      corePce: cpiData?.PCEPILFE ? computeInflationYoY(cpiData.PCEPILFE) : [],
      dotPlot: DOT_PLOT,
    });
  } catch (error) {
    console.error('API error:', error);
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
      sofrRaw: sofrContracts,
      cpi: FALLBACK_CPI,
      dotPlot: DOT_PLOT,
    });
  }
}

function computeFallbackMeetings(effr, curve) {
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
  const now = new Date();
  const sr = { 1: curve.DGS1MO||3.58, 3: curve.DGS3MO||3.55, 6: curve.DGS6MO||3.48, 12: curve.DGS1||3.42, 24: curve.DGS2||3.68 };
  return meetings.map(m => {
    const mo = (new Date(m.date).getFullYear()-now.getFullYear())*12+(new Date(m.date).getMonth()-now.getMonth());
    let r; if(mo<=1)r=sr[1];else if(mo<=3)r=sr[1]+(sr[3]-sr[1])*((mo-1)/2);else if(mo<=6)r=sr[3]+(sr[6]-sr[3])*((mo-3)/3);else if(mo<=12)r=sr[6]+(sr[12]-sr[6])*((mo-6)/6);else r=sr[12]+(sr[24]-sr[12])*((mo-12)/12);
    const d=(effr-r)/0.25,c=Math.max(0,d);let h,c25,c50;if(c<=0){h=100;c25=0;c50=0}else if(c<1){h=Math.round((1-c)*100);c25=100-h;c50=0}else if(c<2){h=0;c25=Math.round((2-c)*100);c50=100-c25}else{h=0;c25=0;c50=100}
    return{meeting:m.label,date:m.date,contract:m.contract,impliedRate:parseFloat(r.toFixed(3)),hold:h,cut25:c25,cut50:c50,hike25:0,cumCuts:c.toFixed(1)};
  });
}
