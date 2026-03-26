'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import MetricBoxes from '@/components/MetricBoxes';
import MeetingsView from '@/components/MeetingsView';
import StripTable from '@/components/StripTable';
import SpreadsView from '@/components/SpreadsView';
import InflationPanel from '@/components/InflationPanel';
import StatusBar from '@/components/StatusBar';
import { fetchAllSOFR, computeMeetingProbs } from '@/lib/sofrClient';
import { FALLBACK_MEETINGS, FALLBACK_STRIP } from '@/lib/constants';

export default function Home() {
  const [fredData, setFredData] = useState(null);
  const [sofrResult, setSofrResult] = useState(null);
  const [sofrLoading, setSofrLoading] = useState(true);
  const [fredLoading, setFredLoading] = useState(true);
  const [stirTab, setStirTab] = useState('MEETINGS');
  const [inputKey, setInputKey] = useState('');

  const fetchFred = useCallback(async (key) => {
    setFredLoading(true);
    try {
      const url = key ? `/api/rates?key=${encodeURIComponent(key)}` : '/api/rates';
      setFredData(await (await fetch(url)).json());
    } catch (e) { console.error('FRED error:', e); }
    setFredLoading(false);
  }, []);

  const fetchSOFR = useCallback(async () => {
    setSofrLoading(true);
    try {
      const result = await fetchAllSOFR();
      setSofrResult(result);
    } catch (e) { console.error('SOFR error:', e); }
    setSofrLoading(false);
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sfm_fred_key') : null;
    if (saved) { setInputKey(saved); fetchFred(saved); } else fetchFred('');
    fetchSOFR();
  }, [fetchFred, fetchSOFR]);

  const handleConnect = () => {
    if (inputKey) { localStorage.setItem('sfm_fred_key', inputKey); fetchFred(inputKey); }
  };

  const rates = fredData?.rates || {};
  const currentEFFR = rates.EFFR || 3.58;
  const currentSOFR = rates.SOFR || 3.56;
  const sofrLive = (sofrResult?.count || 0) > 0;
  const sofrContracts = sofrResult?.contracts || [];
  const strip = sofrResult?.strip?.length ? sofrResult.strip : FALLBACK_STRIP;
  const meetings = sofrLive ? computeMeetingProbs(sofrContracts, currentEFFR) : FALLBACK_MEETINGS;
  const terminalRate = meetings[meetings.length - 1]?.impliedRate || 3.27;
  const data = { ...fredData, meetings, strip, sofrLive, sofrCount: sofrResult?.count || 0 };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header />
      <div style={{ padding: '0 16px' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1 }}>FRED API</span>
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: fredData?.live ? 'rgba(0,200,83,0.15)' : 'rgba(255,82,82,0.1)', color: fredData?.live ? 'var(--green)' : 'var(--red)' }}>
            {fredData?.live ? '● LIVE' : '○ DEMO'}
          </span>
          <input value={inputKey} onChange={e => setInputKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="Enter free FRED API key..." style={{ flex: 1, minWidth: 200, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', fontSize: 11, fontFamily: 'inherit', borderRadius: 2 }} />
          <button onClick={handleConnect} className="tab-btn active" style={{ fontSize: 10 }}>CONNECT</button>
          <span style={{ fontSize: 9, color: 'var(--dim)' }}>Free key → <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>fred.stlouisfed.org</a></span>
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text)', letterSpacing: 2 }}>US STIR</span>
            <span style={{ color: 'var(--amber)', fontSize: 13, fontWeight: 'bold' }}>SOFR {currentSOFR.toFixed(2)}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {['MEETINGS', 'STRIP', 'SPREADS'].map(t => (
                <button key={t} className={`tab-btn ${stirTab === t ? 'active' : ''}`} onClick={() => setStirTab(t)}>{t}</button>
              ))}
            </div>
          </div>
          <MetricBoxes effr={currentEFFR} terminal={terminalRate} meetings={meetings} />
          <div style={{ marginTop: 12 }} className="fade-in">
            {stirTab === 'MEETINGS' && <MeetingsView meetings={meetings} dotPlot={data?.dotPlot} effr={currentEFFR} />}
            {stirTab === 'STRIP' && <StripTable strip={strip} sofrLive={sofrLive} sofrLoading={sofrLoading} currentSOFR={currentSOFR} />}
            {stirTab === 'SPREADS' && <SpreadsView rates={rates} />}
          </div>
        </div>
        <InflationPanel data={data} />
      </div>
      <StatusBar data={data} loading={fredLoading || sofrLoading} sofrLoading={sofrLoading} />
    </div>
  );
}
