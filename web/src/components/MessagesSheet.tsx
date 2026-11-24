import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { AsyncButton, Sheet, Sk, balHairline, input, primary } from '../ui';

// Your messages (Haven-style feedback threads): everything you've sent
// from Send feedback, with the team's replies. Opening a thread marks its
// reply as read; you can reply back from the thread.
const TYPE: Record<string, string> = { bug: 'Bug', idea: 'Idea', question: 'Question' };
const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

export function MessagesSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const loadList = () => api('/api/me/feedback').then((d: any) => setItems(d.items || [])).catch((e: any) => { setError(e.message); setItems([]); });
  useEffect(() => { loadList(); }, []);
  async function open(id: string) {
    setError(''); setText('');
    try { setThread(await api(`/api/me/feedback/${id}`)); onChanged(); }
    catch (e: any) { setError(e.message); }
  }
  async function send() {
    if (!thread || !text.trim()) return;
    setError('');
    try { await api(`/api/me/feedback/${thread.id}/messages`, 'POST', { text }); setText(''); setThread(await api(`/api/me/feedback/${thread.id}`)); }
    catch (e: any) { setError(e.message); }
  }
  const back = () => { setThread(null); loadList(); };

  if (thread) return (<Sheet title={TYPE[thread.type] || 'Your message'} onClose={onClose} maxHeight="88vh">
    <button type="button" onClick={back} style={{background:'transparent',border:'none',color:'var(--muted)',padding:'8px 0',fontSize:14,cursor:'pointer'}}>‹ All messages</button>
    <div style={{fontSize:12,color:'var(--muted)',textAlign:'center',margin:'4px 0 12px'}}>{thread.label} · Only you and the Duesy team can see this</div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {thread.messages.map((m: any) => (<div key={m.id} style={{alignSelf:m.author==='user'?'flex-end':'flex-start',maxWidth:'85%',background:m.author==='user'?'var(--field)':'var(--info-bg)',borderRadius:'var(--radius-card)',padding:'10px 12px'}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--muted)',marginBottom:2}}>{m.author==='user' ? 'You' : 'Duesy team'} · {when(m.createdAt)}</div>
        <div style={{fontSize:15,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{m.text}</div>
      </div>))}
    </div>
    {error && <p style={{color:'var(--danger-text)',fontSize:14}}>{error}</p>}
    <div style={{display:'flex',gap:8,marginTop:14,alignItems:'flex-end'}}>
      <textarea aria-label="Reply to the Duesy team" placeholder="Reply to the team" value={text} onChange={e=>setText(e.target.value)} rows={2} maxLength={2000} style={{...input,margin:0,flex:1,resize:'vertical',fontFamily:'inherit'}} />
      <AsyncButton style={{...primary,padding:'12px 16px',flexShrink:0}} disabled={!text.trim()} onClick={send}>Send</AsyncButton>
    </div>
  </Sheet>);

  return (<Sheet title="Your messages" onClose={onClose} maxHeight="88vh">
    <p style={{fontSize:13,color:'var(--muted)',margin:'8px 0 12px'}}>Feedback you’ve sent, and any replies from the team.</p>
    {error && <p style={{color:'var(--danger-text)',fontSize:14}}>{error}</p>}
    {items === null && <div>{[0,1,2].map(i=>(<div key={i} style={{padding:'12px 0',borderTop:i?balHairline:'none'}}><Sk w="60%" h={14} /><div style={{height:6}} /><Sk w="35%" h={12} /></div>))}</div>}
    {items !== null && items.length === 0 && <p style={{color:'var(--muted)',textAlign:'center',padding:'16px 0'}}>Nothing sent yet. Use Send feedback and replies will show up here.</p>}
    {items !== null && items.length > 0 && <div className="flat-list" style={{background:'var(--field)',borderRadius:'var(--radius-card)',overflow:'hidden'}}>
      {items.map((i: any) => (<button key={i.id} type="button" className="flat-row" onClick={()=>open(i.id)}>
        <span style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
          <span aria-label={i.unread ? 'New reply' : undefined} style={{width:8,height:8,borderRadius:'50%',background:i.unread?'var(--accent)':'transparent',flexShrink:0}} />
          <span style={{minWidth:0}}><span style={{display:'block',fontWeight:i.unread?700:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.message}</span><span style={{display:'block',fontSize:13,color:'var(--muted)'}}>{TYPE[i.type] || 'Feedback'} · {when(i.updatedAt)} · {i.label}</span></span>
        </span>
        <span style={{color:'var(--muted)',flexShrink:0}}>›</span>
      </button>))}
    </div>}
  </Sheet>);
}
