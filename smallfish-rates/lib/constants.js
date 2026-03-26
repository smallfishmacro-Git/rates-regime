// FOMC 2026-2027 meeting dates
export const FOMC_MEETINGS = [
  { date: '2026-01-28', label: 'Jan 28', contract: 'FFF6', passed: true, decision: 'HOLD' },
  { date: '2026-03-18', label: 'Mar 18', contract: 'FFH6', passed: true, decision: 'HOLD' },
  { date: '2026-04-29', label: 'Apr 29', contract: 'FFJ6', passed: false },
  { date: '2026-06-10', label: 'Jun 10', contract: 'FFM6', passed: false },
  { date: '2026-07-29', label: 'Jul 29', contract: 'FFN6', passed: false },
  { date: '2026-09-16', label: 'Sep 16', contract: 'FFU6', passed: false },
  { date: '2026-10-28', label: 'Oct 28', contract: 'FFV6', passed: false },
  { date: '2026-12-09', label: 'Dec 09', contract: 'FFZ6', passed: false },
  { date: '2027-01-27', label: 'Jan 27', contract: 'FFF7', passed: false },
  { date: '2027-03-17', label: 'Mar 17', contract: 'FFH7', passed: false },
  { date: '2027-04-28', label: 'Apr 28', contract: 'FFJ7', passed: false },
  { date: '2027-06-09', label: 'Jun 09', contract: 'FFM7', passed: false },
];

// Latest dot plot (March 2026 SEP) — median projections
export const DOT_PLOT = {
  '2026': 3.40,
  '2027': 3.15,
  '2028': 2.90,
  'longer_run': 3.00,
};

// Fallback data when FRED API key is not set
export const FALLBACK_RATES = {
  EFFR: 3.58,
  SOFR: 3.56,
  DFEDTARU: 3.75,
  DFEDTARL: 3.50,
  DGS1MO: 3.58,
  DGS3MO: 3.55,
  DGS6MO: 3.48,
  DGS1: 3.42,
  DGS2: 3.68,
  DGS3: 3.72,
  DGS5: 3.85,
  DGS7: 3.98,
  DGS10: 4.12,
  DGS20: 4.45,
  DGS30: 4.38,
  T10Y2Y: 0.44,
  T10Y3M: 0.57,
  T5YIE: 2.35,
  T10YIE: 2.28,
  T5YIFR: 2.21,
  DFII10: 1.84,
};

// Fallback meeting probabilities (based on CME FedWatch late March 2026)
export const FALLBACK_MEETINGS = [
  { meeting: 'Apr 29', date: '2026-04-29', contract: 'FFJ6', impliedRate: 3.620, hold: 86, cut25: 14, cut50: 0, hike25: 0, cumCuts: '0.1' },
  { meeting: 'Jun 10', date: '2026-06-10', contract: 'FFM6', impliedRate: 3.580, hold: 72, cut25: 24, cut50: 4, hike25: 0, cumCuts: '0.3' },
  { meeting: 'Jul 29', date: '2026-07-29', contract: 'FFN6', impliedRate: 3.540, hold: 62, cut25: 30, cut50: 8, hike25: 0, cumCuts: '0.5' },
  { meeting: 'Sep 16', date: '2026-09-16', contract: 'FFU6', impliedRate: 3.490, hold: 50, cut25: 38, cut50: 12, hike25: 0, cumCuts: '0.7' },
  { meeting: 'Oct 28', date: '2026-10-28', contract: 'FFV6', impliedRate: 3.450, hold: 42, cut25: 40, cut50: 18, hike25: 0, cumCuts: '0.9' },
  { meeting: 'Dec 09', date: '2026-12-09', contract: 'FFZ6', impliedRate: 3.390, hold: 32, cut25: 44, cut50: 24, hike25: 0, cumCuts: '1.1' },
  { meeting: 'Jan 27', date: '2027-01-27', contract: 'FFF7', impliedRate: 3.360, hold: 28, cut25: 46, cut50: 26, hike25: 0, cumCuts: '1.2' },
  { meeting: 'Mar 17', date: '2027-03-17', contract: 'FFH7', impliedRate: 3.330, hold: 24, cut25: 46, cut50: 30, hike25: 0, cumCuts: '1.3' },
  { meeting: 'Apr 28', date: '2027-04-28', contract: 'FFJ7', impliedRate: 3.300, hold: 20, cut25: 44, cut50: 36, hike25: 0, cumCuts: '1.4' },
  { meeting: 'Jun 09', date: '2027-06-09', contract: 'FFM7', impliedRate: 3.270, hold: 18, cut25: 42, cut50: 40, hike25: 0, cumCuts: '1.5' },
];

// FF Strip contracts (fallback)
export const FALLBACK_STRIP = [
  { year: 2026, contracts: [
    { ticker: 'FFJ6', month: 'Apr26', lastPx: 96.380, impRate: 3.620, chgOCR: -0.005 },
    { ticker: 'FFK6', month: 'May26', lastPx: 96.395, impRate: 3.605, chgOCR: -0.020 },
    { ticker: 'FFM6', month: 'Jun26', lastPx: 96.420, impRate: 3.580, chgOCR: -0.045 },
    { ticker: 'FFN6', month: 'Jul26', lastPx: 96.460, impRate: 3.540, chgOCR: -0.085 },
    { ticker: 'FFQ6', month: 'Aug26', lastPx: 96.480, impRate: 3.520, chgOCR: -0.105 },
    { ticker: 'FFU6', month: 'Sep26', lastPx: 96.510, impRate: 3.490, chgOCR: -0.135 },
    { ticker: 'FFV6', month: 'Oct26', lastPx: 96.550, impRate: 3.450, chgOCR: -0.175 },
    { ticker: 'FFX6', month: 'Nov26', lastPx: 96.570, impRate: 3.430, chgOCR: -0.195 },
    { ticker: 'FFZ6', month: 'Dec26', lastPx: 96.610, impRate: 3.390, chgOCR: -0.235 },
  ]},
  { year: 2027, contracts: [
    { ticker: 'FFF7', month: 'Jan27', lastPx: 96.640, impRate: 3.360, chgOCR: -0.265 },
    { ticker: 'FFG7', month: 'Feb27', lastPx: 96.660, impRate: 3.340, chgOCR: -0.285 },
    { ticker: 'FFH7', month: 'Mar27', lastPx: 96.670, impRate: 3.330, chgOCR: -0.295 },
    { ticker: 'FFJ7', month: 'Apr27', lastPx: 96.700, impRate: 3.300, chgOCR: -0.325 },
    { ticker: 'FFK7', month: 'May27', lastPx: 96.720, impRate: 3.280, chgOCR: -0.345 },
    { ticker: 'FFM7', month: 'Jun27', lastPx: 96.730, impRate: 3.270, chgOCR: -0.355 },
  ]},
];

// Fallback CPI history
export const FALLBACK_CPI = [
  { date: '2024-04', yoy: 3.4, mom: 0.3 }, { date: '2024-05', yoy: 3.3, mom: 0.2 },
  { date: '2024-06', yoy: 3.0, mom: -0.1 }, { date: '2024-07', yoy: 2.9, mom: 0.2 },
  { date: '2024-08', yoy: 2.5, mom: 0.2 }, { date: '2024-09', yoy: 2.4, mom: 0.2 },
  { date: '2024-10', yoy: 2.6, mom: 0.2 }, { date: '2024-11', yoy: 2.7, mom: 0.3 },
  { date: '2024-12', yoy: 2.9, mom: 0.4 }, { date: '2025-01', yoy: 3.0, mom: 0.5 },
  { date: '2025-02', yoy: 2.8, mom: 0.2 }, { date: '2025-03', yoy: 2.4, mom: 0.1 },
  { date: '2025-04', yoy: 2.3, mom: 0.2 }, { date: '2025-05', yoy: 2.4, mom: 0.3 },
  { date: '2025-06', yoy: 2.5, mom: 0.2 }, { date: '2025-07', yoy: 2.6, mom: 0.2 },
  { date: '2025-08', yoy: 2.5, mom: 0.1 }, { date: '2025-09', yoy: 2.4, mom: 0.2 },
  { date: '2025-10', yoy: 2.6, mom: 0.3 }, { date: '2025-11', yoy: 2.7, mom: 0.3 },
  { date: '2025-12', yoy: 2.8, mom: 0.4 }, { date: '2026-01', yoy: 3.0, mom: 0.5 },
  { date: '2026-02', yoy: 2.8, mom: 0.2 },
];
