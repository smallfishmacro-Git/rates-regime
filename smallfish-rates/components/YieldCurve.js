'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush,
} from 'recharts';

const COLUMNS = [
  { id: 'nominal',   title: 'NOMINAL',         color: '#F59E0B', prefix: 'n' },
  { id: 'real',      title: 'REAL',            color: '#22D3EE', prefix: 'r' },
  { id: 'inflation', title: 'INFLATION SWAPS', color: '#F97316', prefix: 'i' },
];

const TENORS = ['2Y', '5Y', '10Y', '30Y'];

const SPREADS = [
  ['1s2s',   '1Y',  '2Y'],
  ['1s5s',   '1Y',  '5Y'],
  ['1s10s',  '1Y',  '10Y'],
  ['1s30s',  '1Y',  '30Y'],
  ['2s5s',   '2Y',  '5Y'],
  ['2s10s',  '2Y',  '10Y'],
  ['2s30s',  '2Y',  '30Y'],
  ['5s10s',  '5Y',  '10Y'],
  ['5s30s',  '5Y',  '30Y'],
  ['10s30s', '10Y', '30Y'],
];

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', 'ALL'];

const REGIME_COLOR = {
  'BULL STEEPENER':  '#2962FF',
  'BEAR STEEPENER':  '#FF6D00',
  'STEEPENER TWIST': '#2E7D32',
  'BULL FLATTENER':  '#D50000',
  'BEAR FLATTENER':  '#6A1B9A',
  'FLATTENER TWIST': '#795548',
  'FLAT':            '#3a3a3a',
};

const REGIME_LEGEND = [
  ['Bull Steep',  'BULL STEEPENER'],
  ['Bear Steep',  'BEAR STEEPENER'],
  ['St Twist',    'STEEPENER TWIST'],
  ['Bull Flat',   'BULL FLATTENER'],
  ['Bear Flat',   'BEAR FLATTENER'],
  ['Fl Twist',    'FLATTENER TWIST'],
];

const tenorKey = (prefix, tenor) => `${prefix}${tenor.toLowerCase()}`;

export default function YieldCurve({ data }) {
  const history = data?.yieldCurve?.history || [];
  const [range, setRange] = useState('1Y');
  const [modal, setModal] = useState(null); // { column, kind, initialId }

  return (
    <div style={{ padding: '0 16px', marginTop: 16 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          paddingBottom: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 2 }}>YIELD CURVE</span>
          <span style={{ fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>
            {history.length
              ? `${history[0].date} → ${history[history.length - 1].date}  (${history.length}d)`
              : 'NO DATA'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {COLUMNS.map(c => (
            <Column
              key={c.id}
              {...c}
              history={history}
              range={range}
              setRange={setRange}
              onExpand={(kind, initialId) => setModal({ column: c, kind, initialId })}
            />
          ))}
        </div>
      </div>

      {modal && (
        <ChartExpandModal
          column={modal.column}
          kind={modal.kind}
          initialId={modal.initialId}
          history={history}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Column({ id, title, color, prefix, history, range, setRange, onExpand }) {
  const [tenor,  setTenor]  = useState('2Y');
  const [spread, setSpread] = useState('2s10s');

  const latest = history[history.length - 1];

  const getVal = (row, t) => row?.[tenorKey(prefix, t)];
  const getSpread = (row, a, b) => {
    const va = getVal(row, a), vb = getVal(row, b);
    if (va == null || vb == null) return null;
    return (vb - va) * 100;
  };

  const validSpreads = useMemo(() => {
    return SPREADS.filter(([, a, b]) => {
      const v = getSpread(latest, a, b);
      return v != null && !isNaN(v) && v !== 0;
    });
  }, [latest, prefix]);

  const cols = Math.max(1, Math.ceil(validSpreads.length / 2));

  const effectiveSpread = validSpreads.find(([sid]) => sid === spread)
    ? spread
    : validSpreads[0]?.[0];

  const [visStart, visEnd] = useMemo(() => rangeIndices(history, range), [history, range]);

  const outrightSeries = useMemo(() => {
    const points = [];
    for (let i = visStart; i <= visEnd; i++) {
      const v = getVal(history[i], tenor);
      if (v != null) points.push({ date: history[i].date, v });
    }
    return points;
  }, [history, visStart, visEnd, tenor, prefix]);

  const spreadSeries = useMemo(() => {
    if (!effectiveSpread) return [];
    const spec = SPREADS.find(s => s[0] === effectiveSpread);
    if (!spec) return [];
    const [, a, b] = spec;
    const points = [];
    for (let i = visStart; i <= visEnd; i++) {
      const v = getSpread(history[i], a, b);
      if (v != null) points.push({ date: history[i].date, v });
    }
    return points;
  }, [history, visStart, visEnd, effectiveSpread, prefix]);

  const regimeNow = useMemo(
    () => classifyRegime(history, prefix, history.length - 1),
    [history, prefix]
  );

  const fullTimeline = useMemo(() => {
    if (history.length < 21) return [];
    const out = new Array(history.length);
    for (let i = 0; i < history.length; i++) {
      out[i] = i < 20 ? null : classifyRegime(history, prefix, i);
    }
    return out;
  }, [history, prefix]);

  const visTimeline = useMemo(
    () => fullTimeline.slice(visStart, visEnd + 1),
    [fullTimeline, visStart, visEnd]
  );
  const visDates = useMemo(
    () => history.slice(visStart, visEnd + 1).map(d => d.date),
    [history, visStart, visEnd]
  );

  // Current value of selected spread (latest)
  const selectedSpreadSpec = SPREADS.find(s => s[0] === effectiveSpread);
  const selectedSpreadVal = selectedSpreadSpec
    ? getSpread(latest, selectedSpreadSpec[1], selectedSpreadSpec[2])
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ========== Column header ========== */}
      <div style={{ paddingBottom: 6, borderBottom: `1px solid ${color}55` }}>
        <span style={{ fontSize: 12, fontWeight: 'bold', color, letterSpacing: 2 }}>{title}</span>
      </div>

      {/* ========== OUTRIGHTS ========== */}
      <div>
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 6 }}>OUTRIGHTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {TENORS.map(t => {
            const v = getVal(latest, t);
            const active = tenor === t;
            const disabled = v == null;
            return (
              <button
                key={t}
                disabled={disabled}
                onClick={() => !disabled && setTenor(t)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: active ? `${color}22` : 'var(--bg)',
                  border: `1px solid ${active ? color : 'var(--border)'}`,
                  borderRadius: 2, padding: '8px 4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 10, color: active ? color : 'var(--dim)', letterSpacing: 1 }}>{t}</span>
                <span style={{
                  fontSize: 16, color: active ? color : 'var(--text)',
                  fontWeight: 'bold', marginTop: 3,
                }}>
                  {v != null ? v.toFixed(2) : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== SPREADS (display only) ========== */}
      <div>
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 6 }}>SPREADS (bp)</div>
        {validSpreads.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3 }}>
            {validSpreads.map(([sid, a, b]) => {
              const v = getSpread(latest, a, b);
              const valColor = v >= 0 ? 'var(--green)' : 'var(--red)';
              return (
                <div
                  key={sid}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 2, padding: '6px 2px',
                  }}
                >
                  <span style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 0.3 }}>{sid}</span>
                  <span style={{ fontSize: 13, color: valColor, fontWeight: 'bold', marginTop: 2 }}>
                    {`${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>no valid spreads</div>
        )}
      </div>

      {/* ========== OUTRIGHT CHART ========== */}
      <ChartBlock
        label={`${tenor} ${title}`}
        data={outrightSeries}
        color={color}
        unit="%"
        onClick={() => onExpand?.('tenor', tenor)}
      />

      {/* ========== SHARED RANGE SELECTOR ========== */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', paddingTop: 2 }}>
        {RANGES.map(r => (
          <button
            key={r}
            className={`tab-btn ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
            style={{ fontSize: 8, padding: '2px 6px' }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ========== REGIME BLOCK ========== */}
      <div style={{
        marginTop: 4, paddingTop: 10,
        borderTop: `1px solid ${color}33`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Sub-header */}
        <div style={{
          fontSize: 11, fontWeight: 'bold', color, letterSpacing: 2,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>{title} REGIME</span>
          <span style={{ fontSize: 8, color: 'var(--dim)', letterSpacing: 1 }}>20D / 2s10s</span>
        </div>

        {/* A) Spread pill selector */}
        {validSpreads.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {validSpreads.map(([sid]) => {
              const active = effectiveSpread === sid;
              return (
                <button
                  key={sid}
                  onClick={() => setSpread(sid)}
                  style={{
                    background: active ? color : 'transparent',
                    color: active ? '#0a0a0a' : 'var(--dim)',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    padding: '2px 7px', fontSize: 9,
                    borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'inherit', letterSpacing: 0.5,
                    fontWeight: active ? 'bold' : 'normal',
                    transition: 'all 0.15s',
                  }}
                >
                  {sid}
                </button>
              );
            })}
          </div>
        )}

        {/* Selected spread current value + lookback */}
        {effectiveSpread && selectedSpreadVal != null && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 10,
          }}>
            <span style={{ color: 'var(--dim)' }}>
              {effectiveSpread}{' '}
              <span style={{
                color: selectedSpreadVal >= 0 ? 'var(--green)' : 'var(--red)',
                fontWeight: 'bold', fontSize: 12,
              }}>
                {selectedSpreadVal >= 0 ? '+' : ''}{selectedSpreadVal.toFixed(0)}bp
              </span>
            </span>
            <span style={{ fontSize: 8, color: 'var(--dim)', letterSpacing: 1 }}>20D LOOKBACK</span>
          </div>
        )}

        {/* B) Regime badge */}
        {(() => {
          const rc = REGIME_COLOR[regimeNow] || 'var(--dim)';
          return (
            <div style={{
              background: regimeNow ? `${rc}26` : 'var(--bg)',
              color: rc,
              border: `1px solid ${rc}`,
              padding: '8px 10px', borderRadius: 2, fontSize: 12,
              letterSpacing: 1.5, fontWeight: 'bold', textAlign: 'center',
            }}>
              {regimeNow || '—'}
            </div>
          );
        })()}

        {/* C) Spread chart */}
        <ChartBlock
          label={effectiveSpread ? `${effectiveSpread} SPREAD` : 'SPREAD'}
          data={spreadSeries}
          color={color}
          unit="bp"
          onClick={effectiveSpread ? () => onExpand?.('spread', effectiveSpread) : undefined}
        />

        {/* D) Regime timeline + legend */}
        <RegimeTimeline timeline={visTimeline} dates={visDates} />
        <RegimeLegend />
      </div>
    </div>
  );
}

function classifyRegime(history, prefix, idx) {
  if (idx < 20) return null;
  const cur  = history[idx];
  const past = history[idx - 20];
  const k2  = `${prefix}2y`;
  const k10 = `${prefix}10y`;
  const c2  = cur?.[k2],  c10 = cur?.[k10];
  const p2  = past?.[k2], p10 = past?.[k10];
  if (c2 == null || c10 == null || p2 == null || p10 == null) return null;
  const d2  = c2  - p2;
  const d10 = c10 - p10;
  const eps = 0.005;
  const up2 = d2 > eps, dn2 = d2 < -eps;
  const up10 = d10 > eps, dn10 = d10 < -eps;
  if (up2 && up10) return Math.abs(d10) >= Math.abs(d2) ? 'BEAR STEEPENER' : 'BEAR FLATTENER';
  if (dn2 && dn10) return Math.abs(d2)  >= Math.abs(d10) ? 'BULL STEEPENER' : 'BULL FLATTENER';
  if (dn2 && up10) return 'STEEPENER TWIST';
  if (up2 && dn10) return 'FLATTENER TWIST';
  return 'FLAT';
}

function rangeIndices(history, range) {
  if (!history.length) return [0, -1];
  const last = history.length - 1;
  if (range === 'ALL') return [0, last];
  if (range === 'YTD') {
    const year = history[last].date.slice(0, 4);
    let start = last;
    while (start > 0 && history[start - 1].date.startsWith(year)) start--;
    return [start, last];
  }
  const days = { '1M': 22, '3M': 66, '6M': 132, '1Y': 252, '2Y': 504 }[range] || history.length;
  return [Math.max(0, history.length - days), last];
}

function ChartBlock({ label, data, color, unit, onClick }) {
  const clickable = typeof onClick === 'function' && data && data.length >= 2;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'Click to expand' : undefined}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.opacity = '1'; }}
    >
      <div style={{
        fontSize: 9, color, fontWeight: 'bold', letterSpacing: 1.5,
        marginBottom: 3, fontFamily: 'inherit',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span>{label}</span>
        {clickable && <span style={{ color: 'var(--dim)', fontSize: 8, fontWeight: 'normal' }}>⤢</span>}
      </div>
      <Chart data={data} color={color} unit={unit} />
    </div>
  );
}

function Chart({ data, color, unit }) {
  if (!data || data.length < 2) {
    return (
      <div style={{
        height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--dim)', fontSize: 10, border: '1px solid var(--border)', borderRadius: 2,
      }}>
        — insufficient data —
      </div>
    );
  }
  const w = 360, h = 120, pad = { t: 6, r: 8, b: 16, l: 30 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const vals = data.map(d => d.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(0.01, max - min);
  const minV = min - span * 0.1;
  const maxV = max + span * 0.1;

  const scaleX = i => pad.l + (i / Math.max(1, data.length - 1)) * cw;
  const scaleY = v => pad.t + ch - ((v - minV) / Math.max(0.0001, maxV - minV)) * ch;

  const pts = data.map((d, i) => `${scaleX(i)},${scaleY(d.v)}`).join(' ');
  const last = data[data.length - 1];
  const first = data[0];

  const isBp = unit === 'bp';
  const gridStep = isBp
    ? ((maxV - minV) > 200 ? 50 : (maxV - minV) > 80 ? 25 : (maxV - minV) > 30 ? 10 : 5)
    : ((maxV - minV) > 4 ? 1 : (maxV - minV) > 1 ? 0.5 : 0.25);
  const grid = [];
  for (let v = Math.ceil(minV / gridStep) * gridStep; v <= maxV; v += gridStep) grid.push(v);

  const zeroVisible = minV <= 0 && maxV >= 0;
  const fillId = `ycFill-${color.replace('#', '')}-${unit}-${data.length}`;
  const fmt = v => isBp ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}` : v.toFixed(2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {grid.map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5} />
          <text x={pad.l - 4} y={scaleY(v) + 3} fill="var(--dim)" fontSize={8} textAnchor="end" fontFamily="monospace">
            {isBp ? v.toFixed(0) : v.toFixed(2)}
          </text>
        </g>
      ))}

      {zeroVisible && (
        <line x1={pad.l} y1={scaleY(0)} x2={w - pad.r} y2={scaleY(0)}
              stroke="var(--dim)" strokeWidth={0.7} strokeDasharray="3 2" opacity={0.6} />
      )}

      <polygon
        points={`${scaleX(0)},${scaleY(minV)} ${pts} ${scaleX(data.length - 1)},${scaleY(minV)}`}
        fill={`url(#${fillId})`}
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={0.5} />

      <circle cx={scaleX(data.length - 1)} cy={scaleY(last.v)} r={2.6} fill={color} />
      <text x={scaleX(data.length - 1) - 4} y={scaleY(last.v) - 5}
            fill={color} fontSize={9} textAnchor="end" fontFamily="monospace" fontWeight="bold">
        {fmt(last.v)}{isBp ? 'bp' : '%'}
      </text>

      <text x={pad.l} y={h - 4} fill="var(--dim)" fontSize={7} textAnchor="start" fontFamily="monospace">
        {first.date.slice(2)}
      </text>
      <text x={w - pad.r} y={h - 4} fill="var(--dim)" fontSize={7} textAnchor="end" fontFamily="monospace">
        {last.date.slice(2)}
      </text>
    </svg>
  );
}

function RegimeTimeline({ timeline, dates }) {
  if (!timeline || !timeline.length) return null;
  const firstValid = timeline.findIndex(t => t != null);
  if (firstValid < 0) return null;

  const start = firstValid;
  const end = timeline.length - 1;
  const total = end - start + 1;
  if (total <= 0) return null;

  const segments = [];
  let segStart = start;
  let segRegime = timeline[start];
  for (let i = start + 1; i <= end; i++) {
    if (timeline[i] !== segRegime) {
      segments.push({ start: segStart - start, len: i - segStart, regime: segRegime });
      segStart = i;
      segRegime = timeline[i];
    }
  }
  segments.push({ start: segStart - start, len: end - segStart + 1, regime: segRegime });

  const w = 360, h = 14;
  const startDate = dates[start];
  const endDate   = dates[end];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
        <rect x={0} y={0} width={w} height={h} fill="var(--bg)" />
        {segments.map((s, i) => (
          <rect
            key={i}
            x={(s.start / total) * w}
            y={0}
            width={Math.max(0.5, (s.len / total) * w)}
            height={h}
            fill={REGIME_COLOR[s.regime] || 'var(--dim)'}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'var(--dim)', marginTop: 1 }}>
        <span>{startDate?.slice(2)}</span>
        <span>{endDate?.slice(2)}</span>
      </div>
    </div>
  );
}

function RegimeLegend() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '2px 6px', fontSize: 7, marginTop: 2,
    }}>
      {REGIME_LEGEND.map(([label, key]) => (
        <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
          <span style={{
            width: 8, height: 8, background: REGIME_COLOR[key],
            borderRadius: 1, flexShrink: 0,
          }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// =====================================================================
// EXPANDED CHART MODAL
// =====================================================================

function ChartExpandModal({ column, kind, initialId, history, onClose }) {
  const { color, title, prefix } = column;
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState(initialId);
  const [activeRange, setActiveRange] = useState('ALL');
  const [brushIdx, setBrushIdx] = useState(null); // null => use full range

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // When pill changes, reset to full range
  useEffect(() => {
    setActiveRange('ALL');
    setBrushIdx(null);
  }, [selectedId]);

  const latest = history[history.length - 1];
  const getVal = (row, t) => row?.[tenorKey(prefix, t)];
  const getSpread = (row, a, b) => {
    const va = getVal(row, a), vb = getVal(row, b);
    if (va == null || vb == null) return null;
    return (vb - va) * 100;
  };

  const pills = useMemo(() => {
    if (kind === 'tenor') {
      return TENORS
        .map(t => ({ id: t, value: getVal(latest, t) }))
        .filter(p => p.value != null && !isNaN(p.value));
    }
    return SPREADS
      .map(([sid, a, b]) => ({ id: sid, value: getSpread(latest, a, b) }))
      .filter(p => p.value != null && !isNaN(p.value) && p.value !== 0);
  }, [kind, prefix, latest]);

  const fullData = useMemo(() => {
    if (kind === 'tenor') {
      const out = [];
      for (const d of history) {
        const v = getVal(d, selectedId);
        if (v != null) out.push({ date: d.date, v });
      }
      return out;
    }
    const spec = SPREADS.find(s => s[0] === selectedId);
    if (!spec) return [];
    const [, a, b] = spec;
    const out = [];
    for (const d of history) {
      const v = getSpread(d, a, b);
      if (v != null) out.push({ date: d.date, v });
    }
    return out;
  }, [kind, prefix, selectedId, history]);

  const unit = kind === 'tenor' ? '%' : 'bp';
  const headerLabel = kind === 'tenor' ? 'OUTRIGHT' : 'SPREAD';

  const onRangeClick = (r) => {
    setActiveRange(r);
    if (!fullData.length) return;
    const [s, e] = rangeIndices(fullData, r);
    setBrushIdx({ start: s, end: e });
  };

  const onBrushChange = (e) => {
    if (e == null || e.startIndex == null || e.endIndex == null) return;
    if (brushIdx && e.startIndex === brushIdx.start && e.endIndex === brushIdx.end) return;
    setBrushIdx({ start: e.startIndex, end: e.endIndex });
    setActiveRange(null);
  };

  const startIndex = brushIdx?.start ?? 0;
  const endIndex   = brushIdx?.end   ?? Math.max(0, fullData.length - 1);

  if (!mounted) return null;

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0a0a0a', border: '1px solid #1a1a1a',
          width: '94vw', height: '90vh', maxWidth: 1600,
          padding: '18px 22px',
          display: 'flex', flexDirection: 'column', gap: 12,
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingBottom: 8, borderBottom: '1px solid #1a1a1a',
        }}>
          <div>
            <span style={{ color, fontSize: 16, fontWeight: 'bold', letterSpacing: 2 }}>{title}</span>
            <span style={{ color: 'var(--dim)', fontSize: 13, margin: '0 12px' }}>—</span>
            <span style={{ color: 'var(--text)', fontSize: 14, letterSpacing: 1 }}>
              {selectedId} {headerLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #1a1a1a',
              color: 'var(--dim)', padding: '4px 12px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11, letterSpacing: 1.5,
              borderRadius: 2,
            }}
          >
            ESC ✕
          </button>
        </div>

        {/* Selectable pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {pills.map(p => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  background: active ? color : 'transparent',
                  color: active ? '#0a0a0a' : 'var(--dim)',
                  border: `1px solid ${active ? color : '#1a1a1a'}`,
                  padding: '4px 14px', fontSize: 11,
                  borderRadius: 14, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: 0.5,
                  fontWeight: active ? 'bold' : 'normal',
                  transition: 'all 0.15s',
                }}
              >
                {p.id}
              </button>
            );
          })}
        </div>

        {/* Date range buttons */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button
              key={r}
              className={`tab-btn ${activeRange === r ? 'active' : ''}`}
              onClick={() => onRangeClick(r)}
              style={{ fontSize: 10, padding: '3px 10px' }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Main chart with built-in brush at the bottom */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {fullData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fullData} margin={{ top: 8, right: 28, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#5a5e6a"
                  tick={{ fill: '#5a5e6a', fontSize: 10, fontFamily: 'inherit' }}
                  minTickGap={70}
                />
                <YAxis
                  stroke="#5a5e6a"
                  tick={{ fill: '#5a5e6a', fontSize: 10, fontFamily: 'inherit' }}
                  tickFormatter={(v) => unit === 'bp' ? v.toFixed(0) : v.toFixed(2)}
                  width={54}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  cursor={{ stroke: color, strokeDasharray: '3 3', strokeWidth: 1 }}
                  contentStyle={{
                    background: 'rgba(10,10,10,0.96)',
                    border: `1px solid ${color}`,
                    borderRadius: 2,
                    fontFamily: 'inherit',
                    fontSize: 11, padding: '6px 10px',
                  }}
                  labelStyle={{ color, marginBottom: 3, letterSpacing: 1 }}
                  itemStyle={{ color: 'var(--text)', padding: 0 }}
                  formatter={(value) => [
                    unit === 'bp'
                      ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}bp`
                      : `${value.toFixed(3)}%`,
                    selectedId,
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={0.5}
                  dot={false}
                  activeDot={{ r: 4, fill: color, stroke: '#0a0a0a', strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="date"
                  height={28}
                  stroke={color}
                  fill="#0a0a0a"
                  travellerWidth={8}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  onChange={onBrushChange}
                  tickFormatter={() => ''}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--dim)', fontSize: 12,
            }}>
              — insufficient data —
            </div>
          )}
        </div>

        {/* Brush range readout */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--dim)', letterSpacing: 1,
          paddingTop: 4, borderTop: '1px solid #1a1a1a',
        }}>
          <span>{fullData[startIndex]?.date ?? '—'}</span>
          <span>{(endIndex - startIndex + 1)}d  ·  drag handles to zoom</span>
          <span>{fullData[endIndex]?.date ?? '—'}</span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
