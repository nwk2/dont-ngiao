import React, { useEffect, useState } from 'react';
import { api } from '../api';

// ANNOUNCEMENTS, ported from nwk2/haven (Nov 2026): from the Duesy
// team; typed (Info / Heads-up / Fixed), optional title, optionally
// dismissible. Every live one is stacked on Home, most urgent first then
// newest; two at a time with "+N more". ✕ dismisses for this person on
// every device (Undo for 5 seconds). Each appears at its start time and goes
// at its end time without asking the server again. (Haven also pushes admin
// changes to open apps over a live connection; Duesy has none, so
// open apps pick changes up when they come back to the foreground.)
export type AnnouncementKind = 'info' | 'warn' | 'ok';
export type AnnouncementData = { id: string; kind: AnnouncementKind; title?: string | null; text: string; dismissible: boolean; startsAt: number; endsAt: number };

const KIND_NAME: Record<AnnouncementKind, string> = { info: 'Info', warn: 'Heads-up', ok: 'Fixed' };
const RANK: Record<AnnouncementKind, number> = { warn: 0, info: 1, ok: 2 };
export const KIND_ICON: Record<AnnouncementKind, JSX.Element> = {
  info: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
  warn: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg>,
  ok: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>,
};
export const kindName = (k: AnnouncementKind) => KIND_NAME[k];

/** One announcement card (also used as the live preview in Admin). */
export function AnnouncementCard({ a, onDismiss, preview }: { a: Omit<AnnouncementData, 'startsAt'>; onDismiss?: () => void; preview?: boolean }) {
  const ink = `var(--ann-${a.kind})`;
  const until = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(a.endsAt);
  return (<section role="region" aria-label={`Announcement from the Duesy team${a.title ? `: ${a.title}` : ''}`}
    style={{display:'grid',gridTemplateColumns:'26px minmax(0, 1fr) auto',gap:10,alignItems:'start',padding:'12px 8px 12px 14px',borderRadius:14,background:`var(--ann-${a.kind}-bg)`,borderLeft:`4px solid ${ink}`,color:'var(--text)'}}>
    <span style={{color:ink,paddingTop:1,display:'flex'}}>{KIND_ICON[a.kind]}</span>
    <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
      <span style={{fontSize:11,fontWeight:800,letterSpacing:'0.06em',textTransform:'uppercase',color:ink}}>{KIND_NAME[a.kind]}</span>
      {a.title && <span style={{fontSize:15,fontWeight:700}}>{a.title}</span>}
      <span style={{fontSize:14,lineHeight:1.45,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{a.text || <span style={{opacity:0.5}}>Your message</span>}</span>
      {!a.dismissible && <span style={{fontSize:12,color:'var(--muted)',marginTop:4}}>Shown until {until}</span>}
    </div>
    {a.dismissible ? <button type="button" aria-label="Dismiss this announcement" tabIndex={preview ? -1 : undefined} onClick={preview ? undefined : onDismiss}
      style={{width:40,height:40,margin:'-8px -2px 0 0',border:0,borderRadius:20,background:'none',color:'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button> : <span />}
  </section>);
}

/** The stack at the top of Home. */
export function Announcements({ list }: { list: AnnouncementData[] }) {
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);

  // Re-render exactly when the next one starts or ends.
  useEffect(() => {
    const next = list.flatMap(a => [a.startsAt, a.endsAt]).filter(t => t > now).sort((x, y) => x - y)[0];
    if (!next) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 250, 2_147_000_000));
    return () => clearTimeout(t);
  }, [list, now]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t); }, [undo]);

  const live = list.filter(a => a.startsAt <= now && a.endsAt > now && !hidden.includes(a.id))
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.startsAt - a.startsAt);
  if (!live.length && !undo) return null;
  const shown = expanded ? live : live.slice(0, 2);

  async function dismiss(id: string) {
    setHidden(h => [...h, id]); setUndo(id);
    await api(`/api/announcements/${id}/dismiss`, 'POST').catch(() => undefined);
  }
  async function restore(id: string) {
    setUndo(null); setHidden(h => h.filter(x => x !== id));
    await api(`/api/announcements/${id}/dismiss`, 'DELETE').catch(() => undefined);
  }

  return (<div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
    {shown.map(a => <AnnouncementCard key={a.id} a={a} onDismiss={() => dismiss(a.id)} />)}
    {live.length > 2 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
      style={{alignSelf:'flex-start',minHeight:40,padding:'0 14px',borderRadius:20,border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',font:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>
      {expanded ? 'Show fewer' : `+${live.length - 2} more announcement${live.length - 2 === 1 ? '' : 's'}`}</button>}
    {undo && <div role="status" style={{position:'fixed',left:12,right:12,bottom:'calc(24px + env(safe-area-inset-bottom, 0px))',zIndex:60,maxWidth:480,margin:'0 auto',padding:'6px 8px 6px 16px',borderRadius:16,background:'var(--text)',color:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
      <span>Announcement dismissed</span>
      <button type="button" onClick={() => restore(undo)} style={{flexShrink:0,minHeight:44,padding:'0 10px',border:0,background:'none',color:'inherit',font:'inherit',fontWeight:700,textDecoration:'underline',textUnderlineOffset:3,cursor:'pointer'}}>Undo</button>
    </div>}
  </div>);
}
