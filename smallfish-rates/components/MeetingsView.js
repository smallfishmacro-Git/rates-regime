'use client';

export default function MeetingsView({ meetings, dotPlot, effr }) {
  if (!meetings.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>
        FED FUNDS IMPLIED PATH — {meetings.length} MEETINGS
      </div>
      <ImpliedPathChart meetings={meetings} effr={effr} dotPlot={dotPlot} />
      <div style={{ marginTop: 14 }}>
        <ProbabilityTable meetings={meetings} />
      </div>
    </div>
  );
}

function ImpliedPathChart({ meetings, effr, dotPlot }) {
  const w = 560, h = 250, pad = { t: 20, r: 25, b: 55, l: 50 };
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

  const fillPath = `${stepPath} L ${scaleX(meetings.length)} ${scaleY(minR)} L ${scaleX(0)} ${scaleY(minR)} Z`;

  const gridLines = [];
  for (let v = Math.ceil(minR * 4) / 4; v <= maxR; v += 0.125) gridLines.push(v);

  // Year separator lines
  const yearSeps = [];
  let lastYear = '';
  meetings.forEach((m, i) => {
    const yr = m.date.slice(0, 4);
    if (yr !== lastYear && lastYear !== '') {
      yearSeps.push({ i, year: yr });
    }
    lastYear = yr;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 250 }}>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity=".12" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity=".01" />
        </linearGradient>
      </defs>
      {/* Grid */}
      {gridLines.filter((_, i) => i % 2 === 0).map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5} />
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
        </g>
      ))}
      {/* Year separators */}
      {yearSeps.map(ys => (
        <g key={ys.year}>
          <line x1={scaleX(ys.i)} y1={pad.t} x2={scaleX(ys.i)} y2={h - pad.b} stroke="var(--dim)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4} />
          <text x={scaleX(ys.i) + 3} y={pad.t + 10} fill="var(--dim)" fontSize={8} fontFamily="monospace" opacity={0.6}>{ys.year}</text>
        </g>
      ))}
      {/* Dot plot median line */}
      <line x1={pad.l} y1={scaleY(dotMedian)} x2={w - pad.r} y2={scaleY(dotMedian)} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="6 3" opacity={0.6} />
      <text x={w - pad.r + 2} y={scaleY(dotMedian) + 3} fill="var(--cyan)" fontSize={8} fontFamily="monospace" opacity={0.7}>DOT</text>
      {/* Current EFFR line */}
      <line x1={pad.l} y1={scaleY(currentRate)} x2={w - pad.r} y2={scaleY(currentRate)} stroke="var(--dim)" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.4} />
      {/* Fill */}
      <path d={fillPath} fill="url(#fg)" />
      {/* Step path */}
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={2.5} filter="url(#glow)" />
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={1.5} />
      {/* Current rate marker */}
      <circle cx={scaleX(0)} cy={scaleY(currentRate)} r={4} fill="var(--green)" />
      <text x={scaleX(0) + 8} y={scaleY(currentRate) + 3} fill="var(--green)" fontSize={9} fontFamily="monospace">{currentRate.toFixed(3)}</text>
      {/* Meeting labels — show every Nth depending on count */}
      {meetings.map((m, i) => {
        const showLabel = meetings.length <= 12 || i % 2 === 0 || i === meetings.length - 1;
        return (
          <g key={m.meeting + m.date}>
            <circle cx={scaleX(i + 0.75)} cy={scaleY(m.impliedRate)} r={meetings.length > 20 ? 1.5 : 2.5} fill="var(--amber)" />
            {showLabel && (
              <text x={scaleX(i + 0.5)} y={h - 10} fill="var(--dim)" fontSize={6} textAnchor="middle" fontFamily="monospace"
                transform={`rotate(-45, ${scaleX(i + 0.5)}, ${h - 10})`}>{m.meeting}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ProbabilityTable({ meetings }) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {/* Left columns */}
            <Th align="left">MEETING</Th>
            <Th align="left">CONTRACT</Th>
            <Th>IMP RATE</Th>
            {/* Hike columns */}
            <Th color="var(--red)">HIKE 75</Th>
            <Th color="var(--red)">HIKE 50</Th>
            <Th color="var(--red)">HIKE 25</Th>
            {/* Hold */}
            <Th color="var(--amber)">HOLD</Th>
            {/* Cut columns */}
            <Th color="var(--green)">CUT 25</Th>
            <Th color="var(--green)">CUT 50</Th>
            <Th color="var(--green)">CUT 75</Th>
            {/* Net */}
            <Th>NET MOVES</Th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, idx) => {
            const isYearBreak = idx > 0 && m.date.slice(0, 4) !== meetings[idx - 1].date.slice(0, 4);
            const cumMoves = parseFloat(m.cumMoves || 0);
            const isHiking = cumMoves < -0.01;
            const isCutting = cumMoves > 0.01;

            return (
              <Fragment key={m.meeting + m.date}>
                {isYearBreak && (
                  <tr>
                    <td colSpan={11} style={{
                      padding: '6px 8px 2px', fontSize: 10, color: 'var(--amber)',
                      fontWeight: 'bold', borderBottom: '1px solid var(--border)',
                      letterSpacing: 1,
                    }}>{m.date.slice(0, 4)}</td>
                  </tr>
                )}
                <tr className="data-row" style={{ borderBottom: '1px solid rgba(26,29,38,0.5)' }}>
                  <td style={{ padding: '5px 8px' }}>{m.meeting}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--dim)' }}>{m.contract}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--amber)' }}>{m.impliedRate.toFixed(3)}</td>
                  {/* Hike columns */}
                  <ProbCell value={m.hike75} type="hike" />
                  <ProbCell value={m.hike50} type="hike" />
                  <ProbCell value={m.hike25} type="hike" />
                  {/* Hold */}
                  <ProbCell value={m.hold} type="hold" />
                  {/* Cut columns */}
                  <ProbCell value={m.cut25} type="cut" />
                  <ProbCell value={m.cut50} type="cut" />
                  <ProbCell value={m.cut75 || 0} type="cut" />
                  {/* Net moves */}
                  <td style={{
                    padding: '5px 8px', textAlign: 'right',
                    color: isCutting ? 'var(--green)' : isHiking ? 'var(--red)' : 'var(--dim)',
                    fontWeight: Math.abs(cumMoves) > 0.5 ? 'bold' : 'normal',
                  }}>
                    {cumMoves > 0 ? '-' : cumMoves < 0 ? '+' : ''}{Math.abs(cumMoves).toFixed(1)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'right', color }) {
  return (
    <th style={{
      textAlign: align, padding: '6px 6px', fontSize: 8, letterSpacing: 0.5,
      color: color || 'var(--dim)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
      whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function ProbCell({ value, type }) {
  const v = value || 0;
  let color, bg;

  if (type === 'hike') {
    color = v > 0 ? 'var(--red)' : 'var(--dim)';
    bg = v > 0 ? `rgba(255,82,82,${(v / 100 * 0.4).toFixed(2)})` : 'transparent';
  } else if (type === 'cut') {
    color = v > 0 ? 'var(--green)' : 'var(--dim)';
    bg = v > 0 ? `rgba(0,200,83,${(v / 100 * 0.4).toFixed(2)})` : 'transparent';
  } else {
    // hold
    color = v > 0 ? 'var(--amber)' : 'var(--dim)';
    bg = v > 0 ? `rgba(240,184,0,${(v / 100 * 0.3).toFixed(2)})` : 'transparent';
  }

  return (
    <td style={{
      padding: '4px 6px', textAlign: 'right',
    }}>
      <span style={{
        padding: '1px 5px', borderRadius: 2, fontSize: 10,
        fontWeight: v > 20 ? 'bold' : 'normal',
        background: bg, color,
      }}>
        {v > 0 ? `${v}%` : '—'}
      </span>
    </td>
  );
}

function Fragment({ children }) { return <>{children}</>; }
