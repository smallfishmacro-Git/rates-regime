'use client';

import { useState, useMemo } from 'react';
import { FALLBACK_RATES } from '@/lib/constants';

const RANGE_MONTHS = { '1M': 1, '3M': 3, '6M': 6, 'YTD': null, '1Y': 12, '2Y': 24, '5Y': 60, 'ALL': null };

export default function InflationPanel({ data }) {
  const [fvTab, setFvTab] = useState('CPI');
  const [inflMetric, setInflMetric] = useState('yoy');
  const [rangeFilter, setRangeFilter] = useState('2Y');
  const [projectionType, setProjectionType] = useState('MOM_YOY');

  const rates = { ...FALLBACK_RATES, ...data?.rates };

  let fullData = data?.cpi || [];
  if (fvTab === 'CORE CPI' && data?.coreCpi?.length) fullData = data.coreCpi;
  if (fvTab === 'PCE' && data?.pce?.length) fullData = data.pce;
  if (fvTab === 'CORE PCE' && data?.corePce?.length) fullData = data.corePce;

  const latest = fullData[fullData.length - 1] || { date: '—', yoy: 0, mom: 0 };

  const chartData = useMemo(() => {
    if (!fullData.length) return [];
    if (rangeFilter === 'ALL') return fullData;
    if (rangeFilter === 'YTD') {
      const lastDate = fullData[fullData.length - 1]?.date || '';
      const year = lastDate.slice(0, 4);
      return fullData.filter(d => d.date?.startsWith(year));
    }
    const months = RANGE_MONTHS[rangeFilter];
    return months ? fullData.slice(-months) : fullData;
  }, [fullData, rangeFilter]);

  const projections = useMemo(() => {
    if (projectionType !== 'MOM_YOY' || !fullData.length) return null;
    return computeProjections(fullData);
  }, [projectionType, fullData]);

  const momVal = latest.mom ?? 0;
  const momColor = momVal >= 0.4 ? 'var(--red)' : momVal <= 0.2 ? 'var(--green)' : 'var(--amber)';

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 2 }}>FAIR VALUE MODEL</span>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {['CPI', 'PCE', 'CORE CPI', 'CORE PCE'].map(t => (
          <button key={t} className={`tab-btn ${fvTab === t ? 'active' : ''}`}
            onClick={() => setFvTab(t)} style={{ fontSize: 10, padding: '4px 10px' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--dim)' }}>LATEST: <span style={{ color: 'var(--text)' }}>{latest.date}</span></span>
        <span style={{ color: 'var(--dim)' }}>MoM: <span style={{ color: momColor }}>
          {momVal >= 0 ? '+' : ''}{momVal.toFixed(1)}%
        </span></span>
        <span style={{ color: 'var(--dim)' }}>YoY: <span style={{ color: 'var(--amber)' }}>{(latest.yoy ?? 0).toFixed(1)}%</span></span>
      </div>

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

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, flexWrap: 'wrap' }}>
        {Object.keys(RANGE_MONTHS).map(r => (
          <button key={r} className={`tab-btn ${rangeFilter === r ? 'active' : ''}`}
            onClick={() => setRangeFilter(r)}
            style={{ fontSize: 8, padding: '2px 6px' }}>
            {r}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { id: 'MOM_YOY', label: 'MOM→YOY' },
          { id: 'YOY_SPEED', label: 'YOY SPEED' },
          { id: 'FF_RATE', label: 'FF RATE' },
        ].map(p => (
          <button key={p.id} className={`tab-btn ${projectionType === p.id ? 'active' : ''}`}
            onClick={() => setProjectionType(p.id)}
            style={{ fontSize: 8, padding: '2px 6px' }}>
            {p.label}
          </button>
        ))}
      </div>

      {projectionType === 'MOM_YOY' && (
        <div style={{ fontSize: 8, color: 'var(--dim)', marginBottom: 6, fontStyle: 'italic' }}>
          Model A: Grows index at recent MoM pace (1M/2M/3M avg), computes YoY vs actual index 12mo prior
        </div>
      )}
      {projectionType === 'YOY_SPEED' && (
        <div style={{ fontSize: 8, color: 'var(--dim)', marginBottom: 6, fontStyle: 'italic' }}>
          YoY Speed: month-over-month change in YoY rate (acceleration/deceleration)
        </div>
      )}
      {projectionType === 'FF_RATE' && (
        <div style={{ fontSize: 8, color: 'var(--dim)', marginBottom: 6, fontStyle: 'italic' }}>
          FF Rate overlay: Effective Fed Funds Rate plotted against inflation
        </div>
      )}

      {chartData.length > 0 && (
        <InflationChart
          data={chartData}
          metric={inflMetric}
          projectionType={projectionType}
          projections={projections}
          effr={rates.EFFR}
        />
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, flexWrap: 'wrap' }}>
        {projectionType !== 'YOY_SPEED' && (
          <LegendItem color="var(--amber)" label={`${inflMetric.toUpperCase()} Actual`} />
        )}
        {inflMetric === 'yoy' && projectionType !== 'YOY_SPEED' && (
          <LegendItem color="var(--red)" label="2% Target" dashed />
        )}
        {projectionType === 'MOM_YOY' && inflMetric === 'yoy' && (
          <>
            <LegendItem color="var(--cyan)" label="1M MoM Proj" dashed />
            <LegendItem color="#ff8c00" label="2M MoM Avg" dashed />
            <LegendItem color="var(--green)" label="3M MoM Avg" dashed />
          </>
        )}
        {projectionType === 'YOY_SPEED' && (
          <LegendItem color="var(--cyan)" label="YoY Speed (Δ%)" />
        )}
        {projectionType === 'FF_RATE' && (
          <LegendItem color="var(--cyan)" label={`EFFR (${(rates.EFFR ?? 0).toFixed(2)}%)`} dashed />
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>KEY RATES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'EFFR', value: rates.EFFR, unit: '%' },
            { label: 'SOFR', value: rates.SOFR, unit: '%' },
            { label: 'UST 2Y', value: rates.DGS2, unit: '%' },
            { label: 'UST 10Y', value: rates.DGS10, unit: '%' },
            { label: 'UST 30Y', value: rates.DGS30, unit: '%' },
            { label: '2s10s', value: rates.T10Y2Y != null ? (rates.T10Y2Y * 100).toFixed(0) : '44', unit: 'bp', raw: true },
          ].map(r => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', padding: '4px 8px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2,
            }}>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{r.label}</span>
              <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 'bold' }}>
                {r.raw ? r.value : (r.value ?? 0).toFixed(2)}{r.unit}
              </span>
            </div>
          ))}
        </div>
      </div>

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
                {(r.value ?? 0).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function computeProjections(data) {
  if (!data.length) return null;
  const index = [100];
  for (let i = 0; i < data.length; i++) {
    const mom = data[i].mom ?? 0;
    index.push(index[index.length - 1] * (1 + mom / 100));
  }

  const projectAt = (monthsAvg) => {
    if (data.length < monthsAvg) return null;
    const recent = data.slice(-monthsAvg).map(d => d.mom ?? 0);
    const avgMoM = recent.reduce((a, b) => a + b, 0) / recent.length;
    const projections = [];
    let projIndex = index[index.length - 1];
    for (let i = 1; i <= 12; i++) {
      projIndex = projIndex * (1 + avgMoM / 100);
      const priorIdx = index.length - 1 - 12 + i;
      const priorIndex = index[priorIdx];
      if (priorIndex) {
        projections.push({ monthOffset: i, yoy: (projIndex / priorIndex - 1) * 100 });
      }
    }
    return { avgMoM, projections };
  };

  return { p1: projectAt(1), p2: projectAt(2), p3: projectAt(3) };
}

function InflationChart({ data, metric, projectionType, projections, effr }) {
  const w = 700, h = 220, pad = { t: 20, r: 35, b: 35, l: 45 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  const showProjection = projectionType === 'MOM_YOY' && metric === 'yoy' && projections;
  const totalPoints = showProjection ? data.length + 12 : data.length;

  const yoySpeed = data.map((d, i) => i > 0 ? (d.yoy ?? 0) - (data[i - 1].yoy ?? 0) : 0);
  const actualVals = data.map(d => d[metric] ?? 0);

  let allVals = [...actualVals];
  if (metric === 'yoy' && projectionType !== 'YOY_SPEED') allVals.push(2.0);
  if (showProjection) {
    [projections.p1, projections.p2, projections.p3].forEach(p => {
      if (p?.projections) allVals.push(...p.projections.map(x => x.yoy));
    });
  }
  if (projectionType === 'FF_RATE' && effr != null) allVals.push(effr);

  let minV, maxV;
  if (projectionType === 'YOY_SPEED') {
    const speedAbs = Math.max(0.5, ...yoySpeed.map(Math.abs));
    minV = -speedAbs - 0.1;
    maxV = speedAbs + 0.1;
  } else if (metric === 'mom') {
    minV = Math.min(-0.2, ...allVals) - 0.1;
    maxV = Math.max(0.6, ...allVals) + 0.1;
  } else {
    minV = Math.floor(Math.min(...allVals) * 2) / 2 - 0.5;
    maxV = Math.ceil(Math.max(...allVals) * 2) / 2 + 0.5;
  }

  const scaleX = (i) => pad.l + (i / Math.max(1, totalPoints - 1)) * cw;
  const scaleY = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;

  const target = metric === 'yoy' && projectionType !== 'YOY_SPEED' ? 2.0 : null;
  const gridStep = projectionType === 'YOY_SPEED' ? 0.25 : metric === 'mom' ? 0.1 : 0.5;
  const gridLines = [];
  for (let v = Math.ceil(minV / gridStep) * gridStep; v <= maxV; v += gridStep) gridLines.push(v);

  const actualPts = actualVals.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ');
  const speedPts = yoySpeed.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ');

  const projLine = (proj) => {
    if (!proj?.projections?.length) return '';
    const lastIdx = data.length - 1;
    const pts = [`${scaleX(lastIdx)},${scaleY(actualVals[lastIdx])}`];
    proj.projections.forEach((p, j) => {
      pts.push(`${scaleX(lastIdx + 1 + j)},${scaleY(p.yoy)}`);
    });
    return pts.join(' ');
  };

  const showEvery = data.length > 36 ? 6 : data.length > 18 ? 3 : data.length > 6 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="inflFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {gridLines.map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5} />
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">
            {v.toFixed(projectionType === 'YOY_SPEED' || metric === 'mom' ? 2 : 1)}
          </text>
        </g>
      ))}

      {projectionType === 'YOY_SPEED' && (
        <line x1={pad.l} y1={scaleY(0)} x2={w - pad.r} y2={scaleY(0)}
          stroke="var(--dim)" strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
      )}

      {target != null && (
        <line x1={pad.l} y1={scaleY(target)} x2={w - pad.r} y2={scaleY(target)}
          stroke="var(--red)" strokeWidth={1.2} strokeDasharray="8 4" opacity={0.7} />
      )}

      {showProjection && (
        <line x1={scaleX(data.length - 1)} y1={pad.t} x2={scaleX(data.length - 1)} y2={h - pad.b}
          stroke="var(--dim)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
      )}

      {projectionType !== 'YOY_SPEED' && (
        <polygon
          points={`${scaleX(0)},${scaleY(minV)} ${actualPts} ${scaleX(data.length - 1)},${scaleY(minV)}`}
          fill="url(#inflFill)"
        />
      )}

      {projectionType === 'YOY_SPEED' && (
        <polyline points={speedPts} fill="none" stroke="var(--cyan)" strokeWidth={1.6} />
      )}

      {showProjection && (
        <>
          {projections.p3 && <polyline points={projLine(projections.p3)} fill="none" stroke="var(--green)" strokeWidth={1.4} strokeDasharray="4 2" opacity={0.85} />}
          {projections.p2 && <polyline points={projLine(projections.p2)} fill="none" stroke="#ff8c00" strokeWidth={1.4} strokeDasharray="4 2" opacity={0.85} />}
          {projections.p1 && <polyline points={projLine(projections.p1)} fill="none" stroke="var(--cyan)" strokeWidth={1.4} strokeDasharray="4 2" opacity={0.85} />}
        </>
      )}

      {projectionType === 'FF_RATE' && effr != null && (
        <>
          <line x1={pad.l} y1={scaleY(effr)} x2={w - pad.r} y2={scaleY(effr)}
            stroke="var(--cyan)" strokeWidth={1.4} strokeDasharray="6 3" opacity={0.85} />
          <text x={w - pad.r + 2} y={scaleY(effr) + 3} fill="var(--cyan)" fontSize={8} fontFamily="monospace" opacity={0.8}>
            EFFR
          </text>
        </>
      )}

      {projectionType !== 'YOY_SPEED' && (
        <polyline points={actualPts} fill="none" stroke="var(--amber)" strokeWidth={1.8} />
      )}

      {data.map((d, i) => (
        i % showEvery === 0 && (
          <text key={d.date} x={scaleX(i)} y={h - 8} fill="var(--dim)" fontSize={7} textAnchor="middle" fontFamily="monospace">
            {d.date?.slice(2) || ''}
          </text>
        )
      ))}

      {projectionType !== 'YOY_SPEED' && actualVals.length > 0 && (
        <>
          <circle cx={scaleX(data.length - 1)} cy={scaleY(actualVals[actualVals.length - 1])} r={3} fill="var(--amber)" />
          <text x={scaleX(data.length - 1) - 5} y={scaleY(actualVals[actualVals.length - 1]) - 6}
            fill="var(--amber)" fontSize={9} textAnchor="end" fontFamily="monospace" fontWeight="bold">
            {(actualVals[actualVals.length - 1] ?? 0).toFixed(1)}%
          </text>
        </>
      )}
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
      }} />
      {label}
    </span>
  );
}
