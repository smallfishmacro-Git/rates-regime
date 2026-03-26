'use client';

export default function MetricBoxes({ effr, terminal, terminalContract, meetings }) {
  const ffrToTerm = ((terminal - effr) * 100).toFixed(1);
  const m6 = meetings[3]?.impliedRate;
  const m12 = meetings[meetings.length - 1]?.impliedRate;
  const term6m = m6 ? ((m6 - effr) * 100).toFixed(1) : '—';
  const term12m = m12 ? ((m12 - effr) * 100).toFixed(1) : '—';

  const fmtBp = (v) => {
    if (v === '—') return '—';
    const n = parseFloat(v);
    return `${n >= 0 ? '+' : ''}${n}bp`;
  };

  const bpColor = (v) => {
    if (v === '—') return 'var(--dim)';
    return parseFloat(v) < 0 ? 'var(--red)' : 'var(--green)';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERMINAL</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--green)' }}>{terminal.toFixed(3)}%</div>
        <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 1 }}>
          {terminalContract || meetings[meetings.length - 1]?.contract || 'FFM7'} M+{meetings.length || 10}
        </div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>EFFR→TERM</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(ffrToTerm) }}>{fmtBp(ffrToTerm)}</div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERM→+6M</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(term6m) }}>{fmtBp(term6m)}</div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERM→+12M</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(term12m) }}>{fmtBp(term12m)}</div>
      </div>
    </div>
  );
}
