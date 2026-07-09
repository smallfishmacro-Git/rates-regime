'use client';

import { useState, useEffect, useMemo } from 'react';

// =====================================================================
// CURVE BACKTEST - per-regime %CAGR for a chosen ETF, driven by the
// classification selected above (curve pair + lookback).
// Data: /api/backtest -> data/backtest_assets.json (yfinance adj closes
// committed by GitHub Actions - same raw.githubusercontent pattern).
// Convention: regime is fixed at the prior close (signal t, return t->t+1),
// so there is no lookahead. CAGR is geometric, annualized on 252 days.
// =====================================================================

const ASSETS = ['SPY', 'QQQ', 'TLT', 'UUP', 'GLD', 'USO', 'BITO'];
const MAX_STALE_DAYS = 7; // max calendar days a regime may be forward-filled

const fmtCagr = v => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function CurveBacktest({ points, regimes, order, currentRegime, curveId, lookback }) {
  const [asset, setAsset] = useState('SPY');
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/backtest')
      .then(r => r.json())
      .then(d => { if (alive) { setPrices(d && d.live ? d : null); setLoading(false); } })
      .catch(() => { if (alive) { setPrices(null); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const bt = useMemo(() => {
    if (!prices || !Array.isArray(points) || points.length < 10) return null;
    const px = prices[asset];
    const pdates = prices.dates;
    if (!Array.isArray(px) || !Array.isArray(pdates) || px.length !== pdates.length) return null;

    const regDates = points.map(p => p.date); // ascending
    const regVals = points.map(p => p.regime);

    let ri = 0;
    const regimeAsOf = d => { // last regime date <= d, capped staleness
      while (ri + 1 < regDates.length && regDates[ri + 1] <= d) ri++;
      if (regDates[ri] > d) return null;
      const staleDays = (new Date(d) - new Date(regDates[ri])) / 86400000;
      return staleDays <= MAX_STALE_DAYS ? regVals[ri] : null;
    };

    const acc = {};
    for (const k of order) acc[k] = { sum: 0, n: 0 };
    let allSum = 0, allN = 0, first = null, last = null;

    for (let i = 1; i < pdates.length; i++) {
      const p0 = px[i - 1], p1 = px[i];
      if (p0 == null || p1 == null || p0 <= 0 || p1 <= 0) continue;
      const reg = regimeAsOf(pdates[i - 1]);
      if (!reg || !acc[reg]) continue;
      const lr = Math.log(p1 / p0);
      acc[reg].sum += lr; acc[reg].n += 1;
      allSum += lr; allN += 1;
      if (!first) first = pdates[i - 1];
      last = pdates[i];
    }
    if (allN < 60) return null;

    const rows = order.map(k => ({
      k,
      n: acc[k].n,
      pct: (100 * acc[k].n) / allN,
      cagr: acc[k].n >= 20 ? (Math.exp((acc[k].sum / acc[k].n) * 252) - 1) * 100 : null,
    }));
    const allCagr = (Math.exp((allSum / allN) * 252) - 1) * 100;
    const maxAbs = Math.max(5, Math.abs(allCagr),
                            ...rows.filter(r => r.cagr != null).map(r => Math.abs(r.cagr)));
    return { rows, allCagr, allN, first, last, maxAbs };
  }, [prices, points, asset, order]);

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: 14, marginBottom: 16 }}>
      <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 1 }}>
          REGIME BACKTEST · {curveId} · {lookback}D
        </span>
        <span style={{ fontSize: 9, color: 'var(--dim)' }}>
          %CAGR by regime · signal at prior close (t→t+1) · adj close, dividends reinvested
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {ASSETS.map(t => (
            <button key={t} className={`tab-btn ${t === asset ? 'active' : ''}`}
                    style={{ fontSize: 10 }} onClick={() => setAsset(t)}>{t}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ color: 'var(--dim)', fontSize: 11, padding: 24, textAlign: 'center' }}>
          ◌ loading asset history…
        </div>
      )}
      {!loading && !prices && (
        <div style={{ color: 'var(--dim)', fontSize: 11, padding: 24, textAlign: 'center' }}>
          asset data unavailable - run the Fetch Backtest Assets workflow
        </div>
      )}
      {!loading && prices && !bt && (
        <div style={{ color: 'var(--dim)', fontSize: 11, padding: 24, textAlign: 'center' }}>
          insufficient overlap between {asset} and regime history
        </div>
      )}

      {!loading && bt && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bt.rows.map(r => (
              <Row key={r.k} label={regimes[r.k].label} color={regimes[r.k].color}
                   cagr={r.cagr} n={r.n} pct={r.pct} maxAbs={bt.maxAbs}
                   active={r.k === currentRegime} />
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 8 }}>
              <Row label={`BUY & HOLD ${asset}`} color="#d8d4c8"
                   cagr={bt.allCagr} n={bt.allN} pct={100} maxAbs={bt.maxAbs} />
            </div>
          </div>
          <div style={{ fontSize: 8.5, color: 'var(--dim)', marginTop: 10 }}>
            {asset} · {bt.first} → {bt.last} · {bt.allN} trading days · CAGR annualized on 252d ·
            regimes with fewer than 20 days show -
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, color, cagr, n, pct, maxAbs, active }) {
  const w = cagr == null ? 0 : Math.min(100, (Math.abs(cagr) / maxAbs) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  background: active ? 'rgba(240,184,0,0.05)' : 'transparent',
                  border: active ? `1px solid ${color}55` : '1px solid transparent',
                  borderRadius: 3, padding: '3px 6px' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ width: 130, fontSize: 10, color: 'var(--text)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', height: 10, minWidth: 80 }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {cagr != null && cagr < 0 && (
            <div style={{ width: `${w}%`, height: '100%', background: color, opacity: 0.8,
                          borderRadius: '2px 0 0 2px' }} />
          )}
        </div>
        <div style={{ width: 1, background: 'var(--dim)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {cagr != null && cagr >= 0 && (
            <div style={{ width: `${w}%`, height: '100%', background: color, opacity: 0.8,
                          borderRadius: '0 2px 2px 0' }} />
          )}
        </div>
      </div>
      <span style={{ width: 62, textAlign: 'right', fontSize: 11, fontWeight: 'bold',
                     color: cagr == null ? 'var(--dim)' : cagr >= 0 ? '#22c977' : '#ff5c5c',
                     flexShrink: 0 }}>
        {fmtCagr(cagr)}
      </span>
      <span style={{ width: 96, textAlign: 'right', fontSize: 9, color: 'var(--dim)', flexShrink: 0 }}>
        {n}d ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}
