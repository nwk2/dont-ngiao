import React, { useEffect, useState } from 'react';
import { CURRENCIES, VAPID_PUBLIC_KEY, api, fmt } from '../api';
import { OnboardingPrompts } from '../components/Onboarding';
import { AsyncButton, FeedbackIconButton, S, Sheet, Sk, ThemePill, balHairline, btn, card, catControl, catControlActive, groupBalancesByVerb, groupMark, homeCard, initials, input, primary } from '../ui';
import { googleAuthUrl } from '../google';

export function HomeSkeleton({ user }: { user: any }) {
  return (<div style={S} aria-label="Loading">
    {user ? (<><div style={{fontSize:20,fontWeight:700}}>Hi, {user.name}</div><div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>{user.email}</div></>) : (<><Sk w={180} h={24} /><div style={{marginTop:6}}><Sk w={220} h={16} /></div></>)}
    <div style={{background:'var(--card)',borderRadius:24,padding:20,marginBottom:20}}><Sk w={140} h={12} /><div style={{marginTop:16}}><Sk w="60%" h={32} /></div><div style={{marginTop:10}}><Sk w="45%" h={32} /></div></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><Sk w={120} h={24} /><Sk w={110} h={38} r={999} /></div>
    {[0,1,2].map(i => (<div key={i} style={card}><Sk w="55%" h={20} /><div style={{marginTop:8}}><Sk w="85%" h={14} /></div><div style={{marginTop:8}}><Sk w="40%" h={14} /></div></div>))}
  </div>);
}

export function Home({ user, setUser, onLogout, setAuthNotice, groups, loadGroups, loadGroup, error, setError, theme, setTheme, onFeedback }: any) {
  const [showCreate, setShowCreate] = useState(false);
  const [showYou, setShowYou] = useState(false);
  // BUG FIX, 2026-11-05: YouView used to render inline at the BOTTOM of
  // Home ({showYou && <YouView/>} after all Home content), so tapping
  // the avatar appended a second page below Home in the same scroll —
  // Home, then You, then scrolling back to Home. It now replaces Home
  // via an early return, like App replaces Home with GroupView and like
  // YouView replaces itself with the archived view.
  if (showYou) return <YouView user={user} setUser={setUser} onLogout={onLogout} setAuthNotice={setAuthNotice} groups={groups} loadGroups={loadGroups} loadGroup={loadGroup} onBack={()=>setShowYou(false)} setError={setError}  theme={theme} setTheme={setTheme} onFeedback={onFeedback} />;
    const totals: any[] = groups?.totals || [];
    const openTotals = totals.filter((t:any)=>t.balance!==0);
    const activeCount = groups?.active?.length ?? 0;
  return (<div style={S}>
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <button aria-label="You" style={{width:48,height:48,borderRadius:'50%',background:'var(--avatar-green)',color:'var(--on-avatar)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18,flexShrink:0,border:'none',padding:0,cursor:'pointer'}} onClick={()=>setShowYou(true)}>{initials(user.name)}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:20,fontWeight:700}}>{user.name}</div>
          <div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>Mai ngiao, mai drama.</div>
        </div>
        <FeedbackIconButton onClick={()=>onFeedback(null)} />
      </div>
    </div>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'var(--danger-text)'}}>{error}</span><button style={btn} onClick={()=>loadGroups()}>Retry</button></div>}
    <OnboardingPrompts />
    {openTotals.length === 0 ? (<div style={{...homeCard,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20}}>
      <span>All settled across {activeCount} {activeCount===1 ? 'group' : 'groups'}</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--tint-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
    </div>) : (<div style={{background:'var(--hero-bg)',borderRadius:24,padding:20,marginBottom:20,color:'var(--hero-text)'}}>
      <div style={{fontSize:13,color:'var(--hero-muted)'}}>Across {activeCount} {activeCount===1 ? 'group' : 'groups'}</div>
      {groupBalancesByVerb(openTotals).map((g:any,gi:number)=>g.items.map((t:any,i:number)=>(<div key={t.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,marginTop:10,...(i===0 && gi>0 ? {borderTop:'2px dashed var(--hero-rule)',paddingTop:12,marginTop:12} : {})}}>
        <span style={{color:'var(--hero-muted)'}}>{i===0 ? g.verb : ''}</span>
        <strong style={{fontFamily:'var(--display)',fontSize:32,fontWeight:800,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',color:t.balance>0?'var(--hero-owed)':'var(--hero-owe)'}}>{fmt(Math.abs(t.balance),t.currency)}</strong>
      </div>)))}
      {openTotals.length > 1 && <p style={{fontSize:13,color:'var(--hero-muted)',marginBottom:0}}>Each currency stays separate. Nothing is converted.</p>}
    </div>)}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0}}>Your groups</h2>
      <button style={{...primary,borderRadius:999,padding:'10px 18px'}} onClick={()=>setShowCreate(true)}>+ New group</button>
    </div>
    {groups?.active?.length === 0 && <div style={{...homeCard,textAlign:'center',padding:'28px 20px'}}>
      <div style={{fontFamily:'var(--display)',fontSize:20,fontWeight:700}}>No groups yet</div>
      <p style={{color:'var(--muted)',margin:'8px 0 16px'}}>Make one for a trip, your flat or a regular makan crew, then share the invite link.</p>
      <button style={{...primary,padding:'12px 20px'}} onClick={()=>setShowCreate(true)}>Create a group</button>
    </div>}
    {groups?.active?.map((g:any)=>{
      const spent: any[] = g.spent || [];
      const my: any[] = g.myBalances || [];
      const openMy = my.filter((b:any)=>b.balance!==0);
      const noExpenses = (g.expenseCount ?? 0) === 0;
      return (<div key={g.id} style={{...homeCard,cursor:'pointer',display:'flex',gap:14,alignItems:'flex-start'}} onClick={()=>loadGroup(g.id)}>
        <span aria-hidden="true" style={{width:44,height:44,borderRadius:14,background:'var(--field)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--display)',fontWeight:800,fontSize:groupMark(g.name).isEmoji?22:18,flexShrink:0}}>{groupMark(g.name).mark}</span>
        <div style={{flex:1,minWidth:0}}>
        <strong style={{fontSize:17}}>{g.name}</strong>
        <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>{g.memberCount ?? '?'} {(g.memberCount===1)?'person':'people'} · {noExpenses ? 'No expenses yet' : `${g.expenseCount} ${g.expenseCount===1?'expense':'expenses'}`}{spent.length>0 ? ` · ${spent.map((s:any)=>fmt(s.amount,s.currency)).join(' + ')} spent` : ''}</div>
        {!noExpenses && openMy.length===0 && <div style={{marginTop:8,fontSize:14,color:'var(--muted)',display:'flex',alignItems:'center',gap:6}}>Settled <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></div>}
        {openMy.length>0 && <div style={{marginTop:8}}>{groupBalancesByVerb(openMy).map((vg:any,gi:number)=>vg.items.map((b:any,i:number)=>(<div key={b.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,fontSize:14,color:b.balance>0?'var(--tint-text)':'var(--danger-text)',...(i===0 && gi>0 ? {borderTop:balHairline,paddingTop:8,marginTop:8} : {})}}><span>{i===0 ? vg.verb : ''}</span><span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmt(Math.abs(b.balance),b.currency)}</span></div>)))}</div>}
        </div>
      </div>);
    })}
    {showCreate && <CreateGroupModal onClose={()=>setShowCreate(false)} onDone={(d:any)=>{setShowCreate(false);
      // HOME REFRESH, Nov 2026: creating a group used to leave the Home
      // list stale until the user went back AND the back-navigation fetch
      // completed — Home showed the pre-creation count, and the profile
      // count (same state, read after the fetch landed) already showed
      // the new one. loadGroup(d.id) only sets the single group detail,
      // never the list. So refresh the list HERE, in the background while
      // the user is inside the new group — by the time they tap back,
      // Home is already correct. back() still refetches too (belt and
      // braces for the other paths that land back on Home).
      if (d?.id) { loadGroup(d.id); loadGroups(); } else loadGroups();
    }} />}
  </div>);
}


export function YouView({ user, setUser, onLogout, setAuthNotice, groups, loadGroups, loadGroup, onBack, setError, theme, setTheme, onFeedback }: any) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name || '');
  const [editError, setEditError] = useState('');
  // CHANGE PASSWORD, Nov 2026: the row was disabled 'Coming soon'.
  // The sheet mirrors the Edit name sheet in this same view (fixed
  // container, 20px top radius, X button, input const, primary Save)
  // and the password fields reuse the Auth/Reset eye-toggle pattern
  // (one shared show/hide state for all three fields). On success the
  // sessions are deleted server-side, so the sheet shows a 'Log in
  // again' button that calls onLogout (clears the token, shows Auth).
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpShow, setCpShow] = useState(false);
  const [cpError, setCpError] = useState('');
  // PUSH NOTIFICATIONS, Nov 2026: one global on/off toggle per user
  // (not per group — v1 scope is new expense / edited / deleted /
  // settle, only for groups the user is in). Presence of a push
  // subscription row on the server IS the opt-in; turning it off
  // deletes the row. On iOS this only works when the app is added to
  // the Home Screen and launched standalone (iOS 16.4+).
  const pushSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  useEffect(() => {
    if (!pushSupported) { setPushEnabled(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setPushEnabled(!!sub);
      } catch { if (!cancelled) setPushEnabled(false); }
    })();
    return () => { cancelled = true; };
  }, [pushSupported]);
  async function togglePush() {
    if (!pushSupported || pushBusy) return;
    setPushError('');
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          try { await api('/api/me/push-subscription', 'DELETE', { endpoint: sub.endpoint }); } catch { /* server row may already be gone */ }
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setPushError(permission === 'denied' ? 'Notifications are blocked — allow them in your browser settings, then try again.' : 'Notifications were not allowed.'); setPushBusy(false); return; }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
        await api('/api/me/push-subscription', 'POST', sub.toJSON());
        setPushEnabled(true);
      }
    } catch (e: any) {
      setPushError(e?.message || 'Could not change notification settings.');
    } finally {
      setPushBusy(false);
    }
  }
  const archived: any[] = groups?.archived || [];
  const totalGroups = (groups?.active?.length || 0) + archived.length;
  const since = user.created_at ? (()=>{ const d = new Date(user.created_at); return `${d.toLocaleString('en-GB',{month:'short'})}, ${d.getFullYear()}`; })() : null;
  if (showArchived) return (<div style={S}>
    <button style={{...btn,borderRadius:999,padding:'10px 18px',marginBottom:16}} onClick={()=>setShowArchived(false)}>← You</button>
    <h2 style={{marginTop:0}}>Archive Groups</h2>
    {archived.length===0 && <p style={{color:'var(--muted)'}}>No archived groups.</p>}
    {archived.map((g:any)=>(<div key={g.id} style={{...homeCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><strong style={{flex:1,minWidth:0}}>{g.name}</strong><span style={{display:'flex',gap:8,flexShrink:0}}><AsyncButton style={btn} onClick={async()=>{await api(`/api/groups/${g.id}/restore`,'POST'); loadGroups(); setShowArchived(false);}}>Restore</AsyncButton><AsyncButton style={btn} onClick={()=>loadGroup(g.id)}>Open</AsyncButton></span></div>))}
  </div>);
  return (<div style={S}>
    <button style={{...btn,borderRadius:999,padding:'10px 18px',marginBottom:16}} onClick={onBack}>← Home</button>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',marginBottom:20}}>
      <div style={{width:72,height:72,borderRadius:'50%',background:'var(--avatar-green)',color:'var(--on-avatar)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:28}}>{initials(user.name)}</div>
      <div style={{fontSize:24,fontWeight:700,marginTop:12}}>{user.name}</div>
      <div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{user.email}</div>
      {since && <div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>User since {since} · {totalGroups} {totalGroups===1?'group':'groups'}{archived.length>0 ? ` (${archived.length} archived)` : ''}</div>}
    </div>
    <h3 style={{marginBottom:8}}>Appearance</h3>
    <div style={{...homeCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><span>Theme</span><ThemePill theme={theme} setTheme={setTheme} /></div>
    <h3 style={{marginBottom:8}}>Account</h3>
    <div className="flat-list" style={{...homeCard,padding:0,overflow:'hidden'}}>
      <button className="flat-row" onClick={()=>{setNameDraft(user.name); setEditError(''); setEditingName(true);}}><span>Edit name <span style={{color:'var(--muted)'}}>· Shown to your groups</span></span><span style={{color:'var(--muted)'}}>›</span></button>
      <button className="flat-row" onClick={()=>{setCpCurrent(''); setCpNew(''); setCpConfirm(''); setCpError(''); setShowChangePassword(true);}}><span>{user.has_password ? 'Change password' : 'Set password'}{!user.has_password && <span style={{color:'var(--muted)'}}> · Add email sign-in</span>}</span><span style={{color:'var(--muted)'}}>›</span></button>
      {/* GOOGLE SIGN-IN, Nov 2026: link a Google account to sign in
      with Google next time. Shown only until linked; afterwards the
      row reads Linked (informational). Linking does NOT change the
      name — Google only proves identity. */}
      {user.has_google ? (
        <div className="flat-row" style={{cursor:'default'}}><span>Google account</span><span style={{color:'var(--muted)',fontSize:15}}>Linked</span></div>
      ) : (
        <button className="flat-row" onClick={()=>{ window.location.href = googleAuthUrl(); }}><span>Link Google account <span style={{color:'var(--muted)'}}>· Sign in with Google</span></span><span style={{color:'var(--muted)'}}>›</span></button>
      )}
      {/* ADMIN BUTTON, Nov 2026: the admin screen was only reachable by
      typing ?admin. An Admin row now sits in the Account card, visible
      only when the current user is an admin (user.is_admin comes from
      /api/me — no BE change). It just navigates to ?admin; the admin
      session restore (or the admin login form) handles access from
      there, and the admin sign-in stays separate — this button does NOT
      promote the app session to admin. Non-admins never see it. */}
      {user.is_admin ? (<button className="flat-row" onClick={()=>{ window.location.href = '/?admin'; }}><span>Admin</span><span style={{color:'var(--muted)'}}>›</span></button>) : null}
    </div>
    <h3 style={{marginBottom:8}}>Notifications</h3>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <span>Push notifications <span style={{color:'var(--muted)'}}>· Expenses and settle-ups in your groups</span></span>
        <button type="button" role="switch" aria-checked={!!pushEnabled} aria-label="Push notifications" disabled={!pushSupported || pushBusy || pushEnabled === null} onClick={togglePush} style={{flexShrink:0,width:52,height:32,borderRadius:999,border:'1px solid var(--border)',background:pushEnabled ? 'var(--accent)' : 'var(--field)',cursor:(!pushSupported || pushBusy || pushEnabled === null) ? 'default' : 'pointer',opacity:(!pushSupported || pushBusy || pushEnabled === null) ? 0.5 : 1,padding:0,position:'relative'}}>
          <span style={{position:'absolute',top:3,left:pushEnabled ? 25 : 3,width:24,height:24,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}} />
        </button>
      </div>
      {pushError && <div style={{color:'var(--danger-text)',fontSize:13}}>{pushError}</div>}
      {!pushSupported && <div style={{color:'var(--muted)',fontSize:13}}>Push notifications are not supported in this browser. On iPhone, add the app to your Home Screen first (iOS 16.4+).</div>}
    </div>
    {/* FEEDBACK, Nov 2026: one of the three doors into the shared
    feedback sheet (the others are the Home and GroupView header
    icons). The row opens the sheet with no group preselected — the
    sheet falls back to the last-opened group, else the first active
    group. The row is a plain one-liner like Change password: it
    shipped with a two-line subline ("Bugs, ideas, questions — goes
    straight to Wai.") plus a teal "New" pill, and Wai's live
    screenshot 2026-11-13 showed that looking off against the
    one-line sibling rows — subline and pill dropped the same day. */}
    <h3 style={{marginBottom:8}}>Feedback</h3>
    <div className="flat-list" style={{...homeCard,padding:0,overflow:'hidden'}}>
      <button type="button" onClick={()=>onFeedback(null)} className="flat-row"><span>Send feedback</span><span style={{color:'var(--muted)'}}>›</span></button>
    </div>
    <h3 style={{marginBottom:8}}>Groups</h3>
    <div className="flat-list" style={{...homeCard,padding:0,overflow:'hidden'}}>
      <button className="flat-row" onClick={()=>setShowArchived(true)}><span>Archived groups</span><span style={{color:'var(--muted)'}}>{archived.length===0 ? 'No archived groups' : `${archived.length} archived · ${archived[0].name}`} ›</span></button>
    </div>
    <div style={{marginTop:20}}><AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={async()=>{await api('/api/auth/logout','POST'); onLogout();}}>Log out</AsyncButton></div>
    {editingName && (<Sheet title="Edit name" onClose={()=>setEditingName(false)} draggable={false} closeOnBackdrop={false}>
        <p style={{fontSize:13,color:'var(--muted)'}}>This is the name shown to your groups.</p>
        <input style={input} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} aria-label="Name" />
        {editError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{editError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{if (!nameDraft.trim()) { setEditError('Name cannot be empty'); return; } try{const d = await api('/api/me','PATCH',{name:nameDraft}); setUser(d.user); setEditingName(false);}catch(e:any){setEditError(e.message);}}}>Save</AsyncButton>
    </Sheet>)}
    {showChangePassword && (<Sheet title={user.has_password ? 'Change password' : 'Set password'} onClose={()=>setShowChangePassword(false)} draggable={false} closeOnBackdrop={false} maxHeight="88vh">
        {/* LOGOUT-ON-SUCCESS, Nov 2026: the sheet used to show a success
        state with a 'Log in again' button, but the X still closed the
        sheet without logging out — the session was already dead
        server-side, so the app sat in a stale signed-in state until
        the next API call 401'd (a refresh kicked you out). Now a
        successful change logs out immediately (onLogout) and sets an
        auth notice, so Auth explains why you are logged out. There is
        no success state in the sheet and no way to stay in the app. */}
        <p style={{fontSize:13,color:'var(--muted)'}}>{user.has_password ? 'You will be logged out everywhere after changing your password.' : 'Add a password so you can also sign in with your email. You will be logged out everywhere after setting it.'}</p>
        {user.has_password && (<><label>Current password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpCurrent} onChange={e=>setCpCurrent(e.target.value)} aria-label="Current password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div></>)}
        <label>New password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpNew} onChange={e=>setCpNew(e.target.value)} aria-label="New password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div>
        <label>Confirm new password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpConfirm} onChange={e=>setCpConfirm(e.target.value)} aria-label="Confirm new password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div>
        {cpError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{cpError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setCpError(''); if (user.has_password) { if (!cpCurrent || !cpNew || !cpConfirm) { setCpError('Please fill in all three fields'); return; } if (cpNew.length < 6) { setCpError('New password must be at least 6 characters'); return; } if (cpNew !== cpConfirm) { setCpError('New passwords do not match'); return; } if (cpNew === cpCurrent) { setCpError('New password must be different from the current password'); return; } try { await api('/api/me/password','POST',{currentPassword:cpCurrent,newPassword:cpNew}); setShowChangePassword(false); if (setAuthNotice) setAuthNotice('Your password was changed — please log in again with your new password.'); onLogout(); } catch (e:any) { setCpError(e.message); } } else { if (!cpNew || !cpConfirm) { setCpError('Please fill in both fields'); return; } if (cpNew.length < 6) { setCpError('New password must be at least 6 characters'); return; } if (cpNew !== cpConfirm) { setCpError('New passwords do not match'); return; } try { await api('/api/me/password','POST',{newPassword:cpNew}); setShowChangePassword(false); if (setAuthNotice) setAuthNotice('Your password was set — please log in again with your new password.'); onLogout(); } catch (e:any) { setCpError(e.message); } }}}>Save</AsyncButton>
    </Sheet>)}
  </div>);
}

export function CreateGroupModal({ onClose, onDone }: any) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('SGD');
  const [showCurrency, setShowCurrency] = useState(false);
  // Local error, same fix as Settings: this sheet overlays the home
  // view, so the parent's error rendered behind it and a failed Create
  // looked like "nothing happens" — the sheet just stayed open.
  const [createError, setCreateError] = useState('');
  return (<Sheet title="New group" onClose={onClose} maxHeight="88vh">
      <label>Group name</label><input style={input} placeholder="e.g. Bali Trip 🌴" value={name} onChange={e=>setName(e.target.value)} />
      <button type="button" onClick={()=>setShowCurrency(v=>!v)} style={{width:'100%',textAlign:'left',background:'var(--field)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12,color:'var(--text)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span><span style={{display:'block',fontSize:12,color:'var(--muted)'}}>Default currency</span><span style={{display:'block',marginTop:2}}>{cur}</span></span><span style={{color:'var(--muted)'}}>›</span></button>
      {showCurrency && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>{CURRENCIES.map(c=><button key={c} type="button" style={c===cur?catControlActive:catControl} onClick={()=>{setCur(c); setShowCurrency(false);}}>{c}</button>)}</div>}
      <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setCreateError(''); try{const d = await api('/api/groups','POST',{name,defaultCurrency:cur}); onDone(d);}catch(e:any){setCreateError(e.message);}}}>Create group</AsyncButton>
      {createError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{createError}</p>}
  </Sheet>);
}
