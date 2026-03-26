'use client';

import { useState } from 'react';

// Year-based color palette (matching CFR terminal style)
const YEAR_COLORS = {
  2026: { bg: 'rgba(255, 82, 82, 0.06)', border: 'rgba(255, 82, 82, 0.15)', accent: '#ff5252', label: '#ff5252' },
  2027: { bg: 'rgba(240, 184, 0, 0.06)', border: 'rgba(240, 184, 0, 0.15)', accent: '#f0b800', label: '#f0b800' },
  2028: { bg: 'rgba(0, 188, 212, 0.06)', border: 'rgba(0, 188, 212, 0.15)', accent: '#00bcd4', label: '#00bcd4' },
  2029: { bg: 'rgba(0, 200, 83, 0.06)', border: 'rgba(0, 200, 83, 0.15)', accent: '#00c853', label: '#00c853' },
  2030: { bg: 'rgba(156, 39, 176, 0.06)', border: 'rgba(156, 39, 176, 0.15)', accent: '#9c27b0', label: '#9c27b0' },
};

const DEFAULT_YEAR = { bg: 'transparent', border: 'var(--border)', accent: 'var(--dim)', label: 'var(--dim)' };

/**
 * Heat-map background for basis point values
 * Green for dovish (rate cuts / negative bps), Red for hawkish (rate hikes / positive bps)
 */
function bpHeatBg(bp, maxBp = 30) {
  if (bp == null || Math.abs(bp) < 0.5) return 'transparent';
  const intensity = Math.min(Math.abs(bp) / maxBp, 1);
  if (bp > 0) {
    // Hawkish = rate up = red
    return `rgba(255, 82, 82, ${(intensity * 0.35).toFixed(2)})`;
  } else {
    // Dovish = rate down = green
    return `rgba(0, 200, 83, ${(intensity * 0.35).toFixed(2)})`;
  }
}

/**
 * Heat-map for BPS CUT column (green = more cuts priced, red = hikes)
 */
function bpsCutHeatBg(bpsCut, maxBp = 25) {
  if (bpsCut == null) return 'transparent';
  const intensity = Math.min(Math.abs(bpsCut) / maxBp, 1);
  if (bpsCut > 0) {
    // Positive = cuts priced in = green
    return `rgba(0, 200, 83, ${(intensity * 0.3).toFixed(2)})`;
  } else {
    // Negative = hikes = red
    return `rgba(255, 82, 82, ${(intensity * 0.3).toFixed(2)})`;
  }
}

function bpColor(bp) {
  if (bp == null || Math.abs(bp) < 0.5) return 'var(--dim)';
  return bp > 0 ? 'var(--red)' : 'var(--green)';
}

function bpsCutColor(bp) {
  if (bp == null) return 'var(--dim)';
  return bp > 0 ? 'var(--green)' : bp < -1 ? 'var(--red)' : 'var(--dim)';
}

function formatBp(bp) {
  if (bp == null) return '—';
  if (Math.abs(bp) < 0.05) return '0.0';
  return `${bp > 0 ? '+' : ''}${bp.toFixed(1)}`;
}

function formatVolume(vol) {
  if (!vol || vol === 0) return '—';
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${Math.round(vol / 1000)}K`;
  return String(vol);
}

export default function StripTable({ strip, sofrLive }) {
  const [product, setProduct] = useState('SOFR');

  if (!strip?.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  const totalContracts = strip.reduce((a, g) => a + g.contracts.length, 0);
  const allContracts = strip.flatMap(g => g.contracts);
  const currentSOFR = allContracts[0]?.impRate || 3.63;

  // Find terminal (peak implied rate)
  const terminalContract = allContracts.reduce(
    (best, c) => (!best || c.impRate > best.impRate ? c : best), null
  );
  const terminal = terminalContract?.impRate || currentSOFR;
  const termSpread = ((terminal - currentSOFR) * 100).toFixed(1);

  // Find max absolute bp values for heat-map scaling
  const maxBp1d = Math.max(1, ...allContracts.map(c => Math.abs(c.bp1d || 0)));
  const maxBp5d = Math.max(1, ...allContracts.map(c => Math.abs(c.bp5d || 0)));
  const maxBp1m = Math.max(1, ...allContracts.map(c => Math.abs(c.bp1m || 0)));
  const maxBpsCut = Math.max(1, ...allContracts.map(c => Math.abs((currentSOFR - c.impRate) * 100)));

  return (
    <div>
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

      {/* Terminal summary */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 10, padding: '6px 8px',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2, fontSize: 11,
      }}>
        <span style={{ color: 'var(--dim)' }}>TERMINAL:
          <span style={{ color: 'var(--green)', fontWeight: 'bold', marginLeft: 4 }}>{terminal.toFixed(3)}%</span>
        </span>
        <span style={{ color: 'var(--dim)' }}>{terminalContract?.ticker} | {terminalContract?.month}</span>
        <span style={{ color: 'var(--dim)' }}>MTG→TERM:
          <span style={{
            color: parseFloat(termSpread) > 0 ? 'var(--red)' : 'var(--green)',
            fontWeight: 'bold', marginLeft: 4,
          }}>{parseFloat(termSpread) > 0 ? '+' : ''}{termSpread}bp</span>
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['CONTRACT', 'LAST PX', 'IMP RATE', 'BPS CUT', '1D bp', '5D bp', '1M bp', 'VOL'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i > 0 ? 'right' : 'left',
                  padding: '6px 6px', fontSize: 9, color: 'var(--dim)', letterSpacing: 1,
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strip.map(group => {
              const yc = YEAR_COLORS[group.year] || DEFAULT_YEAR;
              return (
                <Fragment key={group.year}>
                  {/* Year header row */}
                  <tr>
                    <td colSpan={8} style={{
                      padding: '8px 6px 4px',
                      color: yc.label,
                      fontWeight: 'bold',
                      fontSize: 12,
                      borderBottom: `1px solid ${yc.border}`,
                      borderLeft: `3px solid ${yc.accent}`,
                      background: yc.bg,
                    }}>{group.year}</td>
                  </tr>
                  {/* Contract rows */}
                  {group.contracts.map(c => {
                    const bpsCut = (currentSOFR - c.impRate) * 100;

                    return (
                      <tr key={c.ticker} className="data-row" style={{
                        borderBottom: `1px solid ${yc.border}`,
                        borderLeft: `3px solid ${yc.accent}`,
                        background: yc.bg,
                      }}>
                        {/* Contract ticker */}
                        <td style={{ padding: '5px 6px' }}>
                          <span style={{ color: yc.accent, fontWeight: 'bold' }}>{c.ticker}</span>
                          <span style={{ color: 'var(--dim)', marginLeft: 5, fontSize: 10 }}>{c.month}</span>
                        </td>
                        {/* Last Px */}
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                          {c.lastPx?.toFixed(3) || '—'}
                        </td>
                        {/* Implied Rate */}
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--amber)', fontWeight: 'bold' }}>
                          {c.impRate?.toFixed(3) || '—'}
                        </td>
                        {/* BPS CUT - heat mapped */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right',
                          color: bpsCutColor(bpsCut),
                          fontWeight: Math.abs(bpsCut) > 5 ? 'bold' : 'normal',
                          background: bpsCutHeatBg(bpsCut, maxBpsCut),
                        }}>
                          {formatBp(bpsCut)}
                        </td>
                        {/* 1D bp - heat mapped */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right',
                          color: bpColor(c.bp1d),
                          fontWeight: c.bp1d != null && Math.abs(c.bp1d) > 1 ? 'bold' : 'normal',
                          background: bpHeatBg(c.bp1d, maxBp1d),
                        }}>
                          {formatBp(c.bp1d)}
                        </td>
                        {/* 5D bp - heat mapped */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right',
                          color: bpColor(c.bp5d),
                          fontWeight: c.bp5d != null && Math.abs(c.bp5d) > 2 ? 'bold' : 'normal',
                          background: bpHeatBg(c.bp5d, maxBp5d),
                        }}>
                          {formatBp(c.bp5d)}
                        </td>
                        {/* 1M bp - heat mapped */}
                        <td style={{
                          padding: '5px 6px', textAlign: 'right',
                          color: bpColor(c.bp1m),
                          fontWeight: c.bp1m != null && Math.abs(c.bp1m) > 3 ? 'bold' : 'normal',
                          background: bpHeatBg(c.bp1m, maxBp1m),
                        }}>
                          {formatBp(c.bp1m)}
                        </td>
                        {/* Volume */}
                        <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>
                          {formatVolume(c.volume)}
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
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--dim)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>BPS CUT = bps below current SOFR spot</span>
        <span>1D/5D/1M = rate change in bp</span>
        <span>(<span style={{ color: 'var(--green)' }}>green</span>=dovish / <span style={{ color: 'var(--red)' }}>red</span>=hawkish)</span>
        <span>Background intensity = magnitude</span>
      </div>
    </div>
  );
}

function Fragment({ children }) {
  return <>{children}</>;
}
