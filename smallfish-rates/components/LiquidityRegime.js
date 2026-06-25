'use client';
import { useState, useMemo } from 'react';

// Data: /api/liquidity -> joins data/nominal_yields.csv + data/inflation_swaps.csv.
// Per date & tenor: infl = inflation swap, real = nominal - inflation swap.
// Quadrant = signs of the 60-trading-day change in (real, infl).

// ---- tunable constants ----
const LOOKBACK = 60;       // trading days for the rolling change
const WINDOW_YEARS = 5;    // history shown in scatter + ribbon
const BP = 100;            // percent -> basis points
const TENORS = ['2Y', '5Y', '10Y'];

const Q = {
  FED_QE:    { name: 'FED QE / LIQUIDITY BID', sub: 'ΔRY ↓ · ΔBE ↑ · EASING + REFLATION',               color: '#00c853' },
  EXPANDING: { name: 'EXPANDING ECONOMY',      sub: 'ΔRY ↑ · ΔBE ↑ · GROWTH + INFLATION ACCELERATING',  color: '#f0b800' },
  RECESSION: { name: 'RECESSIONARY',           sub: 'ΔRY ↓ · ΔBE ↓ · GROWTH SCARE + DISINFLATION',      color: '#ff5252' },
  TAPER:     { name: 'TAPER / QT',             sub: 'ΔRY ↑ · ΔBE ↓ · LIQUIDITY WITHDRAWAL DOMINATES',   color: '#a855f7' },
};

const PLAYBOOK = {
  FED_QE: [
    ['RATES', 'muted nominal response; 10s30s steepens as BE outpaces RY decline'],
    ['EQUITIES', 'long S&P + EM equities · long-duration tech bid'],
    ['FX', 'short USD vs JPY / EUR / AUD · rate-diff narrows'],
    ['CMDTY', 'long gold & copper · reflation drift'],
    ['CREDIT', 'long US IG & HY cash · spreads compress'],
    ['VOL', 'short equity / FX / rates vol'],
  ],
  EXPANDING: [
    ['RATES', 'short US 10y · bear steepener as both real + BE rise'],
    ['EQUITIES', 'long financials, oil/gas · stay long equities'],
    ['FX', 'short USD vs EM & commodity FX'],
    ['CMDTY', 'short gold · long oil · demand-side bid'],
    ['CREDIT', 'long US IG/HY, EZ HY, EM credit OAS compression'],
    ['VOL', 'short equity vol · long rates vol'],
  ],
  RECESSION: [
    ['RATES', 'long duration across G7 · bull steepener priced'],
    ['EQUITIES', 'buy downside protection · defensives > cyclicals'],
    ['FX', 'long USDCAD, long USDJPY, long EURNOK · safe-haven'],
    ['CMDTY', 'short oil, short copper · demand collapse'],
    ['CREDIT', 'long IG for duration exposure · short HY'],
    ['VOL', 'long VIX · left-tail bid'],
  ],
  TAPER: [
    ['RATES', 'flatter UK30s50s, US 10s30s · real-rate squeeze'],
    ['EQUITIES', 'buy downside protection · multiple compression'],
    ['FX', 'long USD vs high-beta (EM, AUD, NZD)'],
    ['CMDTY', 'short silver, short platinum, short oil'],
    ['CREDIT', 'buy credit protection · IG > HY'],
    ['VOL', 'long VIX · vol-of-vol bid'],
  ],
};

function classify(dReal, dInfl) {
  if (dReal == null || dInfl == null) return null;
  if (dReal <= 0 && dInfl > 0) return 'FED_QE';
  if (dReal > 0 && dInfl > 0) return 'EXPANDING';
  if (dReal <= 0 && dInfl <= 0) return 'RECESSION';
  return 'TAPER';
}

function seriesFor(data, tenor) {
  if (!data) return null;
  const m = {
    '2Y':  { real: data.r2y,  infl: data.i2y },
    '5Y':  { real: data.r5y,  infl: data.i5y },
    '10Y': { real: data.r10y, infl: data.i10y },
  };
  return m[tenor] || null;
}

function ticks(min, max, n = 5) {
  const span = (max - min) || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(2)}%`);
const fmtBp  = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} bp`);

export default function LiquidityRegime({ data, loading }) {
  const [tenor, setTenor] = useState('10Y');

  const model = useMemo(() => {
    const s = seriesFor(data, tenor);
    if (!s || !data || !Array.isArray(data.dates)) return null;
    const { real, infl } = s;
    const dates = data.dates;

    const pts = [];
    for (let i = LOOKBACK; i < dates.length; i++) {
      const r0 = real[i - LOOKBACK], r1 = real[i];
      const f0 = infl[i - LOOKBACK], f1 = infl[i];
      if (r0 == null || r1 == null || f0 == null || f1 == null) continue;
      const dReal = (r1 - r0) * BP;
      const dInfl = (f1 - f0) * BP;
      pts.push({ date: dates[i], dReal, dInfl, quad: classify(dReal, dInfl) });
    }
    if (!pts.length) return null;

    // restrict to window
    const lastDate = pts[pts.length - 1].date;
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - WINDOW_YEARS);
    const win = pts.filter((p) => new Date(p.date) >= cutoff);

    // latest non-null levels (independent of each other)
    let lastReal = null, lastInfl = null;
    for (let i = real.length - 1; i >= 0; i--) { if (real[i] != null) { lastReal = real[i]; break; } }
    for (let i = infl.length - 1; i >= 0; i--) { if (infl[i] != null) { lastInfl = infl[i]; break; } }

    const cur = win[win.length - 1];

    const counts = { FED_QE: 0, EXPANDING: 0, RECESSION: 0, TAPER: 0 };
    win.forEach((p) => { if (p.quad) counts[p.quad]++; });
    const total = win.length || 1;

    return { pts: win, cur, lastReal, lastInfl, counts, total, asOf: cur.date };
  }, [data, tenor]);

  // ---- shells ----
  const wrap = { fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', fontSize: 12 };
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 14 };

  if (loading) return <div style={{ ...wrap, padding: 24, color: 'var(--dim)' }}>loading liquidity regime…</div>;
  if (!model)  return <div style={{ ...wrap, padding: 24, color: 'var(--dim)' }}>no data available for {tenor}.</div>;

  const { pts, cur, lastReal, lastInfl, counts, total, asOf } = model;
  const curQ = Q[cur.quad];

  // ---- scatter geometry ----
  const W = 600, H = 440, L = 50, R = 16, T = 16, B = 46;
  const pw = W - L - R, ph = H - T - B;
  const xs = pts.map((p) => p.dInfl), ys = pts.map((p) => p.dReal);
  let xmin = Math.min(0, ...xs), xmax = Math.max(0, ...xs);
  let ymin = Math.min(0, ...ys), ymax = Math.max(0, ...ys);
  const padX = (xmax - xmin) * 0.08 || 1, padY = (ymax - ymin) * 0.08 || 1;
  xmin -= padX; xmax += padX; ymin -= padY; ymax += padY;
  const sx = (v) => L + ((v - xmin) / (xmax - xmin)) * pw;
  const sy = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * ph;
  const x0 = sx(0), y0 = sy(0);
  const xticks = ticks(xmin, xmax, 5), yticks = ticks(ymin, ymax, 5);

  // ribbon geometry
  const RW = 1000, RH = 28;
  const rw = RW / pts.length;

  const TenorBtn = ({ t }) => (
    <button
      onClick={() => setTenor(t)}
      style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: 'pointer',
        padding: '4px 12px', borderRadius: 3,
        border: `1px solid ${tenor === t ? 'var(--amber)' : 'var(--border)'}`,
        background: tenor === t ? 'rgba(240,184,0,0.12)' : 'transparent',
        color: tenor === t ? 'var(--amber)' : 'var(--dim)',
      }}
    >{t}</button>
  );

  const QuadCard = ({ k }) => {
    const q = Q[k], active = cur.quad === k;
    return (
      <div style={{
        background: 'var(--card)',
        border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
        boxShadow: active ? '0 0 0 1px var(--amber), 0 0 18px rgba(240,184,0,0.18)' : 'none',
        borderRadius: 4, padding: 14,
      }}>
        <div style={{ color: q.color, fontWeight: 600, letterSpacing: 0.5 }}>{q.name}</div>
        <div style={{ color: 'var(--dim)', fontSize: 11, margin: '2px 0 10px' }}>{q.sub}</div>
        {PLAYBOOK[k].map(([label, txt]) => (
          <div key={label} style={{ display: 'flex', gap: 10, lineHeight: '1.6' }}>
            <span style={{ color: 'var(--dim)', width: 64, flex: '0 0 64px' }}>{label}</span>
            <span>{txt}</span>
          </div>
        ))}
      </div>
    );
  };

  const Metric = ({ label, value, delta }) => (
    <div style={{ ...card, flex: 1 }}>
      <div style={{ color: 'var(--dim)', fontSize: 11, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: 'var(--amber)', fontSize: 26, fontWeight: 700, lineHeight: '1.2' }}>{value}</div>
      {delta !== undefined && (
        <div style={{ color: 'var(--dim)', fontSize: 11 }}>{delta} · {LOOKBACK}D</div>
      )}
    </div>
  );

  return (
    <div style={wrap}>
      {/* title + maturity toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: 'var(--amber)', letterSpacing: 1, fontSize: 13 }}>LIQUIDITY REGIME</div>
        <div style={{ display: 'flex', gap: 8 }}>{TENORS.map((t) => <TenorBtn key={t} t={t} />)}</div>
      </div>

      {/* metrics strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Metric label={`${tenor} REAL YIELD`}     value={fmtPct(lastReal)} delta={fmtBp(cur.dReal)} />
        <Metric label={`${tenor} INFLATION SWAP`} value={fmtPct(lastInfl)} delta={fmtBp(cur.dInfl)} />
        <div style={{ ...card, flex: 1 }}>
          <div style={{ color: 'var(--dim)', fontSize: 11, letterSpacing: 0.5 }}>CURRENT QUADRANT</div>
          <div style={{ color: curQ.color, fontSize: 22, fontWeight: 700, lineHeight: '1.3' }}>{curQ.name}</div>
          <div style={{ color: 'var(--dim)', fontSize: 11 }}>as of {asOf}</div>
        </div>
      </div>

      {/* axis hint */}
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)', fontSize: 10, letterSpacing: 0.5, padding: '0 4px 4px' }}>
        <span>← LOWER REAL YIELDS</span>
        <span>HIGHER BREAKEVENS ↑ / LOWER BREAKEVENS ↓</span>
        <span>HIGHER REAL YIELDS →</span>
      </div>

      {/* 2x2 playbook */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <QuadCard k="FED_QE" />
        <QuadCard k="EXPANDING" />
        <QuadCard k="RECESSION" />
        <QuadCard k="TAPER" />
      </div>

      {/* scatter + ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* scatter */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text)', letterSpacing: 0.5 }}>SCATTER · ΔRY vs ΔBE</span>
            <span style={{ color: 'var(--dim)', fontSize: 10 }}>{LOOKBACK}-day changes · last {WINDOW_YEARS}y</span>
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 10, lineHeight: '1.4', marginBottom: 8 }}>
            60d rolling (ΔRY, ΔBE) scatter, quadrant-coloured. Today's marker emphasised — direction of travel matters (Recessionary → Fed QE is the classic policy-pivot arc).
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
            {/* quadrant tints */}
            <rect x={x0} y={T}  width={Math.max(0, L + pw - x0)} height={Math.max(0, y0 - T)}  fill="#f0b800" opacity="0.05" />
            <rect x={L}  y={T}  width={Math.max(0, x0 - L)}      height={Math.max(0, y0 - T)}  fill="#a855f7" opacity="0.05" />
            <rect x={x0} y={y0} width={Math.max(0, L + pw - x0)} height={Math.max(0, T + ph - y0)} fill="#00c853" opacity="0.05" />
            <rect x={L}  y={y0} width={Math.max(0, x0 - L)}      height={Math.max(0, T + ph - y0)} fill="#ff5252" opacity="0.05" />
            {/* gridlines */}
            {xticks.map((t, i) => (
              <line key={'gx' + i} x1={sx(t)} y1={T} x2={sx(t)} y2={T + ph} stroke="var(--grid)" strokeWidth="0.5" />
            ))}
            {yticks.map((t, i) => (
              <line key={'gy' + i} x1={L} y1={sy(t)} x2={L + pw} y2={sy(t)} stroke="var(--grid)" strokeWidth="0.5" />
            ))}
            {/* zero lines */}
            <line x1={x0} y1={T} x2={x0} y2={T + ph} stroke="var(--dim)" strokeWidth="1" />
            <line x1={L} y1={y0} x2={L + pw} y2={y0} stroke="var(--dim)" strokeWidth="1" />
            {/* points */}
            {pts.map((p, i) => (
              <circle key={i} cx={sx(p.dInfl)} cy={sy(p.dReal)} r="2.4" fill={Q[p.quad].color} opacity="0.6" />
            ))}
            {/* today */}
            <circle cx={sx(cur.dInfl)} cy={sy(cur.dReal)} r="6.5" fill="#fff" stroke={curQ.color} strokeWidth="2.5" />
            {/* tick labels */}
            {xticks.map((t, i) => (
              <text key={'tx' + i} x={sx(t)} y={T + ph + 14} fill="var(--dim)" fontSize="9" textAnchor="middle">{t.toFixed(0)}</text>
            ))}
            {yticks.map((t, i) => (
              <text key={'ty' + i} x={L - 6} y={sy(t) + 3} fill="var(--dim)" fontSize="9" textAnchor="end">{t.toFixed(0)}</text>
            ))}
            <text x={L + pw / 2} y={H - 4} fill="var(--dim)" fontSize="10" textAnchor="middle">ΔBreakeven · bp · {LOOKBACK}D</text>
            <text x={12} y={T + ph / 2} fill="var(--dim)" fontSize="10" textAnchor="middle" transform={`rotate(-90 12 ${T + ph / 2})`}>ΔReal Yield · bp · {LOOKBACK}D</text>
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
            {Object.entries(Q).map(([k, q]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--dim)', fontSize: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: q.color, display: 'inline-block' }} />{q.name}
              </span>
            ))}
          </div>
        </div>

        {/* ribbon + residency */}
        <div style={card}>
          <div style={{ color: 'var(--text)', letterSpacing: 0.5, marginBottom: 4 }}>QUADRANT TIMELINE</div>
          <div style={{ color: 'var(--dim)', fontSize: 10, lineHeight: '1.4', marginBottom: 8 }}>
            Daily quadrant-classification ribbon and per-quadrant residency % over {WINDOW_YEARS}y.
          </div>
          <svg viewBox={`0 0 ${RW} ${RH}`} preserveAspectRatio="none" style={{ width: '100%', height: 28 }}>
            {pts.map((p, i) => (
              <rect key={i} x={i * rw} y="0" width={rw + 0.6} height={RH} fill={p.quad ? Q[p.quad].color : 'var(--border)'} />
            ))}
          </svg>
          <div style={{ marginTop: 14 }}>
            {Object.entries(Q).map(([k, q]) => {
              const pct = Math.round((100 * counts[k]) / total);
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: q.color, flex: '0 0 10px' }} />
                  <span style={{ flex: 1 }}>{q.name}</span>
                  <span style={{ color: 'var(--dim)', width: 110, flex: '0 0 110px' }}>
                    <span style={{ display: 'inline-block', height: 6, width: `${pct}%`, background: q.color, borderRadius: 2, verticalAlign: 'middle', marginRight: 6 }} />
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
