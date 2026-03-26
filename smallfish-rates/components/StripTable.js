'use client';

import { useState } from 'react';

export default function StripTable({ strip, sofrLive }) {
  const [product, setProduct] = useState('SOFR');

  if (!strip?.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  const totalContracts = strip.reduce((a, g) => a + g.contracts.length, 0);

  // Compute terminal rate and spread to current
  const allContracts = strip.flatMap(g => g.contracts);
  const currentSOFR = allContracts[0]?.impRate || 0;
  const terminalContract = allContracts.reduce(
    (best, c) => (!best || c.impRate > best.impRate ? c : best), null
  );
  const terminal = terminalContract?.impRate || 0;
  const termSpread = ((terminal - currentSOFR) * 100).toFixed(1);

  return (
    <div>
      {/* Header with product toggle + status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap',
      }}>
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
          <button
            className={`tab-btn ${product === 'SOFR' ? 'active' : ''}`}
            onClick={() => setProduct('SOFR')}
            style={{ fontSize: 9, padding: '2px 8px' }}
          >SOFR</button>
          <button
            className={`tab-btn ${product === 'FED FUNDS' ? 'active' : ''}`}
            onClick={() => setProduct('FED FUNDS')}
            style={{ fontSize: 9, padding: '2px 8px' }}
          >FED FUNDS</button>
        </div>
      </div>

      {/* Terminal summary */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 10, padding: '6px 8px',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2,
        fontSize: 11,
      }}>
        <span style={{ color: 'var(--dim)' }}>TERMINAL:
          <span style={{ color: 'var(--green)', fontWeight: 'bold', marginLeft: 4 }}>
            {terminal.toFixed(3)}%
          </span>
        </span>
        <span style={{ color: 'var(--dim)' }}>
          {terminalContract?.ticker} | {terminalContract?.month}
        </span>
        <span style={{ color: 'var(--dim)' }}>MTG→TERM:
          <span style={{
            color: parseFloat(termSpread) > 0 ? 'var(--red)' : 'var(--green)',
            fontWeight: 'bold', marginLeft: 4,
          }}>
            {parseFloat(termSpread) > 0 ? '+' : ''}{termSpread}bp
          </span>
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['CONTRACT', 'LAST PX', 'IMP RATE', 'BPS CUT', '1D', '5D', '1M', 'VOL'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i > 0 ? 'right' : 'left',
                  padding: '6px 6px',
                  fontSize: 9,
                  color: 'var(--dim)',
                  letterSpacing: 1,
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--card)',
                  zIndex: 1,
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strip.map(group => (
              <Fragment key={group.year}>
                <tr>
                  <td colSpan={8} style={{
                    padding: '8px 6px 4px',
                    color: 'var(--amber)',
                    fontWeight: 'bold',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                  }}>{group.year}</td>
                </tr>
                {group.contracts.map(c => {
                  const effr = 3.63; // Current SOFR spot approx
                  const bpsCut = -((c.impRate - effr) * 100);
                  const hasMoved1d = Math.abs(c.bp1d || 0) >= 0.1;
                  const hasMoved5d = Math.abs(c.bp5d || 0) >= 0.1;
                  const hasMoved1m = Math.abs(c.bp1m || 0) >= 0.1;

                  return (
                    <tr key={c.ticker} className="data-row" style={{
                      borderBottom: '1px solid rgba(26,29,38,0.5)',
                    }}>
                      {/* Contract */}
                      <td style={{ padding: '5px 6px' }}>
                        <span style={{ color: 'var(--green)' }}>{c.ticker}</span>
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
                      {/* BPS from current */}
                      <td style={{
                        padding: '5px 6px', textAlign: 'right',
                        color: bpsCut > 0 ? 'var(--green)' : bpsCut < -1 ? 'var(--red)' : 'var(--dim)',
                      }}>
                        {bpsCut > 0 ? '+' : ''}{bpsCut.toFixed(1)}
                      </td>
                      {/* 1D bp change */}
                      <td style={{
                        padding: '5px 6px', textAlign: 'right',
                        color: !hasMoved1d ? 'var(--dim)' : (c.bp1d > 0 ? 'var(--red)' : 'var(--green)'),
                        fontWeight: hasMoved1d ? 'bold' : 'normal',
                      }}>
                        {formatBpChange(c.bp1d)}
                      </td>
                      {/* 5D bp change */}
                      <td style={{
                        padding: '5px 6px', textAlign: 'right',
                        color: !hasMoved5d ? 'var(--dim)' : (c.bp5d > 0 ? 'var(--red)' : 'var(--green)'),
                        fontWeight: hasMoved5d ? 'bold' : 'normal',
                      }}>
                        {formatBpChange(c.bp5d)}
                      </td>
                      {/* 1M bp change */}
                      <td style={{
                        padding: '5px 6px', textAlign: 'right',
                        color: !hasMoved1m ? 'var(--dim)' : (c.bp1m > 0 ? 'var(--red)' : 'var(--green)'),
                        fontWeight: hasMoved1m ? 'bold' : 'normal',
                      }}>
                        {formatBpChange(c.bp1m)}
                      </td>
                      {/* Volume */}
                      <td style={{
                        padding: '5px 6px', textAlign: 'right', color: 'var(--dim)',
                        fontSize: 10,
                      }}>
                        {formatVolume(c.volume)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Column legend */}
      <div style={{
        marginTop: 8, fontSize: 9, color: 'var(--dim)',
        display: 'flex', gap: 12, flexWrap: 'wrap',
      }}>
        <span>BPS CUT = bps below current SOFR spot</span>
        <span>1D/5D/1M = rate change in bp (
          <span style={{ color: 'var(--green)' }}>green</span>=dovish,{' '}
          <span style={{ color: 'var(--red)' }}>red</span>=hawkish)
        </span>
      </div>
    </div>
  );
}

function formatBpChange(bp) {
  if (bp == null || Math.abs(bp) < 0.05) return '—';
  const sign = bp > 0 ? '+' : '';
  return `${sign}${bp.toFixed(1)}`;
}

function formatVolume(vol) {
  if (!vol || vol === 0) return '—';
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return String(vol);
}

function Fragment({ children }) {
  return <>{children}</>;
}
