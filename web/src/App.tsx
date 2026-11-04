import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, getToken, CURRENCIES, CATEGORIES, fmt, toMinor, fromMinor } from './api';
import { DateField, fmtDate, todayIso } from './calendar';
import { Pie, DailyBar } from './pie';

const S = { maxW: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const;
const card: React.CSSProperties = { background:'#1c1c1e', border:'1px solid #2e2e2e', borderRadius:16, padding:14, marginBottom:12, color:'#f5f5f5', lineHeight:1.45 };
const rowCard: React.CSSProperties = { ...card, padding:'12px 14px', lineHeight:1.4 };
const avatar: React.CSSProperties = { width:40, height:40, borderRadius:'50%', background:'#65a30d', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 };
const noAccountChip: React.CSSProperties = { fontSize:11, background:'#422006', color:'#fbbf24', padding:'2px 8px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
const currencyChip: React.CSSProperties = { fontSize:12, background:'#134e4a', padding:'3px 10px', borderRadius:99, color:'#5eead4', fontWeight:600, whiteSpace:'nowrap' };
const btn: React.CSSProperties = { padding:'9px 14px', borderRadius:999, border:'1px solid #333', background:'#242424', color:'#fff' };
const primary: React.CSSProperties = { ...btn, background:'#2dd4bf', color:'#0f172a', borderColor:'#2dd4bf', fontWeight:600 };
// Chunk 9: one shared compact style for the Spend by category controls, so
// Group, Mine, and the currency select look like a set. Compact (down from
// the inherited ~16px button size), explicit height so the native select
// matches the buttons. Other buttons in the app keep btn/primary untouched.
const catControl: React.CSSProperties = { padding:'8px 14px', fontSize:14, lineHeight:1.4, height:36, boxSizing:'border-box', borderRadius:10, border:'1px solid #333', background:'#242424', color:'#fff' };
const catControlActive: React.CSSProperties = { ...catControl, background:'#2dd4bf', color:'#0f172a', borderColor:'#2dd4bf', fontWeight:600 };
const input: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid #333', borderRadius:10, margin:'4px 0 10px', background:'#242424', color:'#fff' };
// Group icon: REMOVED 2026-11-04 at Wai's request ("revert the emoji
// change, i rather user inputs the emoji into the group name itself").
// There is no separate icon field, picker, or icon prefix anywhere in
// the UI anymore: the group name input is the only place an emoji goes,
// typed from the user's own keyboard, as part of the name string itself
// (e.g. "✈️ KL Trip"). The server still has a groups.icon column and
// still accepts icon in PATCH/POST, but the frontend never sends it and
// never displays it — existing stored icons are simply ignored in the
// UI, not deleted from D1, so nothing is destructively migrated. If a
// group had a stored icon, retype it into its name to get it back.
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
// the GroupView wrapper routes that error: to the caller's onError
// callback when one is supplied (row/card-local error, Chunk 4), else
// to the global setError — and closes the sheet either way.
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

// Loading state, explained: the old code had only two states — user null
// (render Auth) or user set (render Home/Group). On refresh, the first
// paint always had user null, so it flashed Auth even with a valid token,
// until /api/me returned. Now there are three states: 'checking' (token
// present, /api/me in flight — render a skeleton, never Auth), 'guest' (no
// token, or /api/me failed — render Auth), 'authed' (render Home/Group).
// A failed /api/me still clears the token, exactly as before; the only
// change is what the user sees while the check is in flight.
// Navigation restoration, localStorage version (not hash routing): after a
// refresh, return to the group + tab you were on, instead of always landing
// on Home. Why localStorage and not a hash URL: it is the smallest change
// that fixes refresh (the reported pain), with no hashchange listener, no
// browser-back history semantics to get wrong, and no Worker SPA-fallback
// requirement. Trade-off, stated plainly: it is private to this browser —
// it does NOT give shareable/bookmarkable group links (a hash URL would).
// The saved value is just {groupId, tab}; it contains no auth data, no
// group content, and the API still enforces membership on restore, so a
// stale or forged id simply fails to load and falls back to Home.
const LAST_GROUP_KEY = 'dont-ngiao-last-group';
const VALID_TABS = ['expenses','balances','members','activity'] as const;
function readSavedGroup(): { groupId: string; tab: typeof VALID_TABS[number] } | null {
  try {
    const raw = localStorage.getItem(LAST_GROUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.groupId !== 'string' || !p.groupId) return null;
    return { groupId: p.groupId, tab: VALID_TABS.includes(p.tab) ? p.tab : 'expenses' };
  } catch { return null; }
}
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authState, setAuthState] = useState<'checking'|'guest'|'authed'>(()=> getToken() ? 'checking' : 'guest');
  const [groups, setGroups] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const loadSeq = useRef(0);
  const restoredRef = useRef(false);
  const [tab, setTab] = useState<'expenses'|'balances'|'members'|'activity'>('expenses');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function loadGroups() { try { setGroups(await api('/api/groups')); setError(''); } catch(e:any){ setError(e.message); } }
  // skeleton=true only for a first tap into a group (Home -> group): show
  // the group skeleton immediately so the tap feels instant, instead of
  // sitting on Home with no feedback until the fetch returns. Reloads from
  // inside a group (after save/settle/delete) do NOT use the skeleton —
  // the old group stays on screen (stale-but-real) plus the button loader,
  // so the screen never flickers to grey on every save.
  async function loadGroup(id: string, opts?: { skeleton?: boolean, keepTab?: boolean }): Promise<boolean> {
    const seq = ++loadSeq.current;
    if (opts?.skeleton) setGroupLoading(true);
    try { const d = await api(`/api/groups/${id}`); if (seq !== loadSeq.current) return false; setGroup(d); if (!opts?.keepTab) setTab('expenses'); setError(''); return true; }
    catch(e:any){ if (seq === loadSeq.current) setError(e.message); return false; }
    finally { if (seq === loadSeq.current) setGroupLoading(false); }
  }
  // Restore once per page load, after auth succeeds: if a group+tab was
  // saved, load that group (with the group skeleton, so refresh shows a
  // skeleton, not Home) and then set the saved tab — loadGroup itself
  // resets tab to 'expenses', so the saved tab must be applied after it
  // awaits, and only on success. A restore failure (group deleted,
  // membership lost, 403/404) clears the saved value and the error
  // loadGroup set, so refresh lands cleanly on Home with no banner: the
  // group is simply gone, and an error on a fresh load would be noise.
  async function restoreSaved() {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = readSavedGroup();
    if (!saved) return;
    const ok = await loadGroup(saved.groupId, { skeleton: true });
    if (ok) setTab(saved.tab);
    else { try { localStorage.removeItem(LAST_GROUP_KEY); } catch { /* ignore */ } setError(''); }
  }
  // Persist navigation: whenever an authed user is inside a group, save
  // group+tab; whenever they are back on Home (group null, not loading,
  // groups loaded), clear it — so refresh after going home lands on Home,
  // not on the last group visited. Guards prevent clearing during the
  // initial load (auth not authed yet, or groups not loaded yet) and
  // during a group load (group null but loading).
  useEffect(()=>{
    if (authState !== 'authed') return;
    if (group) { try { localStorage.setItem(LAST_GROUP_KEY, JSON.stringify({ groupId: group.id, tab })); } catch { /* ignore */ } }
    else if (!groupLoading && groups) { try { localStorage.removeItem(LAST_GROUP_KEY); } catch { /* ignore */ } }
  }, [group, tab, authState, groupLoading, groups]);
  useEffect(()=>{ if (getToken()) api('/api/me').then(async d=>{ setUser(d.user); setAuthState('authed'); loadGroups(); await restoreSaved(); }).catch(()=>{ setToken(null); setUser(null); setAuthState('guest'); }); }, []);
  async function doAuth(mode: 'login'|'register', name: string, email: string, password: string) {
    setError(''); setLoading(true);
    try { const d = await api(`/api/auth/${mode}`, 'POST', mode==='register' ? {name,email,password} : {email,password}); setToken(d.token); setUser(d.user); setAuthState('authed'); await loadGroups(); await restoreSaved(); }
    catch(e:any){ setError(e.message); } finally { setLoading(false); }
  }
  function doLogout() { try { localStorage.removeItem(LAST_GROUP_KEY); } catch { /* ignore */ } setToken(null); setUser(null); setGroup(null); setGroups(null); setAuthState('guest'); }
  // Destination-aware checking skeleton: during auth checking we do not
  // yet know the user, but we DO know the saved destination synchronously
  // from localStorage. If a group was saved, show a GroupSkeleton from the
  // very first paint — NOT HomeSkeleton, whose real "Don't Ngiao" title
  // would flash momentarily on a refresh from inside a group, before
  // restore switches to the group skeleton. If no group was saved, the
  // destination is Home, so HomeSkeleton (with its real title, which is
  // also the Home page title) is correct and causes no flash.
  if (authState === 'checking') {
    if (readSavedGroup()) return <GroupSkeleton />;
    return <HomeSkeleton user={null} />;
  }
  if (authState === 'guest' || !user) return <Auth onAuth={doAuth} error={error} loading={loading} />;
  if (groupLoading) return <GroupSkeleton />;
  // Reload with a detail object when the write already returned one:
  // use it directly instead of refetching (the old reload() always
  // refetched, doubling every write's groupDetail cost, and reset the
  // tab to Expenses — so a Settle from Balances or an Add member from
  // Members landed back on Expenses, hiding the updated data). Refetch
  // (keepTab) is only the fallback for writes that return no detail
  // (archive/restore/leave from Settings, Home restore via loadGroups).
  if (group) return <GroupView group={group} setGroup={setGroup} tab={tab} setTab={setTab} back={()=>{setGroup(null); loadGroups();}} reload={(detail?: any)=> detail && detail.id ? (setGroup(detail), setError(''), Promise.resolve(true)) : loadGroup(group.id, { keepTab: true })} error={error} setError={setError} />;
  if (!groups) return <HomeSkeleton user={user} />;
  return <Home user={user} setUser={setUser} onLogout={doLogout} groups={groups} loadGroups={loadGroups} loadGroup={(id: string)=>loadGroup(id, { skeleton: true })} error={error} setError={setError} />;
}

// Skeleton screens: grey blocks in the exact shape of the content that is
// loading, with a pulse animation (see .skeleton-pulse in index.html).
// No spinner, no "Loading..." text — the layout itself is the feedback,
// and because the blocks match the real layout, there is no layout shift
// when real data replaces them. Used only for first loads (auth check,
// groups list, first group tap); never for tab switches (data already
// loaded) or post-action reloads (stale content + button loader instead).
function Sk({ w, h, r }: { w: string | number; h: number; r?: number }) {
  return <div className="skeleton-pulse" style={{width:w,height:h,borderRadius:r ?? 8,background:'#2a2a2a',flexShrink:0}} />;
}
function HomeSkeleton({ user }: { user: any }) {
  return (<div style={S} aria-label="Loading">
    {user ? (<><div style={{fontSize:20,fontWeight:700}}>Hi, {user.name}</div><div style={{fontSize:13,color:'#a3a3a3',marginTop:2}}>{user.email}</div></>) : (<><Sk w={180} h={24} /><div style={{marginTop:6}}><Sk w={220} h={16} /></div></>)}
    <h1 style={{marginBottom:4}}>Don't Ngiao</h1><p style={{color:'#a3a3a3',marginTop:0}}>Mai ngiao, mai drama.</p>
    <div style={{background:'#1c1c1e',borderRadius:24,padding:20,marginBottom:20}}><Sk w={140} h={12} /><div style={{marginTop:16}}><Sk w="60%" h={32} /></div><div style={{marginTop:10}}><Sk w="45%" h={32} /></div></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><Sk w={120} h={24} /><Sk w={110} h={38} r={999} /></div>
    {[0,1,2].map(i => (<div key={i} style={card}><Sk w="55%" h={20} /><div style={{marginTop:8}}><Sk w="85%" h={14} /></div><div style={{marginTop:8}}><Sk w="40%" h={14} /></div></div>))}
  </div>);
}
// GroupSkeleton is ALL skeleton, no real buttons: the ← Groups button
// used to be a real, tappable button (so a user could cancel a pending
// group load), while Settings and everything else were grey blocks —
// which read as a half-loaded page, not a skeleton. Now the top row is
// two grey pills, matching the real top row's sizes, and Back works
// immediately after the group loads. Trade-off, stated plainly: you can
// no longer cancel a group load mid-flight from the skeleton; loads are
// normally <1s, so waiting for the real back button is the cheaper
// consistency cost.
function GroupSkeleton() {
  return (<div style={S} aria-label="Loading group">
    <div style={{display:'flex',gap:8,alignItems:'center'}}><Sk w={140} h={38} r={999} /><Sk w={90} h={38} r={999} /></div>
    <div style={{marginTop:16}}><Sk w="60%" h={28} /></div>
    <div style={{marginTop:8}}><Sk w="45%" h={16} /></div>
    <div style={{display:'flex',gap:0,borderBottom:'1px solid #333',margin:'16px 0 12px'}}>{[0,1,2,3].map(i => (<div key={i} style={{flex:1,padding:'10px 4px',display:'flex',justifyContent:'center'}}><Sk w={56} h={14} /></div>))}</div>
    {[0,1,2].map(i => (<div key={i} style={rowCard}><Sk w="70%" h={18} /><div style={{marginTop:8}}><Sk w="50%" h={14} /></div></div>))}
  </div>);
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
// Settle rows use a colour dot instead of an avatar (see memberDotColor).
// Colour is SEQUENTIAL by member position in group.members (creation
// order, as returned by the API — creator first, then members in the order
// they were added), NOT a hash of the member id. The hash version collided
// in a real group: two members hashed to the same palette index and both
// dots rendered peach, defeating the point of the dots. Sequential
// guarantees distinct colours for up to 8 members, on every device and
// for every viewer (everyone sees the same member order). Trade-off,
// stated plainly: if a middle member is removed, members after them shift
// one colour — renaming never changes a colour. Colours repeat only if a
// group has more members than the palette size (modulo).
const MEMBER_DOT_COLORS = ['#5eead4','#a5b4fc','#fda4af','#fcd34d','#86efac','#f0abfc','#93c5fd','#fdba74'];
function memberDotColor(group: any, memberId: string | null | undefined) {
  if (!memberId) return '#a3a3a3';
  const idx = (group.members || []).findIndex((x:any)=>x.id===memberId);
  if (idx < 0) return '#a3a3a3';
  return MEMBER_DOT_COLORS[idx % MEMBER_DOT_COLORS.length];
}
function personDisplay(group: any, memberId: string | null | undefined, fallbackName: string | null | undefined) {
  const member = memberId ? group.members.find((x:any)=>x.id===memberId) : null;
  const name = member?.name || fallbackName || 'Unknown member';
  const label = (group.myMemberId && memberId && memberId===group.myMemberId) ? 'You' : name;
  return { name, label, memberId: memberId || null };
}

function Home({ user, setUser, onLogout, groups, loadGroups, loadGroup, error, setError }: any) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name || '');
  const totals: any[] = groups?.totals || [];
  return (<div style={S}>
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <button aria-label="Account menu" style={{width:48,height:48,borderRadius:'50%',background:'#65a30d',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18,flexShrink:0,border:'none',padding:0,cursor:'pointer'}} onClick={()=>setShowAccountMenu(true)}>{initials(user.name)}</button>
        <div style={{flex:1,minWidth:0}}>
          {editingName ? (<input style={{...input,margin:0}} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} aria-label="Name" />) : (<>
            <div style={{fontSize:20,fontWeight:700}}>Hi, {user.name}</div>
            <div style={{fontSize:13,color:'#a3a3a3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>{user.email}</div>
          </>)}
        </div>
      </div>
      {editingName ? (<div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
        <AsyncButton style={primary} onClick={async()=>{try{const d = await api('/api/me','PATCH',{name:nameDraft}); setUser(d.user); setEditingName(false);}catch(e:any){setError(e.message);}}}>Save</AsyncButton>
        <button style={btn} onClick={()=>{setEditingName(false); setNameDraft(user.name);}}>Cancel</button>
      </div>) : null}
    </div>
    <h1 style={{marginBottom:4}}>Don't Ngiao</h1><p style={{color:'#a3a3a3',marginTop:0}}>Mai ngiao, mai drama.</p>
    {error && <p style={{color:'#f87171'}}>{error}</p>}
    <div style={{background:'linear-gradient(135deg,#0f766e,#059669,#10b981)',borderRadius:24,padding:20,marginBottom:20,color:'#fff'}}>
      <div style={{fontSize:12,letterSpacing:1.5,color:'#ccfbf1',fontWeight:600}}>ACROSS ALL YOUR GROUPS</div>
      {totals.length === 0 || totals.every((t:any)=>t.balance===0) ? (<p style={{margin:'12px 0 0'}}>All settled.</p>) : totals.map((t:any)=>(<div key={t.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,marginTop:10}}>
        <span style={{color:'#ccfbf1'}}>{t.balance>0 ? 'You are owed' : t.balance<0 ? 'You owe' : 'settled'}</span>
        <strong style={{fontSize:28,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(t.balance),t.currency)}</strong>
      </div>))}
      <p style={{fontSize:13,color:'#ccfbf1',marginBottom:0}}>Kept separate per currency — no conversion. Tap a group below to see who to pay.</p>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0}}>Your groups</h2>
      <button style={{...primary,borderRadius:999,padding:'10px 18px'}} onClick={()=>setShowCreate(true)}>+ New group</button>
    </div>
    {groups?.active?.length === 0 && <p style={{color:'#a3a3a3'}}>No groups yet — tap + New group to create one.</p>}
    {groups?.active?.map((g:any)=>{
      const spent: any[] = g.spent || [];
      const my: any[] = g.myBalances || [];
      return (<div key={g.id} style={{...card,cursor:'pointer'}} onClick={()=>loadGroup(g.id)}>
        <strong style={{fontSize:17}}>{g.name}</strong>
        <div style={{fontSize:13,color:'#a3a3a3',marginTop:6}}>{g.memberCount ?? '?'} {(g.memberCount===1)?'person':'people'} · {g.expenseCount ?? '?'} expenses{spent.length>0 ? ` · ${spent.map((s:any)=>fmt(s.amount,s.currency)).join(' + ')} spent` : ''}</div>
        {my.length>0 && <div style={{marginTop:8}}>{my.map((b:any)=>(<div key={b.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,fontSize:14,color:b.balance>0?'#5eead4':b.balance<0?'#f87171':'#a3a3a3'}}><span>{b.balance>0 ? 'You are owed' : b.balance<0 ? 'You owe' : 'settled'}</span><span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(b.balance),b.currency)}</span></div>))}</div>}
      </div>);
    })}
    {groups?.archived?.length > 0 && <><h2>Archived groups</h2>{groups.archived.map((g:any)=>(<div key={g.id} style={{...rowCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><strong style={{flex:1,minWidth:0}}>{g.name}</strong><span style={{display:'flex',gap:8,flexShrink:0}}><AsyncButton style={btn} onClick={async()=>{await api(`/api/groups/${g.id}/restore`,'POST'); loadGroups();}}>Restore</AsyncButton><AsyncButton style={btn} onClick={()=>loadGroup(g.id)}>Open</AsyncButton></span></div>))}</>}
    <div style={{...card,marginTop:20}}>
      <h3 style={{marginTop:0}}>How settling works here</h3>
      <p style={{fontSize:13,color:'#a3a3a3',marginBottom:0}}>Balances are per currency and never converted. Recording a payment never moves real money — it just records that money changed hands. Settle from a group's Balances tab, for one currency at a time.</p>
    </div>
    {showCreate && <CreateGroupModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false); loadGroups();}} />}
    {showAccountMenu && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#1c1c1e',borderRadius:'16px 16px 0 0',padding:16,width:'100%',maxWidth:640}}>
        <div style={{fontWeight:600}}>{user.name}</div>
        <div style={{fontSize:13,color:'#a3a3a3',marginTop:2,marginBottom:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button style={{...btn,width:'100%'}} onClick={()=>{setShowAccountMenu(false); setNameDraft(user.name); setEditingName(true);}}>Edit name</button>
          <AsyncButton style={{...btn,width:'100%'}} onClick={async()=>{await api('/api/auth/logout','POST'); onLogout();}}>Log out</AsyncButton>
          <button style={{...btn,width:'100%'}} onClick={()=>setShowAccountMenu(false)}>Cancel</button>
        </div>
      </div>
    </div>)}
  </div>);
}

function CreateGroupModal({ onClose, onDone }: any) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('SGD');
  // Local error, same fix as Settings: this modal is full-screen, so the
  // parent's error rendered behind it and a failed Create looked like
  // "nothing happens" — the modal just stayed open with no message.
  const [createError, setCreateError] = useState('');
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>New group</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Group name</label><input style={input} placeholder="Group name, e.g. ✈️ KL Trip" value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency <select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></label>
      <AsyncButton style={primary} onClick={async()=>{setCreateError(''); try{await api('/api/groups','POST',{name,defaultCurrency:cur}); onDone();}catch(e:any){setCreateError(e.message);}}}>Create group</AsyncButton>
      {createError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{createError}</p>}
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
    <button style={btn} onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Register':'Log in'}</button>
    <p style={{color:'#a3a3a3',fontSize:13}}>Prototype port: email/password only, no email verification or password reset yet.</p>
  </div>);
}

function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [detailExpense, setDetailExpense] = useState<any>(null);
  const [settle, setSettle] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [editingMemberId, setEditingMemberId] = useState<string|null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [catView, setCatView] = useState<'group'|'mine'>('group');
  const [catChart, setCatChart] = useState<'pie'|'bar'>('pie');
  // Carousel swipe: touch start/end only (refs, not state — no re-render
  // while the finger moves). A horizontal swipe >50px, and more horizontal
  // than vertical, switches charts: left = pie -> bar, right = bar -> pie.
  // No wrap-around. Vertical swipes are untouched, so page scrolling
  // still works. This is safe now that the bar chart fits the screen
  // width (no inner horizontal scroll to conflict with the swipe).
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onChartTouchStart(e: React.TouchEvent) { const t = e.touches[0]; if (t) swipeStart.current = { x: t.clientX, y: t.clientY }; }
  function onChartTouchEnd(e: React.TouchEvent) {
    const s = swipeStart.current; swipeStart.current = null; if (!s) return;
    const t = e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0 && catChart === 'pie') setCatChart('bar');
    else if (dx > 0 && catChart === 'bar') setCatChart('pie');
  }
  // Chunk 4: row-local errors. Kept in GroupView (not the App-level global)
  // so they render inside the row that caused them. A successful reload
  // replaces the group object, which clears them; a tab change clears
  // them explicitly (see changeTab), so they can never stick across tabs
  // or reappear on return to a tab unless the action is retried and fails
  // again. A failed action does not reload, so its row error stays put.
  const [memberErrors, setMemberErrors] = useState<Record<string,string>>({});
  const [paymentErrors, setPaymentErrors] = useState<Record<string,string>>({});
  useEffect(()=>{ setMemberErrors({}); setPaymentErrors({}); }, [group]);
  function changeTab(t: 'expenses'|'balances'|'members'|'activity') { setTab(t); setError(''); setMemberErrors({}); setPaymentErrors({}); }
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
      {(['expenses','balances','members','activity'] as const).map(t=>(<button key={t} onClick={()=>changeTab(t)} style={{flex:1,padding:'10px 4px',fontSize:14,color:tab===t?'#fff':'#a3a3a3',background:'transparent',border:'none',borderBottom:tab===t?'3px solid #2dd4bf':'none',textTransform:'capitalize'}}>{t}</button>))}
    </div>
    {tab==='expenses' && <>
      <div style={card}><h3 style={{marginTop:0}}>Spend by category</h3>
        {/* Chart controls, 2026-11-04: Pie/Bar buttons REMOVED — the carousel
        is swipeable, so they were redundant (and in the screenshot they
        wrapped Bar onto a second row). The dots below the chart stay as
        the chart indicator (and still tap to switch). Currency is a
        separate dimension from Group/Mine, so it sits on the right:
        Group+Mine grouped on the left, the select pushed right with
        marginLeft:auto (so it stays right even if it wraps). */}
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><div style={{display:'flex',gap:8}}><button style={catView==='group'?catControlActive:catControl} onClick={()=>setCatView('group')}>Group</button><button style={catView==='mine'?catControlActive:catControl} onClick={()=>setCatView('mine')}>Mine</button></div>
        {currencies.length>1 && <select style={{...catControl,marginLeft:'auto'}} value={cur} onChange={e=>setCatCur(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select>}</div>
        {/* Carousel, swipe (and dots): both panels stay mounted in a
        200%-wide flex track, so tapping a dot slides the track, and a
        horizontal swipe on the chart does the same (left: pie -> bar,
        right: bar -> pie). The old Pie/Bar buttons were removed
        2026-11-04 as redundant with swipe. Swipe was previously blocked
        because the bar panel scrolled horizontally on its own when
        there were many days; now the bar chart fits the screen width,
        so there is no inner scroll to conflict with the swipe. */}
        <div style={{overflow:'hidden',width:'100%',touchAction:'pan-y'}} onTouchStart={onChartTouchStart} onTouchEnd={onChartTouchEnd}>
          <div style={{display:'flex',width:'200%',transition:'transform 0.3s ease',transform:catChart==='pie' ? 'translateX(0)' : 'translateX(-50%)'}}>
            <div style={{width:'50%',flexShrink:0,boxSizing:'border-box'}}><Pie data={catData} currency={cur} /></div>
            <div style={{width:'50%',flexShrink:0,boxSizing:'border-box'}}><DailyBar expenses={group.expenses} myMemberId={group.myMemberId} view={catView} currency={cur} /></div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:8}}>
          <button type="button" aria-label="Show pie chart" style={{width:8,height:8,borderRadius:'50%',border:'none',padding:0,cursor:'pointer',background:catChart==='pie' ? '#2dd4bf' : '#333'}} onClick={()=>setCatChart('pie')} />
          <button type="button" aria-label="Show bar chart" style={{width:8,height:8,borderRadius:'50%',border:'none',padding:0,cursor:'pointer',background:catChart==='bar' ? '#2dd4bf' : '#333'}} onClick={()=>setCatChart('bar')} />
        </div>
        <p style={{fontSize:12,color:'#a3a3a3'}}>{catView==='mine' ? 'Mine = your split shares only. Other members\' individual breakdowns are never sent to you.' : 'Group = total spend for the whole group.'} Pie = overall breakdown. Bar = spend per day, stacked by category, fitted to the screen width. Per currency only, never converted. Swipe the chart to switch.</p>
      </div>
      {group.expenses.length===0 && <p>No expenses yet.</p>}
      {group.expenses.map((e:any)=>{const mySplit = group.myMemberId ? e.splits.find((s:any)=>s.member_id===group.myMemberId) : null; const n = e.splits.length; return (<div key={e.id} style={{...rowCard,cursor:'pointer'}} onClick={()=>setDetailExpense(e)}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><strong>{e.description}</strong> <span style={{fontSize:12,background:'#2a2a2a',padding:'2px 6px',borderRadius:99}}>{e.category}</span> <span style={{fontSize:12,background:'#134e4a',padding:'2px 6px',borderRadius:99}}>{e.currency}</span><div style={{fontSize:13,color:'#a3a3a3'}}>Paid by {e.payerName} · {fmtDate(e.date)}</div></div>
        <div style={{textAlign:'right'}}><strong>{e.display}</strong></div></div>
        <div style={{fontSize:13,marginTop:6,color:'#a3a3a3'}}>{mySplit ? `Your share: ${fmt(mySplit.amount_minor,e.currency)} · Split between ${n} people` : `Not involved · Split between ${n} people`}</div>
      </div>);})}
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
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6}}>
              <span style={{width:10,height:10,borderRadius:'50%',background:memberDotColor(group, from.memberId),flexShrink:0}} />
              <span>{from.label}</span>
              <span style={{color:'#a3a3a3'}}>owes</span>
              <span style={{width:10,height:10,borderRadius:'50%',background:memberDotColor(group, to.memberId),flexShrink:0}} />
              <span>{to.label}</span>
            </div>
            <div style={{marginLeft:16,marginTop:4}}><strong>{s.display}</strong></div>
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
            <div style={{fontSize:13,lineHeight:1.4,marginTop:4,marginLeft:34}}><strong>{p.display}</strong> <span style={{color:'#a3a3a3'}}>· {fmtDate(p.date)}</span></div>
            {paymentErrors[p.id] && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:4,marginBottom:0}}>{paymentErrors[p.id]}</p>}
          </div>
          <button style={{...btn,flexShrink:0}} onClick={()=>setConfirm({title:'Delete payment?',message:`Delete the ${p.display} payment from ${from.label} to ${to.label} on ${fmtDate(p.date)}? This cannot be undone.`,onError:(msg:string)=>setPaymentErrors(prev=>({...prev,[p.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/payments/${p.id}`,'DELETE'); reload(d);}})}>Delete</button>
        </div>);
      })}
    </>}
    {tab==='members' && <>
      {group.members.map((m:any)=>{
        const isEditing = editingMemberId===m.id;
        return (<div key={m.id} style={rowCard}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={avatar}>{initials(m.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          {isEditing ? (<input style={{...input,margin:0}} placeholder="Email" value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} aria-label="Member email" />) : (<>
          <div style={{fontWeight:600,lineHeight:1.4}}>{m.name}{!m.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
          {m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>) : (!m.user_id ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Placeholder — no email set, no one can claim this yet</div>) : null)}
          {!m.user_id && m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Placeholder — they can claim this by signing up with the same email</div>) : null}
          </>)}
        </div>
        {isEditing ? (<span style={{display:'flex',gap:8,flexShrink:0}}>
          <AsyncButton style={primary} onClick={async()=>{try{const d = await api(`/api/groups/${group.id}/members/${m.id}`,'PATCH',{email:emailDraft}); setEditingMemberId(null); reload(d);}catch(er:any){setError(er.message);}}}>Save</AsyncButton>
          <button style={btn} onClick={()=>setEditingMemberId(null)}>Cancel</button>
        </span>) : (!m.user_id ? null : (<span style={{display:'flex',gap:8,flexShrink:0}}>
          <button style={{...btn,flexShrink:0}} onClick={()=>setConfirm({title:'Remove member?',message:`Remove ${m.name} from this group? This cannot be undone.`,onError:(msg:string)=>setMemberErrors(prev=>({...prev,[m.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/members/${m.id}`,'DELETE'); reload(d);}})}>Remove</button>
        </span>))}
        </div>
        {!isEditing && !m.user_id ? (<div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
          <button style={btn} onClick={()=>{setEditingMemberId(m.id); setEmailDraft(m.email || '');}}>Edit email</button>
          <button style={{...btn,flexShrink:0}} onClick={()=>setConfirm({title:'Remove member?',message:`Remove ${m.name} from this group? This cannot be undone.`,onError:(msg:string)=>setMemberErrors(prev=>({...prev,[m.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/members/${m.id}`,'DELETE'); reload(d);}})}>Remove</button>
        </div>) : null}
        {memberErrors[m.id] && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{memberErrors[m.id]}</p>}
      </div>);})}
      <AddMember groupId={group.id} reload={reload} />
    </>}
    {tab==='activity' && <>
      {group.activity.length===0 && <p>No activity yet.</p>}
      {group.activity.map((a:any)=>(<div key={a.id} style={card}><strong>{activityTitle(a)}</strong><div style={{fontSize:13,color:'#a3a3a3'}}>{a.actor_name} · {new Date(a.created_at).toLocaleString()} {a.amount_minor!=null ? `· ${fmt(a.amount_minor,a.currency)}` : ''} {a.detail?`· ${a.detail}`:''}</div></div>))}
    </>}
    {detailExpense && <ExpenseDetailSheet group={group} expense={detailExpense} onClose={()=>setDetailExpense(null)} setConfirm={setConfirm} reload={reload} />}
    {showExpense && <ExpenseModal group={group} onClose={()=>setShowExpense(false)} reload={(d?:any)=>{setShowExpense(false); reload(d);}} />}
    {settle && <SettleModal group={group} suggestion={settle} onClose={()=>setSettle(null)} reload={(d?:any)=>{setSettle(null); reload(d);}} setError={setError} />}
    {showSettings && <SettingsModal group={group} onClose={()=>setShowSettings(false)} reload={(d?:any)=>{setShowSettings(false); reload(d);}} back={back} />}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){if (confirm.onError) confirm.onError(er.message); else setError(er.message);}finally{setConfirm(null);}}} />}
  </div>);
}
function activityTitle(a:any) {
  const map: Record<string,string> = { group_created:'Group created', group_renamed:'Group renamed', group_currency_changed:'Default currency changed', group_icon_changed:'Group icon changed', expense_added:'Expense added', expense_deleted:'Expense deleted', payment_recorded:'Payment recorded', payment_deleted:'Payment deleted', member_added:'Member added', member_removed:'Member removed', member_email_updated:'Member email updated', member_left:'Member left', group_archived:'Group archived', group_restored:'Group restored' };
  return map[a.type] || a.type;
}
function AddMember({ groupId, reload }: any) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [addError, setAddError] = useState('');
  return (<div style={card}><h3 style={{marginTop:0}}>Add member</h3>
    <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
    <input style={input} placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
    <p style={{fontSize:13,color:'#a3a3a3',marginTop:-6,marginBottom:10,lineHeight:1.4}}>Links an existing account, or a placeholder they can claim.</p>
    <AsyncButton style={primary} onClick={async()=>{try{const d = await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); setName(''); setEmail(''); setAddError(''); reload(d);}catch(e:any){setAddError(e.message);}}}>Add member</AsyncButton>
    {addError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{addError}</p>}
  </div>);
}

function ExpenseModal({ group, onClose, reload }: any) {
  // Chunk 4 amendment: modal-local error. The modal is full-screen, so the
  // global GroupView error rendered behind it and was invisible until the
  // modal closed. Validation/API failures now render inside the modal.
  const [modalError, setModalError] = useState('');
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
      {modalError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{modalError}</p>}
      <AsyncButton style={primary} onClick={async()=>{
        setModalError('');
        const amountMinor = toMinor(amount, currency); if (amountMinor===null) { setModalError('Enter a valid positive amount'); return; }
        const body: any = { description, amountMinor, currency, date, paidByMemberId: payer, category, splitType, participants: selected };
        if (splitType==='percent') body.percents = selected.map(id=>Number(percents[id]||0));
        if (splitType==='exact') { const arr = selected.map(id=>toMinor(exact[id]||'', currency)); if (arr.some(v=>v===null)) { setModalError('Enter valid exact amounts'); return; } body.exactAmounts = arr; }
        try { const d = await api(`/api/groups/${group.id}/expenses`,'POST',body); reload(d); } catch(e:any){ setModalError(e.message); }
      }}>Add expense</AsyncButton>
    </div>
  </div>);
}
// Expense detail sheet (Chunk 2): the compact list row opens this bottom
// sheet, following the SettleModal/ConfirmSheet pattern. It is the only
// place Delete expense lives — the list card has no splits line and no
// Delete button. Delete here opens the Chunk 1 ConfirmSheet, so nothing
// is deleted directly from the sheet either; on a confirmed delete the
// detail sheet closes and the group reloads. Cancel on the confirm sheet
// leaves this sheet open (the GroupView confirm wrapper only clears the
// confirm state). The sheet scrolls internally so a 10-person split fits.
function ExpenseDetailSheet({ group, expense: e, onClose, setConfirm, reload }: any) {
  // Chunk 4: a failed confirmed delete shows here, inside the sheet, and
  // the sheet stays open (the action throws before onClose(), so the
  // confirm wrapper's onError is what displays it — not the global error).
  const [sheetError, setSheetError] = useState('');
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#1c1c1e',borderRadius:'16px 16px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'80vh',overflowY:'auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}><div><h2 style={{marginTop:0,marginBottom:4}}>{e.description}</h2><div><span style={{fontSize:12,background:'#2a2a2a',padding:'2px 6px',borderRadius:99}}>{e.category}</span>{' '}<span style={{fontSize:12,background:'#134e4a',padding:'2px 6px',borderRadius:99}}>{e.currency}</span></div><div style={{fontSize:13,color:'#a3a3a3',marginTop:6}}>Paid by {e.payerName} · split between {e.splits.length} people · {fmtDate(e.date)}</div></div><div style={{textAlign:'right',flexShrink:0}}><strong>{e.display}</strong></div></div>
      <div style={{marginTop:12}}>{e.splits.map((s:any)=>{const member = group.members.find((x:any)=>x.id===s.member_id); const pd = personDisplay(group, s.member_id, member?.name); const isMine = group.myMemberId && s.member_id===group.myMemberId; return (<div key={s.member_id} style={{...rowCard,display:'flex',alignItems:'center',gap:12,background:isMine?'#134e4a':'#1c1c1e'}}>
        <div style={avatar}>{initials(pd.name)}</div>
        <div style={{flex:1,minWidth:0,fontWeight:600,lineHeight:1.4}}>{pd.label}{member && !member.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
        <strong style={{color:isMine?'#5eead4':'#f5f5f5',whiteSpace:'nowrap',flexShrink:0}}>{fmt(s.amount_minor,e.currency)}</strong>
      </div>);})}</div>
      {sheetError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{sheetError}</p>}
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button style={btn} onClick={()=>setConfirm({title:'Delete expense?',message:`Delete '${e.description}' (${e.display})? This will also remove its splits. This cannot be undone.`,onError:(msg:string)=>setSheetError(msg),action:async()=>{const d = await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); onClose(); reload(d);}})}>Delete expense</button>
        <button style={btn} onClick={onClose}>Close</button>
      </div>
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
      <AsyncButton style={primary} disabled={minor===null || minor<=0 || minor>suggestion.amountMinor} onClick={async()=>{try{const d = await api(`/api/groups/${group.id}/payments`,'POST',{fromMemberId:suggestion.fromMemberId,toMemberId:suggestion.toMemberId,amountMinor:minor,currency:suggestion.currency,date}); reload(d);}catch(e:any){setError(e.message);}}}>Settle</AsyncButton>{' '}<button style={btn} onClick={onClose}>Cancel</button>
    </div>
  </div>);
}
function SettingsModal({ group, onClose, reload, back }: any) {
  const [name, setName] = useState(group.name); const [cur, setCur] = useState(group.defaultCurrency);
  const hasExpense = !!group.myHasExpense;
  // Save feedback, three parts (see the Save discussion): (1) dirty
  // check — Save is disabled + dimmed when nothing changed, so a
  // no-change click can never look like a silent no-op; name is compared
  // trimmed, because the server trims it anyway. (2) close on success —
  // already the behaviour via the reload wrapper (close modal + reload
  // group), kept, not changed. (3) local error — Settings previously
  // sent errors to the parent's setError, which renders in the group
  // view BEHIND this full-screen modal, so a failed save was silent;
  // errors now render inside the modal, same fix as the expense modal's
  // modalError. All Settings actions (Save/Archive/Restore/Leave) share
  // this local error, since they shared the hidden-error problem.
  const dirty = name.trim() !== group.name || cur !== group.defaultCurrency;
  const [settingsError, setSettingsError] = useState('');
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button style={btn} onClick={onClose}>Close</button></div>
      <label>Group name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency (new expenses only — existing expenses keep their currency)</label><select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
      <AsyncButton style={{...primary, opacity: dirty?1:0.5, cursor: dirty?'pointer':'not-allowed'}} disabled={!dirty} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}`,'PATCH',{name,defaultCurrency:cur}); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Save settings</AsyncButton>
      {settingsError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
      <hr style={{margin:'20px 0'}} />
      {group.isArchived
        ? <AsyncButton style={btn} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
        : <AsyncButton style={btn} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/archive`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Archive group</AsyncButton>}
      <p style={{fontSize:13,color:'#a3a3a3'}}>Archiving hides the group from the active list and preserves all expenses, payments, members and activity. It can be restored.</p>
      <div style={{marginTop:16}}>
        <AsyncButton style={{...btn, opacity: hasExpense?0.5:1, cursor: hasExpense?'not-allowed':'pointer'}} disabled={hasExpense} aria-disabled={hasExpense} onClick={async()=>{setSettingsError(''); try{const r = await api(`/api/groups/${group.id}/leave`,'POST'); if (r.groupDeleted || r.groupArchived) back(); else reload();}catch(e:any){setSettingsError(e.message);}}}>Leave group</AsyncButton>
        {hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled. The server enforces the same rule.</p>}
        {!hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>You have no expenses in this group, so you can leave. If you are the last member, the group is deleted (it has no expenses to preserve).</p>}
      </div>
    </div>
  </div>);
}
