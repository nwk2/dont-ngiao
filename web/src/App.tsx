import React, { useEffect, useState } from 'react';
import { api, setToken, getToken, CURRENCIES, CATEGORIES, fmt, toMinor, fromMinor } from './api';
import { DateField, fmtDate, todayIso } from './calendar';
import { Pie } from './pie';

const S = { maxW: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const;
const card: React.CSSProperties = { background:'#fff', border:'1px solid #e5e5e5', borderRadius:12, padding:12, marginBottom:10 };
const btn: React.CSSProperties = { padding:'9px 14px', borderRadius:8, border:'1px solid #ccc', background:'#fff' };
const primary: React.CSSProperties = { ...btn, background:'#1a1a1a', color:'#fff', borderColor:'#1a1a1a' };
const input: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'9px', border:'1px solid #ccc', borderRadius:8, margin:'4px 0 10px' };

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
  return (<div style={S}>
    <h1>Don't Ngiao</h1><p style={{color:'#666'}}>Split expenses fairly. Don't be ngiao.</p>
    {error && <p style={{color:'red'}}>{error}</p>}
    <CreateGroup onDone={loadGroups} setError={setError} />
    <h2>Your groups</h2>
    {groups?.active?.length === 0 && <p>No groups yet — create one above.</p>}
    {groups?.active?.map((g:any)=>(<div key={g.id} style={card} onClick={()=>loadGroup(g.id)}>
      <strong>{g.name}</strong> <span style={{color:'#666'}}>({g.defaultCurrency})</span>
      <div style={{fontSize:13,marginTop:4}}>{g.balances.map((b:any)=><span key={b.currency} style={{marginRight:10}}>{b.currency}: {fmt(b.balance,b.currency)}</span>)}</div>
    </div>))}
    {groups?.archived?.length > 0 && <><h2>Archived groups</h2>{groups.archived.map((g:any)=>(<div key={g.id} style={card}><strong>{g.name}</strong> <button style={btn} onClick={async()=>{await api(`/api/groups/${g.id}/restore`,'POST'); loadGroups();}}>Restore</button> <button style={btn} onClick={()=>loadGroup(g.id)}>Open</button></div>))}</>}
    <button style={btn} onClick={async()=>{await api('/api/auth/logout','POST'); setToken(null); setUser(null);}}>Log out</button>
  </div>);
}

function Auth({ onAuth, error, loading }: any) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return (<div style={S}><h1>Don't Ngiao</h1><p>Split expenses fairly. Don't be ngiao.</p>
    {error && <p style={{color:'red'}}>{error}</p>}
    {mode==='register' && <><label>Name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} /></>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} />
    <label>Password</label><input type="password" style={input} value={password} onChange={e=>setPassword(e.target.value)} />
    <button style={primary} disabled={loading} onClick={()=>onAuth(mode,name,email,password)}>{mode==='login'?'Log in':'Create account'}</button>{' '}
    <button style={btn} onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Need an account? Register':'Already have an account? Log in'}</button>
    <p style={{color:'#666',fontSize:13}}>Prototype port: email/password only, no email verification or password reset yet.</p>
  </div>);
}
function CreateGroup({ onDone, setError }: any) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('SGD');
  return (<div style={card}><h3 style={{marginTop:0}}>Create group</h3>
    <input style={input} placeholder="Group name, e.g. KL Trip" value={name} onChange={e=>setName(e.target.value)} />
    <label>Default currency <select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></label>
    <button style={primary} onClick={async()=>{try{await api('/api/groups','POST',{name,defaultCurrency:cur}); setName(''); onDone();}catch(e:any){setError(e.message);}}}>Create group</button>
  </div>);
}

function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settle, setSettle] = useState<any>(null);
  const [catView, setCatView] = useState<'group'|'mine'>('group');
  const [catCur, setCatCur] = useState<string>('');
  const currencies = Object.keys(group.categoryGroup || {});
  const cur = catCur || currencies[0] || group.defaultCurrency;
  const catData = (catView==='group' ? group.categoryGroup?.[cur] : group.categoryMine?.[cur]) || {};
  return (<div style={S}>
    <button style={btn} onClick={back}>← Groups</button>{' '}
    <button style={btn} onClick={()=>setShowSettings(true)} aria-label="Group settings">⚙ Settings</button>
    <h1 style={{marginBottom:4}}>{group.name}</h1>
    {group.isArchived && <p style={{background:'#fff3cd',padding:8,borderRadius:8}}>This group is archived. Restore it from Settings or the home screen to edit it again.</p>}
    <p style={{color:'#666',marginTop:0}}>Default currency: {group.defaultCurrency} · {group.members.length} members</p>
    {error && <p style={{color:'red'}}>{error}</p>}
    <div style={{display:'flex',gap:0,borderBottom:'1px solid #ddd',marginBottom:12}}>
      {(['expenses','balances','members','activity'] as const).map(t=>(<button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'10px 4px',fontSize:12,background:tab===t?'#fff':'transparent',border:'none',borderBottom:tab===t?'3px solid #1a1a1a':'none',textTransform:'capitalize'}}>{t}</button>))}
    </div>
    {tab==='expenses' && <>
      <div style={card}><h3 style={{marginTop:0}}>Spend by category</h3>
        <div><button style={catView==='group'?primary:btn} onClick={()=>setCatView('group')}>Group</button>{' '}<button style={catView==='mine'?primary:btn} onClick={()=>setCatView('mine')}>Mine</button>{' '}
        {currencies.length>1 && <select value={cur} onChange={e=>setCatCur(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select>}</div>
        <Pie data={catData} currency={cur} />
        <p style={{fontSize:12,color:'#666'}}>{catView==='mine' ? 'Mine = your split shares only, computed on the server. Other members\' individual breakdowns are never sent to you.' : 'Group = total spend for the whole group.'} Per currency only, never converted.</p>
      </div>
      {group.expenses.length===0 && <p>No expenses yet.</p>}
      {group.expenses.map((e:any)=>(<div key={e.id} style={card}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><strong>{e.description}</strong> <span style={{fontSize:12,background:'#eee',padding:'2px 6px',borderRadius:99}}>{e.category}</span> <span style={{fontSize:12,background:'#e8f0fe',padding:'2px 6px',borderRadius:99}}>{e.currency}</span><div style={{fontSize:13,color:'#666'}}>Paid by {e.payerName} · {fmtDate(e.date)}</div></div>
        <div style={{textAlign:'right'}}><div><strong>{e.display}</strong></div><div style={{fontSize:12,color:'#666'}}>{e.currency}</div></div></div>
        <div style={{fontSize:13,marginTop:6}}>{e.splits.map((s:any)=>{const m=group.members.find((x:any)=>x.id===s.member_id); return `${m?.name}: ${fmt(s.amount_minor,e.currency)}`;}).join(' · ')}</div>
        <button style={{...btn,marginTop:8}} onClick={async()=>{try{await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); reload();}catch(er:any){setError(er.message);}}}>Delete expense</button>
      </div>))}
      {!showExpense && <div style={{position:'fixed',left:0,right:0,bottom:0,background:'#fff',borderTop:'1px solid #ddd',padding:12,textAlign:'center'}}><button style={primary} onClick={()=>setShowExpense(true)}>+ Add expense</button></div>}
    </>}
    {tab==='balances' && <>
      {group.balances.length===0 && <p>No balances yet.</p>}
      {group.balances.map((b:any)=>(<div key={b.memberId+b.currency} style={card}>{b.memberName}: {b.display} <span style={{color:'#666'}}>({b.currency})</span></div>))}
      <h3>Settle up</h3>
      {group.suggestions.length===0 && <p>All settled.</p>}
      {group.suggestions.map((s:any,i:number)=>(<div key={i} style={card}>{s.fromName} owes {s.toName}: <strong>{s.display}</strong>{' '}<button style={primary} onClick={()=>setSettle(s)}>Settle</button></div>))}
      <h3>Recorded payments</h3>
      {group.payments.map((p:any)=>(<div key={p.id} style={card}>{p.fromName} → {p.toName}: {p.display} · {fmtDate(p.date)} <button style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/payments/${p.id}`,'DELETE'); reload();}catch(er:any){setError(er.message);}}}>Delete</button></div>))}
    </>}
    {tab==='members' && <>
      {group.members.map((m:any)=>(<div key={m.id} style={card}>{m.name}{m.email?` (${m.email})`:''}{m.user_id?'':' · placeholder — they can claim this by signing up with the same email'} <button style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/members/${m.id}`,'DELETE'); reload();}catch(er:any){setError(er.message);}}}>Remove</button></div>))}
      <AddMember groupId={group.id} reload={reload} setError={setError} />
    </>}
    {tab==='activity' && <>
      {group.activity.length===0 && <p>No activity yet.</p>}
      {group.activity.map((a:any)=>(<div key={a.id} style={card}><strong>{activityTitle(a)}</strong><div style={{fontSize:13,color:'#666'}}>{a.actor_name} · {new Date(a.created_at).toLocaleString()} {a.amount_minor!=null ? `· ${fmt(a.amount_minor,a.currency)}` : ''} {a.detail?`· ${a.detail}`:''}</div></div>))}
    </>}
    {showExpense && <ExpenseModal group={group} onClose={()=>setShowExpense(false)} reload={()=>{setShowExpense(false); reload();}} setError={setError} />}
    {settle && <SettleModal group={group} suggestion={settle} onClose={()=>setSettle(null)} reload={()=>{setSettle(null); reload();}} setError={setError} />}
    {showSettings && <SettingsModal group={group} onClose={()=>setShowSettings(false)} reload={()=>{setShowSettings(false); reload();}} back={back} setError={setError} />}
  </div>);
}
function activityTitle(a:any) {
  const map: Record<string,string> = { group_created:'Group created', group_renamed:'Group renamed', group_currency_changed:'Default currency changed', expense_added:'Expense added', expense_deleted:'Expense deleted', payment_recorded:'Payment recorded', payment_deleted:'Payment deleted', member_added:'Member added', member_removed:'Member removed', member_left:'Member left', group_archived:'Group archived', group_restored:'Group restored' };
  return map[a.type] || a.type;
}
function AddMember({ groupId, reload, setError }: any) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  return (<div style={card}><h3 style={{marginTop:0}}>Add member</h3>
    <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
    <input style={input} placeholder="Email (optional — links an existing account, or a placeholder they can claim)" value={email} onChange={e=>setEmail(e.target.value)} />
    <button style={primary} onClick={async()=>{try{await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); setName(''); setEmail(''); reload();}catch(e:any){setError(e.message);}}}>Add member</button>
  </div>);
}

function ExpenseModal({ group, onClose, reload, setError }: any) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState(group.defaultCurrency);
  const [date, setDate] = useState(todayIso()); const [payer, setPayer] = useState(group.members[0]?.id || ''); const [category, setCategory] = useState('Uncategorized');
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'>('equal');
  const [selected, setSelected] = useState<string[]>(group.members.map((m:any)=>m.id));
  const [percents, setPercents] = useState<Record<string,string>>({}); const [exact, setExact] = useState<Record<string,string>>({});
  const toggle = (id:string)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#f6f5f2',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'#f6f5f2',padding:'8px 0'}}><h2 style={{margin:0}}>Add expense</h2><button style={btn} onClick={onClose}>Close</button></div>
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
      <button style={primary} onClick={async()=>{
        const amountMinor = toMinor(amount, currency); if (amountMinor===null) { setError('Enter a valid positive amount'); return; }
        const body: any = { description, amountMinor, currency, date, paidByMemberId: payer, category, splitType, participants: selected };
        if (splitType==='percent') body.percents = selected.map(id=>Number(percents[id]||0));
        if (splitType==='exact') { const arr = selected.map(id=>toMinor(exact[id]||'', currency)); if (arr.some(v=>v===null)) { setError('Enter valid exact amounts'); return; } body.exactAmounts = arr; }
        try { await api(`/api/groups/${group.id}/expenses`,'POST',body); reload(); } catch(e:any){ setError(e.message); }
      }}>Add expense</button>
    </div>
  </div>);
}
function SettleModal({ group, suggestion, onClose, reload, setError }: any) {
  const [amount, setAmount] = useState(fromMinor(suggestion.amountMinor, suggestion.currency));
  const [date, setDate] = useState(todayIso());
  const minor = toMinor(amount, suggestion.currency);
  const remaining = minor===null ? null : suggestion.amountMinor - minor;
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#fff',borderRadius:'16px 16px 0 0',padding:16,width:'100%',maxWidth:640}}>
      <h2 style={{marginTop:0}}>Settle</h2><p>{suggestion.fromName} → {suggestion.toName} · {suggestion.currency}</p>
      <p style={{color:'#666'}}>Recording a payment never moves real money — it just records that money changed hands.</p>
      <label>Amount ({suggestion.currency})</label><input style={input} value={amount} onChange={e=>setAmount(e.target.value)} />
      {remaining!==null && remaining>0 && <p style={{color:'#b45309'}}>Partial payment: {fmt(remaining, suggestion.currency)} will remain outstanding.</p>}
      {remaining!==null && remaining<0 && <p style={{color:'red'}}>Amount exceeds the outstanding {fmt(suggestion.amountMinor, suggestion.currency)}.</p>}
      <label>Date</label><div style={{marginBottom:10}}><DateField id="pay-date" value={date} onChange={setDate} /></div>
      <button style={primary} disabled={minor===null || minor<=0 || minor>suggestion.amountMinor} onClick={async()=>{try{await api(`/api/groups/${group.id}/payments`,'POST',{fromMemberId:suggestion.fromMemberId,toMemberId:suggestion.toMemberId,amountMinor:minor,currency:suggestion.currency,date}); reload();}catch(e:any){setError(e.message);}}}>Settle</button>{' '}<button style={btn} onClick={onClose}>Cancel</button>
    </div>
  </div>);
}
function SettingsModal({ group, onClose, reload, back, setError }: any) {
  const [name, setName] = useState(group.name); const [cur, setCur] = useState(group.defaultCurrency);
  const hasExpense = !!group.myHasExpense;
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#f6f5f2',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Group name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency (new expenses only — existing expenses keep their currency)</label><select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
      <button style={primary} onClick={async()=>{try{await api(`/api/groups/${group.id}`,'PATCH',{name,defaultCurrency:cur}); reload();}catch(e:any){setError(e.message);}}}>Save settings</button>
      <hr style={{margin:'20px 0'}} />
      {group.isArchived
        ? <button style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/restore`,'POST'); reload();}catch(e:any){setError(e.message);}}}>Restore group</button>
        : <button style={btn} onClick={async()=>{try{await api(`/api/groups/${group.id}/archive`,'POST'); reload();}catch(e:any){setError(e.message);}}}>Archive group</button>}
      <p style={{fontSize:13,color:'#666'}}>Archiving hides the group from the active list and preserves all expenses, payments, members and activity. It can be restored.</p>
      <div style={{marginTop:16}}>
        <button style={{...btn, opacity: hasExpense?0.5:1, cursor: hasExpense?'not-allowed':'pointer'}} disabled={hasExpense} aria-disabled={hasExpense} onClick={async()=>{try{const r = await api(`/api/groups/${group.id}/leave`,'POST'); if (r.groupDeleted || r.groupArchived) back(); else reload();}catch(e:any){setError(e.message);}}}>Leave group</button>
        {hasExpense && <p style={{fontSize:13,color:'#666'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled. The server enforces the same rule.</p>}
        {!hasExpense && <p style={{fontSize:13,color:'#666'}}>You have no expenses in this group, so you can leave. If you are the last member, the group is deleted (it has no expenses to preserve).</p>}
      </div>
    </div>
  </div>);
}
