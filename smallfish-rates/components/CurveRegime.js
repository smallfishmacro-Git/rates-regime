'use client';

import { useState, useMemo } from 'react';

// =====================================================================
// CURVE REGIME — yield-curve regime classifier
// (Δshort vs Δlong over a lookback) with playbook cards, scatter & timeline.
// Data: /api/curve -> data/curve_regime.json  { dates[], y3m, y2, y5, y10, y30 }
// =====================================================================

// ---- tunable constants ------------------------------------------------------
const DEFAULT_CURVE = '2S10S';
const DEFAULT_LOOKBACK = 60;     // trading days
const WINDOW_YEARS = 5;          // history shown in scatter / timeline / dist
const PATH_DAYS = 252;           // trailing 12M path overlaid on the scatter
// ----------------------------------------------------------------------------

const CURVES = [
  { id: '2S10S',  short: 'y2',  long: 'y10', sName: '2Y',  lName: '10Y' },
  { id: '2S5S',   short: 'y2',  long: 'y5',  sName: '2Y',  lName: '5Y'  },
  { id: '5S10S',  short: 'y5',  long: 'y10', sName: '5Y',  lName: '10Y' },
  { id: '2S30S',  short: 'y2',  long: 'y30', sName: '2Y',  lName: '30Y' },
  { id: '5S30S',  short: 'y5',  long: 'y30', sName: '5Y',  lName: '30Y' },
  { id: '10S30S', short: 'y10', long: 'y30', sName: '10Y', lName: '30Y' },
  { id: '3M-2Y',  short: 'y3m', long: 'y2',  sName: '3M',  lName: '2Y'  },
  { id: '3M-10Y', short: 'y3m', long: 'y10', sName: '3M',  lName: '10Y' },
];

const REGIME = {
  BULL_STEEP: {
    label: 'Bull Steepening', short: 'Bull Steep', color: '#22c977',
    cond: (s, l) => `Δ${s} < 0 · Δ${l} < 0 · short falling faster`,
    narrative: 'Recession / cut cycle setup. Fed cutting aggressively (or expected to); both yields fall, short faster. Bond bull.',
    play: [
      ['Rates', 'long duration · bull bid'],
      ['Equities', 'tactical caution · cuts driven by stress'],
      ['Credit', 'IG bid · HY softer'],
      ['FX', 'USD weaker as Fed cuts'],
      ['Commodities', 'gold up · oil regime-dependent'],
    ],
  },
  BULL_FLAT: {
    label: 'Bull Flattening', short: 'Bull Flat', color: '#3f8cff',
    cond: (s, l) => `Δ${s} < 0 · Δ${l} < 0 · long falling faster`,
    narrative: 'Growth scare. Long yields rally hardest as market prices weak future growth; short stays low-anchored.',
    play: [
      ['Rates', 'long bonds bid · curve flattens'],
      ['Equities', 'defensives · growth scare regime'],
      ['Credit', 'IG bid · HY widens'],
      ['FX', 'USD/JPY/CHF haven bid'],
      ['Commodities', 'gold up · oil down'],
    ],
  },
  TWIST_STEEP: {
    label: 'Twist Steepening', short: 'Twist Steep', color: '#9d6bff',
    cond: (s, l) => `Δ${s} < 0 · Δ${l} > 0 · twist steepening`,
    narrative: 'Short falls / long rises. Often signals fiscal-deficit + dovish Fed combo. Long-end vigilantes wake up.',
    play: [
      ['Rates', 'long-end steepeners · short the long end'],
      ['Equities', 'value over growth (long-duration hit)'],
      ['Credit', 'long-duration credit at risk'],
      ['FX', 'fiscal-stress currencies underperform'],
      ['Commodities', 'commodities bid on fiscal/inflation'],
    ],
  },
  BEAR_STEEP: {
    label: 'Bear Steepening', short: 'Bear Steep', color: '#ff5c5c',
    cond: (s, l) => `Δ${s} > 0 · Δ${l} > 0 · long rising faster`,
    narrative: 'Inflation scare. Long yields rise hardest; market doubts CB is ahead of inflation. Bear bond regime.',
    play: [
      ['Rates', 'short duration · pay long / receive short'],
      ['Equities', 'cyclical value · short long-duration tech'],
      ['Credit', 'short long-dated credit'],
      ['FX', 'USD mixed · EM under pressure'],
      ['Commodities', 'commodities bid · TIPS over nominals'],
    ],
  },
  BEAR_FLAT: {
    label: 'Bear Flattening', short: 'Bear Flat', color: '#f0b800',
    cond: (s, l) => `Δ${s} > 0 · Δ${l} > 0 · short rising faster`,
    narrative: 'Classic Fed tightening cycle. Front-end repricing higher faster than long; late-cycle warning.',
    play: [
      ['Rates', 'short bonds + steepeners (longer term)'],
      ['Equities', 'late-cycle caution · watch for inversion'],
      ['Credit', 'short HY · IG floating rate'],
      ['FX', 'USD bid on rate-diff'],
      ['Commodities', 'mixed · oil ↑ on demand · gold pressured'],
    ],
  },
  TWIST_FLAT: {
    label: 'Twist Flattening', short: 'Twist Flat', color: '#ec5fa0',
    cond: (s, l) => `Δ${s} > 0 · Δ${l} < 0 · twist flattening`,
    narrative: 'Short rises / long falls. Late-cycle Fed last hike + recession-fear bid for long bonds.',
    play: [
      ['Rates', 'long bonds bid + short front-end'],
      ['Equities', 'late-cycle defensive rotation'],
      ['Credit', 'high-quality only · avoid lower-tier'],
      ['FX', 'USD haven bid'],
      ['Commodities', 'gold ↑ · industrial commodities ↓'],
    ],
  },
};

// grid order (matches the source layout), and stats/legend order
const CARD_ORDER = ['BULL_STEEP', 'BULL_FLAT', 'TWIST_STEEP', 'BEAR_STEEP', 'BEAR_FLAT', 'TWIST_FLAT'];
const STAT_ORDER = ['BULL_STEEP', 'BULL_FLAT', 'BEAR_STEEP', 'BEAR_FLAT', 'TWIST_STEEP', 'TWIST_FLAT'];

// Steepening <=> curve spread (long-short) widens <=> (dL - dS) > 0.
function classify(dS, dL) {
  if (dS < 0 && dL < 0) return (dL - dS) > 0 ? 'BULL_STEEP' : 'BULL_FLAT';
  if (dS > 0 && dL > 0) return (dL - dS) > 0 ? 'BEAR_STEEP' : 'BEAR_FLAT';
  if (dS < 0 && dL > 0) return 'TWIST_STEEP';
  if (dS > 0 && dL < 0) return 'TWIST_FLAT';
  const dc = dL - dS; // exact-zero edge: assign by curve direction + level
  if (dc > 0) return (dS + dL) >= 0 ? 'BEAR_STEEP' : 'BULL_STEEP';
  return (dS + dL) >= 0 ? 'BEAR_FLAT' : 'BULL_FLAT';
}

const fmtBp = v => `${v >= 0 ? '+' : ''}${Math.round(v)} bp`;
const deltaColor = v => (v > 0 ? '#ff5c5c' : v < 0 ? '#22c977' : 'var(--dim)');

function niceBounds(min, max) {
  let lo = Math.min(0, min), hi = Math.max(0, max);
  const pad = Math.max(1, hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const raw = (hi - lo) / 6;
  const steps = [5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const step = steps.find(s => s >= raw) ?? steps[steps.length - 1];
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

export default function CurveRegime({ data, loading }) {
  const [curveId, setCurveId] = useState(DEFAULT_CURVE);
  const [lkInput, setLkInput] = useState(String(DEFAULT_LOOKBACK));
  const [lookback, setLookback] = useState(DEFAULT_LOOKBACK);

  const curve = CURVES.find(c => c.id === curveId) || CURVES[0];

  const model = useMemo(() => {
    const dates = data?.dates;
    if (!Array.isArray(dates) || dates.length < lookback + 5) return null;
    const s = data[curve.short], l = data[curve.long];
    if (!Array.isArray(s) || !Array.isArray(l)) return null;

    const L = Math.max(2, Math.min(lookback, dates.length - 2));

    // build points for every day with a full lookback window
    const points = [];
    for (let i = L; i < dates.length; i++) {
      if (s[i] == null || l[i] == null || s[i - L] == null || l[i - L] == null) continue;
      const dS = (s[i] - s[i - L]) * 100;
      const dL = (l[i] - l[i - L]) * 100;
      points.push({
        i, date: dates[i], dS, dL,
        regime: classify(dS, dL),
        curve: (l[i] - s[i]) * 100,
        sLvl: s[i], lLvl: l[i],
      });
    }
    if (!points.length) return null;

    // window = trailing WINDOW_YEARS by calendar date
    const lastDate = new Date(points[points.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - WINDOW_YEARS);
    const cutISO = cutoff.toISOString().slice(0, 10);
    let w0 = points.findIndex(p => p.date >= cutISO);
    if (w0 < 0) w0 = 0;
    const win = points.slice(w0);

    // distribution over the window
    const counts = {};
    for (const k of STAT_ORDER) counts[k] = 0;
    for (const p of win) counts[p.regime] = (counts[p.regime] || 0) + 1;
    const total = win.length || 1;
    const dist = {};
    for (const k of STAT_ORDER) dist[k] = { n: counts[k], pct: (100 * counts[k]) / total };

    // axis bounds from the window
    const xs = win.map(p => p.dS), ys = win.map(p => p.dL);
    const bx = niceBounds(Math.min(...xs), Math.max(...xs));
    const by = niceBounds(Math.min(...ys), Math.max(...ys));

    const path = win.slice(Math.max(0, win.length - PATH_DAYS));
    const current = points[points.length - 1];

    return { points, win, dist, total, bx, by, path, current,
             asOf: data.as_of || current.date };
  }, [data, curve, lookback]);

  const runGo = () => {
    const n = parseInt(lkInput, 10);
    if (Number.isFinite(n) && n >= 2 && n <= 750) setLookback(n);
    else setLkInput(String(lookback));
  };

  // ---- control bar ----------------------------------------------------------
  const controlBar = (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 3,
                  padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center',
                  gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>CURVE</span>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {CURVES.map(c => (
          <button key={c.id} className={`tab-btn ${c.id === curveId ? 'active' : ''}`}
                  style={{ fontSize: 10 }} onClick={() => setCurveId(c.id)}>{c.id}</button>
        ))}
      </div>
      <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
      <span style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>LOOKBACK</span>
      <input value={lkInput} onChange={e => setLkInput(e.target.value)}
             onKeyDown={e => e.key === 'Enter' && runGo()}
             style={{ width: 56, background: 'var(--bg)', border: '1px solid var(--border)',
                      color: 'var(--text)', padding: '4px 6px', fontSize: 11, fontFamily: 'inherit',
                      borderRadius: 2, textAlign: 'center' }} />
      <span style={{ fontSize: 10, color: 'var(--dim)' }}>D</span>
      <button className="tab-btn active" style={{ fontSize: 10 }} onClick={runGo}>GO</button>
      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>
        {curveId} · {lookback}D{model ? ` · ${model.win.length}d` : ''}
      </span>
    </div>
  );

  if (loading || !data) {
    return <div style={{ padding: '0 16px' }}>{controlBar}
      <div style={{ color: 'var(--dim)', fontSize: 11, padding: 40, textAlign: 'center' }}>
        {loading ? '◌ loading curve history…' : 'no data'}</div></div>;
  }
  if (!model) {
    return <div style={{ padding: '0 16px' }}>{controlBar}
      <div style={{ color: 'var(--dim)', fontSize: 11, padding: 40, textAlign: 'center' }}>
        insufficient history for {curveId} @ {lookback}D</div></div>;
  }

  const cur = model.current;
  const curMeta = REGIME[cur.regime];
  const curveDelta = cur.dL - cur.dS;

  return (
    <div style={{ padding: '0 16px' }} className="fade-in">
      {controlBar}

      {/* ---- metric cards ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <MetricCard label="REGIME" valueColor={curMeta.color} value={curMeta.label}
                    sub={`as of ${model.asOf}`} accent={curMeta.color} big />
        <MetricCard label={`Δ${curve.sName} · ${lookback}D`} valueColor={deltaColor(cur.dS)}
                    value={fmtBp(cur.dS)} sub={`${curve.sName} level ${cur.sLvl.toFixed(2)}%`} />
        <MetricCard label={`Δ${curve.lName} · ${lookback}D`} valueColor={deltaColor(cur.dL)}
                    value={fmtBp(cur.dL)} sub={`${curve.lName} level ${cur.lLvl.toFixed(2)}%`} />
        <MetricCard label={`CURVE (${curve.lName}-${curve.sName}) Δ ${lookback}D`}
                    valueColor={deltaColor(curveDelta)} value={fmtBp(curveDelta)}
                    sub={`curve level ${Math.round(cur.curve)}bp`} />
      </div>

      {/* ---- regime playbook cards ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {CARD_ORDER.map(rk => (
          <RegimeCard key={rk} rk={rk} curve={curve}
                      pct={model.dist[rk].pct} active={rk === cur.regime} />
        ))}
      </div>

      {/* ---- scatter + timeline ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Panel title={`SCATTER · Δ${curve.sName} VS Δ${curve.lName} · ${lookback}D · LAST ${WINDOW_YEARS}Y`}
               sub="colored by regime · white = current · 12M path overlaid">
          <Scatter model={model} curve={curve} />
          <ScatterLegend dist={model.dist} />
        </Panel>
        <Panel title="REGIME TIMELINE" sub={`% days in each regime · last ${WINDOW_YEARS}y`}>
          <TimelineBar win={model.win} />
          <TimelineLegend />
          <TimelineStats dist={model.dist} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MetricCard({ label, value, sub, valueColor, sub2, accent, big }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '10px 12px', borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 17 : 20, fontWeight: 'bold', color: valueColor, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 4 }}>{sub}{sub2 ? ` · ${sub2}` : ''}</div>
    </div>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 14 }}>
      <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 1 }}>{title}</span>
        {sub && <span style={{ fontSize: 9, color: 'var(--dim)', marginLeft: 8 }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function RegimeCard({ rk, curve, pct, active }) {
  const m = REGIME[rk];
  return (
    <div style={{
      background: active ? 'rgba(240,184,0,0.04)' : 'var(--card)',
      border: `1px solid ${active ? m.color : 'var(--border)'}`,
      borderLeft: `3px solid ${m.color}`, borderRadius: 4, padding: '10px 12px',
      boxShadow: active ? `0 0 0 1px ${m.color}33` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: m.color, letterSpacing: 1 }}>
          {m.label.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: active ? m.color : 'var(--dim)', fontWeight: 'bold' }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--dim)', margin: '3px 0 6px', letterSpacing: 0.3 }}>
        {m.cond(curve.sName, curve.lName)}
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text)', lineHeight: 1.45, marginBottom: 7 }}>
        {m.narrative}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {m.play.map(([k, v]) => (
          <div key={k} style={{ fontSize: 9, lineHeight: 1.35 }}>
            <span style={{ color: m.color, fontWeight: 'bold' }}>{k}</span>
            <span style={{ color: 'var(--dim)' }}> · {v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Scatter({ model, curve }) {
  const W = 540, H = 430, pad = { t: 10, r: 14, b: 30, l: 38 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const { bx, by, win, path, current } = model;
  const sx = v => pad.l + ((v - bx.lo) / (bx.hi - bx.lo)) * pw;
  const sy = v => pad.t + ph - ((v - by.lo) / (by.hi - by.lo)) * ph;

  const xLines = [];
  for (let v = bx.lo; v <= bx.hi + 1e-6; v += bx.step) xLines.push(v);
  const yLines = [];
  for (let v = by.lo; v <= by.hi + 1e-6; v += by.step) yLines.push(v);

  const pathStr = path.map(p => `${sx(p.dS).toFixed(1)},${sy(p.dL).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* grid */}
      {xLines.map(v => (
        <g key={`x${v}`}>
          <line x1={sx(v)} y1={pad.t} x2={sx(v)} y2={pad.t + ph}
                stroke={v === 0 ? 'var(--dim)' : 'var(--grid)'} strokeWidth={v === 0 ? 0.8 : 0.5} />
          <text x={sx(v)} y={H - 16} fill="var(--dim)" fontSize={8} textAnchor="middle" fontFamily="monospace">{v}</text>
        </g>
      ))}
      {yLines.map(v => (
        <g key={`y${v}`}>
          <line x1={pad.l} y1={sy(v)} x2={pad.l + pw} y2={sy(v)}
                stroke={v === 0 ? 'var(--dim)' : 'var(--grid)'} strokeWidth={v === 0 ? 0.8 : 0.5} />
          <text x={pad.l - 5} y={sy(v) + 3} fill="var(--dim)" fontSize={8} textAnchor="end" fontFamily="monospace">{v}</text>
        </g>
      ))}
      {/* axis titles */}
      <text x={pad.l + pw / 2} y={H - 3} fill="var(--dim)" fontSize={8.5} textAnchor="middle" fontFamily="monospace">
        Δ{curve.sName} · bp · {/* lookback shown in panel title */}
      </text>
      <text x={11} y={pad.t + ph / 2} fill="var(--dim)" fontSize={8.5} textAnchor="middle"
            fontFamily="monospace" transform={`rotate(-90 11 ${pad.t + ph / 2})`}>
        Δ{curve.lName} · bp
      </text>

      {/* points */}
      {win.map((p, i) => (
        <circle key={i} cx={sx(p.dS)} cy={sy(p.dL)} r={1.7} fill={REGIME[p.regime].color} opacity={0.8} />
      ))}
      {/* 12M path */}
      <polyline points={pathStr} fill="none" stroke="#d8d4c8" strokeWidth={1} opacity={0.55} />
      {/* current */}
      <circle cx={sx(current.dS)} cy={sy(current.dL)} r={4.5} fill="#ffffff" stroke="var(--bg)" strokeWidth={1.2} />
      <circle cx={sx(current.dS)} cy={sy(current.dL)} r={7} fill="none" stroke="#ffffff" strokeWidth={0.6} opacity={0.5} />
    </svg>
  );
}

function ScatterLegend({ dist }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 8, marginTop: 4 }}>
      {STAT_ORDER.map(k => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
          <span style={{ width: 7, height: 7, background: REGIME[k].color, borderRadius: 1 }} />
          {REGIME[k].label} ({Math.round(dist[k].pct)}%)
        </span>
      ))}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
        <span style={{ width: 12, height: 0, borderTop: '1px solid #d8d4c8' }} /> 12M path
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
        <span style={{ width: 7, height: 7, background: '#fff', borderRadius: 1 }} /> now
      </span>
    </div>
  );
}

function TimelineBar({ win }) {
  const W = 540, H = 16;
  const n = win.length || 1;
  const segs = [];
  let start = 0, reg = win[0]?.regime;
  for (let i = 1; i < win.length; i++) {
    if (win[i].regime !== reg) { segs.push({ start, len: i - start, reg }); start = i; reg = win[i].regime; }
  }
  if (win.length) segs.push({ start, len: win.length - start, reg });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--bg)" />
        {segs.map((s, i) => (
          <rect key={i} x={(s.start / n) * W} y={0} width={Math.max(0.5, (s.len / n) * W)} height={H}
                fill={REGIME[s.reg].color} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: 'var(--dim)', marginTop: 2 }}>
        <span>{win[0]?.date.slice(2)}</span>
        <span>{win[win.length - 1]?.date.slice(2)}</span>
      </div>
    </div>
  );
}

function TimelineLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 8, margin: '8px 0' }}>
      {STAT_ORDER.map(k => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
          <span style={{ width: 9, height: 9, background: REGIME[k].color, borderRadius: 1 }} />
          {REGIME[k].short}
        </span>
      ))}
    </div>
  );
}

function TimelineStats({ dist }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
      {STAT_ORDER.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: REGIME[k].color }} />
            <span style={{ fontSize: 10, color: 'var(--text)' }}>{REGIME[k].label}</span>
          </span>
          <span style={{ fontSize: 10, color: 'var(--text)' }}>
            {dist[k].pct.toFixed(1)}% <span style={{ color: 'var(--dim)' }}>({dist[k].n}d)</span>
          </span>
        </div>
      ))}
    </div>
  );
}
