import React from 'react';
import { fmt, CATEGORIES, isZeroDecimal } from './api';
import { Estimate } from './components/Fx';
// Category charts (no chart library dependency). Pie = overall breakdown
// by category. DailyBar = spend per day, stacked by category.
// Colour is fixed per category (index in CATEGORIES), NOT by sorted rank,
// so a category keeps the same colour in pie and bar, and across
// Group/Mine views and currencies, even as amounts change. Muted,
// dark-theme-friendly palette (same family as the settle colour dots,
// different mapping — categories and members are different domains).
export const CAT_COLORS: Record<string, string> = {
  // Theme variables (defined in index.html): gruvbox dark, pastels
  // light (approved 2026-11-04 dark; light pastels 2026-11-06, proposed
  // values). Fixed per category, same in pie and bar.
  'Food & Drink': 'var(--cat-food)',
  'Transport': 'var(--cat-transport)',
  'Accommodation': 'var(--cat-accommodation)',
  'Activities': 'var(--cat-activities)',
  'Shopping': 'var(--cat-shopping)',
  'Other': 'var(--cat-other)',
};
function catColor(cat: string) { return CAT_COLORS[cat] || 'var(--muted)'; }
// Short label for the top of a bar: "¥980", "¥39.4k", "S$1.2k", "₩1.5M".
// Rough on purpose; the exact figure is in the tap tooltip.
function compact(minor: number, cur: string) {
  const major = isZeroDecimal(cur) ? minor : minor / 100;
  const sym = fmt(0, cur).replace(/[\d.,]+$/, '');
  const short = (v: number, unit: string) => `${sym}${(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString()}${unit}`;
  if (major >= 1e6) return short(major / 1e6, 'M');
  if (major >= 1e3) return short(major / 1e3, 'k');
  return `${sym}${Math.round(major).toLocaleString()}`;
}
const longDay = (day: string) => {
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
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
  if (total === 0) return <p style={{color:'var(--muted)'}}>No spend in {currency} yet.</p>;
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
      {isFullCircle ? (<><circle cx={100} cy={100} r={80} fill={slices[0].color} stroke="var(--card)" strokeWidth={2} /><circle cx={100} cy={100} r={48} fill="var(--card)" /></>) : slices.map(s=><path key={s.cat} d={s.d} fill={s.color} stroke="var(--card)" strokeWidth={2} />)}
      <text x={100} y={98} textAnchor="middle" fontSize={centreSize} fontWeight={700} fill="var(--text)" style={{fontVariantNumeric:'tabular-nums'}}>{totalStr}</text>
      <text x={100} y={116} textAnchor="middle" fontSize={11} fill="var(--muted)">total</text>
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
  // Tap a bar -> tooltip with that day's exact total and, when the chart
  // currency isn't the user's home currency, a "≈ S$" estimate (Estimate
  // renders nothing otherwise). Phones have no hover, so the old SVG
  // <title> tooltip never showed there. Tap the same bar or anywhere
  // outside to close; switching Group/Mine or currency closes it too.
  const [sel, setSel] = React.useState<string | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const [tipPos, setTipPos] = React.useState<{ left: number; top: number } | null>(null);
  React.useEffect(() => { setSel(null); }, [view, currency]);
  React.useEffect(() => {
    if (!sel) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && (t.closest('[data-daybar]') || tipRef.current?.contains(t))) return;
      setSel(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [sel]);
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
    const cat = e.category === 'Uncategorized' ? 'Other' : (e.category || 'Other');
    if (!byDay.has(day)) byDay.set(day, {});
    const row = byDay.get(day)!;
    row[cat] = (row[cat] || 0) + amount;
  }
  const days = Array.from(byDay.keys()).sort();
  const dayTotals = days.map(d => Object.values(byDay.get(d)!).reduce((a,b)=>a+b,0));
  const grandTotal = dayTotals.reduce((a,b)=>a+b,0);
  // No early return here: the tooltip's layout effect below is a hook, so
  // the empty state is returned after it (rules of hooks).
  const maxTotal = Math.max(1, ...dayTotals);
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
  // in the expense list below, and tapping a bar shows its day + exact
  // total (and home-currency estimate) in a tooltip.
  // top leaves room for the day-total label above the tallest bar.
  const left = 56, right = 8, top = 24, plotH = 180;
  const svgW = Math.max(200, wrapW);
  const slot = (svgW - left - right) / days.length;
  const barW = Math.max(2, Math.min(28, slot * 0.61));
  const svgH = top + plotH + 28;
  const ticks = [0, maxTotal / 3, (2 * maxTotal) / 3, maxTotal];
  const labelStep = Math.max(1, Math.ceil(days.length / 12));
  // Day totals sit on top of each bar while there's room (~40px per day);
  // on long trips they're hidden and the tap tooltip carries the total.
  const showTotals = slot >= 40;
  const selIdx = sel ? days.indexOf(sel) : -1;
  // Tooltip placement, measured after render: centred above the bar,
  // clamped inside the chart; if there's no room above (tallest bar), it
  // goes at the top of the plot beside the bar instead. Runs after every
  // render (no deps) because the tooltip's size can change on its own,
  // e.g. the "≈ S$" estimate appearing once rates load, or the day's
  // total changing; setTipPos only fires when the position actually moves.
  React.useLayoutEffect(() => {
    const tip = tipRef.current;
    if (selIdx < 0 || !tip) { if (tipPos) setTipPos(null); return; }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const cx = left + selIdx * slot + slot / 2;
    const barTop = top + plotH - (dayTotals[selIdx] / maxTotal) * plotH;
    let l = Math.max(0, Math.min(svgW - tw, cx - tw / 2));
    let t = barTop - (showTotals ? 18 : 6) - th;
    if (t < 0) {
      t = 4;
      l = cx - barW / 2 - 8 - tw >= 0 ? cx - barW / 2 - 8 - tw : Math.min(svgW - tw, cx + barW / 2 + 8);
    }
    if (!tipPos || Math.abs(tipPos.left - l) > 0.5 || Math.abs(tipPos.top - t) > 0.5) setTipPos({ left: l, top: t });
  });
  if (grandTotal === 0) return <p style={{color:'var(--muted)'}}>No spend in {currency} yet.</p>;
  return (<div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
    <div ref={wrapRef} style={{width:'100%',position:'relative'}}>
      <svg width={svgW} height={svgH} role="img" aria-label="Daily spend by category bar chart" style={{display:'block',margin:'0 auto'}}>
        {ticks.map((t, i) => { const y = top + plotH * (1 - (maxTotal ? t / maxTotal : 0)); return (<g key={i}>
          <line x1={left} x2={svgW - right} y1={y} y2={y} stroke="var(--hairline)" strokeWidth={1} />
          <text x={left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--muted)" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(Math.round(t), currency)}</text>
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
          const dim = sel !== null && sel !== day;
          return (<g key={day} data-daybar="" role="button" tabIndex={0} aria-label={`${longDay(day)}: ${fmt(dayTotals[i], currency)}`} aria-pressed={sel === day}
            onClick={() => setSel(sel === day ? null : day)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sel === day ? null : day); } }}
            style={{cursor:'pointer'}}>
            <g style={{opacity: dim ? 0.3 : 1, transition: 'opacity 0.15s'}}>
              {segs.map(s => (<rect key={s.cat} x={s.x} y={s.y} width={barW} height={Math.max(s.h, 0)} fill={catColor(s.cat)} />))}
              {showTotals && <text x={x + barW / 2} y={top + plotH - cum - 6} textAnchor="middle" fontSize={10} fill={sel === day ? 'var(--text)' : 'var(--muted)'} style={{fontVariantNumeric:'tabular-nums'}}>{compact(dayTotals[i], currency)}</text>}
            </g>
            {i % labelStep === 0 && <text x={x + barW / 2} y={top + plotH + 18} textAnchor="middle" fontSize={10} fill="var(--muted)">{day.slice(5)}</text>}
            {/* Full-slot hit area so thin bars are still easy to tap. */}
            <rect x={left + i * slot} y={top} width={slot} height={plotH + 28} fill="transparent" />
          </g>);
        })}
      </svg>
      {/* Hardcoded soft shadow on purpose: most themes set --shadow to
      none, and the tooltip needs to lift off the chart card it overlaps. */}
      {selIdx >= 0 && (<div ref={tipRef} role="status" style={{position:'absolute',left:tipPos?.left ?? 0,top:tipPos?.top ?? 0,visibility:tipPos ? 'visible' : 'hidden',background:'var(--card)',border:'var(--border-w) solid var(--border)',borderRadius:'var(--radius-control)',padding:'8px 12px',fontSize:13,lineHeight:1.4,whiteSpace:'nowrap',boxShadow:'0 4px 14px rgba(0,0,0,0.25)',zIndex:1}}>
        <div style={{color:'var(--muted)'}}>{longDay(days[selIdx])}</div>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <strong style={{fontSize:15,fontVariantNumeric:'tabular-nums'}}>{fmt(dayTotals[selIdx], currency)}</strong>
          <Estimate minor={dayTotals[selIdx]} cur={currency} />
        </div>
      </div>)}
    </div>
    <Legend entries={legendEntries} total={grandTotal} currency={currency} />
  </div>);
}
