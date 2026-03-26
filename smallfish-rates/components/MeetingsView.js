'use client';

export default function MeetingsView({ meetings, dotPlot, effr }) {
  if (!meetings.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>
        FED FUNDS IMPLIED PATH
      </div>
      <ImpliedPathChart meetings={meetings} effr={effr} dotPlot={dotPlot} />
      <div style={{ marginTop: 14 }}>
        <ProbabilityTable meetings={meetings} />
      </div>
    </div>
  );
}

function ImpliedPathChart({ meetings, effr, dotPlot }) {
  const w = 560, h = 230, pad = { t: 20, r: 25, b: 45, l: 50 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const currentRate = effr || 3.58;
  const allRates = [currentRate, ...meetings.map(m => m.impliedRate)];
  const minR = Math.floor(Math.min(...allRates) * 8) / 8 - 0.1;
  const maxR = Math.ceil(Math.max(...allRates) * 8) / 8 + 0.1;
  const scaleX = (i) => pad.l + (i / meetings.length) * cw;
  const scaleY = (v) => pad.t + ch - ((v - minR) / (maxR - minR)) * ch;

  const dotMedian = dotPlot?.['2026'] || 3.40;

  // Step chart path
  let stepPath = `M ${scaleX(0)} ${scaleY(currentRate)}`;
  meetings.forEach((m, i) => {
    const prevRate = i === 0 ? currentRate : meetings[i - 1].impliedRate;
    stepPath += ` L ${scaleX(i + 0.5)} ${scaleY(prevRate)}`;
    stepPath += ` L ${scaleX(i + 0.5)} ${scaleY(m.impliedRate)}`;
    stepPath += ` L ${scaleX(i + 1)} ${scaleY(m.impliedRate)}`;
  });

  // Fill path
  const fillPath = `${stepPath} L ${scaleX(meetings.length)} ${scaleY(minR)} L ${scaleX(0)} ${scaleY(minR)} Z`;

  // Grid
  const gridLines = [];
  for (let v = Math.ceil(minR * 4) / 4; v <= maxR; v += 0.125) {
    gridLines.push(v);
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 230 }}>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {/* Grid */}
      {gridLines.filter((_, i) => i % 2 === 0).map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5}/>
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
        </g>
      ))}
      {/* Dot plot median line */}
      <line x1={pad.l} y1={scaleY(dotMedian)} x2={w - pad.r} y2={scaleY(dotMedian)} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="6 3" opacity={0.6}/>
      <text x={w - pad.r + 2} y={scaleY(dotMedian) + 3} fill="var(--cyan)" fontSize={8} fontFamily="monospace" opacity={0.7}>DOT</text>
      {/* Fill */}
      <path d={fillPath} fill="url(#fillGrad)"/>
      {/* Step path */}
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={2.5} filter="url(#glow)"/>
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={1.5}/>
      {/* Current rate marker */}
      <circle cx={scaleX(0)} cy={scaleY(currentRate)} r={4} fill="var(--green)"/>
      <text x={scaleX(0) + 8} y={scaleY(currentRate) + 3} fill="var(--green)" fontSize={9} fontFamily="monospace">{currentRate.toFixed(3)}</text>
      {/* Meeting points & labels */}
      {meetings.map((m, i) => (
        <g key={m.meeting}>
          <circle cx={scaleX(i + 0.75)} cy={scaleY(m.impliedRate)} r={2.5} fill="var(--amber)"/>
          <text x={scaleX(i + 0.5)} y={h - 10} fill="var(--dim)" fontSize={7} textAnchor="middle" fontFamily="monospace"
            transform={`rotate(-35, ${scaleX(i + 0.5)}, ${h - 10})`}>{m.meeting}</text>
        </g>
      ))}
    </svg>
  );
}

function ProbabilityTable({ meetings }) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {['MEETING', 'CONTRACT', 'IMP RATE', 'HOLD', 'CUT 25', 'CUT 50', 'CUM CUTS'].map((h, i) => (
              <th key={h} style={{
                textAlign: i > 1 ? 'right' : 'left', padding: '6px 8px', fontSize: 9,
                color: 'var(--dim)', letterSpacing: 1, borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map(m => (
            <tr key={m.meeting} className="data-row" style={{ borderBottom: '1px solid rgba(26,29,38,0.5)' }}>
              <td style={{ padding: '5px 8px' }}>{m.meeting}</td>
              <td style={{ padding: '5px 8px', color: 'var(--dim)' }}>{m.contract}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--amber)' }}>{m.impliedRate.toFixed(3)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                <ProbBadge value={m.hold} type="hold"/>
              </td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                <ProbBadge value={m.cut25} type="cut"/>
              </td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                <ProbBadge value={m.cut50} type="cut"/>
              </td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: parseFloat(m.cumCuts) > 0.5 ? 'var(--green)' : 'var(--dim)' }}>
                {m.cumCuts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbBadge({ value, type }) {
  const color = type === 'hold'
    ? 'var(--amber)'
    : value > 20 ? 'var(--green)' : 'var(--dim)';
  const bg = type === 'hold'
    ? `rgba(240,184,0,${value / 100 * 0.3})`
    : value > 30 ? `rgba(0,200,83,${value / 100 * 0.4})` : 'transparent';

  return (
    <span style={{
      padding: '1px 6px', borderRadius: 2, fontSize: 10,
      fontWeight: 'bold', background: bg, color,
    }}>
      {value}%
    </span>
  );
}
