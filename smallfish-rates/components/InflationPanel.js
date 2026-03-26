'use client';

import { useState } from 'react';
import { FALLBACK_RATES } from '@/lib/constants';

export default function InflationPanel({ data }) {
  const [fvTab, setFvTab] = useState('CPI');
  const [inflMetric, setInflMetric] = useState('yoy');

  const rates = { ...FALLBACK_RATES, ...data?.rates };
  const cpiData = data?.cpi || [];
  const latestCPI = cpiData[cpiData.length - 1] || { date: '—', yoy: 0, mom: 0 };

  // Select inflation series based on tab
  let chartData = cpiData;
  if (fvTab === 'CORE CPI' && data?.coreCpi?.length) chartData = data.coreCpi;
  if (fvTab === 'PCE' && data?.pce?.length) chartData = data.pce;
  if (fvTab === 'CORE PCE' && data?.corePce?.length) chartData = data.corePce;

  const latest = chartData[chartData.length - 1] || latestCPI;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 16 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        paddingBottom: 8, borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 2 }}>FAIR VALUE MODEL</span>
      </div>

      {/* Inflation model tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {['CPI', 'PCE', 'CORE CPI', 'CORE PCE'].map(t => (
          <button key={t} className={`tab-btn ${fvTab === t ? 'active' : ''}`}
            onClick={() => setFvTab(t)} style={{ fontSize: 10, padding: '4px 10px' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Latest stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--dim)' }}>LATEST: <span style={{ color: 'var(--text)' }}>{latest.date}</span></span>
        <span style={{ color: 'var(--dim)' }}>MoM: <span style={{ color: latest.mom > 0.3 ? 'var(--red)' : 'var(--green)' }}>
          {latest.mom >= 0 ? '+' : ''}{latest.mom?.toFixed(1)}%
        </span></span>
        <span style={{ color: 'var(--dim)' }}>YoY: <span style={{ color: 'var(--amber)' }}>{latest.yoy?.toFixed(1)}%</span></span>
      </div>

      {/* Chart */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1 }}>
            {inflMetric === 'yoy' ? 'YOY' : 'MOM'} INFLATION
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {['yoy', 'mom'].map(m => (
              <button key={m} className={`tab-btn ${inflMetric === m ? 'active' : ''}`}
                onClick={() => setInflMetric(m)}
                style={{ fontSize: 9, padding: '2px 8px', textTransform: 'uppercase' }}>
                {m}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 && <InflationChart data={chartData} metric={inflMetric} />}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 9 }}>
        <LegendItem color="var(--amber)" label="Actual" />
        <LegendItem color="var(--cyan)" label="3M Avg" dashed />
        {inflMetric === 'yoy' && <LegendItem color="var(--red)" label="2% Target" dashed />}
      </div>

      {/* Key Rates */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>KEY RATES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'EFFR', value: rates.EFFR, unit: '%' },
            { label: 'SOFR', value: rates.SOFR, unit: '%' },
            { label: 'UST 2Y', value: rates.DGS2, unit: '%' },
            { label: 'UST 10Y', value: rates.DGS10, unit: '%' },
            { label: 'UST 30Y', value: rates.DGS30, unit: '%' },
            { label: '2s10s', value: rates.T10Y2Y ? (rates.T10Y2Y * 100).toFixed(0) : '44', unit: 'bp', raw: true },
          ].map(r => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', padding: '4px 8px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2,
            }}>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{r.label}</span>
              <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 'bold' }}>
                {r.raw ? r.value : (r.value?.toFixed(2) || '—')}{r.unit}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Breakevens */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>BREAKEVEN INFLATION</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: '5Y BE', value: rates.T5YIE },
            { label: '10Y BE', value: rates.T10YIE },
            { label: '5Y5Y FWD', value: rates.T5YIFR },
            { label: 'REAL 10Y', value: rates.DFII10 },
          ].map(r => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2,
            }}>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{r.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 'bold' }}>
                {r.value?.toFixed(2) || '—'}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InflationChart({ data, metric }) {
  const w = 500, h = 200, pad = { t: 20, r: 20, b: 35, l: 45 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const vals = data.map(d => d[metric]);
  const minV = metric === 'mom' ? Math.min(-0.2, ...vals) - 0.1 : Math.floor(Math.min(...vals) * 2) / 2 - 0.5;
  const maxV = metric === 'mom' ? Math.max(0.6, ...vals) + 0.1 : Math.ceil(Math.max(...vals) * 2) / 2 + 0.5;
  const scaleX = (i) => pad.l + (i / (data.length - 1)) * cw;
  const scaleY = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;
  const pts = data.map((d, i) => `${scaleX(i)},${scaleY(d[metric])}`).join(' ');

  const target = metric === 'yoy' ? 2.0 : null;
  const gridStep = metric === 'mom' ? 0.1 : 0.5;
  const gridLines = [];
  for (let v = Math.ceil(minV / gridStep) * gridStep; v <= maxV; v += gridStep) gridLines.push(v);

  // 3-month moving average
  const ma3Pts = data.map((d, i) => {
    if (i < 2) return null;
    const avg = (data[i][metric] + data[i-1][metric] + data[i-2][metric]) / 3;
    return `${scaleX(i)},${scaleY(avg)}`;
  }).filter(Boolean).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 200 }}>
      <defs>
        <linearGradient id="inflFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.1"/>
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {gridLines.map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5}/>
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">
            {v.toFixed(metric === 'mom' ? 1 : 1)}
          </text>
        </g>
      ))}
      {target && (
        <line x1={pad.l} y1={scaleY(target)} x2={w - pad.r} y2={scaleY(target)}
          stroke="var(--red)" strokeWidth={1.2} strokeDasharray="8 4" opacity={0.7}/>
      )}
      <polygon
        points={`${scaleX(0)},${scaleY(minV)} ${pts} ${scaleX(data.length - 1)},${scaleY(minV)}`}
        fill="url(#inflFill)"
      />
      {ma3Pts && <polyline points={ma3Pts} fill="none" stroke="var(--cyan)" strokeWidth={1.2} strokeDasharray="4 2" opacity={0.6}/>}
      <polyline points={pts} fill="none" stroke="var(--amber)" strokeWidth={1.8}/>
      {/* X-axis labels */}
      {data.map((d, i) => (
        i % 3 === 0 && (
          <text key={d.date} x={scaleX(i)} y={h - 8} fill="var(--dim)" fontSize={7} textAnchor="middle" fontFamily="monospace">
            {d.date.slice(2)}
          </text>
        )
      ))}
      {/* Latest point */}
      <circle cx={scaleX(data.length - 1)} cy={scaleY(data[data.length - 1][metric])} r={4} fill="var(--amber)"/>
      <text x={scaleX(data.length - 1) - 5} y={scaleY(data[data.length - 1][metric]) - 8}
        fill="var(--amber)" fontSize={10} textAnchor="end" fontFamily="monospace" fontWeight="bold">
        {data[data.length - 1][metric].toFixed(1)}%
      </text>
    </svg>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--dim)' }}>
      <span style={{
        width: 12, height: dashed ? 0 : 2, display: 'inline-block',
        background: dashed ? 'transparent' : color,
        borderTop: dashed ? `1.5px dashed ${color}` : 'none',
      }}/>
      {label}
    </span>
  );
}
