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
  const allRates = [currentRate, ...meetings.map(m => m.postMtg || m.impliedRate)];
  const minR = Math.floor(Math.min(...allRates) * 8) / 8 - 0.1;
  const maxR = Math.ceil(Math.max(...allRates) * 8) / 8 + 0.1;
  const scaleX = (i) => pad.l + (i / meetings.length) * cw;
  const scaleY = (v) => pad.t + ch - ((v - minR) / (maxR - minR)) * ch;

  const dotMedian = dotPlot?.['2026'] || 3.40;

  // Step chart using postMtg rates
  let stepPath = `M ${scaleX(0)} ${scaleY(currentRate)}`;
  meetings.forEach((m, i) => {
    const prevRate = i === 0 ? currentRate : (meetings[i - 1].postMtg || meetings[i - 1].impliedRate);
    const thisRate = m.postMtg || m.impliedRate;
    stepPath += ` L ${scaleX(i + 0.5)} ${scaleY(prevRate)}`;
    stepPath += ` L ${scaleX(i + 0.5)} ${scaleY(thisRate)}`;
    stepPath += ` L ${scaleX(i + 1)} ${scaleY(thisRate)}`;
  });

  const fillPath = `${stepPath} L ${scaleX(meetings.length)} ${scaleY(minR)} L ${scaleX(0)} ${scaleY(minR)} Z`;

  const gridLines = [];
  for (let v = Math.ceil(minR * 4) / 4; v <= maxR; v += 0.125) gridLines.push(v);

  // Year separators
  const yearSeps = [];
  let lastYear = '';
  meetings.forEach((m, i) => {
    const yr = m.date.slice(0, 4);
    if (yr !== lastYear && lastYear !== '') yearSeps.push({ i, year: yr });
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
      {gridLines.filter((_, i) => i % 2 === 0).map(v => (
        <g key={v}>
          <line x1={pad.l} y1={scaleY(v)} x2={w - pad.r} y2={scaleY(v)} stroke="var(--grid)" strokeWidth={0.5} />
          <text x={pad.l - 5} y={scaleY(v) + 3} fill="var(--dim)" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
        </g>
      ))}
      {yearSeps.map(ys => (
        <g key={ys.year}>
          <line x1={scaleX(ys.i)} y1={pad.t} x2={scaleX(ys.i)} y2={h - pad.b} stroke="var(--dim)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4} />
          <text x={scaleX(ys.i) + 3} y={pad.t + 10} fill="var(--dim)" fontSize={8} fontFamily="monospace" opacity={0.6}>{ys.year}</text>
        </g>
      ))}
      {/* Dot plot */}
      <line x1={pad.l} y1={scaleY(dotMedian)} x2={w - pad.r} y2={scaleY(dotMedian)} stroke="var(--cyan)" strokeWidth={1} strokeDasharray="6 3" opacity={0.6} />
      <text x={w - pad.r + 2} y={scaleY(dotMedian) + 3} fill="var(--cyan)" fontSize={8} fontFamily="monospace" opacity={0.7}>DOT</text>
      {/* Current rate line */}
      <line x1={pad.l} y1={scaleY(currentRate)} x2={w - pad.r} y2={scaleY(currentRate)} stroke="var(--dim)" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.4} />
      {/* Fill + path */}
      <path d={fillPath} fill="url(#fg)" />
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={2.5} filter="url(#glow)" />
      <path d={stepPath} fill="none" stroke="var(--amber)" strokeWidth={1.5} />
      {/* Spot marker */}
      <circle cx={scaleX(0)} cy={scaleY(currentRate)} r={4} fill="var(--green)" />
      <text x={scaleX(0) + 8} y={scaleY(currentRate) + 3} fill="var(--green)" fontSize={9} fontFamily="monospace">{currentRate.toFixed(3)}</text>
      {/* Meeting dots + labels */}
      {meetings.map((m, i) => {
        const showLabel = meetings.length <= 12 || i % 2 === 0 || i === meetings.length - 1;
        const r = m.postMtg || m.impliedRate;
        return (
          <g key={m.meeting + m.date}>
            <circle cx={scaleX(i + 0.75)} cy={scaleY(r)} r={meetings.length > 20 ? 1.5 : 2.5} fill="var(--amber)" />
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
    <div style={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <Th align="left" w={70}>MTG</Th>
            <Th align="left" w={50}>CONTRACT</Th>
            <Th w={55}>RATE</Th>
            <Th w={60}>POST-MTG</Th>
            <Th w={40} color="var(--green)">-75</Th>
            <Th w={40} color="var(--green)">-50</Th>
            <Th w={40} color="var(--green)">-25</Th>
            <Th w={45} color="var(--amber)">HOLD</Th>
            <Th w={40} color="var(--red)">+25</Th>
            <Th w={40} color="var(--red)">+50</Th>
            <Th w={40} color="var(--red)">+75</Th>
            <Th w={55}>CUM</Th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, idx) => {
            const isYearBreak = idx > 0 && m.date.slice(0, 4) !== meetings[idx - 1].date.slice(0, 4);
            const cum = m.cumMoves || 0;
            const postMtgChanged = Math.abs(((m.postMtg ?? 0) - (m.rate ?? 0)) * 100) > 0.5;

            return (
              <Fragment key={m.meeting + m.date}>
                {isYearBreak && (
                  <tr>
                    <td colSpan={12} style={{
                      padding: '6px 8px 2px', fontSize: 10, color: 'var(--amber)',
                      fontWeight: 'bold', borderBottom: '1px solid var(--border)', letterSpacing: 1,
                    }}>{m.date.slice(0, 4)}</td>
                  </tr>
                )}
                <tr className="data-row" style={{ borderBottom: '1px solid rgba(26,29,38,0.5)' }}>
                  {/* Meeting date */}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{m.meeting}</td>
                  {/* Contract */}
                  <td style={{ padding: '4px 6px', color: 'var(--dim)', fontSize: 10 }}>{m.contract}</td>
                  {/* Rate going in */}
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{(m.rate ?? m.impliedRate ?? 0).toFixed(3)}</td>
                  {/* Post-meeting rate (highlighted if different) */}
                  <td style={{
                    padding: '4px 6px', textAlign: 'right',
                    color: postMtgChanged ? 'var(--amber)' : 'var(--text)',
                    fontWeight: postMtgChanged ? 'bold' : 'normal',
                  }}>{(m.postMtg ?? m.impliedRate ?? 0).toFixed(3)}</td>
                  {/* Cut columns: -75, -50, -25 */}
                  <ProbCell value={m.cut75} type="cut" />
                  <ProbCell value={m.cut50} type="cut" />
                  <ProbCell value={m.cut25} type="cut" />
                  {/* Hold */}
                  <ProbCell value={m.hold} type="hold" />
                  {/* Hike columns: +25, +50, +75 */}
                  <ProbCell value={m.hike25} type="hike" />
                  <ProbCell value={m.hike50} type="hike" />
                  <ProbCell value={m.hike75} type="hike" />
                  {/* Cumulative hikes (positive = hikes, negative = cuts) */}
                  <td style={{
                    padding: '4px 6px', textAlign: 'right',
                    color: cum > 0.05 ? 'var(--red)' : cum < -0.05 ? 'var(--green)' : 'var(--dim)',
                    fontWeight: Math.abs(cum) >= 0.5 ? 'bold' : 'normal',
                  }}>
                    {cum > 0 ? '+' : ''}{cum.toFixed(1)}
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

function Th({ children, align = 'right', color, w }) {
  return (
    <th style={{
      textAlign: align, padding: '5px 4px', fontSize: 8, letterSpacing: 0.5,
      color: color || 'var(--dim)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
      whiteSpace: 'nowrap', minWidth: w || 'auto',
    }}>{children}</th>
  );
}

function ProbCell({ value, type }) {
  const v = value || 0;
  if (v <= 0) {
    return <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>—</td>;
  }

  let color, bg;
  if (type === 'hike') {
    color = 'var(--red)';
    bg = `rgba(255,82,82,${(v / 100 * 0.45).toFixed(2)})`;
  } else if (type === 'cut') {
    color = 'var(--green)';
    bg = `rgba(0,200,83,${(v / 100 * 0.45).toFixed(2)})`;
  } else {
    color = 'var(--amber)';
    bg = `rgba(240,184,0,${(v / 100 * 0.35).toFixed(2)})`;
  }

  return (
    <td style={{ padding: '3px 4px', textAlign: 'right' }}>
      <span style={{
        padding: '1px 4px', borderRadius: 2, fontSize: 10,
        fontWeight: v > 30 ? 'bold' : 'normal',
        background: bg, color,
      }}>{v}%</span>
    </td>
  );
}

function Fragment({ children }) { return <>{children}</>; }
