import React from 'react';
import { fmt } from './api';
// Small SVG pie chart (no chart library dependency). Input: {category: minor}.
const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#64748b'];
export function Pie({ data, currency }: { data: Record<string, number>; currency: string }) {
  const entries = Object.entries(data).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,[,v])=>a+v,0);
  if (total === 0) return <p style={{color:'#a3a3a3'}}>No spend in {currency} yet.</p>;
  let acc = 0;
  const slices = entries.map(([cat, v], i) => {
    const a0 = acc/total*Math.PI*2; acc += v; const a1 = acc/total*Math.PI*2;
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const x0 = 100+80*Math.sin(a0), y0 = 100-80*Math.cos(a0), x1 = 100+80*Math.sin(a1), y1 = 100-80*Math.cos(a1);
    return { cat, v, color: COLORS[i % COLORS.length], d: `M100,100 L${x0},${y0} A80,80 0 ${large} 1 ${x1},${y1} Z` };
  });
  // A 100% slice has identical arc start/end points, which renders as
  // nothing in SVG — so a single-category pie would show a blank area.
  // Render a full circle for a 100% slice instead; other slices keep arcs.
  const isFullCircle = slices.length === 1;
  return (<div>
    <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Spend by category pie chart">{isFullCircle ? <circle cx={100} cy={100} r={80} fill={slices[0].color}/> : slices.map(s=><path key={s.cat} d={s.d} fill={s.color}/>)}</svg>
    <ul style={{listStyle:'none',padding:0}}>{slices.map(s=><li key={s.cat}><span style={{display:'inline-block',width:10,height:10,background:s.color,marginRight:6}}/> {s.cat}: {fmt(s.v, currency)} ({((s.v/total)*100).toFixed(1)}%)</li>)}</ul>
  </div>);
}
