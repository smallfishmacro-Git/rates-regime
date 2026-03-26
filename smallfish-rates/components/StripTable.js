'use client';

export default function StripTable({ strip }) {
  if (!strip?.length) return <div style={{ color: 'var(--dim)', padding: 20 }}>Loading...</div>;

  const totalContracts = strip.reduce((a, g) => a + g.contracts.length, 0);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1, marginBottom: 8 }}>
        FF STRIP — {totalContracts} CONTRACTS
        <span style={{ marginLeft: 12, fontSize: 10 }}>
          <button className="tab-btn active" style={{ fontSize: 9, padding: '2px 8px', marginRight: 4 }}>FED FUNDS</button>
          <button className="tab-btn" style={{ fontSize: 9, padding: '2px 8px' }}>SOFR</button>
        </span>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['CONTRACT', 'LAST PX', 'IMP RATE', '+/- OCR', 'PX 1D', 'PX 5D', 'PX 1M'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i > 0 ? 'right' : 'left', padding: '6px 8px', fontSize: 9,
                  color: 'var(--dim)', letterSpacing: 1, borderBottom: '1px solid var(--border)',
                  position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strip.map(group => (
              <Fragment key={group.year}>
                <tr>
                  <td colSpan={7} style={{
                    padding: '8px 8px 4px', color: 'var(--amber)', fontWeight: 'bold',
                    borderBottom: '1px solid var(--border)', fontSize: 12,
                  }}>{group.year}</td>
                </tr>
                {group.contracts.map(c => (
                  <tr key={c.ticker} className="data-row" style={{ borderBottom: '1px solid rgba(26,29,38,0.5)' }}>
                    <td style={{ padding: '5px 8px' }}>
                      <span style={{ color: 'var(--green)' }}>{c.ticker}</span>
                      <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 10 }}>{c.month}</span>
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{c.lastPx.toFixed(3)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--amber)' }}>{c.impRate.toFixed(3)}</td>
                    <td style={{
                      padding: '5px 8px', textAlign: 'right',
                      color: c.chgOCR < 0 ? 'var(--red)' : c.chgOCR > 0 ? 'var(--green)' : 'var(--dim)',
                    }}>
                      {c.chgOCR.toFixed(3)}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--dim)' }}>0.000</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--dim)' }}>0.000</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--dim)' }}>0.000</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fragment({ children }) {
  return <>{children}</>;
}
