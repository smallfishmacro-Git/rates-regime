'use client';

import { useState } from 'react';

// Year color palette
const YC = {
  2026: { bg: 'rgba(255,82,82,0.06)', border: 'rgba(255,82,82,0.15)', accent: '#ff5252' },
  2027: { bg: 'rgba(240,184,0,0.06)', border: 'rgba(240,184,0,0.15)', accent: '#f0b800' },
  2028: { bg: 'rgba(0,188,212,0.06)', border: 'rgba(0,188,212,0.15)', accent: '#00bcd4' },
  2029: { bg: 'rgba(0,200,83,0.06)', border: 'rgba(0,200,83,0.15)', accent: '#00c853' },
  2030: { bg: 'rgba(156,39,176,0.06)', border: 'rgba(156,39,176,0.15)', accent: '#9c27b0' },
};
const DY = { bg: 'transparent', border: 'var(--border)', accent: 'var(--dim)' };

function heatBg(bp, max) {
  if (bp == null || Math.abs(bp) < 0.3) return 'transparent';
  const i = Math.min(Math.abs(bp) / (max || 1), 1);
  return bp > 0 ? `rgba(255,82,82,${(i * 0.4).toFixed(2)})` : `rgba(0,200,83,${(i * 0.4).toFixed(2)})`;
}

function cutHeatBg(bp, max) {
  if (bp == null) return 'transparent';
  const i = Math.min(Math.abs(bp) / (max || 1), 1);
  return bp > 0 ? `rgba(0,200,83,${(i * 0.3).toFixed(2)})` : `rgba(255,82,82,${(i * 0.3).toFixed(2)})`;
}

function bpCol(bp) {
  if (bp == null || Math.abs(bp) < 0.3) return 'var(--dim)';
  return bp > 0 ? 'var(--red)' : 'var(--green)';
}

function cutCol(bp) {
  if (bp == null) return 'var(--dim)';
  return bp > 0 ? 'var(--green)' : bp < -1 ? 'var(--red)' : 'var(--dim)';
}

function fmtBp(bp) {
  if (bp == null) return '—';
  if (Math.abs(bp) < 0.05) return '0.0';
  return `${bp > 0 ? '+' : ''}${bp.toFixed(1)}`;
}

function fmtVol(v) {
  if (!v) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(v);
}

// ── POPUP CHART ─────────────────────────────────────────────────────────────
function PriceChartPopup({ contract, onClose, currentSOFR }) {
  const history = contract.history1y;
  if (!history || history.length < 5) return null;

  const w = 620, h = 340, pad = { t: 30, r: 50, b: 40, l: 55 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const prices = history.map(p => p.close);
  const minP = Math.floor(Math.min(...prices) * 4) / 4 - 0.125;
  const maxP = Math.ceil(Math.max(...prices) * 4) / 4 + 0.125;
  const sx = (i) => pad.l + (i / (history.length - 1)) * cw;
  const sy = (v) => pad.t + ch - ((v - minP) / (maxP - minP)) * ch;

  // Current SOFR price = 100 - rate
  const sofrPx = 100 - (currentSOFR || 3.63);

  // Cut/hike lines: +25bp cut = price goes UP by 0.25, -25bp hike = price goes DOWN
  const levels = [
    { label: '+75bp cut', delta: 0.75, color: '#00c853' },
    { label: '+50bp cut', delta: 0.50, color: '#00c853' },
    { label: '+25bp cut', delta: 0.25, color: '#00c853' },
    { label: 'SOFR SPOT', delta: 0, color: '#f0b800' },
    { label: '-25bp hike', delta: -0.25, color: '#ff5252' },
    { label: '-50bp hike', delta: -0.50, color: '#ff5252' },
    { label: '-75bp hike', delta: -0.75, color: '#ff5252' },
  ];

  // Price path
  const pts = history.map((p, i) => `${sx(i)},${sy(p.close)}`).join(' ');

  // Grid lines
  const gridStep = 0.25;
  const gridLines = [];
  for (let v = Math.ceil(minP / gridStep) * gridStep; v <= maxP; v += gridStep) gridLines.push(v);

  // X-axis: show monthly labels
  const monthLabels = [];
  let lastMonth = '';
  history.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    if (m !== lastMonth) { monthLabels.push({ i, label: p.date.slice(2, 7) }); lastMonth = m; }
  });

  const latest = history[history.length - 1];
  const impRate = (100 - latest.close).toFixed(3);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 6, padding: 20, maxWidth: 680, width: '95%',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: (YC[contract.year] || DY).accent }}>
              {contract.ticker}
            </span>
            <span style={{ color: 'var(--dim)', marginLeft: 8, fontSize: 12 }}>
              {contract.month} | Settlement: {contract.settlementDate}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: 'var(--amber)', fontWeight: 'bold' }}>
              {latest.close.toFixed(3)} → {impRate}%
            </div>
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--dim)', padding: '2px 10px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 10, borderRadius: 2, marginTop: 4,
            }}>ESC</button>
          </div>
        </div>

        {/* Chart */}
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 340 }}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {gridLines.map(v => (
            <g key={v}>
              <line x1={pad.l} y1={sy(v)} x2={w - pad.r} y2={sy(v)} stroke="var(--grid)" strokeWidth={0.5} />
              <text x={pad.l - 5} y={sy(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">
                {v.toFixed(2)}
              </text>
              {/* Right side: implied rate */}
              <text x={w - pad.r + 5} y={sy(v) + 3} fill="var(--dim)" fontSize={8} fontFamily="monospace">
                {(100 - v).toFixed(2)}%
              </text>
            </g>
          ))}

          {/* Cut/Hike horizontal lines */}
          {levels.map(lv => {
            const px = sofrPx + lv.delta;
            if (px < minP || px > maxP) return null;
            return (
              <g key={lv.label}>
                <line x1={pad.l} y1={sy(px)} x2={w - pad.r} y2={sy(px)}
                  stroke={lv.color} strokeWidth={lv.delta === 0 ? 1.5 : 1}
                  strokeDasharray={lv.delta === 0 ? '0' : '6 3'} opacity={0.7} />
                <text x={w - pad.r + 5} y={sy(px) + 3} fill={lv.color} fontSize={7} fontFamily="monospace">
                  {lv.label}
                </text>
              </g>
            );
          })}

          {/* X-axis month labels */}
          {monthLabels.filter((_, i) => i % 2 === 0).map(ml => (
            <text key={ml.i} x={sx(ml.i)} y={h - 10} fill="var(--dim)" fontSize={8}
              textAnchor="middle" fontFamily="monospace">{ml.label}</text>
          ))}

          {/* Area fill */}
          <polygon
            points={`${sx(0)},${sy(minP)} ${pts} ${sx(history.length - 1)},${sy(minP)}`}
            fill="url(#chartFill)"
          />
          {/* Price line */}
          <polyline points={pts} fill="none" stroke="var(--amber)" strokeWidth={1.8} />
          {/* Latest dot */}
          <circle cx={sx(history.length - 1)} cy={sy(latest.close)} r={4} fill="var(--amber)" />
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 9, color: 'var(--dim)', flexWrap: 'wrap' }}>
          <span>Left axis: Price | Right axis: Implied Rate</span>
          <span style={{ color: 'var(--green)' }}>— — Cut levels (+25/50/75bp)</span>
          <span style={{ color: 'var(--amber)' }}>━━ SOFR Spot</span>
          <span style={{ color: 'var(--red)' }}>— — Hike levels (-25/50/75bp)</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN TABLE ──────────────────────────────────────────────────────────────
export default function StripTable({ strip, sofrLive }) {
  const [product, setProduct] = useState('SOFR');
  const [chartContract, setChartContract] = useState(null);

  if (!strip?.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  const totalContracts = strip.reduce((a, g) => a + g.contracts.length, 0);
  const allContracts = strip.flatMap(g => g.contracts);
  const currentSOFR = allContracts[0]?.impRate || 3.63;
  const terminalContract = allContracts.reduce((b, c) => (!b || c.impRate > b.impRate ? c : b), null);
  const terminal = terminalContract?.impRate || currentSOFR;
  const termSpread = ((terminal - currentSOFR) * 100).toFixed(1);

  // Scaling for heat maps
  const maxBp1d = Math.max(1, ...allContracts.map(c => Math.abs(c.bp1d ?? 0)));
  const maxBp5d = Math.max(3, ...allContracts.map(c => Math.abs(c.bp5d ?? 0)));
  const maxBp1m = Math.max(5, ...allContracts.map(c => Math.abs(c.bp1m ?? 0)));
  const maxCut = Math.max(1, ...allContracts.map(c => Math.abs((currentSOFR - c.impRate) * 100)));
  const maxVol = Math.max(1, ...allContracts.map(c => c.volume || 0));

  // Track which contracts are in the first 4 (have chart data)
  let contractIndex = 0;

  return (
    <div>
      {/* Popup chart */}
      {chartContract && (
        <PriceChartPopup contract={chartContract} onClose={() => setChartContract(null)} currentSOFR={currentSOFR} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1 }}>
          {product} STRIP — {totalContracts} CONTRACTS
        </span>
        <span style={{
          fontSize: 9, padding: '2px 6px', borderRadius: 2,
          background: sofrLive ? 'rgba(0,200,83,0.15)' : 'rgba(255,82,82,0.1)',
          color: sofrLive ? 'var(--green)' : 'var(--red)',
        }}>
          {sofrLive ? '● YAHOO LIVE' : '○ FALLBACK'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`tab-btn ${product === 'SOFR' ? 'active' : ''}`}
            onClick={() => setProduct('SOFR')} style={{ fontSize: 9, padding: '2px 8px' }}>SOFR</button>
          <button className={`tab-btn ${product === 'FED FUNDS' ? 'active' : ''}`}
            onClick={() => setProduct('FED FUNDS')} style={{ fontSize: 9, padding: '2px 8px' }}>FED FUNDS</button>
        </div>
      </div>

      {/* Terminal */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 10, padding: '6px 8px',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 11,
      }}>
        <span style={{ color: 'var(--dim)' }}>TERMINAL:
          <span style={{ color: 'var(--green)', fontWeight: 'bold', marginLeft: 4 }}>{terminal.toFixed(3)}%</span>
        </span>
        <span style={{ color: 'var(--dim)' }}>{terminalContract?.ticker} | {terminalContract?.month}</span>
        <span style={{ color: 'var(--dim)' }}>MTG→TERM:
          <span style={{ color: parseFloat(termSpread) > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 'bold', marginLeft: 4 }}>
            {parseFloat(termSpread) > 0 ? '+' : ''}{termSpread}bp
          </span>
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['CONTRACT', 'LAST PX', 'IMP RATE', 'BPS CUT', '1D bp', '5D bp', '1M bp', 'VOLUME'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i > 0 ? 'right' : 'left', padding: '6px 6px', fontSize: 9,
                  color: 'var(--dim)', letterSpacing: 1, borderBottom: '1px solid var(--border)',
                  position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strip.map(group => {
              const yc = YC[group.year] || DY;
              return (
                <Fragment key={group.year}>
                  <tr>
                    <td colSpan={8} style={{
                      padding: '8px 6px 4px', color: yc.accent, fontWeight: 'bold', fontSize: 12,
                      borderBottom: `1px solid ${yc.border}`, borderLeft: `3px solid ${yc.accent}`, background: yc.bg,
                    }}>{group.year}</td>
                  </tr>
                  {group.contracts.map(c => {
                    const bpsCut = (currentSOFR - c.impRate) * 100;
                    const globalIdx = contractIndex++;
                    const hasChart = c.history1y && c.history1y.length > 10;
                    const volPct = maxVol > 0 ? ((c.volume || 0) / maxVol) * 100 : 0;

                    return (
                      <tr key={c.ticker} className="data-row" style={{
                        borderBottom: `1px solid ${yc.border}`, borderLeft: `3px solid ${yc.accent}`, background: yc.bg,
                        cursor: hasChart ? 'pointer' : 'default',
                      }} onClick={() => hasChart && setChartContract(c)}>
                        {/* Contract */}
                        <td style={{ padding: '5px 6px' }}>
                          <span style={{ color: yc.accent, fontWeight: 'bold' }}>{c.ticker}</span>
                          <span style={{ color: 'var(--dim)', marginLeft: 5, fontSize: 10 }}>{c.month}</span>
                          {hasChart && <span style={{ color: 'var(--cyan)', marginLeft: 4, fontSize: 9 }}>📈</span>}
                        </td>
                        {/* Last Px */}
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{c.lastPx?.toFixed(3) || '—'}</td>
                        {/* Implied Rate */}
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--amber)', fontWeight: 'bold' }}>
                          {c.impRate?.toFixed(3) || '—'}
                        </td>
                        {/* BPS CUT */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right', color: cutCol(bpsCut),
                          fontWeight: Math.abs(bpsCut) > 5 ? 'bold' : 'normal', background: cutHeatBg(bpsCut, maxCut),
                        }}>{fmtBp(bpsCut)}</td>
                        {/* 1D */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right', color: bpCol(c.bp1d),
                          fontWeight: c.bp1d != null && Math.abs(c.bp1d) > 1 ? 'bold' : 'normal',
                          background: heatBg(c.bp1d, maxBp1d),
                        }}>{fmtBp(c.bp1d)}</td>
                        {/* 5D */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right', color: bpCol(c.bp5d),
                          fontWeight: c.bp5d != null && Math.abs(c.bp5d) > 2 ? 'bold' : 'normal',
                          background: heatBg(c.bp5d, maxBp5d),
                        }}>{fmtBp(c.bp5d)}</td>
                        {/* 1M */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right', color: bpCol(c.bp1m),
                          fontWeight: c.bp1m != null && Math.abs(c.bp1m) > 3 ? 'bold' : 'normal',
                          background: heatBg(c.bp1m, maxBp1m),
                        }}>{fmtBp(c.bp1m)}</td>
                        {/* Volume with data bar */}
                        <td style={{ padding: '5px 6px', textAlign: 'right', position: 'relative', minWidth: 80 }}>
                          {/* Background data bar */}
                          <div style={{
                            position: 'absolute', top: 2, bottom: 2, right: 0,
                            width: `${volPct}%`,
                            background: 'rgba(0,188,212,0.15)',
                            borderRadius: '2px 0 0 2px',
                            transition: 'width 0.3s',
                          }} />
                          <span style={{ position: 'relative', zIndex: 1, color: 'var(--dim)', fontSize: 10 }}>
                            {fmtVol(c.volume)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>BPS CUT = bps below SOFR spot</span>
        <span>1D/5D/1M = implied rate change in bp</span>
        <span>(<span style={{ color: 'var(--green)' }}>green</span>=dovish <span style={{ color: 'var(--red)' }}>red</span>=hawkish)</span>
        <span>📈 = click for 1Y chart</span>
      </div>
    </div>
  );
}

function Fragment({ children }) { return <>{children}</>; }
