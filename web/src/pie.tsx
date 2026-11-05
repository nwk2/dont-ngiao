import React from 'react';
import { fmt, CATEGORIES } from './api';
// Category charts (no chart library dependency). Pie = overall breakdown
// by category. DailyBar = spend per day, stacked by category.
// Colour is fixed per category (index in CATEGORIES), NOT by sorted rank,
// so a category keeps the same colour in pie and bar, and across
// Group/Mine views and currencies, even as amounts change. Muted,
// dark-theme-friendly palette (same family as the settle colour dots,
// different mapping — categories and members are different domains).
export const CAT_COLORS: Record<string, string> = {
  // Gruvbox dark (approved 2026-11-04 for dark mode; light pastel is
  // a separate light-mode palette, not built yet): green, blue, purple,
  // yellow, orange, aqua, grey. Fixed per category, same in pie and bar.
  'Food & Drink': '#b8bb26',
  'Transport': '#83a598',
  'Accommodation': '#d3869b',
  'Activities': '#fabd2f',
  'Shopping': '#fe8019',
  'Other': '#8ec07c',
  'Uncategorized': '#928374',
};
function catColor(cat: string) { return CAT_COLORS[cat] || '#a3a3a3'; }
function Legend({ entries, total, currency }: { entries: [string, number][]; total: number; currency: string }) {
  return (<div style={{width:'100%',maxWidth:360}}>
    {entries.map(([cat, v]) => (<div key={cat} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'6px 0'}}>
      <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}><span style={{width:10,height:10,borderRadius:'50%',background:catColor(cat),flexShrink:0}} />{cat}</span>
      <span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(v, currency)} ({((v/total)*100).toFixed(1)}%)</span>
    </div>))}
  </div>);
}
export function Pie({ data, currency }: { data: Record<string, number>; currency: string }) {
  const entries = Object.entries(data).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,[,v])=>a+v,0);
  if (total === 0) return <p style={{color:'#a3a3a3'}}>No spend in {currency} yet.</p>;
  const totalStr = fmt(total, currency);
  const centreSize = totalStr.length > 9 ? 12 : 16;
  let acc = 0;
  const slices = entries.map(([cat, v]) => {
    const a0 = acc/total*Math.PI*2; acc += v; const a1 = acc/total*Math.PI*2;
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const x0 = 100+80*Math.sin(a0), y0 = 100-80*Math.cos(a0), x1 = 100+80*Math.sin(a1), y1 = 100-80*Math.cos(a1);
    const xi0 = 100+48*Math.sin(a0), yi0 = 100-48*Math.cos(a0), xi1 = 100+48*Math.sin(a1), yi1 = 100-48*Math.cos(a1);
    return { cat, v, color: catColor(cat), d: `M${x0},${y0} A80,80 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A48,48 0 ${large} 0 ${xi0},${yi0} Z` };
  });
  const isFullCircle = slices.length === 1;
  return (<div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
    <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Spend by category pie chart">
      {isFullCircle ? (<><circle cx={100} cy={100} r={80} fill={slices[0].color} stroke="#1c1c1e" strokeWidth={2} /><circle cx={100} cy={100} r={48} fill="#1c1c1e" /></>) : slices.map(s=><path key={s.cat} d={s.d} fill={s.color} stroke="#1c1c1e" strokeWidth={2} />)}
      <text x={100} y={98} textAnchor="middle" fontSize={centreSize} fontWeight={700} fill="#fff" style={{fontVariantNumeric:'tabular-nums'}}>{totalStr}</text>
      <text x={100} y={116} textAnchor="middle" fontSize={11} fill="#a3a3a3">total</text>
    </svg>
    <Legend entries={entries} total={total} currency={currency} />
  </div>);
}
export function DailyBar({ expenses, myMemberId, view, currency }: { expenses: any[]; myMemberId: string | null; view: 'group' | 'mine'; currency: string }) {
  // Fit-to-width: measure the actual container width (ResizeObserver, so
  // it follows phone rotation / window resize), then scale the x-axis to
  // fit it — no horizontal scrolling inside the bar chart. The chart's
  // point is the trend (total height per day, stacked by category), and
  // that trend is only visible at a glance when every day is on screen at
  // once; scrolling hid the shape of the trend behind a viewport.
  // Fallback 320px before the first measurement (first paint, SSR-free).
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = React.useState(320);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapW(el.clientWidth || 320);
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Frontend aggregation from the already-loaded expenses (no API change):
  // Group = total expense amount per day per category; Mine = requester's
  // split share per day per category. Per currency only, never converted.
  // Only days with spend in this currency/view appear, oldest first.
  const byDay = new Map<string, Record<string, number>>();
  for (const e of expenses || []) {
    if (e.currency !== currency) continue;
    let amount = 0;
    if (view === 'group') amount = e.amount_minor || 0;
    else if (myMemberId) amount = (e.splits || []).find((s:any)=>s.member_id===myMemberId)?.amount_minor || 0;
    if (!amount || amount <= 0) continue;
    const day = String(e.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const cat = e.category || 'Uncategorized';
    if (!byDay.has(day)) byDay.set(day, {});
    const row = byDay.get(day)!;
    row[cat] = (row[cat] || 0) + amount;
  }
  const days = Array.from(byDay.keys()).sort();
  const dayTotals = days.map(d => Object.values(byDay.get(d)!).reduce((a,b)=>a+b,0));
  const grandTotal = dayTotals.reduce((a,b)=>a+b,0);
  if (grandTotal === 0) return <p style={{color:'#a3a3a3'}}>No spend in {currency} yet.</p>;
  const maxTotal = Math.max(...dayTotals);
  const catTotals: Record<string, number> = {};
  for (const d of days) for (const [cat, v] of Object.entries(byDay.get(d)!)) catTotals[cat] = (catTotals[cat] || 0) + v;
  const legendEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  // Geometry: y-axis labels left, x-axis day labels bottom, bars stacked
  // bottom-up in fixed CATEGORIES order (not sorted rank, so a category's
  // segment position is stable across days). X-axis is scaled to fit:
  // slot = plot width / number of days, bar = ~61% of the slot (the old
  // 22/36 ratio), capped at 28px so a few-days chart does not become huge
  // slabs, floored at 2px so a many-days chart still draws a visible
  // trend silhouette. Day labels are thinned to ~12 max, evenly spaced.
  // Trade-off, stated plainly: with many days, small category segments
  // inside a thin bar become sub-pixel and unreadable individually — the
  // total height (the trend) and the dominant categories stay readable,
  // which is the point of this chart; per-day exact amounts are already
  // in the expense list below, and each bar still has a <title> tooltip
  // with its day + total.
  const left = 56, right = 8, top = 10, plotH = 180;
  const svgW = Math.max(200, wrapW);
  const slot = (svgW - left - right) / days.length;
  const barW = Math.max(2, Math.min(28, slot * 0.61));
  const svgH = top + plotH + 28;
  const ticks = [0, maxTotal / 3, (2 * maxTotal) / 3, maxTotal];
  const labelStep = Math.max(1, Math.ceil(days.length / 12));
  return (<div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
    <div ref={wrapRef} style={{width:'100%'}}>
      <svg width={svgW} height={svgH} role="img" aria-label="Daily spend by category bar chart" style={{display:'block',margin:'0 auto'}}>
        {ticks.map((t, i) => { const y = top + plotH * (1 - (maxTotal ? t / maxTotal : 0)); return (<g key={i}>
          <line x1={left} x2={svgW - right} y1={y} y2={y} stroke="#2e2e2e" strokeWidth={1} />
          <text x={left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#a3a3a3" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(Math.round(t), currency)}</text>
        </g>); })}
        {days.map((day, i) => {
          const x = left + i * slot + (slot - barW) / 2;
          let cum = 0;
          const dayCats = Object.keys(byDay.get(day)!);
          const segOrder = [...CATEGORIES, ...dayCats.filter(c => !CATEGORIES.includes(c))];
          const segs = segOrder.filter(c => (byDay.get(day)![c] || 0) > 0).map(cat => {
            const v = byDay.get(day)![cat];
            const h = maxTotal ? (v / maxTotal) * plotH : 0;
            const y = top + plotH - cum - h;
            cum += h;
            return { cat, v, x, y, h };
          });
          return (<g key={day}>
            <title>{day}: {fmt(dayTotals[i], currency)}</title>
            {segs.map(s => (<rect key={s.cat} x={s.x} y={s.y} width={barW} height={Math.max(s.h, 0)} fill={catColor(s.cat)} />))}
            {i % labelStep === 0 && <text x={x + barW / 2} y={top + plotH + 18} textAnchor="middle" fontSize={10} fill="#a3a3a3">{day.slice(5)}</text>}
          </g>);
        })}
      </svg>
    </div>
    <Legend entries={legendEntries} total={grandTotal} currency={currency} />
  </div>);
}
