import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, getToken, CURRENCIES, CATEGORIES, fmt, toMinor, fromMinor } from './api';
import { DateField, fmtDate, todayIso } from './calendar';
import { Pie } from './pie';

const S = { maxW: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const;
const card: React.CSSProperties = { background:'#1c1c1e', border:'1px solid #2e2e2e', borderRadius:16, padding:14, marginBottom:12, color:'#f5f5f5', lineHeight:1.45 };
const rowCard: React.CSSProperties = { ...card, padding:'12px 14px', lineHeight:1.4 };
const avatar: React.CSSProperties = { width:40, height:40, borderRadius:'50%', background:'#65a30d', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 };
const noAccountChip: React.CSSProperties = { fontSize:11, background:'#422006', color:'#fbbf24', padding:'2px 8px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
const currencyChip: React.CSSProperties = { fontSize:12, background:'#134e4a', padding:'3px 10px', borderRadius:99, color:'#5eead4', fontWeight:600, whiteSpace:'nowrap' };
const btn: React.CSSProperties = { padding:'9px 14px', borderRadius:10, border:'1px solid #333', background:'#242424', color:'#fff' };
const primary: React.CSSProperties = { ...btn, background:'#2dd4bf', color:'#0f172a', borderColor:'#2dd4bf', fontWeight:600 };
const input: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid #333', borderRadius:10, margin:'4px 0 10px', background:'#242424', color:'#fff' };

// Per-button async loader: each button tracks its own busy state, so one
// in-flight action does not disable the whole screen. While busy the button
// is disabled, dimmed, and shows a spinner in front of its original label
// (the label is never replaced by "..." alone). A mounted ref guards the
// final setState for buttons that unmount mid-call (e.g. Leave group
// navigating back, Settle closing its modal).
type AsyncButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'> & {
  onClick: () => Promise<unknown> | void;
  disabled?: boolean;
};
function AsyncButton({ onClick, children, style, disabled, ...rest }: AsyncButtonProps) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  async function handle() {
    if (busy || disabled) return;
    setBusy(true);
    try { await onClick(); } finally { if (mounted.current) setBusy(false); }
  }
  return (<button {...rest} style={{ ...style, opacity: busy ? 0.6 : style?.opacity, cursor: busy ? 'not-allowed' : style?.cursor }} disabled={disabled || busy} onClick={handle}>
    {busy && <span className="btn-spinner" aria-hidden="true" />}{children}
  </button>);
}

// Reusable delete confirmation, following the SettleModal bottom-sheet
// pattern (fixed overlay, dark backdrop, sheet anchored to the bottom).
// The SettleModal has no Escape/backdrop dismissal, so this sheet is
// dismissed via Cancel only — no new dismissal mechanism is invented here.
// The confirm button is red and uses AsyncButton with a loader, like
// other async buttons. Callers pass an action that throws on failure;
// the GroupView wrapper shows that error (global setError, as today —
// error placement is a later chunk) and closes the sheet either way.
function ConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel }: any) {
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#1c1c1e',borderRadius:'16px 16px 0 0',padding:16,width:'100%',maxWidth:640}}>
      <h2 style={{marginTop:0}}>{title}</h2>
      <p style={{color:'#a3a3a3',lineHeight:1.45}}>{message}</p>
      <div style={{display:'flex',gap:8}}>
        <AsyncButton style={{...btn,background:'#dc2626',color:'#fff',borderColor:'#dc2626',fontWeight:600}} onClick={onConfirm}>{confirmLabel || 'Delete'}</AsyncButton>
        <button style={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>);
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [groups, setGroups] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [tab, setTab] = useState<'expenses'|'balances'|'members'|'activity'>('expenses');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function loadGroups() { try { setGroups(await api('/api/groups')); } catch(e:any){ setError(e.message); } }
  async function loadGroup(id: string) { try { const d = await api(`/api/groups/${id}`); setGroup(d); setTab('expenses'); } catch(e:any){ setError(e.message); } }
  useEffect(()=>{ if (getToken()) api('/api/me').then(d=>{ setUser(d.user); loadGroups(); }).catch(()=>setToken(null)); }, []);
  async function doAuth(mode: 'login'|'register', name: string, email: string, password: string) {
    setError(''); setLoading(true);
    try { const d = await api(`/api/auth/${mode}`, 'POST', mode==='register' ? {name,email,password} : {email,password}); setToken(d.token); setUser(d.user); await loadGroups(); }
    catch(e:any){ setError(e.message); } finally { setLoading(false); }
  }
  if (!user) return <Auth onAuth={doAuth} error={error} loading={loading} />;
  if (group) return <GroupView group={group} setGroup={setGroup} tab={tab} setTab={setTab} back={()=>{setGroup(null); loadGroups();}} reload={()=>loadGroup(group.id)} error={error} setError={setError} />;
  return <Home user={user} setUser={setUser} groups={groups} loadGroups={loadGroups} loadGroup={loadGroup} error={error} setError={setError} />;
}

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
}

// Person display for Settle up / Recorded payments: resolves a member id to
// its real name (falling back to the API-provided name, then 'Unknown
// member' — never 'undefined'), and labels the current user as 'You'.
// The avatar always uses the real name's initials, even when the label is
// 'You'. Only the display label changes; no names in state or payloads
// are mutated. If myMemberId is unavailable, no 'You' substitution happens.
function personDisplay(group: any, memberId: string | null | undefined, fallbackName: string | null | undefined) {
  const member = memberId ? group.members.find((x:any)=>x.id===memberId) : null;
  const name = member?.name || fallbackName || 'Unknown member';
  const label = (group.myMemberId && memberId && memberId===group.myMemberId) ? 'You' : name;
  return { name, label };
}

function Home({ user, setUser, groups, loadGroups, loadGroup, error, setError }: any) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name || '');
  const totals: any[] = groups?.totals || [];
  return (<div style={S}>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
      <div style={{width:48,height:48,borderRadius:'50%',background:'#65a30d',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18,flexShrink:0}}>{initials(user.name)}</div>
      <div style={{flex:1,minWidth:0}}>
        {editingName ? (<div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input style={{...input,margin:0}} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} aria-label="Name" />
          <AsyncButton style={primary} onClick={async()=>{try{const d = await api('/api/me','PATCH',{name:nameDraft}); setUser(d.user); setEditingName(false);}catch(e:any){setError(e.message);}}}>Save</AsyncButton>
          <button style={btn} onClick={()=>{setEditingName(false); setNameDraft(user.name);}}>Cancel</button>
        </div>) : (<>
          <div style={{fontSize:20,fontWeight:700}}>Hi, {user.name}</div>
          <div style={{fontSize:13,color:'#a3a3a3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>{user.email}</div>
        </>)}
      </div>
      {!editingName && <><button style={btn} onClick={()=>{setNameDraft(user.name); setEditingName(true);}}>Edit name</button>
      <AsyncButton style={btn} onClick={async()=>{await api('/api/auth/logout','POST'); setToken(null); setUser(null);}}>Log out</AsyncButton></>}
    </div>
    <h1 style={{marginBottom:4}}>Don't Ngiao</h1><p style={{color:'#a3a3a3',marginTop:0}}>Mai ngiao, mai drama.</p>
    {error && <p style={{color:'#f87171'}}>{error}</p>}
    <div style={{background:'linear-gradient(135deg,#0f766e,#059669,#10b981)',borderRadius:24,padding:20,marginBottom:20,color:'#fff'}}>
      <div style={{fontSize:12,letterSpacing:1.5,color:'#ccfbf1',fontWeight:600}}>ACROSS ALL YOUR GROUPS</div>
      {totals.length === 0 || totals.every((t:any)=>t.balance===0) ? (<p style={{margin:'12px 0 0'}}>All settled.</p>) : totals.map((t:any)=>(<div key={t.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:10}}>
        <strong style={{fontSize:28}}>{fmt(t.balance,t.currency)}</strong>
        <span style={{color:'#ccfbf1'}}>{t.balance>0 ? 'owed to you' : 'you owe'}</span>
      </div>))}
      <p style={{fontSize:13,color:'#ccfbf1',marginBottom:0}}>Kept separate per currency — no conversion. Check a group below for who to pay.</p>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <h2 style={{margin:0}}>Your groups</h2>
      <button style={{...primary,borderRadius:999,padding:'10px 18px'}} onClick={()=>setShowCreate(true)}>+ New group</button>
    </div>
    {groups?.active?.length === 0 && <p style={{color:'#a3a3a3'}}>No groups yet — tap + New group to create one.</p>}
    {groups?.active?.map((g:any)=>{
      const spent: any[] = g.spent || [];
      const my: any[] = g.myBalances || [];
      return (<div key={g.id} style={{...card,cursor:'pointer'}} onClick={()=>loadGroup(g.id)}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
          <strong style={{fontSize:17}}>{g.name}</strong>
          <span style={{fontSize:12,background:'#2a2a2a',padding:'3px 10px',borderRadius:99,color:'#a3a3a3'}}>{g.defaultCurrency}</span>
        </div>
        <div style={{fontSize:13,color:'#a3a3a3',marginTop:6}}>{g.memberCount ?? '?'} {(g.memberCount===1)?'person':'people'} · {g.expenseCount ?? '?'} expenses{spent.length>0 ? ` · ${spent.map((s:any)=>fmt(s.amount,s.currency)).join(' + ')} spent` : ''}</div>
        {my.length>0 && <div style={{marginTop:8}}>{my.map((b:any)=>(<div key={b.currency} style={{fontSize:14,color:b.balance>0?'#5eead4':b.balance<0?'#f87171':'#a3a3a3'}}>{fmt(b.balance,b.currency)} {b.balance>0?'owed to you':b.balance<0?'you owe':'settled'}</div>))}</div>}
      </div>);
    })}
    {groups?.archived?.length > 0 && <><h2>Archived groups</h2>{groups.archived.map((g:any)=>(<div key={g.id} style={{...rowCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><strong style={{flex:1,minWidth:0}}>{g.name}</strong><span style={{display:'flex',gap:8,flexShrink:0}}><AsyncButton style={btn} onClick={async()=>{await api(`/api/groups/${g.id}/restore`,'POST'); loadGroups();}}>Restore</AsyncButton><AsyncButton style={btn} onClick={()=>loadGroup(g.id)}>Open</AsyncButton></span></div>))}</>}
    <div style={{...card,marginTop:20}}>
      <h3 style={{marginTop:0}}>How settling works here</h3>
      <p style={{fontSize:13,color:'#a3a3a3',marginBottom:0}}>Balances are per currency and never converted. Recording a payment never moves real money — it just records that money changed hands. Settle from a group's Balances tab, for one currency at a time.</p>
    </div>
    {showCreate && <CreateGroupModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false); loadGroups();}} setError={setError} />}
  </div>);
}

function CreateGroupModal({ onClose, onDone, setError }: any) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('SGD');
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>New group</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Group name</label><input style={input} placeholder="Group name, e.g. KL Trip" value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency <select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></label>
      <AsyncButton style={primary} onClick={async()=>{try{await api('/api/groups','POST',{name,defaultCurrency:cur}); onDone();}catch(e:any){setError(e.message);}}}>Create group</AsyncButton>
    </div>
  </div>);
}

function Auth({ onAuth, error, loading }: any) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return (<div style={S}><h1>Don't Ngiao</h1><p>Mai ngiao, mai drama.</p>
    {error && <p style={{color:'#f87171'}}>{error}</p>}
    {mode==='register' && <><label>Name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} /></>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} />
    <label>Password</label><input type="password" style={input} value={password} onChange={e=>setPassword(e.target.value)} />
    <button style={{...primary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={()=>onAuth(mode,name,email,password)}>{loading && <span className="btn-spinner" aria-hidden="true" />}{loading ? (mode==='login' ? 'Logging in…' : 'Creating account…') : (mode==='login' ? 'Log in' : 'Create account')}</button>{' '}
    <button style={btn} onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Need an account? Register':'Already have an account? Log in'}</button>
    <p style={{color:'#a3a3a3',fontSize:13}}>Prototype port: email/password only, no email verification or password reset yet.</p>
  </div>);
}

function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settle, setSettle] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [editingMemberId, setEditingMemberId] = useState<string|null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [catView, setCatView] = useState<'group'|'mine'>('group');
  const [catCur, setCatCur] = useState<string>('');
  const currencies = Object.keys(group.categoryGroup || {});
  const cur = catCur || currencies[0] || group.defaultCurrency;
  const catData = (catView==='group' ? group.categoryGroup?.[cur] : group.categoryMine?.[cur]) || {};
  return (<div style={S}>
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <button style={btn} onClick={back}>← Groups</button>
      <button style={btn} onClick={()=>setShowSettings(true)} aria-label="Group settings">⚙ Settings</button>
    </div>
    <h1 style={{marginBottom:4}}>{group.name}</h1>
    {group.isArchived && <p style={{background:'#422006',padding:8,borderRadius:8}}>This group is archived. Restore it from Settings or the home screen to edit it again.</p>}
    <p style={{color:'#a3a3a3',marginTop:0,lineHeight:1.4}}>Default currency: {group.defaultCurrency} · {group.members.length} members</p>
    {error && <p style={{color:'#f87171'}}>{error}</p>}
    <div style={{display:'flex',gap:0,borderBottom:'1px solid #333',marginBottom:12,background:'#1c1c1e'}}>
      {(['expenses','balances','members','activity'] as const).map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'10px 4px',fontSize:14,color:tab===t?'#fff':'#a3a3a3',background:'transparent',border:'none',borderBottom:tab===t?'3px solid #2dd4bf':'none',textTransform:'capitalize'}}>{t}</button>))}
    </div>
    {tab==='expenses' && <>
      <div style={card}><h3 style={{marginTop:0}}>Spend by category</h3>
        <div><button style={catView==='group'?primary:btn} onClick={()=>setCatView('group')}>Group</button>{' '}<button style={catView==='mine'?primary:btn} onClick={()=>setCatView('mine')}>Mine</button>{' '}
        {currencies.length>1 && <select value={cur} onChange={e=>setCatCur(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select>}</div>
        <Pie data={catData} currency={cur} />
        <p style={{fontSize:12,color:'#a3a3a3'}}>{catView==='mine' ? 'Mine = your split shares only, computed on the server. Other members\' individual breakdowns are never sent to you.' : 'Group = total spend for the whole group.'} Per currency only, never converted.</p>
      </div>
      {group.expenses.length===0 && <p>No expenses yet.</p>}
      {group.expenses.map((e:any)=>(<div key={e.id} style={card}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><strong>{e.description}</strong> <span style={{fontSize:12,background:'#2a2a2a',padding:'2px 6px',borderRadius:99}}>{e.category}</span> <span style={{fontSize:12,background:'#134e4a',padding:'2px 6px',borderRadius:99}}>{e.currency}</span><div style={{fontSize:13,color:'#a3a3a3'}}>Paid by {e.payerName} · {fmtDate(e.date)}</div></div>
        <div style={{textAlign:'right'}}><div><strong>{e.display}</strong></div><div style={{fontSize:12,color:'#a3a3a3'}}>{e.currency}</div></div></div>
        <div style={{fontSize:13,marginTop:6}}>{e.splits.map((s:any)=>{const m=group.members.find((x:any)=>x.id===s.member_id); return `${m?.name}: ${fmt(s.amount_minor,e.currency)}`;}).join(' · ')}</div>
        <button style={{...btn,marginTop:8}} onClick={()=>setConfirm({title:'Delete expense?',message:`Delete '${e.description}' (${e.display})? This will also remove its splits. This cannot be undone.`,action:async()=>{await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); reload();}})}>Delete expense</button>
      </div>))}
      {!showExpense && <div style={{position:'fixed',left:0,right:0,bottom:0,background:'#1c1c1e',borderTop:'1px solid #333',padding:12,textAlign:'center'}}><button style={primary} onClick={()=>setShowExpense(true)}>+ Add expense</button></div>}
    </>}
    {tab==='balances' && <>
      {group.balances.length===0 && <p>No balances yet.</p>}
      {(() => {
        const balCurrencies: string[] = [];
        for (const b of group.balances) if (!balCurrencies.includes(b.currency)) balCurrencies.push(b.currency);
        return balCurrencies.map((cur, ci) => {
          const spent = group.expenses.filter((e:any)=>e.currency===cur).reduce((sum:number,e:any)=>sum+e.amount_minor, 0);
          return (<div key={cur}>
            <div style={{display:'flex',alignItems:'center',gap:8,margin:`${ci===0?0:16}px 0 8px`}}>
              <span style={currencyChip}>{cur}</span>
              <span style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>{fmt(spent, cur)} spent</span>
            </div>
            {group.balances.filter((b:any)=>b.currency===cur).map((b:any)=>{
              const member = group.members.find((x:any)=>x.id===b.memberId);
              const displayName = b.memberId===group.myMemberId ? `You (${b.memberName})` : b.memberName;
              return (<div key={b.memberId+b.currency} style={{...rowCard,display:'flex',alignItems:'center',gap:12}}>
                <div style={avatar}>{initials(b.memberName)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,lineHeight:1.4}}>{displayName}{member && !member.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
                  <div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Paid {fmt(b.paid ?? 0, cur)} · share {fmt(b.share ?? 0, cur)}</div>
                </div>
                <strong style={{color:b.balance>0?'#5eead4':b.balance<0?'#f87171':'#a3a3a3',fontSize:16,whiteSpace:'nowrap',flexShrink:0,textAlign:'right'}}>{b.balance>0?'+':''}{b.display}</strong>
              </div>);
            })}
          </div>);
        });
      })()}
      <h3>Settle up</h3>
      {group.suggestions.length===0 && <p>All settled.</p>}
      {group.suggestions.map((s:any,i:number)=>{
        const from = personDisplay(group, s.fromMemberId, s.fromName);
        const to = personDisplay(group, s.toMemberId, s.toName);
        return (<div key={i} style={{...rowCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0,lineHeight:1.4,display:'flex',flexWrap:'wrap',alignItems:'center',gap:6}}>
            <span style={{...avatar,width:28,height:28,fontSize:12}}>{initials(from.name)}</span>
            <strong>{from.label}</strong>
            <span style={{color:'#a3a3a3'}}>owes</span>
            <span style={{...avatar,width:28,height:28,fontSize:12}}>{initials(to.name)}</span>
            <strong>{to.label}</strong>
            <strong>{s.display}</strong>
          </div>
          <button style={{...primary,flexShrink:0}} onClick={()=>setSettle(s)}>Settle</button>
        </div>);
      })}
      <h3>Recorded payments</h3>
      {group.payments.map((p:any)=>{
        const from = personDisplay(group, p.from_member_id, p.fromName);
        const to = personDisplay(group, p.to_member_id, p.toName);
        return (<div key={p.id} style={{...rowCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6}}>
              <span style={{...avatar,width:28,height:28,fontSize:12}}>{initials(from.name)}</span>
              <strong>{from.label}</strong>
              <span style={{color:'#a3a3a3'}}>paid</span>
              <span style={{...avatar,width:28,height:28,fontSize:12}}>{initials(to.name)}</span>
              <strong>{to.label}</strong>
            </div>
            <div style={{fontSize:13,lineHeight:1.4,marginTop:4}}><strong>{p.display}</strong> <span style={{color:'#a3a3a3'}}>· {fmtDate(p.date)}</span></div>
          </div>
          <button style={{...btn,flexShrink:0}} onClick={()=>setConfirm({title:'Delete payment?',message:`Delete the ${p.display} payment from ${from.label} to ${to.label} on ${fmtDate(p.date)}? This cannot be undone.`,action:async()=>{await api(`/api/groups/${group.id}/payments/${p.id}`,'DELETE'); reload();}})}>Delete</button>
        </div>);
      })}
    </>}
    {tab==='members' && <>
      {group.members.map((m:any)=>{
        const isEditing = editingMemberId===m.id;
        return (<div key={m.id} style={{...rowCard,display:'flex',alignItems:'center',gap:12}}>
        <div style={avatar}>{initials(m.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          {isEditing ? (<input style={{...input,margin:0}} placeholder="Email" value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} aria-label="Member email" />) : (<>
          <div style={{fontWeight:600,lineHeight:1.4}}>{m.name}{!m.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
          {m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>) : (!m.user_id ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Placeholder — no email set, no one can claim this yet</div>) : null)}
          {!m.user_id && m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Placeholder — they can claim this by signing up with the same email</div>) : null}
          </>)}
        </div>
        {isEditing ? (<span style={{display:'flex',gap:8,flexShrink:0}}>
          <AsyncButton style={primary} onClick={async()=>{try{await api(`/api/groups/${group.id}/members/${m.id}`,'PATCH',{email:emailDraft}); setEditingMemberId(null); reload();}catch(er:any){setError(er.message);}}}>Save</AsyncButton>
          <button style={btn} onClick={()=>setEditingMemberId(null)}>Cancel</button>
        </span>) : (<span style={{display:'flex',gap:8,flexShrink:0}}>
          {!m.user_id ? (<button style={btn} onClick={()=>{setEditingMemberId(m.id); setEmailDraft(m.email || '');}}>Edit email</button>) : null}
          <button style={{...btn,flexShrink:0}} onClick={()=>setConfirm({title:'Remove member?',message:`Remove ${m.name} from this group? This cannot be undone.`,action:async()=>{await api(`/api/groups/${group.id}/members/${m.id}`,'DELETE'); reload();}})}>Remove</button>
        </span>)}
      </div>);})}
      <AddMember groupId={group.id} reload={reload} setError={setError} />
    </>}
    {tab==='activity' && <>
      {group.activity.length===0 && <p>No activity yet.</p>}
      {group.activity.map((a:any)=>(<div key={a.id} style={card}><strong>{activityTitle(a)}</strong><div style={{fontSize:13,color:'#a3a3a3'}}>{a.actor_name} · {new Date(a.created_at).toLocaleString()} {a.amount_minor!=null ? `· ${fmt(a.amount_minor,a.currency)}` : ''} {a.detail?`· ${a.detail}`:''}</div></div>))}
    </>}
    {showExpense && <ExpenseModal group={group} onClose={()=>setShowExpense(false)} reload={()=>{setShowExpense(false); reload();}} setError={setError} />}
    {settle && <SettleModal group={group} suggestion={settle} onClose={()=>setSettle(null)} reload={()=>{setSettle(null); reload();}} setError={setError} />}
    {showSettings && <SettingsModal group={group} onClose={()=>setShowSettings(false)} reload={()=>{setShowSettings(false); reload();}} back={back} setError={setError} />}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){setError(er.message);}finally{setConfirm(null);}}} />}
  </div>);
}
function activityTitle(a:any) {
  const map: Record<string,string> = { group_created:'Group created', group_renamed:'Group renamed', group_currency_changed:'Default currency changed', expense_added:'Expense added', expense_deleted:'Expense deleted', payment_recorded:'Payment recorded', payment_deleted:'Payment deleted', member_added:'Member added', member_removed:'Member removed', member_email_updated:'Member email updated', member_left:'Member left', group_archived:'Group archived', group_restored:'Group restored' };
  return map[a.type] || a.type;
}
function AddMember({ groupId, reload, setError }: any) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  return (<div style={card}><h3 style={{marginTop:0}}>Add member</h3>
    <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
    <input style={input} placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
    <p style={{fontSize:13,color:'#a3a3a3',marginTop:-6,marginBottom:10,lineHeight:1.4}}>Links an existing account, or a placeholder they can claim.</p>
    <AsyncButton style={primary} onClick={async()=>{try{await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); setName(''); setEmail(''); reload();}catch(e:any){setError(e.message);}}}>Add member</AsyncButton>
  </div>);
}

function ExpenseModal({ group, onClose, reload, setError }: any) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState(group.defaultCurrency);
  const [date, setDate] = useState(todayIso()); const [payer, setPayer] = useState(group.members[0]?.id || ''); const [category, setCategory] = useState('Uncategorized');
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'>('equal');
  const [selected, setSelected] = useState<string[]>(group.members.map((m:any)=>m.id));
  const [percents, setPercents] = useState<Record<string,string>>({}); const [exact, setExact] = useState<Record<string,string>>({});
  const toggle = (id:string)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'#111111',padding:'8px 0'}}><h2 style={{margin:0}}>Add expense</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Description</label><input style={input} value={description} onChange={e=>setDescription(e.target.value)} />
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div><label>Amount</label><input style={input} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
      <div><label>Currency</label><select style={input} value={currency} onChange={e=>setCurrency(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></div></div>
      <label>Date</label><div style={{marginBottom:10}}><DateField id="exp-date" value={date} onChange={setDate} /></div>
      <label>Paid by</label><select style={input} value={payer} onChange={e=>setPayer(e.target.value)}>{group.members.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <label>Category</label><select style={input} value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
      <label>Split</label><select style={input} value={splitType} onChange={e=>setSplitType(e.target.value as any)}><option value="equal">Equal</option><option value="exact">Exact amounts</option><option value="percent">Percentages</option></select>
      {group.members.map((m:any)=>(<label key={m.id} style={{display:'block',marginBottom:6}}><input type="checkbox" checked={selected.includes(m.id)} onChange={()=>toggle(m.id)} /> {m.name}
        {selected.includes(m.id) && splitType==='percent' && <input style={{...input,width:120,marginLeft:8}} placeholder="%" value={percents[m.id]||''} onChange={e=>setPercents({...percents,[m.id]:e.target.value})} />}
        {selected.includes(m.id) && splitType==='exact' && <input style={{...input,width:140,marginLeft:8}} placeholder={currency} value={exact[m.id]||''} onChange={e=>setExact({...exact,[m.id]:e.target.value})} />}
      </label>))}
      <AsyncButton style={primary} onClick={async()=>{
        const amountMinor = toMinor(amount, currency); if (amountMinor===null) { setError('Enter a valid positive amount'); return; }
        const body: any = { description, amountMinor, currency, date, paidByMemberId: payer, category, splitType, participants: selected };
        if (splitType==='percent') body.percents = selected.map(id=>Number(percents[id]||0));
        if (splitType==='exact') { const arr = selected.map(id=>toMinor(exact[id]||'', currency)); if (arr.some(v=>v===null)) { setError('Enter valid exact amounts'); return; } body.exactAmounts = arr; }
        try { await api(`/api/groups/${group.id}/expenses`,'POST',body); reload(); } catch(e:any){ setError(e.message); }
      }}>Add expense</AsyncButton>
    </div>
  </div>);
}
function SettleModal({ group, suggestion, onClose, reload, setError }: any) {
  const [amount, setAmount] = useState(fromMinor(suggestion.amountMinor, suggestion.currency));
  const [date, setDate] = useState(todayIso());
  const minor = toMinor(amount, suggestion.currency);
  const remaining = minor===null ? null : suggestion.amountMinor - minor;
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#1c1c1e',borderRadius:'16px 16px 0 0',padding:16,width:'100%',maxWidth:640}}>
      <h2 style={{marginTop:0}}>Settle</h2><p>{suggestion.fromName} → {suggestion.toName} · {suggestion.currency}</p>
      <p style={{color:'#a3a3a3'}}>Recording a payment never moves real money — it just records that money changed hands.</p>
      <label>Amount ({suggestion.currency})</label><input style={input} value={amount} onChange={e=>setAmount(e.target.value)} />
      {remaining!==null && remaining>0 && <p style={{color:'#fbbf24'}}>Partial payment: {fmt(remaining, suggestion.currency)} will remain outstanding.</p>}
      {remaining!==null && remaining<0 && <p style={{color:'#f87171'}}>Amount exceeds the outstanding {fmt(suggestion.amountMinor, suggestion.currency)}.</p>}
      <label>Date</label><div style={{marginBottom:10}}><DateField id="pay-date" value={date} onChange={setDate} /></div>
      <AsyncButton style={primary} disabled={minor===null || minor<=0 || minor>suggestion.amountMinor} onClick={async()=>{try{await api(`/api/groups/${group.id}/payments`,'POST',{fromMemberId:suggestion.fromMemberId,toMemberId:suggestion.toMemberId,amountMinor:minor,currency:suggestion.currency,date}); reload();}catch(e:any){setError(e.message);}}}>Settle</AsyncButton>{' '}<button style={btn} onClick={onClose}>Cancel</button>
    </div>
  </div>);
}
function SettingsModal({ group, onClose, reload, back, setError }: any) {
  const [name, setName] = useState(group.name); const [cur, setCur] = useState(group.defaultCurrency);
  const hasExpense = !!group.myHasExpense;
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Group name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency (new expenses only — existing expenses keep their currency)</label><select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
      <AsyncButton style={primary} onClick={async()=>{try{await api(`/api/groups/${group.id}`,'PATCH',{name,defaultCurrency:cur}); reload();}catch(e:any){setError(e.message);}}}>Save settings</AsyncButton>
      <hr style={{margin:'20px 0'}} />
      {group.isArchived
        ? <AsyncButton style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/restore`,'POST'); reload();}catch(e:any){setError(e.message);}}}>Restore group</AsyncButton>
        : <AsyncButton style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/archive`,'POST'); reload();}catch(e:any){setError(e.message);}}}>Archive group</AsyncButton>}
      <p style={{fontSize:13,color:'#a3a3a3'}}>Archiving hides the group from the active list and preserves all expenses, payments, members and activity. It can be restored.</p>
      <div style={{marginTop:16}}>
        <AsyncButton style={{...btn, opacity: hasExpense?0.5:1, cursor: hasExpense?'not-allowed':'pointer'}} disabled={hasExpense} aria-disabled={hasExpense} onClick={async()=>{try{const r = await api(`/api/groups/${group.id}/leave`,'POST'); if (r.groupDeleted || r.groupArchived) back(); else reload();}catch(e:any){setError(e.message);}}}>Leave group</AsyncButton>
        {hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled. The server enforces the same rule.</p>}
        {!hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>You have no expenses in this group, so you can leave. If you are the last member, the group is deleted (it has no expenses to preserve).</p>}
      </div>
    </div>
  </div>);
}
