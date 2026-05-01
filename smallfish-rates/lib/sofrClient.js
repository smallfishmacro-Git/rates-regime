// Client-side SOFR data loader + CFR-style per-meeting probabilities

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

// FOMC meetings through 2029
const FOMC_MEETINGS = [
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
  { label: 'Jul 28', date: '2027-07-28', contract: 'FFN7' },
  { label: 'Sep 15', date: '2027-09-15', contract: 'FFU7' },
  { label: 'Oct 27', date: '2027-10-27', contract: 'FFV7' },
  { label: 'Dec 08', date: '2027-12-08', contract: 'FFZ7' },
  { label: 'Jan 26', date: '2028-01-26', contract: 'FFF8' },
  { label: 'Mar 15', date: '2028-03-15', contract: 'FFH8' },
  { label: 'Apr 26', date: '2028-04-26', contract: 'FFJ8' },
  { label: 'Jun 07', date: '2028-06-07', contract: 'FFM8' },
  { label: 'Jul 26', date: '2028-07-26', contract: 'FFN8' },
  { label: 'Sep 13', date: '2028-09-13', contract: 'FFU8' },
  { label: 'Oct 25', date: '2028-10-25', contract: 'FFV8' },
  { label: 'Dec 06', date: '2028-12-06', contract: 'FFZ8' },
  { label: 'Jan 31', date: '2029-01-31', contract: 'FFF9' },
  { label: 'Mar 14', date: '2029-03-14', contract: 'FFH9' },
  { label: 'Apr 25', date: '2029-04-25', contract: 'FFJ9' },
  { label: 'Jun 06', date: '2029-06-06', contract: 'FFM9' },
  { label: 'Jul 25', date: '2029-07-25', contract: 'FFN9' },
  { label: 'Sep 12', date: '2029-09-12', contract: 'FFU9' },
  { label: 'Oct 24', date: '2029-10-24', contract: 'FFV9' },
  { label: 'Dec 05', date: '2029-12-05', contract: 'FFZ9' },
];

/**
 * Interpolate SOFR rate at a given date from the futures curve
 */
function interpolateRate(sorted, targetDate) {
  const t = new Date(targetDate);
  let before = null, after = null;
  for (const c of sorted) {
    const sd = new Date(c.settlementDate);
    if (sd <= t) before = c;
    if (sd > t && !after) after = c;
  }
  if (before && after) {
    const ratio = (t - new Date(before.settlementDate)) / (new Date(after.settlementDate) - new Date(before.settlementDate));
    return before.impRate + ratio * (after.impRate - before.impRate);
  }
  return (before || after)?.impRate || null;
}

/**
 * CFR-style per-meeting probabilities.
 * 
 * RATE = implied rate going INTO the meeting
 * POST-MTG = implied rate AFTER the meeting
 * The difference gives us what the market prices for THIS specific meeting.
 * 
 * Per-meeting move decomposed into:
 *   HOLD / CUT 25 / CUT 50 / CUT 75 / HIKE 25 / HIKE 50 / HIKE 75
 * 
 * CUM HIKES = cumulative rate change from spot in number of 25bp moves
 *   positive = net hikes, negative = net cuts
 */
export function computeMeetingProbs(sofrContracts, currentSOFR) {
  const sorted = [...sofrContracts].sort((a, b) => new Date(a.settlementDate) - new Date(b.settlementDate));
  if (!sorted.length) return [];

  const results = [];
  let cumChangeBp = 0;

  for (let i = 0; i < FOMC_MEETINGS.length; i++) {
    const m = FOMC_MEETINGS[i];
    const mDate = new Date(m.date);

    // Rate going INTO this meeting = post-meeting rate of previous, or spot
    const preMtgRate = i === 0
      ? currentSOFR
      : results[i - 1].postMtg;

    // Rate AFTER this meeting = interpolated from SOFR curve at meeting date
    const postMtgRate = interpolateRate(sorted, m.date) || preMtgRate;

    // Per-meeting expected move in bp (positive = rate goes up = hike)
    const meetingMoveBp = (postMtgRate - preMtgRate) * 100;

    // Decompose into probability of a 25bp move at this meeting
    // moveFraction: how many 25bp moves are priced at this meeting
    const moveFraction = meetingMoveBp / 25; // positive = hike, negative = cut

    let hold = 0, cut25 = 0, cut50 = 0, cut75 = 0;
    let hike25 = 0, hike50 = 0, hike75 = 0;

    if (Math.abs(moveFraction) < 0.02) {
      hold = 100;
    } else if (moveFraction < 0) {
      // Cuts priced at this meeting
      const cutFrac = -moveFraction;
      if (cutFrac < 1) {
        hold = Math.round((1 - cutFrac) * 100);
        cut25 = 100 - hold;
      } else if (cutFrac < 2) {
        cut25 = Math.round((2 - cutFrac) * 100);
        cut50 = 100 - cut25;
      } else if (cutFrac < 3) {
        cut50 = Math.round((3 - cutFrac) * 100);
        cut75 = 100 - cut50;
      } else {
        cut75 = 100;
      }
    } else {
      // Hikes priced at this meeting
      if (moveFraction < 1) {
        hold = Math.round((1 - moveFraction) * 100);
        hike25 = 100 - hold;
      } else if (moveFraction < 2) {
        hike25 = Math.round((2 - moveFraction) * 100);
        hike50 = 100 - hike25;
      } else if (moveFraction < 3) {
        hike50 = Math.round((3 - moveFraction) * 100);
        hike75 = 100 - hike50;
      } else {
        hike75 = 100;
      }
    }

    // Cumulative change from spot in bp
    cumChangeBp += meetingMoveBp;
    // Express as number of 25bp moves (positive = hikes, negative = cuts)
    const cumMoves = parseFloat((cumChangeBp / 25).toFixed(1));

    results.push({
      meeting: m.label,
      date: m.date,
      contract: m.contract,
      rate: parseFloat(preMtgRate.toFixed(3)),
      postMtg: parseFloat(postMtgRate.toFixed(3)),
      impliedRate: parseFloat(postMtgRate.toFixed(3)),
      hold, cut25, cut50, cut75,
      hike25, hike50, hike75,
      cumMoves,
    });
  }

  return results;
}
