'use client';

export default function StatusBar({ data, loading }) {
  const lastUpdate = data?.lastUpdate ? new Date(data.lastUpdate).toLocaleString() : '—';

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      margin: '16px 16px 0', padding: '8px 0', borderTop: '1px solid var(--border)',
      flexWrap: 'wrap', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 9, color: 'var(--dim)', flexWrap: 'wrap' }}>
        <span>FRED: <span style={{ color: data?.live ? 'var(--green)' : 'var(--red)' }}>
          {data?.live ? '● LIVE' : '○ DEMO'}
        </span></span>
        <span>|</span>
        <span>SOFR FUTURES: <span style={{ color: data?.sofrLive ? 'var(--green)' : 'var(--red)' }}>
          {data?.sofrLive ? `● YAHOO (${data?.sofrCount || 0} contracts)` : '○ FALLBACK'}
        </span></span>
        <span>|</span>
        <span>UPDATED: {lastUpdate}</span>
        {loading && (
          <>
            <span>|</span>
            <span className="glow-pulse" style={{ color: 'var(--amber)' }}>LOADING...</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 9, color: 'var(--dim)' }}>
        <a href="https://smallfish-btd.vercel.app/" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--dim)', textDecoration: 'none' }}>BTD</a>
        <a href="https://smallfish-market-risk.vercel.app/" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--dim)', textDecoration: 'none' }}>MKT RISK</a>
        <span>|</span>
        <span style={{ color: 'var(--amber)', letterSpacing: 1 }}>SMALLFISHMACRO TERMINAL v1.0</span>
      </div>
    </div>
  );
}
