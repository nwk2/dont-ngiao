import React, { useState } from 'react';
// Calendar picker: button showing formatted date, month grid, no native date input.
// All picker buttons use the dark btn style explicitly (see below). The
// prev/next/Today/Close buttons previously had NO inline style, so they
// fell back to Safari's native light-grey button background while the
// global CSS in index.html sets button text to white — white on light
// grey, near-invisible. The day buttons were fine because they already
// had an explicit dark background. This is the only place in the app with
// unstyled buttons (verified by grep: no other <button without style=).
// The date button itself carries no 📅 emoji: Apple's calendar emoji
// always renders "JUL 17", which reads as a second, wrong date next to
// the real formatted date — so the button is text only.
const pickerBtn: React.CSSProperties = { padding:'9px 14px', borderRadius:999, border:'1px solid var(--border)', background:'var(--field)', color:'var(--text)', cursor:'pointer' };
export function fmtDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function todayIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function DateField({ value, onChange, id }: { value: string; onChange: (v: string)=>void; id: string }) {
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState(() => { const [y,m] = value.split('-').map(Number); return { y, m: m-1 }; });
  const first = new Date(ym.y, ym.m, 1); const startDay = (first.getDay()+6)%7; // Mon-first
  const daysIn = new Date(ym.y, ym.m+1, 0).getDate();
  const cells: (number|null)[] = [...Array(startDay).fill(null), ...Array.from({length: daysIn}, (_,i)=>i+1)];
  return (<div>
    <button type="button" id={id} onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'10px',textAlign:'left',border:'1px solid var(--border)',borderRadius:8,background:'var(--field)',color:'var(--text)'}}>{fmtDate(value)}</button>
    {open && <div role="dialog" aria-label="Choose date" style={{border:'1px solid var(--border)',borderRadius:8,padding:10,marginTop:6,background:'var(--card)',color:'var(--text)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <button type="button" style={pickerBtn} onClick={()=>setYm(({y,m})=> m===0?{y:y-1,m:11}:{y,m:m-1})}>‹</button>
        <strong>{first.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</strong>
        <button type="button" style={pickerBtn} onClick={()=>setYm(({y,m})=> m===11?{y:y+1,m:0}:{y,m:m+1})}>›</button>
      </div>
      <div style={{display:'flex',gap:4,marginTop:8,alignItems:'center'}}>
        <label>Jump to year <select value={ym.y} onChange={e=>setYm(s=>({...s,y:Number(e.target.value)}))}>{Array.from({length:211},(_,i)=>1900+i).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        <button type="button" style={pickerBtn} onClick={()=>{onChange(todayIso()); setOpen(false);}}>Today</button>
        <button type="button" style={pickerBtn} onClick={()=>setOpen(false)}>Close</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginTop:8}}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=><div key={d} style={{textAlign:'center',fontSize:12,color:'var(--muted)'}}>{d}</div>)}
        {cells.map((d,i)=> d===null ? <div key={i}/> : <button type="button" key={i} aria-label={fmtDate(`${ym.y}-${String(ym.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)} onClick={()=>{onChange(`${ym.y}-${String(ym.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`); setOpen(false);}} style={{padding:6,background: value===`${ym.y}-${String(ym.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` ? 'var(--accent)' : 'var(--field)', color: value===`${ym.y}-${String(ym.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` ? 'var(--accent-text)' : 'var(--text)', border:'1px solid var(--border)', borderRadius:6}}>{d}</button>)}
      </div>
    </div>}
  </div>);
}
