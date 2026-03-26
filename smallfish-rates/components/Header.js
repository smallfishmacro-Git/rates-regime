'use client';

import { useState } from 'react';

const MAIN_TABS = ['RATES REGIME', 'BUY THE DIP', 'MARKET RISK'];
const SUB_TABS = ['DASHBOARD', 'REGIME MAP', 'CROSS-ASSET', 'EQUITIES', 'NEWS', 'BRIEFING'];

const EXTERNAL_LINKS = {
  'BUY THE DIP': 'https://smallfish-btd.vercel.app/',
  'MARKET RISK': 'https://smallfish-market-risk.vercel.app/',
};

export default function Header() {
  const [activeMain] = useState('RATES REGIME');
  const [activeSub, setActiveSub] = useState('DASHBOARD');

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <header style={{ padding: '0 16px' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="var(--amber)" strokeWidth="1.5" fill="none"/>
              <path d="M8 14c1-2 2-3 4-3s3 1 4 3" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="9" cy="9" r="1" fill="var(--amber)"/>
              <circle cx="15" cy="9" r="1" fill="var(--amber)"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--amber)', letterSpacing: 3 }}>
              SMALLFISHMACRO
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text)', letterSpacing: 2, fontWeight: 'bold' }}>
            TERMINAL
          </span>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>v1.0</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 10 }}>
          <span style={{ color: 'var(--dim)' }}>US</span>
          <span style={{ color: 'var(--dim)' }}>NOM + REAL + INF SWAPS</span>
          <span style={{ color: 'var(--amber)' }}>{dateStr}</span>
          <span style={{ color: 'var(--dim)' }}>{timeStr}</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--dim)', padding: '3px 10px', fontSize: 10,
              cursor: 'pointer', fontFamily: 'inherit', borderRadius: 2,
              letterSpacing: 1,
            }}
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Main nav tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        padding: '6px 0',
      }}>
        {MAIN_TABS.map((tab) => {
          const isActive = tab === activeMain;
          const isExternal = EXTERNAL_LINKS[tab];
          return (
            <a
              key={tab}
              href={isExternal || '#'}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              style={{
                fontSize: 11, padding: '6px 20px', letterSpacing: 1.5,
                color: isActive ? 'var(--amber)' : 'var(--dim)',
                borderBottom: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                textDecoration: 'none', cursor: 'pointer',
                fontWeight: isActive ? 'bold' : 'normal',
                transition: 'all 0.2s',
              }}
            >
              {tab}
              {isExternal && <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.5 }}>↗</span>}
            </a>
          );
        })}
      </div>

      {/* Sub nav tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        padding: '4px 0', marginBottom: 12,
      }}>
        {SUB_TABS.map((tab) => (
          <span
            key={tab}
            onClick={() => setActiveSub(tab)}
            style={{
              fontSize: 10, padding: '5px 16px', letterSpacing: 1,
              color: tab === activeSub ? 'var(--text)' : 'var(--dim)',
              borderBottom: tab === activeSub ? '1px solid var(--amber)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab}
          </span>
        ))}
      </div>
    </header>
  );
}
