'use client';

import { FALLBACK_RATES } from '@/lib/constants';

export default function SpreadsView({ rates }) {
  const r = { ...FALLBACK_RATES, ...rates };

  const spreads = [
    { label: '2s10s', value: Math.round((r.DGS10 - r.DGS2) * 100), desc: 'DGS10 − DGS2' },
    { label: '3m10y', value: Math.round((r.DGS10 - r.DGS3MO) * 100), desc: 'DGS10 − DGS3MO' },
    { label: '2s5s', value: Math.round((r.DGS5 - r.DGS2) * 100), desc: 'DGS5 − DGS2' },
    { label: '5s30s', value: Math.round((r.DGS30 - r.DGS5) * 100), desc: 'DGS30 − DGS5' },
    { label: '2s30s', value: Math.round((r.DGS30 - r.DGS2) * 100), desc: 'DGS30 − DGS2' },
    { label: 'FF−SOFR', value: Math.round(((r.EFFR || 3.58) - (r.SOFR || 3.56)) * 100), desc: 'EFFR − SOFR' },
  ];

  const curve = [
    { tenor: '1M', rate: r.DGS1MO },
    { tenor: '3M', rate: r.DGS3MO },
    { tenor: '6M', rate: r.DGS6MO },
    { tenor: '1Y', rate: r.DGS1 },
    { tenor: '2Y', rate: r.DGS2 },
    { tenor: '3Y', rate: r.DGS3 },
    { tenor: '5Y', rate: r.DGS5 },
    { tenor: '7Y', rate: r.DGS7 },
    { tenor: '10Y', rate: r.DGS10 },
    { tenor: '20Y', rate: r.DGS20 },
    { tenor: '30Y', rate: r.DGS30 },
  ];

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 12 }}>
        KEY YIELD CURVE SPREADS (BP)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {spreads.map(s => (
          <div key={s.label} style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            padding: '10px 12px', borderRadius: 3,
          }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
            <div style={{
              fontSize: 22, fontWeight: 'bold', marginTop: 2,
              color: s.value > 0 ? 'var(--green)' : s.value < 0 ? 'var(--red)' : 'var(--amber)',
            }}>
              {s.value > 0 ? '+' : ''}{s.value}
            </div>
            <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>
          TREASURY YIELD CURVE
        </div>
        <YieldCurveChart data={curve} />
      </div>

      {/* Real rates */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>REAL vs NOMINAL</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { label: '10Y NOM', value: r.DGS10, color: 'var(--amber)' },
            { label: '10Y REAL', value: r.DFII10, color: 'var(--cyan)' },
            { label: '10Y BE', value: r.T10YIE, color: 'var(--green)' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              padding: '8px 10px', borderRadius: 2,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: item.color }}>{item.value?.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function YieldCurveChart({ data }) {
  const w = 540, h = 200, pad = { t: 20, r: 20, b: 35, l: 45 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const rates = data.map(d => d.rate);
  const minR = Math.floor(Math.min(...rates) * 4) / 4 - 0.25;
  const maxR = Math.ceil(Math.max(...rates) * 4) / 4 + 0.25;
  const scaleX = (i) => pad.l + (i / (data.length - 1)) * cw;
  const scaleY = (v) => pad.t + ch - ((v - minR) / (maxR - minR)) * ch;
  const pts = data.map((d, i) => `${scaleX(i)},${scaleY(d.rate)}`).join(' ');

  const gridLines = [];
  for (let v = Math.ceil(minR * 4) / 4; v <= maxR; v += 0.25) gridLines.push(v);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 200 }}>
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {gridLines.map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5}/>
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(2)}</text>
        </g>
      ))}
      <polygon
        points={`${scaleX(0)},${scaleY(minR)} ${pts} ${scaleX(data.length - 1)},${scaleY(minR)}`}
        fill="url(#curveFill)"
      />
      <polyline points={pts} fill="none" stroke="var(--amber)" strokeWidth={2}/>
      {data.map((d, i) => (
        <g key={d.tenor}>
          <circle cx={scaleX(i)} cy={scaleY(d.rate)} r={3} fill="var(--bg)" stroke="var(--amber)" strokeWidth={1.5}/>
          <text x={scaleX(i)} y={h - 8} fill="var(--dim)" fontSize={8} textAnchor="middle" fontFamily="monospace">{d.tenor}</text>
          <text x={scaleX(i)} y={scaleY(d.rate) - 8} fill="var(--text)" fontSize={8} textAnchor="middle" fontFamily="monospace">{d.rate?.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}
