'use client';

export default function MetricBoxes({ effr, terminal, meetings, sofrContracts, currentSOFR }) {
  const sofr = currentSOFR || 3.56;
  const allContracts = sofrContracts || [];

  let peakContract = null;
  let peakRate = sofr;
  let peakIdx = -1;
  let isCutting = false;

  if (meetings && meetings.length > 0) {
    meetings.forEach((m, i) => {
      const rate = m.postMtg ?? m.impliedRate ?? 0;
      if (rate > peakRate) {
        peakRate = rate;
        peakIdx = i;
        peakContract = m;
      }
    });
  }

  if (peakIdx === -1 && meetings && meetings.length > 0) {
    let troughRate = sofr;
    meetings.forEach((m, i) => {
      const rate = m.postMtg ?? m.impliedRate ?? 0;
      if (rate < troughRate) {
        troughRate = rate;
        peakIdx = i;
        peakContract = m;
        peakRate = rate;
      }
    });
    isCutting = true;
  }

  const ffrToTermBp = ((peakRate - sofr) * 100).toFixed(1);
  const m6Idx = Math.min((peakIdx >= 0 ? peakIdx : 0) + 6, (meetings?.length || 1) - 1);
  const rate6m = meetings?.[m6Idx]?.postMtg ?? meetings?.[m6Idx]?.impliedRate ?? peakRate;
  const termTo6m = ((rate6m - peakRate) * 100).toFixed(1);
  const m12Idx = Math.min((peakIdx >= 0 ? peakIdx : 0) + 12, (meetings?.length || 1) - 1);
  const rate12m = meetings?.[m12Idx]?.postMtg ?? meetings?.[m12Idx]?.impliedRate ?? peakRate;
  const termTo12m = ((rate12m - peakRate) * 100).toFixed(1);

  const termMeetingsOut = peakIdx >= 0 ? peakIdx + 1 : '?';
  const peakLabel = peakContract?.contract || '—';
  const m6Label = meetings?.[m6Idx]?.contract || '—';
  const m12Label = meetings?.[m12Idx]?.contract || '—';

  const fmtBp = (v) => { const n = parseFloat(v); return `${n >= 0 ? '+' : ''}${n}bp`; };
  const bpColor = (v) => { const n = parseFloat(v); if (Math.abs(n) < 0.5) return 'var(--dim)'; return n > 0 ? 'var(--red)' : 'var(--green)'; };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERMINAL RATE (T)</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: isCutting ? 'var(--green)' : 'var(--red)' }}>{peakRate.toFixed(3)}%</div>
        <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, lineHeight: 1.3 }}>{peakLabel} | M+{termMeetingsOut} | {isCutting ? 'TROUGH (CUTS)' : 'PEAK (HIKES PRICED)'}</div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>SOFR TO TERMINAL</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(ffrToTermBp) }}>{fmtBp(ffrToTermBp)}</div>
        <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, lineHeight: 1.3 }}>SOFR ({sofr.toFixed(3)}%) vs {peakLabel} ({peakRate.toFixed(3)}%)</div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERMINAL TO +6 MONTHS</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(termTo6m) }}>{fmtBp(termTo6m)}</div>
        <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, lineHeight: 1.3 }}>{peakLabel} ({peakRate.toFixed(3)}%) vs {m6Label} ({rate6m.toFixed(3)}%)</div>
      </div>
      <div className="metric-box">
        <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1.5, marginBottom: 2 }}>TERMINAL TO +12 MONTHS</div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: bpColor(termTo12m) }}>{fmtBp(termTo12m)}</div>
        <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 2, lineHeight: 1.3 }}>{peakLabel} ({peakRate.toFixed(3)}%) vs {m12Label} ({rate12m.toFixed(3)}%)</div>
      </div>
    </div>
  );
}
