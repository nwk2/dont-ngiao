import React, { useEffect, useRef, useState } from 'react';
import { api, fetchVersion } from '../api';
import { readSavedGroup } from '../prefs';
import { AsyncButton, PickerSheet, balHairline, input, pickCheck, primary, tabPill, tabPillActive, tabTrack, useSheetDrag } from '../ui';

// FEEDBACK, Nov 2026: in-app feedback from signed-in users
// (auth-only — no anonymous path). Three doors (You view Feedback
// section, Home header icon, GroupView header icon) open this one
// shared sheet. The form always starts fresh on open (type Bug,
// default group, empty message) — no draft preservation, like every
// other sheet. Send is disabled while the trimmed message is empty;
// while sending the sheet is undismissable (X, backdrop and swipe all
// gated on !sending) so a result cannot be lost mid-flight. The label
// stays "Send" while sending — AsyncButton prepends its spinner and
// renders children unchanged; only Enable notifications swaps its
// label, and this must not copy it. Sender name + buildId are sent to
// the server (and shown in the admin detail) but never displayed to
// the sender — no "Sent as" footnote. On success the sheet swaps to a
// success state; on failure the message is preserved for retry.
// REBUILD, Nov 2026: re-trigger push — the webhook for the feedback
// fixes commit never built (no v171), so this comment-only change
// re-triggers the Workers Build from main.
export function FeedbackSheet({ initialGroupId, groups, onClose }: any) {
  const active: any[] = groups || [];
  const [fbType, setFbType] = useState<'bug'|'idea'|'question'>('bug');
  const [fbGroupId, setFbGroupId] = useState<string | null>(() => {
    if (initialGroupId && active.some((g:any)=>g.id===initialGroupId)) return initialGroupId;
    const saved = readSavedGroup();
    if (saved && active.some((g:any)=>g.id===saved.groupId)) return saved.groupId;
    return active[0]?.id || null;
  });
  const [message, setMessage] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [fbError, setFbError] = useState('');
  const [sent, setSent] = useState(false);
  // SUCCESS, Nov 2026: no separate success screen — on send the button
  // morphs to a check-circle + "Sent" and the sheet closes after ~1s,
  // so the user feels the success on the button they just tapped (Wai's
  // pick 2026-11-13; the "Thanks — sent." screen + Done button shipped
  // in v170 and were dropped after his screenshot review). locked covers
  // sending AND that 1s window, so the Sent state is actually seen.
  const locked = sending || sent;
  const lockedRef = useRef(false);
  lockedRef.current = locked;
  const sentTimerRef = useRef<any>(null);
  useEffect(()=>()=>{ if (sentTimerRef.current) clearTimeout(sentTimerRef.current); }, []);
  const drag = useSheetDrag(()=>{ if (!lockedRef.current) onClose(); });
  const groupName = fbGroupId ? (active.find((g:any)=>g.id===fbGroupId)?.name || 'General (no group)') : 'General (no group)';
  async function doSend() {
    const msg = message.trim();
    if (!msg || sending) return;
    setSending(true); setFbError('');
    try {
      const buildId = await fetchVersion();
      await api('/api/me/feedback', 'POST', { type: fbType, message: msg, groupId: fbGroupId, buildId });
      setSent(true);
      sentTimerRef.current = setTimeout(()=>onClose(), 1000);
    } catch (e: any) { setFbError(e?.message || 'Could not send feedback.'); }
    finally { setSending(false); }
  }
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget && !locked) onClose(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))',width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>Send feedback</h2><button type="button" aria-label="Close" title="Close" disabled={locked} onClick={()=>{ if (!locked) onClose(); }} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:locked?'default':'pointer',flexShrink:0,opacity:locked?0.5:1}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <>
        <div style={{...tabTrack,marginTop:12}}><button disabled={locked} style={fbType==='bug'?tabPillActive:tabPill} onClick={()=>setFbType('bug')}>Bug</button><button disabled={locked} style={fbType==='idea'?tabPillActive:tabPill} onClick={()=>setFbType('idea')}>Idea</button><button disabled={locked} style={fbType==='question'?tabPillActive:tabPill} onClick={()=>setFbType('question')}>Question</button></div>
        <button type="button" disabled={locked} onClick={()=>setShowGroupPicker(true)} style={{width:'100%',textAlign:'left',background:'var(--field)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12,color:'var(--text)',cursor:locked?'default':'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:locked?0.5:1}}><span><span style={{display:'block',fontSize:12,color:'var(--muted)'}}>Group</span><span style={{display:'block',marginTop:2}}>{groupName}</span></span><span style={{color:'var(--muted)'}}>›</span></button>
        <label>Message</label>
        <textarea style={{...input,minHeight:120,resize:'vertical'}} placeholder="What happened, or what would you like to see?" value={message} maxLength={2000} disabled={locked} onChange={e=>setMessage(e.target.value)} aria-label="Message" />
        {fbError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{fbError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={locked || !message.trim()} onClick={doSend}>{sent ? (<span style={{display:'inline-flex',alignItems:'center',gap:8}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>Sent</span>) : 'Send'}</AsyncButton>
      </>    </div>
    {showGroupPicker && <PickerSheet title="Group" onClose={()=>setShowGroupPicker(false)}>
      <div style={{marginTop:6}}>
        <button key="__general" type="button" onClick={()=>{setFbGroupId(null); setShowGroupPicker(false);}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
          <span style={{flex:1,minWidth:0,fontWeight:600}}>General (no group)</span>{fbGroupId===null && pickCheck}
        </button>
        {active.map((g:any) => (<button key={g.id} type="button" onClick={()=>{setFbGroupId(g.id); setShowGroupPicker(false);}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
          <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:600}}>{g.name}</span>{g.id===fbGroupId && pickCheck}
        </button>))}
      </div>
    </PickerSheet>}
  </div>);
}
