'use client';
import { useState } from 'react';

const YC = {
  2026: { bg: 'rgba(255,82,82,0.06)', border: 'rgba(255,82,82,0.15)', accent: '#ff5252' },
  2027: { bg: 'rgba(240,184,0,0.06)', border: 'rgba(240,184,0,0.15)', accent: '#f0b800' },
  2028: { bg: 'rgba(0,188,212,0.06)', border: 'rgba(0,188,212,0.15)', accent: '#00bcd4' },
  2029: { bg: 'rgba(0,200,83,0.06)', border: 'rgba(0,200,83,0.15)', accent: '#00c853' },
  2030: { bg: 'rgba(156,39,176,0.06)', border: 'rgba(156,39,176,0.15)', accent: '#9c27b0' },
};
const DY = { bg: 'transparent', border: 'var(--border)', accent: 'var(--dim)' };
function ht(bp,mx){if(bp==null||Math.abs(bp)<0.3)return'transparent';const i=Math.min(Math.abs(bp)/(mx||1),1);return bp>0?`rgba(255,82,82,${(i*.4).toFixed(2)})`:`rgba(0,200,83,${(i*.4).toFixed(2)})`;}
function ch(bp,mx){if(bp==null)return'transparent';const i=Math.min(Math.abs(bp)/(mx||1),1);return bp>0?`rgba(0,200,83,${(i*.3).toFixed(2)})`:`rgba(255,82,82,${(i*.3).toFixed(2)})`;}
function bc(bp){return bp==null||Math.abs(bp)<0.3?'var(--dim)':bp>0?'var(--red)':'var(--green)';}
function cc(bp){return bp==null?'var(--dim)':bp>0?'var(--green)':bp<-1?'var(--red)':'var(--dim)';}
function fb(bp){if(bp==null)return'—';if(Math.abs(bp)<0.05)return'0.0';return`${bp>0?'+':''}${bp.toFixed(1)}`;}
function fv(v){if(!v)return'—';if(v>=1e6)return`${(v/1e6).toFixed(1)}M`;if(v>=1e3)return`${Math.round(v/1e3)}K`;return String(v);}

function ChartPopup({c, onClose, sofr}) {
  const h1y = c.history1y || c.history;
  if (!h1y || h1y.length < 5) return null;
  const W=640,H=360,P={t:30,r:55,b:40,l:55};
  const CW=W-P.l-P.r,CH=H-P.t-P.b;
  const pr=h1y.map(p=>p.close);
  const mn=Math.floor(Math.min(...pr)*4)/4-.125,mx=Math.ceil(Math.max(...pr)*4)/4+.125;
  const sx=i=>P.l+(i/(h1y.length-1))*CW;
  const sy=v=>P.t+CH-((v-mn)/(mx-mn))*CH;
  const spx=100-(sofr||3.63);
  const last=h1y[h1y.length-1];
  const ir=(100-last.close).toFixed(3);
  const pts=h1y.map((p,i)=>`${sx(i)},${sy(p.close)}`).join(' ');
  const lvs=[{l:'+75bp cut',d:.75,c:'#00c853'},{l:'+50bp cut',d:.50,c:'#00c853'},{l:'+25bp cut',d:.25,c:'#00c853'},{l:'SOFR SPOT',d:0,c:'#f0b800'},{l:'-25bp hike',d:-.25,c:'#ff5252'},{l:'-50bp hike',d:-.50,c:'#ff5252'},{l:'-75bp hike',d:-.75,c:'#ff5252'}];
  const gr=[];for(let v=Math.ceil(mn/.25)*.25;v<=mx;v+=.25)gr.push(v);
  const ml=[];let lm='';h1y.forEach((p,i)=>{const m=p.date.slice(0,7);if(m!==lm){ml.push({i,l:p.date.slice(2,7)});lm=m;}});
  const yc=YC[c.year]||DY;

  return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'#0d0f14',border:'1px solid #1a1d26',borderRadius:6,padding:20,maxWidth:700,width:'95%'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div><span style={{fontSize:16,fontWeight:'bold',color:yc.accent}}>{c.ticker}</span><span style={{color:'#5a5e6a',marginLeft:8,fontSize:12}}>{c.label} | Settles: {c.settlementDate}</span></div>
          <div style={{textAlign:'right'}}><div style={{fontSize:14,color:'#f0b800',fontWeight:'bold'}}>{last.close.toFixed(3)} → {ir}%</div>
            <button onClick={onClose} style={{background:'transparent',border:'1px solid #1a1d26',color:'#5a5e6a',padding:'2px 10px',cursor:'pointer',fontFamily:'inherit',fontSize:10,borderRadius:2,marginTop:4}}>ESC ×</button></div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%'}}>
          <defs><linearGradient id="cf2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0b800" stopOpacity="0.15"/><stop offset="100%" stopColor="#f0b800" stopOpacity="0.01"/></linearGradient></defs>
          {gr.map(v=>(<g key={v}><line x1={P.l} y1={sy(v)} x2={W-P.r} y2={sy(v)} stroke="#1a1d26" strokeWidth={.5}/><text x={P.l-5} y={sy(v)+3} fill="#5a5e6a" fontSize={9} textAnchor="end" fontFamily="monospace">{v.toFixed(2)}</text><text x={W-P.r+5} y={sy(v)+3} fill="#5a5e6a" fontSize={8} fontFamily="monospace">{(100-v).toFixed(2)}%</text></g>))}
          {lvs.map(lv=>{const px=spx+lv.d;if(px<mn||px>mx)return null;return(<g key={lv.l}><line x1={P.l} y1={sy(px)} x2={W-P.r} y2={sy(px)} stroke={lv.c} strokeWidth={lv.d===0?1.5:1} strokeDasharray={lv.d===0?'0':'6 3'} opacity={.7}/><text x={W-P.r+5} y={sy(px)+3} fill={lv.c} fontSize={7} fontFamily="monospace">{lv.l}</text></g>);})}
          {ml.filter((_,i)=>i%2===0).map(m=>(<text key={m.i} x={sx(m.i)} y={H-8} fill="#5a5e6a" fontSize={8} textAnchor="middle" fontFamily="monospace">{m.l}</text>))}
          <polygon points={`${sx(0)},${sy(mn)} ${pts} ${sx(h1y.length-1)},${sy(mn)}`} fill="url(#cf2)"/>
          <polyline points={pts} fill="none" stroke="#f0b800" strokeWidth={1.8}/>
          <circle cx={sx(h1y.length-1)} cy={sy(last.close)} r={4} fill="#f0b800"/>
        </svg>
        <div style={{display:'flex',gap:14,marginTop:8,fontSize:9,color:'#5a5e6a',flexWrap:'wrap'}}>
          <span>Left: Price | Right: Rate</span><span style={{color:'#00c853'}}>— — Cut levels</span><span style={{color:'#f0b800'}}>━━ SOFR Spot</span><span style={{color:'#ff5252'}}>— — Hike levels</span>
        </div>
      </div>
    </div>
  );
}

export default function StripTable({strip,sofrLive,sofrLoading,currentSOFR}) {
  const [chartC,setChartC]=useState(null);
  if(!strip?.length)return<div style={{color:'var(--dim)',padding:20}}>{sofrLoading?'Loading SOFR futures from Yahoo Finance...':'No data'}</div>;

  const all=strip.flatMap(g=>g.contracts);
  const sofr0=currentSOFR||all[0]?.impRate||3.63;
  const termC=all.reduce((b,c)=>(!b||c.impRate>b.impRate?c:b),null);
  const terminal=termC?.impRate||sofr0;
  const termSp=((terminal-sofr0)*100).toFixed(1);
  const m1d=Math.max(1,...all.map(c=>Math.abs(c.bp1d??0)));
  const m5d=Math.max(3,...all.map(c=>Math.abs(c.bp5d??0)));
  const m1m=Math.max(5,...all.map(c=>Math.abs(c.bp1m??0)));
  const mCut=Math.max(1,...all.map(c=>Math.abs((sofr0-c.impRate)*100)));
  const mVol=Math.max(1,...all.map(c=>c.volume||0));

  return(
    <div>
      {chartC&&<ChartPopup c={chartC} onClose={()=>setChartC(null)} sofr={sofr0}/>}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:'var(--dim)',letterSpacing:1}}>SOFR STRIP — {all.length} CONTRACTS</span>
        <span style={{fontSize:9,padding:'2px 6px',borderRadius:2,background:sofrLive?'rgba(0,200,83,0.15)':sofrLoading?'rgba(240,184,0,0.15)':'rgba(255,82,82,0.1)',color:sofrLive?'var(--green)':sofrLoading?'var(--amber)':'var(--red)'}}>
          {sofrLoading?'◌ LOADING':sofrLive?'● YAHOO LIVE':'○ FALLBACK'}
        </span>
      </div>
      <div style={{display:'flex',gap:16,marginBottom:10,padding:'6px 8px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:2,fontSize:11}}>
        <span style={{color:'var(--dim)'}}>TERMINAL: <span style={{color:'var(--green)',fontWeight:'bold'}}>{terminal.toFixed(3)}%</span></span>
        <span style={{color:'var(--dim)'}}>{termC?.ticker} | {termC?.label}</span>
        <span style={{color:'var(--dim)'}}>MTG→TERM: <span style={{color:parseFloat(termSp)>0?'var(--red)':'var(--green)',fontWeight:'bold'}}>{parseFloat(termSp)>0?'+':''}{termSp}bp</span></span>
      </div>
      <div style={{overflowX:'auto',maxHeight:460,overflowY:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead><tr>
            {['CONTRACT','LAST PX','IMP RATE','BPS CUT','1D bp','5D bp','1M bp','VOLUME'].map((h,i)=>(
              <th key={h} style={{textAlign:i>0?'right':'left',padding:'6px 6px',fontSize:9,color:'var(--dim)',letterSpacing:1,borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--card)',zIndex:1,whiteSpace:'nowrap'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {strip.map(group=>{const yc=YC[group.year]||DY;return(
              <Fragment key={group.year}>
                <tr><td colSpan={8} style={{padding:'8px 6px 4px',color:yc.accent,fontWeight:'bold',fontSize:12,borderBottom:`1px solid ${yc.border}`,borderLeft:`3px solid ${yc.accent}`,background:yc.bg}}>{group.year}</td></tr>
                {group.contracts.map(c=>{
                  const bps=(sofr0-c.impRate)*100;
                  const hasChart=(c.history1y||c.history)&&(c.history1y||c.history).length>5;
                  const volPct=mVol>0?((c.volume||0)/mVol)*100:0;
                  return(
                    <tr key={c.ticker} className="data-row" style={{borderBottom:`1px solid ${yc.border}`,borderLeft:`3px solid ${yc.accent}`,background:yc.bg,cursor:hasChart?'pointer':'default'}} onClick={()=>hasChart&&setChartC(c)}>
                      <td style={{padding:'5px 6px'}}><span style={{color:yc.accent,fontWeight:'bold'}}>{c.ticker}</span><span style={{color:'var(--dim)',marginLeft:5,fontSize:10}}>{c.label}</span>{hasChart&&<span style={{marginLeft:4,fontSize:9}}>📈</span>}</td>
                      <td style={{padding:'5px 6px',textAlign:'right'}}>{c.lastPx?.toFixed(3)||'—'}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',color:'var(--amber)',fontWeight:'bold'}}>{c.impRate?.toFixed(3)||'—'}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',color:cc(bps),fontWeight:Math.abs(bps)>5?'bold':'normal',background:ch(bps,mCut)}}>{fb(bps)}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',color:bc(c.bp1d),fontWeight:c.bp1d!=null&&Math.abs(c.bp1d)>1?'bold':'normal',background:ht(c.bp1d,m1d)}}>{fb(c.bp1d)}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',color:bc(c.bp5d),fontWeight:c.bp5d!=null&&Math.abs(c.bp5d)>2?'bold':'normal',background:ht(c.bp5d,m5d)}}>{fb(c.bp5d)}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',color:bc(c.bp1m),fontWeight:c.bp1m!=null&&Math.abs(c.bp1m)>3?'bold':'normal',background:ht(c.bp1m,m1m)}}>{fb(c.bp1m)}</td>
                      <td style={{padding:'5px 6px',textAlign:'right',position:'relative',minWidth:80}}>
                        <div style={{position:'absolute',top:2,bottom:2,right:0,width:`${volPct}%`,background:'rgba(0,188,212,0.15)',borderRadius:'2px 0 0 2px'}}/>
                        <span style={{position:'relative',zIndex:1,color:'var(--dim)',fontSize:10}}>{fv(c.volume)}</span>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );})}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8,fontSize:9,color:'var(--dim)',display:'flex',gap:10,flexWrap:'wrap'}}>
        <span>BPS CUT = bps below SOFR spot</span>
        <span>1D/5D/1M = rate chg in bp (<span style={{color:'var(--green)'}}>green</span>=dovish <span style={{color:'var(--red)'}}>red</span>=hawkish)</span>
        <span>📈 = click for 1Y chart</span>
      </div>
    </div>
  );
}
function Fragment({children}){return<>{children}</>;}
