'use client';

import { useState } from 'react';

const YC = {
  2026: { bg: 'rgba(255,82,82,0.06)', border: 'rgba(255,82,82,0.15)', accent: '#ff5252' },
  2027: { bg: 'rgba(240,184,0,0.06)', border: 'rgba(240,184,0,0.15)', accent: '#f0b800' },
  2028: { bg: 'rgba(0,188,212,0.06)', border: 'rgba(0,188,212,0.15)', accent: '#00bcd4' },
  2029: { bg: 'rgba(0,200,83,0.06)', border: 'rgba(0,200,83,0.15)', accent: '#00c853' },
  2030: { bg: 'rgba(156,39,176,0.06)', border: 'rgba(156,39,176,0.15)', accent: '#9c27b0' },
};
const DY = { bg: 'transparent', border: 'var(--border)', accent: 'var(--dim)' };

function heat(bp, max) { if(bp==null||Math.abs(bp)<0.3)return'transparent';const i=Math.min(Math.abs(bp)/(max||1),1);return bp>0?`rgba(255,82,82,${(i*.4).toFixed(2)})`:`rgba(0,200,83,${(i*.4).toFixed(2)})`; }
function cutHeat(bp, max) { if(bp==null)return'transparent';const i=Math.min(Math.abs(bp)/(max||1),1);return bp>0?`rgba(0,200,83,${(i*.3).toFixed(2)})`:`rgba(255,82,82,${(i*.3).toFixed(2)})`; }
function bpC(bp) { return bp==null||Math.abs(bp)<0.3?'var(--dim)':bp>0?'var(--red)':'var(--green)'; }
function cutC(bp) { return bp==null?'var(--dim)':bp>0?'var(--green)':bp<-1?'var(--red)':'var(--dim)'; }
function fB(bp) { if(bp==null)return'—';if(Math.abs(bp)<0.05)return'0.0';return`${bp>0?'+':''}${bp.toFixed(1)}`; }
function fV(v) { if(!v)return'—';if(v>=1e6)return`${(v/1e6).toFixed(1)}M`;if(v>=1e3)return`${Math.round(v/1e3)}K`;return String(v); }

// ── POPUP CHART ─────────────────────────────────────────────────────────────
function ChartPopup({ contract, onClose, currentSOFR }) {
  const hist = contract.history1y;
  if (!hist || hist.length < 5) return null;

  const w = 640, h = 360, pad = { t: 30, r: 55, b: 40, l: 55 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const prices = hist.map(p => p.close);
  const minP = Math.floor(Math.min(...prices) * 4) / 4 - 0.125;
  const maxP = Math.ceil(Math.max(...prices) * 4) / 4 + 0.125;
  const sx = i => pad.l + (i / (hist.length - 1)) * cw;
  const sy = v => pad.t + ch - ((v - minP) / (maxP - minP)) * ch;
  const sofrPx = 100 - (currentSOFR || 3.63);
  const latest = hist[hist.length - 1];
  const impRate = (100 - latest.close).toFixed(3);
  const pts = hist.map((p, i) => `${sx(i)},${sy(p.close)}`).join(' ');

  const levels = [
    { label: '+75bp cut', d: 0.75, c: '#00c853' },
    { label: '+50bp cut', d: 0.50, c: '#00c853' },
    { label: '+25bp cut', d: 0.25, c: '#00c853' },
    { label: 'SOFR SPOT', d: 0, c: '#f0b800' },
    { label: '-25bp hike', d: -0.25, c: '#ff5252' },
    { label: '-50bp hike', d: -0.50, c: '#ff5252' },
    { label: '-75bp hike', d: -0.75, c: '#ff5252' },
  ];

  const grid = [];
  for (let v = Math.ceil(minP / 0.25) * 0.25; v <= maxP; v += 0.25) grid.push(v);

  const mLabels = [];
  let lastM = '';
  hist.forEach((p, i) => { const m = p.date.slice(0, 7); if (m !== lastM) { mLabels.push({ i, label: p.date.slice(2, 7) }); lastM = m; } });

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#0d0f14', border: '1px solid var(--border)', borderRadius: 6, padding: 20, maxWidth: 700, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: (YC[contract.year] || DY).accent }}>{contract.tvTicker || contract.ticker}</span>
            <span style={{ color: 'var(--dim)', marginLeft: 8, fontSize: 12 }}>{contract.label || contract.month} | Settles: {contract.settlementDate}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: 'var(--amber)', fontWeight: 'bold' }}>{latest.close.toFixed(3)} → {impRate}%</div>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '2px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, borderRadius: 2, marginTop: 4 }}>ESC ×</button>
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }}>
          <defs>
            <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0b800" stopOpacity="0.15" /><stop offset="100%" stopColor="#f0b800" stopOpacity="0.01" /></linearGradient>
          </defs>
          {grid.map(v => (<g key={v}><line x1={pad.l} y1={sy(v)} x2={w - pad.r} y2={sy(v)} stroke="#1a1d26" strokeWidth={0.5} /><text x={pad.l - 5} y={sy(v) + 3} fill="#5a5e6a" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(2)}</text><text x={w - pad.r + 5} y={sy(v) + 3} fill="#5a5e6a" fontSize={8} fontFamily="monospace">{(100 - v).toFixed(2)}%</text></g>))}
          {levels.map(lv => { const px = sofrPx + lv.d; if (px < minP || px > maxP) return null; return (<g key={lv.label}><line x1={pad.l} y1={sy(px)} x2={w - pad.r} y2={sy(px)} stroke={lv.c} strokeWidth={lv.d === 0 ? 1.5 : 1} strokeDasharray={lv.d === 0 ? '0' : '6 3'} opacity={0.7} /><text x={w - pad.r + 5} y={sy(px) + 3} fill={lv.c} fontSize={7} fontFamily="monospace">{lv.label}</text></g>); })}
          {mLabels.filter((_, i) => i % 2 === 0).map(ml => (<text key={ml.i} x={sx(ml.i)} y={h - 8} fill="#5a5e6a" fontSize={8} textAnchor="middle" fontFamily="monospace">{ml.label}</text>))}
          <polygon points={`${sx(0)},${sy(minP)} ${pts} ${sx(hist.length - 1)},${sy(minP)}`} fill="url(#cf)" />
          <polyline points={pts} fill="none" stroke="#f0b800" strokeWidth={1.8} />
          <circle cx={sx(hist.length - 1)} cy={sy(latest.close)} r={4} fill="#f0b800" />
        </svg>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 9, color: '#5a5e6a', flexWrap: 'wrap' }}>
          <span>Left: Price | Right: Implied Rate</span>
          <span style={{ color: '#00c853' }}>— — Cut levels</span>
          <span style={{ color: '#f0b800' }}>━━ SOFR Spot</span>
          <span style={{ color: '#ff5252' }}>— — Hike levels</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN TABLE ──────────────────────────────────────────────────────────────
export default function StripTable({ strip, sofrLive, sofrLoading, currentSOFR }) {
  const [product, setProduct] = useState('SOFR');
  const [chartC, setChartC] = useState(null);

  if (!strip?.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>{sofrLoading ? 'Loading SOFR futures...' : 'No data'}</div>;

  const all = strip.flatMap(g => g.contracts);
  const sofr0 = currentSOFR || all[0]?.impRate || 3.63;
  const termC = all.reduce((b, c) => (!b || c.impRate > b.impRate ? c : b), null);
  const terminal = termC?.impRate || sofr0;
  const termSp = ((terminal - sofr0) * 100).toFixed(1);

  const mx1d = Math.max(1, ...all.map(c => Math.abs(c.bp1d ?? 0)));
  const mx5d = Math.max(3, ...all.map(c => Math.abs(c.bp5d ?? 0)));
  const mx1m = Math.max(5, ...all.map(c => Math.abs(c.bp1m ?? 0)));
  const mxCut = Math.max(1, ...all.map(c => Math.abs((sofr0 - c.impRate) * 100)));
  const mxVol = Math.max(1, ...all.map(c => c.volume || 0));

  return (
    <div>
      {chartC && <ChartPopup contract={chartC} onClose={() => setChartC(null)} currentSOFR={sofr0} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1 }}>SOFR STRIP — {all.length} CONTRACTS</span>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: sofrLive ? 'rgba(0,200,83,0.15)' : sofrLoading ? 'rgba(240,184,0,0.15)' : 'rgba(255,82,82,0.1)', color: sofrLive ? 'var(--green)' : sofrLoading ? 'var(--amber)' : 'var(--red)' }}>
          {sofrLoading ? '◌ LOADING' : sofrLive ? '● YAHOO LIVE' : '○ FALLBACK'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`tab-btn ${product === 'SOFR' ? 'active' : ''}`} onClick={() => setProduct('SOFR')} style={{ fontSize: 9, padding: '2px 8px' }}>SOFR</button>
          <button className="tab-btn" style={{ fontSize: 9, padding: '2px 8px' }}>FED FUNDS</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 10, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 11 }}>
        <span style={{ color: 'var(--dim)' }}>TERMINAL: <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>{terminal.toFixed(3)}%</span></span>
        <span style={{ color: 'var(--dim)' }}>{termC?.ticker || termC?.tvTicker} | {termC?.month || termC?.label}</span>
        <span style={{ color: 'var(--dim)' }}>MTG→TERM: <span style={{ color: parseFloat(termSp) > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 'bold' }}>{parseFloat(termSp) > 0 ? '+' : ''}{termSp}bp</span></span>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {['CONTRACT', 'LAST PX', 'IMP RATE', 'BPS CUT', '1D bp', '5D bp', '1M bp', 'VOLUME'].map((h, i) => (
              <th key={h} style={{ textAlign: i > 0 ? 'right' : 'left', padding: '6px 6px', fontSize: 9, color: 'var(--dim)', letterSpacing: 1, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {strip.map(group => {
              const yc = YC[group.year] || DY;
              return (
                <Fragment key={group.year}>
                  <tr><td colSpan={8} style={{ padding: '8px 6px 4px', color: yc.accent, fontWeight: 'bold', fontSize: 12, borderBottom: `1px solid ${yc.border}`, borderLeft: `3px solid ${yc.accent}`, background: yc.bg }}>{group.year}</td></tr>
                  {group.contracts.map(c => {
                    const bps = (sofr0 - c.impRate) * 100;
                    const hasChart = c.history1y && c.history1y.length > 10;
                    const volPct = mxVol > 0 ? ((c.volume || 0) / mxVol) * 100 : 0;
                    const tk = c.tvTicker || c.ticker;

                    return (
                      <tr key={tk} className="data-row" style={{ borderBottom: `1px solid ${yc.border}`, borderLeft: `3px solid ${yc.accent}`, background: yc.bg, cursor: hasChart ? 'pointer' : 'default' }}
                        onClick={() => hasChart && setChartC(c)}>
                        <td style={{ padding: '5px 6px' }}>
                          <span style={{ color: yc.accent, fontWeight: 'bold' }}>{tk}</span>
                          <span style={{ color: 'var(--dim)', marginLeft: 5, fontSize: 10 }}>{c.label || c.month}</span>
                          {hasChart && <span style={{ marginLeft: 4, fontSize: 9 }}>📈</span>}
                        </td>
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{c.lastPx?.toFixed(3) || '—'}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--amber)', fontWeight: 'bold' }}>{c.impRate?.toFixed(3) || '—'}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: cutC(bps), fontWeight: Math.abs(bps) > 5 ? 'bold' : 'normal', background: cutHeat(bps, mxCut) }}>{fB(bps)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: bpC(c.bp1d), fontWeight: c.bp1d != null && Math.abs(c.bp1d) > 1 ? 'bold' : 'normal', background: heat(c.bp1d, mx1d) }}>{fB(c.bp1d)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: bpC(c.bp5d), fontWeight: c.bp5d != null && Math.abs(c.bp5d) > 2 ? 'bold' : 'normal', background: heat(c.bp5d, mx5d) }}>{fB(c.bp5d)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: bpC(c.bp1m), fontWeight: c.bp1m != null && Math.abs(c.bp1m) > 3 ? 'bold' : 'normal', background: heat(c.bp1m, mx1m) }}>{fB(c.bp1m)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', position: 'relative', minWidth: 80 }}>
                          <div style={{ position: 'absolute', top: 2, bottom: 2, right: 0, width: `${volPct}%`, background: 'rgba(0,188,212,0.15)', borderRadius: '2px 0 0 2px' }} />
                          <span style={{ position: 'relative', zIndex: 1, color: 'var(--dim)', fontSize: 10 }}>{fV(c.volume)}</span>
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

      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>BPS CUT = bps below SOFR spot</span>
        <span>1D/5D/1M = rate chg in bp (<span style={{ color: 'var(--green)' }}>green</span>=dovish <span style={{ color: 'var(--red)' }}>red</span>=hawkish)</span>
        <span>📈 = click for 1Y chart</span>
      </div>
    </div>
  );
}

function Fragment({ children }) { return <>{children}</>; }
