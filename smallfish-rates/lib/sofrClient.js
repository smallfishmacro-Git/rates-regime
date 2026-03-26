// Client-side helper — fetches all SOFR from /api/sofr batch endpoint

const CODE_MONTHS = { H: 3, M: 6, U: 9, Z: 12 };

export async function fetchAllSOFR() {
  try {
    const res = await fetch('/api/sofr');
    if (!res.ok) return { contracts: [], strip: [] };
    const data = await res.json();
    return {
      contracts: data.contracts || [],
      strip: data.strip || [],
      count: data.count || 0,
    };
  } catch (err) {
    console.error('SOFR fetch error:', err);
    return { contracts: [], strip: [] };
  }
}

export function computeMeetingProbs(sofrContracts, currentEFFR) {
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
  const sorted = [...sofrContracts].sort((a, b) => new Date(a.settlementDate) - new Date(b.settlementDate));
  if (!sorted.length) return [];

  return meetings.map(m => {
    const mDate = new Date(m.date);
    let before = null, after = null;
    for (const c of sorted) {
      if (new Date(c.settlementDate) <= mDate) before = c;
      if (new Date(c.settlementDate) > mDate && !after) after = c;
    }
    let impliedRate;
    if (before && after) {
      const ratio = (mDate - new Date(before.settlementDate)) / (new Date(after.settlementDate) - new Date(before.settlementDate));
      impliedRate = before.impRate + ratio * (after.impRate - before.impRate);
    } else impliedRate = (before || after)?.impRate || currentEFFR;

    const adj = impliedRate + 0.05;
    const cuts = Math.max(0, (currentEFFR - adj) / 0.25);
    let hold, cut25, cut50;
    if (cuts <= 0) { hold = 100; cut25 = 0; cut50 = 0; }
    else if (cuts < 1) { hold = Math.round((1 - cuts) * 100); cut25 = 100 - hold; cut50 = 0; }
    else if (cuts < 2) { hold = 0; cut25 = Math.round((2 - cuts) * 100); cut50 = 100 - cut25; }
    else { hold = 0; cut25 = 0; cut50 = 100; }
    return { meeting: m.label, date: m.date, contract: m.contract, impliedRate: parseFloat(impliedRate.toFixed(3)), hold, cut25, cut50, hike25: 0, cumCuts: cuts.toFixed(1) };
  });
}
