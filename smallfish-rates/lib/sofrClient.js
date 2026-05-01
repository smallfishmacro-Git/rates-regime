// Client-side SOFR data loader + meeting probabilities
// Reads from /data/sofr.json (updated daily by GitHub Actions)

export async function fetchAllSOFR() {
  try {
    const res = await fetch('/data/sofr.json');
    if (!res.ok) return { contracts: [], strip: [], count: 0 };
    const data = await res.json();
    return {
      contracts: data.contracts || [],
      strip: data.strip || [],
      count: data.count || 0,
      timestamp: data.timestamp || null,
    };
  } catch (err) {
    console.error('SOFR fetch error:', err);
    return { contracts: [], strip: [], count: 0 };
  }
}

// Extended FOMC meetings: ~30 meetings out to mid-2029
const FOMC_MEETINGS = [
  // 2026
  { label: 'Apr 29', date: '2026-04-29', contract: 'FFJ6' },
  { label: 'Jun 10', date: '2026-06-10', contract: 'FFM6' },
  { label: 'Jul 29', date: '2026-07-29', contract: 'FFN6' },
  { label: 'Sep 16', date: '2026-09-16', contract: 'FFU6' },
  { label: 'Oct 28', date: '2026-10-28', contract: 'FFV6' },
  { label: 'Dec 09', date: '2026-12-09', contract: 'FFZ6' },
  // 2027
  { label: 'Jan 27', date: '2027-01-27', contract: 'FFF7' },
  { label: 'Mar 17', date: '2027-03-17', contract: 'FFH7' },
  { label: 'Apr 28', date: '2027-04-28', contract: 'FFJ7' },
  { label: 'Jun 09', date: '2027-06-09', contract: 'FFM7' },
  { label: 'Jul 28', date: '2027-07-28', contract: 'FFN7' },
  { label: 'Sep 15', date: '2027-09-15', contract: 'FFU7' },
  { label: 'Oct 27', date: '2027-10-27', contract: 'FFV7' },
  { label: 'Dec 08', date: '2027-12-08', contract: 'FFZ7' },
  // 2028
  { label: 'Jan 26', date: '2028-01-26', contract: 'FFF8' },
  { label: 'Mar 15', date: '2028-03-15', contract: 'FFH8' },
  { label: 'Apr 26', date: '2028-04-26', contract: 'FFJ8' },
  { label: 'Jun 07', date: '2028-06-07', contract: 'FFM8' },
  { label: 'Jul 26', date: '2028-07-26', contract: 'FFN8' },
  { label: 'Sep 13', date: '2028-09-13', contract: 'FFU8' },
  { label: 'Oct 25', date: '2028-10-25', contract: 'FFV8' },
  { label: 'Dec 06', date: '2028-12-06', contract: 'FFZ8' },
  // 2029
  { label: 'Jan 31', date: '2029-01-31', contract: 'FFF9' },
  { label: 'Mar 14', date: '2029-03-14', contract: 'FFH9' },
  { label: 'Apr 25', date: '2029-04-25', contract: 'FFJ9' },
  { label: 'Jun 06', date: '2029-06-06', contract: 'FFM9' },
  { label: 'Jul 25', date: '2029-07-25', contract: 'FFN9' },
  { label: 'Sep 12', date: '2029-09-12', contract: 'FFU9' },
  { label: 'Oct 24', date: '2029-10-24', contract: 'FFV9' },
  { label: 'Dec 05', date: '2029-12-05', contract: 'FFZ9' },
];

export function computeMeetingProbs(sofrContracts, currentEFFR) {
  const sorted = [...sofrContracts].sort((a, b) => new Date(a.settlementDate) - new Date(b.settlementDate));
  if (!sorted.length) return [];

  return FOMC_MEETINGS.map(m => {
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
    } else {
      impliedRate = (before || after)?.impRate || currentEFFR;
    }

    // SOFR trades ~5bp below EFFR, adjust
    const adj = impliedRate + 0.05;

    // Number of 25bp moves implied (positive = cuts, negative = hikes)
    const movesImplied = (currentEFFR - adj) / 0.25;

    // Compute probabilities for cuts AND hikes
    let hold = 0, cut25 = 0, cut50 = 0, cut75 = 0;
    let hike25 = 0, hike50 = 0, hike75 = 0;

    if (Math.abs(movesImplied) < 0.01) {
      // Essentially no move priced
      hold = 100;
    } else if (movesImplied > 0) {
      // Cuts priced in
      if (movesImplied < 1) {
        hold = Math.round((1 - movesImplied) * 100);
        cut25 = 100 - hold;
      } else if (movesImplied < 2) {
        cut25 = Math.round((2 - movesImplied) * 100);
        cut50 = 100 - cut25;
      } else if (movesImplied < 3) {
        cut50 = Math.round((3 - movesImplied) * 100);
        cut75 = 100 - cut50;
      } else {
        cut75 = 100;
      }
    } else {
      // Hikes priced in (movesImplied is negative)
      const hikesImplied = -movesImplied;
      if (hikesImplied < 1) {
        hold = Math.round((1 - hikesImplied) * 100);
        hike25 = 100 - hold;
      } else if (hikesImplied < 2) {
        hike25 = Math.round((2 - hikesImplied) * 100);
        hike50 = 100 - hike25;
      } else if (hikesImplied < 3) {
        hike50 = Math.round((3 - hikesImplied) * 100);
        hike75 = 100 - hike50;
      } else {
        hike75 = 100;
      }
    }

    return {
      meeting: m.label,
      date: m.date,
      contract: m.contract,
      impliedRate: parseFloat(impliedRate.toFixed(3)),
      hold, cut25, cut50, cut75,
      hike25, hike50, hike75,
      cumMoves: movesImplied.toFixed(1),
    };
  });
}
