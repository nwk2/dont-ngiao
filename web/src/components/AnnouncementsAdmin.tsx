import React, { useEffect, useState } from 'react';
import { AnnouncementCard, AnnouncementKind, KIND_ICON, kindName } from './Announcements';
import { AsyncButton, btn, homeCard, input, primary, sectionTitle, switchKnob, switchStyle } from '../ui';

// Admin › News: announcements, ported from nwk2/haven. A list (tap a row to
// edit) with Live / Scheduled / Ended, and a form with type, optional title,
// message, show-from / until (prefilled: now → a week), "people can dismiss
// it", "show it again" when editing one people dismissed, and a live preview
// exactly as it appears on Home.
type Ann = { id: string; kind: AnnouncementKind; title: string | null; text: string; dismissible: boolean; startsAt: number; endsAt: number; dismissed: number };
type Form = { id: string | null; kind: AnnouncementKind; title: string; text: string; dismissible: boolean; from: string; until: string; dismissed: number; showAgain: boolean };

const toLocal = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const blank = (): Form => { const now = Date.now(); return { id: null, kind: 'info', title: '', text: '', dismissible: true, from: toLocal(now), until: toLocal(now + 7 * 86_400_000), dismissed: 0, showAgain: false }; };
const status = (a: Ann) => (a.endsAt <= Date.now() ? 'Ended' : a.startsAt > Date.now() ? 'Scheduled' : 'Live');
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 };
// iOS gives datetime-local a wide intrinsic size; this keeps it inside its column.
const dateInput: React.CSSProperties = { ...input, margin: 0, minWidth: 0, maxWidth: '100%', display: 'block', WebkitAppearance: 'none', appearance: 'none', lineHeight: '22px' };

export function AnnouncementsAdmin({ adminApi, onError }: { adminApi: (path: string, method: string, body?: any) => Promise<any>; onError: (m: string) => void }) {
  const [list, setList] = useState<Ann[] | null>(null);
  const [f, setF] = useState<Form>(blank);
  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const load = () => adminApi('/api/admin/announcements', 'GET').then((d: any) => setList(d.announcements || [])).catch((e: any) => { onError(e.message); setList([]); });
  useEffect(() => { load(); }, []);
  const edit = (a: Ann) => setF({ id: a.id, kind: a.kind, title: a.title ?? '', text: a.text, dismissible: !!a.dismissible, from: toLocal(a.startsAt), until: toLocal(a.endsAt), dismissed: a.dismissed, showAgain: false });
  const valid = !!f.text.trim() && !!f.from && !!f.until && new Date(f.until) > new Date(f.from);

  async function save() {
    onError('');
    const startsAt = new Date(f.from).getTime(), endsAt = new Date(f.until).getTime();
    const body = { kind: f.kind, title: f.title.trim() || null, text: f.text, dismissible: f.dismissible, startsAt, endsAt, showAgain: f.showAgain };
    try {
      const r = f.id ? await adminApi(`/api/admin/announcements/${f.id}`, 'PUT', body) : await adminApi('/api/admin/announcements', 'POST', body);
      // Show the saved row straight away, then reconcile with the server.
      const saved: Ann = { id: f.id ?? r.id, kind: f.kind, title: f.title.trim().slice(0, 60) || null, text: f.text.trim().slice(0, 280), dismissible: f.dismissible, startsAt, endsAt, dismissed: f.id ? (f.showAgain ? 0 : f.dismissed) : 0 };
      setList(prev => (f.id ? (prev || []).map(a => (a.id === f.id ? saved : a)) : [...(prev || []), saved]).sort((a, b) => b.startsAt - a.startsAt));
      setF(blank()); load();
    } catch (e: any) { onError(e.message); }
  }
  async function remove() {
    if (!f.id) return; const id = f.id; onError('');
    try { await adminApi(`/api/admin/announcements/${id}`, 'DELETE'); setList(prev => (prev || []).filter(a => a.id !== id)); setF(blank()); load(); }
    catch (e: any) { onError(e.message); }
  }

  return (<>
    <h2 style={{...sectionTitle,marginTop:0}}>Announcements</h2>
    <div style={{...homeCard,padding:6}}>
      {list === null && <p style={{color:'var(--muted)',fontSize:13,margin:10}}>Loading…</p>}
      {list !== null && !list.length && <p style={{color:'var(--muted)',fontSize:13,margin:10}}>None yet. They show at the top of everyone’s Home.</p>}
      {(list || []).map((a, i, arr) => {
        const st = status(a);
        return (<button key={a.id} type="button" aria-current={f.id === a.id ? 'true' : undefined} onClick={() => edit(a)}
          style={{display:'flex',alignItems:'center',gap:10,width:'100%',minHeight:52,padding:'8px 8px',border:0,borderBottom:i===arr.length-1?'none':'1px solid var(--hairline)',background:f.id===a.id?'var(--field)':'none',color:'var(--text)',font:'inherit',textAlign:'left',cursor:'pointer',borderRadius:8}}>
          <span aria-hidden="true" style={{width:10,height:10,borderRadius:5,flexShrink:0,background:`var(--ann-${a.kind})`}} />
          <span style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',fontSize:14}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.title || a.text}</span>
            <small style={{color:'var(--muted)',fontSize:12}}>{kindName(a.kind)} · {when(a.startsAt)} → {when(a.endsAt)}{a.dismissible ? (a.dismissed ? ` · dismissed by ${a.dismissed}` : '') : ' · can’t be dismissed'}</small>
          </span>
          <span style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:10,background:'var(--field)',color:st==='Live'?'var(--accent)':'var(--muted)',whiteSpace:'nowrap'}}>{st}</span>
        </button>);
      })}
      {f.id && <button type="button" onClick={() => setF(blank())} style={{...btn,boxShadow:'none',border:0,background:'transparent',margin:'4px 0 0'}}>+ New announcement</button>}
    </div>

    <h2 style={sectionTitle}>{f.id ? 'Edit announcement' : 'New announcement'}</h2>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:14}}>
      <div>
        <span style={label}>Type</span>
        <div role="radiogroup" aria-label="Type" style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:4,padding:4,borderRadius:12,border:'1px solid var(--border)'}}>
          {(['info','warn','ok'] as const).map(k => {
            const on = f.kind === k;
            return (<button key={k} type="button" role="radio" aria-checked={on} onClick={() => set({ kind: k })}
              style={{minHeight:44,border:0,borderRadius:9,background:on?'var(--text)':'transparent',color:on?'var(--bg)':'var(--muted)',font:'inherit',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer'}}>
              <span style={{display:'flex',width:16,height:16,color:on?'inherit':`var(--ann-${k})`}}>{React.cloneElement(KIND_ICON[k], { width: 16, height: 16 })}</span>{kindName(k)}
            </button>);
          })}
        </div>
      </div>
      <label><span style={label}>Title (optional)</span><input value={f.title} maxLength={60} placeholder="e.g. Planned maintenance" onChange={e => set({ title: e.target.value })} style={{...input,margin:0}} /></label>
      <label>
        <span style={label}>Message</span>
        <textarea value={f.text} maxLength={280} rows={3} placeholder="What people need to know, in a sentence or two" onChange={e => set({ text: e.target.value })} style={{...input,margin:0,resize:'vertical'}} />
        <span style={{display:'block',textAlign:'right',fontSize:12,color:'var(--muted)',marginTop:4}}>{f.text.length}/280</span>
      </label>
      <label><span style={label}>Show from</span><input type="datetime-local" value={f.from} onChange={e => set({ from: e.target.value })} style={dateInput} /></label>
      <label><span style={label}>Until</span><input type="datetime-local" value={f.until} onChange={e => set({ until: e.target.value })} style={dateInput} />
        {f.from && f.until && !(new Date(f.until) > new Date(f.from)) && <span style={{display:'block',fontSize:12,fontWeight:600,color:'var(--danger-text)',marginTop:6}}>“Until” must be after “Show from”.</span>}</label>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <span><strong>People can dismiss it</strong><br /><span style={{fontSize:12,color:'var(--muted)'}}>Turn off for things everyone must see, like maintenance in progress. It then stays until its end time.</span></span>
        <button type="button" role="switch" aria-checked={f.dismissible} aria-label="People can dismiss it" onClick={() => set({ dismissible: !f.dismissible })} style={switchStyle(f.dismissible)}><span style={switchKnob(f.dismissible)} /></button>
      </div>
      {f.id && f.dismissed > 0 && (<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <span><strong>Show it again to people who dismissed it</strong><br /><span style={{fontSize:12,color:'var(--muted)'}}>{f.dismissed === 1 ? '1 person has' : `${f.dismissed} people have`} dismissed it. Use this for changes that matter.</span></span>
        <button type="button" role="switch" aria-checked={f.showAgain} aria-label="Show it again to people who dismissed it" onClick={() => set({ showAgain: !f.showAgain })} style={switchStyle(f.showAgain)}><span style={switchKnob(f.showAgain)} /></button>
      </div>)}
      <div>
        <span style={label}>Preview on Home</span>
        <div style={{padding:12,borderRadius:14,border:'1px dashed var(--border)',background:'var(--bg)'}}>
          <AnnouncementCard preview a={{ id: 'preview', kind: f.kind, title: f.title.trim() || null, text: f.text, dismissible: f.dismissible, endsAt: f.until ? new Date(f.until).getTime() : Date.now() }} />
        </div>
      </div>
      <AsyncButton style={{...primary,width:'100%'}} disabled={!valid} onClick={save}>{f.id ? 'Save changes' : 'Schedule announcement'}</AsyncButton>
      {f.id && <AsyncButton style={{...btn,width:'100%',color:'var(--danger-text)'}} onClick={remove}>Remove announcement</AsyncButton>}
      <span style={{fontSize:12,color:'var(--muted)'}}>Open apps pick it up when they’re next opened or brought back to the front.</span>
    </div>
  </>);
}
