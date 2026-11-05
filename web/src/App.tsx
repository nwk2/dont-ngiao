import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, getToken, CURRENCIES, CATEGORIES, fmt, toMinor, fromMinor } from './api';
import { DateField, fmtDate, todayIso } from './calendar';
import { Pie, DailyBar } from './pie';

const S = { maxW: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const;
const card: React.CSSProperties = { background:'#1c1c1e', border:'1px solid #2e2e2e', borderRadius:16, padding:14, marginBottom:12, color:'#f5f5f5', lineHeight:1.45 };
const rowCard: React.CSSProperties = { ...card, padding:'12px 14px', lineHeight:1.4 };
// BALANCES REVAMP 2026-11-05 (dark only, restyle only): rows inside one
// borderless card (radius 20, no #2e2e2e border) with hairline dividers,
// matching the approved prototype Balances look. Shared card/rowCard are
// untouched, so Expenses/Members/Activity keep their current cards.
// Logic below is unchanged: net-only Your position, per-member Paid/share,
// creditor-only Settle (with placeholder-debtor exception), debtor-or-
// creditor-only payment deletion.
const balCard: React.CSSProperties = { background:'#1c1c1e', borderRadius:20, padding:'6px 0', marginBottom:12, color:'#f5f5f5', lineHeight:1.45 };
const balRow: React.CSSProperties = { display:'flex', alignItems:'center', gap:12, padding:'12px 14px' };
const balHairline = '1px solid #2e2e2e';
// HOME + TABS REVAMP 2026-11-05 (dark only, restyle only): borderless
// radius-20 cards (same language as balCard) for Home group cards, and a
// segmented pill track for group tabs, matching the approved prototype.
// Shared card/rowCard untouched, so Expenses/Members/Activity rows keep
// their current cards until their own chunks. Logic unchanged everywhere:
// Home group list, archived Restore/Open, account menu, Edit name,
// group header, changeTab behaviour, tab keys.
const EXP_CAT_COLORS: Record<string,string> = { 'Food & Drink':'#b8bb26', 'Transport':'#83a598', 'Accommodation':'#d3869b', 'Activities':'#fabd2f', 'Shopping':'#fe8019', 'Other':'#8ec07c', 'Uncategorized':'#928374' };
function catIcon(cat: string) {
  // Feather-style line SVGs, white stroke on a coloured chip, matching the
  // approved prototype Expenses icon chips. Colours mirror pie.tsx
  // (gruvbox dark since this chunk).
  const common = { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'#fff', strokeWidth:2, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
  const paths: Record<string, React.ReactNode> = {
    'Food & Drink': (<><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></>),
    'Transport': (<><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" /><rect x="3" y="11" width="18" height="7" rx="2" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></>),
    'Accommodation': (<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>),
    'Activities': (<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>),
    'Shopping': (<><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>),
    'Other': (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
    'Uncategorized': (<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  };
  return (<svg {...common}>{paths[cat] || paths['Uncategorized']}</svg>);
}
const homeCard: React.CSSProperties = { background:'#1c1c1e', borderRadius:20, padding:16, marginBottom:12, color:'#f5f5f5', lineHeight:1.45 };
const tabTrack: React.CSSProperties = { display:'flex', gap:0, background:'#242424', borderRadius:999, padding:3, marginBottom:16 };
const tabPill: React.CSSProperties = { flex:1, padding:'10px 4px', fontSize:14, color:'#a3a3a3', background:'transparent', border:'none', borderRadius:999, fontWeight:400, cursor:'pointer' };
const tabPillActive: React.CSSProperties = { ...tabPill, color:'#0f172a', background:'#fff', fontWeight:600 };
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
  // /api/me fix, Nov 2026: only a 401 clears the token. Previously
  // this catch-all cleared it on ANY failure — including a transient
  // network failure or a 500 on the first load — permanently wiping a
  // still-valid session and forcing a re-login. Now: 401 -> clear token
  // and go to login (session really is gone); anything else -> keep
  // the token, show a retry screen (authError), and let the user retry
  // the same check instead of losing the session. Log out and
  // post-reset 401s still clear the token, as before.
  const [authError, setAuthError] = useState('');
  async function checkAuth() {
    if (!getToken()) return;
    setAuthError('');
    try { const d = await api('/api/me'); setUser(d.user); setAuthState('authed'); loadGroups(); await restoreSaved(); }
    catch (e: any) {
      if (e?.status === 401) { setToken(null); setUser(null); setAuthState('guest'); }
      else { setAuthError(e.message || 'Could not reach the server'); }
    }
  }
  useEffect(()=>{ checkAuth(); }, []);
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
  // ADMIN + RESET routing, Nov 2026: the regular app has no router
  // (deliberately — hash routing was decided against for groups), so
  // these two special views are gated by URL query params, read once
  // on mount. ?admin shows the separate admin login page (different
  // user, different token key, see AdminView); ?reset=<token> shows the
  // password-reset form for a link the admin sent manually. Both take
  // precedence over the regular Auth/Home/Group flow, and neither
  // requires the regular token — a reset link must work for a user who
  // is logged out, and an admin login must work in a browser where a
  // regular session already exists.
  const [urlParams] = useState(() => new URLSearchParams(window.location.search));
  const resetToken = urlParams.get('reset');
  const isAdminPage = urlParams.has('admin');
  if (resetToken) return <ResetPasswordView token={resetToken} />;
  if (isAdminPage) return <AdminView />;
  if (authError) return (<div style={S}><h1>Don't Ngiao</h1><p style={{color:'#a3a3a3'}}>Couldn't check your session — your login is kept, this may just be a network hiccup.</p><p style={{color:'#f87171'}}>{authError}</p><button style={{...primary, width:'100%'}} onClick={()=>checkAuth()}>Retry</button><p><button style={btn} onClick={()=>{ setToken(null); setUser(null); setAuthError(''); setAuthState('guest'); }}>Use a different account</button></p></div>);
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
  const [showYou, setShowYou] = useState(false);
  // BUG FIX, 2026-11-05: YouView used to render inline at the BOTTOM of
  // Home ({showYou && <YouView/>} after all Home content), so tapping
  // the avatar appended a second page below Home in the same scroll —
  // Home, then You, then scrolling back to Home. It now replaces Home
  // via an early return, like App replaces Home with GroupView and like
  // YouView replaces itself with the archived view.
  if (showYou) return <YouView user={user} setUser={setUser} onLogout={onLogout} groups={groups} loadGroups={loadGroups} loadGroup={loadGroup} onBack={()=>setShowYou(false)} setError={setError} />;
    const totals: any[] = groups?.totals || [];
  return (<div style={S}>
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <button aria-label="You" style={{width:48,height:48,borderRadius:'50%',background:'#65a30d',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18,flexShrink:0,border:'none',padding:0,cursor:'pointer'}} onClick={()=>setShowYou(true)}>{initials(user.name)}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:20,fontWeight:700}}>{user.name}</div>
          <div style={{fontSize:13,color:'#a3a3a3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>Mai ngiao, mai drama.</div>
        </div>
        <button type="button" aria-label="Dark / light mode (coming soon)" title="Dark / light mode — coming soon" disabled style={{width:88,height:40,borderRadius:999,border:'1px solid #333',background:'#242424',padding:3,boxSizing:'border-box',display:'flex',alignItems:'stretch',cursor:'not-allowed',flexShrink:0}}>
          <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,color:'#a3a3a3'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>
          <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,background:'#3f4756',color:'#ffffff'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg></span>
        </button>
      </div>
    </div>
    <h1 style={{marginBottom:4}}>Don't Ngiao</h1><p style={{color:'#a3a3a3',marginTop:0}}>Mai ngiao, mai drama.</p>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'#f87171'}}>{error}</span><button style={btn} onClick={()=>loadGroups()}>Retry</button></div>}
    <div style={{background:'linear-gradient(135deg,#0f766e,#059669,#10b981)',borderRadius:24,padding:20,marginBottom:20,color:'#fff'}}>
      <div style={{fontSize:12,letterSpacing:1.5,color:'#ccfbf1',fontWeight:600}}>ALL ACROSS {(groups?.active?.length ?? 0)} {((groups?.active?.length ?? 0) === 1) ? 'GROUP' : 'GROUPS'}</div>
      {totals.length === 0 || totals.every((t:any)=>t.balance===0) ? (<p style={{margin:'12px 0 0'}}>All settled.</p>) : totals.map((t:any)=>(<div key={t.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,marginTop:10}}>
        <span style={{color:'#ccfbf1'}}>{t.balance>0 ? 'You are owed' : t.balance<0 ? 'You owe' : 'Settled'}</span>
        <strong style={{fontSize:28,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(t.balance),t.currency)}</strong>
      </div>))}
      <p style={{fontSize:13,color:'#ccfbf1',marginBottom:0}}>Kept separate per currency — no conversion. Tap a group below to see who to pay.</p>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0}}>Your groups</h2>
      <button style={{...btn,borderRadius:999,padding:'10px 18px'}} onClick={()=>setShowCreate(true)}>+ New group</button>
    </div>
    {groups?.active?.length === 0 && <p style={{color:'#a3a3a3'}}>No groups yet — tap + New group to create one.</p>}
    {groups?.active?.map((g:any)=>{
      const spent: any[] = g.spent || [];
      const my: any[] = g.myBalances || [];
      return (<div key={g.id} style={{...homeCard,cursor:'pointer'}} onClick={()=>loadGroup(g.id)}>
        <strong style={{fontSize:17}}>{g.name}</strong>
        <div style={{fontSize:13,color:'#a3a3a3',marginTop:6}}>{g.memberCount ?? '?'} {(g.memberCount===1)?'person':'people'} · {g.expenseCount ?? '?'} expenses{spent.length>0 ? ` · ${spent.map((s:any)=>fmt(s.amount,s.currency)).join(' + ')} spent` : ''}</div>
        {my.length>0 && <div style={{marginTop:8}}>{my.map((b:any)=>(<div key={b.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,fontSize:14,color:b.balance>0?'#5eead4':b.balance<0?'#f87171':'#a3a3a3'}}><span>{b.balance>0 ? 'You are owed' : b.balance<0 ? 'You owe' : 'Settled'}</span><span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(b.balance),b.currency)}</span></div>))}</div>}
      </div>);
    })}
    <div style={{...homeCard,marginTop:20}}>
      <h3 style={{marginTop:0}}>How settling works here</h3>
      <p style={{fontSize:13,color:'#a3a3a3',marginBottom:0}}>Balances are per currency and never converted. Recording a payment never moves real money — it just records that money changed hands. Settle from a group's Balances tab, for one currency at a time.</p>
    </div>
    {showCreate && <CreateGroupModal onClose={()=>setShowCreate(false)} onDone={()=>{setShowCreate(false); loadGroups();}} />}
  </div>);
}


function YouView({ user, setUser, onLogout, groups, loadGroups, loadGroup, onBack, setError }: any) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name || '');
  const [editError, setEditError] = useState('');
  const archived: any[] = groups?.archived || [];
  const totalGroups = (groups?.active?.length || 0) + archived.length;
  const since = user.created_at ? (()=>{ const d = new Date(user.created_at); return `${d.toLocaleString('en-GB',{month:'short'})}, ${d.getFullYear()}`; })() : null;
  if (showArchived) return (<div style={S}>
    <button style={{...btn,borderRadius:999,padding:'10px 18px',marginBottom:16}} onClick={()=>setShowArchived(false)}>← You</button>
    <h2 style={{marginTop:0}}>Archive Groups</h2>
    {archived.length===0 && <p style={{color:'#a3a3a3'}}>No archived groups.</p>}
    {archived.map((g:any)=>(<div key={g.id} style={{...homeCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><strong style={{flex:1,minWidth:0}}>{g.name}</strong><span style={{display:'flex',gap:8,flexShrink:0}}><AsyncButton style={btn} onClick={async()=>{await api(`/api/groups/${g.id}/restore`,'POST'); loadGroups(); setShowArchived(false);}}>Restore</AsyncButton><AsyncButton style={btn} onClick={()=>loadGroup(g.id)}>Open</AsyncButton></span></div>))}
  </div>);
  return (<div style={S}>
    <button style={{...btn,borderRadius:999,padding:'10px 18px',marginBottom:16}} onClick={onBack}>← Home</button>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',marginBottom:20}}>
      <div style={{width:72,height:72,borderRadius:'50%',background:'#65a30d',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:28}}>{initials(user.name)}</div>
      <div style={{fontSize:24,fontWeight:700,marginTop:12}}>{user.name}</div>
      <div style={{fontSize:13,color:'#a3a3a3',marginTop:4}}>{user.email}</div>
      {since && <div style={{fontSize:13,color:'#a3a3a3',marginTop:4}}>User since {since} · {totalGroups} {totalGroups===1?'group':'groups'}</div>}
    </div>
    <h3 style={{marginBottom:8}}>Appearance</h3>
    <div style={{...homeCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><span>Theme</span><button type="button" aria-label="Dark / light mode (coming soon)" title="Dark / light mode — coming soon" disabled style={{width:88,height:40,borderRadius:999,border:'1px solid #333',background:'#242424',padding:3,boxSizing:'border-box',display:'flex',alignItems:'stretch',cursor:'not-allowed',flexShrink:0}}>
      <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,color:'#a3a3a3'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>
      <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,background:'#3f4756',color:'#ffffff'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg></span>
    </button></div>
    <h3 style={{marginBottom:8}}>Account</h3>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:8}}>
      <button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>{setNameDraft(user.name); setEditError(''); setEditingName(true);}}><span>Edit name <span style={{color:'#a3a3a3'}}>· Shown to your groups</span></span><span style={{color:'#a3a3a3'}}>›</span></button>
      <button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:0.5,cursor:'not-allowed'}} disabled><span>Change password</span><span style={{fontSize:12,color:'#a3a3a3',border:'1px solid #333',borderRadius:999,padding:'2px 8px'}}>Coming soon</span></button>
    </div>
    <h3 style={{marginBottom:8}}>Groups</h3>
    <button style={{...homeCard,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',color:'#fff'}} onClick={()=>setShowArchived(true)}><span>Archive Groups</span><span style={{color:'#a3a3a3'}}>{archived.length===0 ? 'No archived groups' : `${archived.length} archived · ${archived[0].name}`} ›</span></button>
    <div style={{marginTop:20}}><AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'#422006',borderColor:'#422006',color:'#f87171'}} onClick={async()=>{await api('/api/auth/logout','POST'); onLogout();}}>Log out</AsyncButton></div>
    {editingName && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#1c1c1e',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Edit name</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setEditingName(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <p style={{fontSize:13,color:'#a3a3a3'}}>This is the name shown to your groups.</p>
        <input style={input} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} aria-label="Name" />
        {editError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{editError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{if (!nameDraft.trim()) { setEditError('Name cannot be empty'); return; } try{const d = await api('/api/me','PATCH',{name:nameDraft}); setUser(d.user); setEditingName(false);}catch(e:any){setEditError(e.message);}}}>Save</AsyncButton>
      </div>
    </div>)}
  </div>);
}

function CreateGroupModal({ onClose, onDone }: any) {
  const [name, setName] = useState(''); const [cur, setCur] = useState('SGD');
  const [showCurrency, setShowCurrency] = useState(false);
  // Local error, same fix as Settings: this sheet overlays the home
  // view, so the parent's error rendered behind it and a failed Create
  // looked like "nothing happens" — the sheet just stayed open.
  const [createError, setCreateError] = useState('');
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#1c1c1e',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'#333',margin:'0 auto 12px'}} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>New group</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <label>Group name</label><input style={input} placeholder="e.g. Bali Trip 🌴" value={name} onChange={e=>setName(e.target.value)} />
      <button type="button" onClick={()=>setShowCurrency(v=>!v)} style={{width:'100%',textAlign:'left',background:'#242424',border:'1px solid #333',borderRadius:16,padding:14,marginBottom:12,color:'#fff',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span><span style={{display:'block',fontSize:12,color:'#a3a3a3'}}>Default currency</span><span style={{display:'block',marginTop:2}}>{cur}</span></span><span style={{color:'#a3a3a3'}}>›</span></button>
      {showCurrency && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>{CURRENCIES.map(c=><button key={c} type="button" style={c===cur?catControlActive:catControl} onClick={()=>{setCur(c); setShowCurrency(false);}}>{c}</button>)}</div>}
      <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setCreateError(''); try{await api('/api/groups','POST',{name,defaultCurrency:cur}); onDone();}catch(e:any){setCreateError(e.message);}}}>Create group</AsyncButton>
      {createError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{createError}</p>}
    </div>
  </div>);
}


// Auth bear (2026-11-05, Wai's pick: full bear with paws): a decorative
// SVG bear above the Auth form, Remembear-style. Pure React + inline
// SVG, no library. Behaviour is focus-driven (mobile has no mouse to
// follow): pupils look down toward the focused field and drift slightly
// with its length; paws slide up over the eyes when the password field
// is focused AND the password is hidden (if the user tapped Show, the
// paws stay down — covering eyes while the password is visible would
// be the joke landing wrong). Blinks on a ~3-5s timer. aria-hidden:
// decoration only, never a security claim — the password field itself
// is what masks the password.
function useBlink() {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let alive = true; let t1: any; let t2: any;
    const loop = () => { t1 = setTimeout(() => { if (!alive) return; setBlink(true); t2 = setTimeout(() => { if (!alive) return; setBlink(false); loop(); }, 150); }, 2800 + Math.random() * 2200); };
    loop();
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return blink;
}
function AuthBear({ focus, value, cover }: any) {
  const blink = useBlink();
  const len = (value || '').length;
  const dx = focus ? Math.min(len, 16) * 0.2 - 1.6 : 0;
  const dy = focus ? 3 : 0;
  const eyeRy = blink ? 1 : 9;
  // Idle paws rest low and out to the sides (cheeks), not over the snout:
  // left paw (-20, +20), right paw (+20, +20); covering is (0, 0) for both.
  const pawL = cover ? 'translate(0 0)' : 'translate(-20 20)';
  const pawR = cover ? 'translate(0 0)' : 'translate(20 20)';
  return (<div aria-hidden="true" style={{display:'flex',justifyContent:'center',marginBottom:8}}>
    <svg width="88" height="88" viewBox="0 0 120 120">
      <circle cx="28" cy="30" r="16" fill="#8d6b4f" /><circle cx="28" cy="30" r="8" fill="#c9a88a" />
      <circle cx="92" cy="30" r="16" fill="#8d6b4f" /><circle cx="92" cy="30" r="8" fill="#c9a88a" />
      <circle cx="60" cy="66" r="44" fill="#8d6b4f" />
      <ellipse cx="60" cy="82" rx="19" ry="14" fill="#e8dcc8" />
      <ellipse cx="60" cy="76" rx="7" ry="5" fill="#3e2723" />
      <path d="M60 81 v4 M60 85 Q52 92 44 88 M60 85 Q68 92 76 88" fill="none" stroke="#3e2723" strokeWidth="2" strokeLinecap="round" />
      <g>
        <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
        <ellipse cx="76" cy="58" rx="9" ry={eyeRy} fill="#fff" />
        {!blink && (<><circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /><circle cx={76 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /></>)}
      </g>
      <g transform={pawL} style={{transition:'transform 0.3s ease'}}>
        <ellipse cx="44" cy="58" rx="15" ry="12" fill="#8d6b4f" />
        <path d="M36 56 v4 M44 54 v4 M52 56 v4" stroke="#6d4c41" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g transform={pawR} style={{transition:'transform 0.3s ease'}}>
        <ellipse cx="76" cy="58" rx="15" ry="12" fill="#8d6b4f" />
        <path d="M68 56 v4 M76 54 v4 M84 56 v4" stroke="#6d4c41" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  </div>);
}

// Auth corgi (2026-11-05, comparison pick): same behaviour as AuthBear
// (focus-driven pupils, blinking, paws over eyes on hidden password),
// different face — Login shows the corgi, Register keeps the bear, so
// Wai can compare them by toggling the pill. Corgi markers: tall pointy
// ears, tan face with a white blaze, white muzzle, tongue out. Paws are
// cream (corgi paws), not head-tan, so they read as paws, not face.
function AuthCorgi({ focus, value, cover }: any) {
  const blink = useBlink();
  const len = (value || '').length;
  const dx = focus ? Math.min(len, 16) * 0.2 - 1.6 : 0;
  const dy = focus ? 3 : 0;
  const eyeRy = blink ? 1 : 9;
  const pawL = cover ? 'translate(0 0)' : 'translate(-20 20)';
  const pawR = cover ? 'translate(0 0)' : 'translate(20 20)';
  return (<div aria-hidden="true" style={{display:'flex',justifyContent:'center',marginBottom:8}}>
    <svg width="88" height="88" viewBox="0 0 120 120">
      <path d="M22 44 L30 6 L54 32 Z" fill="#d99a5b" stroke="#d99a5b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M98 44 L90 6 L66 32 Z" fill="#d99a5b" stroke="#d99a5b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M29 36 L33 16 L46 29 Z" fill="#f3c6a5" />
      <path d="M91 36 L87 16 L74 29 Z" fill="#f3c6a5" />
      <ellipse cx="60" cy="68" rx="44" ry="38" fill="#d99a5b" />
      <path d="M60 32 L57 58 L60 70 L63 58 Z" fill="#fff8ec" />
      <ellipse cx="60" cy="84" rx="20" ry="13" fill="#fff8ec" />
      <ellipse cx="60" cy="98" rx="7" ry="9" fill="#f48fb1" />
      <path d="M60 96 v6" stroke="#e57373" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="60" cy="78" rx="7" ry="5" fill="#3e2723" />
      <path d="M60 83 v3 M60 86 Q52 92 46 89 M60 86 Q68 92 74 89" fill="none" stroke="#3e2723" strokeWidth="2" strokeLinecap="round" />
      <g>
        <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
        <ellipse cx="76" cy="58" rx="9" ry={eyeRy} fill="#fff" />
        {!blink && (<><circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /><circle cx={76 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /></>)}
      </g>
      <g transform={pawL} style={{transition:'transform 0.3s ease'}}>
        <ellipse cx="44" cy="58" rx="15" ry="12" fill="#f5e6d3" />
        <path d="M36 56 v4 M44 54 v4 M52 56 v4" stroke="#c9a88a" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g transform={pawR} style={{transition:'transform 0.3s ease'}}>
        <ellipse cx="76" cy="58" rx="15" ry="12" fill="#f5e6d3" />
        <path d="M68 56 v4 M76 54 v4 M84 56 v4" stroke="#c9a88a" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  </div>);
}

function Auth({ onAuth, error, loading }: any) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<string|null>(null);
  const focusValue = focus==='name' ? name : focus==='email' ? email : focus==='password' ? password : '';
  return (<div style={S}>{mode==='login' ? <AuthCorgi focus={focus} value={focusValue} cover={focus==='password' && !showPassword} /> : <AuthBear focus={focus} value={focusValue} cover={focus==='password' && !showPassword} />}<h1>Don't Ngiao</h1><p style={{color:'#a3a3a3',marginTop:0}}>Mai ngiao, mai drama.</p>
    <div style={{...tabTrack,marginBottom:16}}><button style={mode==='login'?tabPillActive:tabPill} onClick={()=>setMode('login')}>Log in</button><button style={mode==='register'?tabPillActive:tabPill} onClick={()=>setMode('register')}>Register</button></div>
    <div style={homeCard}>
    {error && <p style={{color:'#f87171',marginTop:0}}>{error}</p>}
    {mode==='register' && <><label>Name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} onFocus={()=>setFocus('name')} onBlur={()=>setFocus(null)} /></>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>setFocus('email')} onBlur={()=>setFocus(null)} />
    <label>Password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={password} onChange={e=>setPassword(e.target.value)} onFocus={()=>setFocus('password')} onBlur={()=>setFocus(null)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={()=>onAuth(mode,name,email,password)}>{loading && <span className="btn-spinner" aria-hidden="true" />}{loading ? (mode==='login' ? 'Logging in…' : 'Creating account…') : (mode==='login' ? 'Log in' : 'Create account')}</button>
    </div>
    <p style={{color:'#a3a3a3',fontSize:13}}>Forgot your password? Ask the admin for a reset link.</p>
  </div>);
}


// ---- Admin (separate user, separate page) ----
// Admin token lives under its own localStorage key, NOT the regular
// dont-ngiao-token, so an admin session and a regular session can
// coexist in the same browser without logging each other out.
// Modules scaffold: AdminView renders a module bar; today there is one
// module (Users). Adding a module later = adding a tab + a view
// component here, plus its server endpoints — no restructuring.
const ADMIN_TOKEN_KEY = 'dont-ngiao-admin-token';
function getAdminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; } }
function setAdminToken(t: string | null) { try { if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t); else localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ } }
async function adminApi(path: string, method = 'GET', body?: any, token?: string | null) {
  const tok = token ?? getAdminToken();
  const res = await fetch(((import.meta as any).env?.VITE_API_URL || '') + path, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
// Fuzzy match: substring wins, otherwise the query's characters must
// appear in order (subsequence) in the text — so "wk" matches "Wai Kit",
// "lcs" matches "Lucas", and a typo-free prefix still works. Lists are
// small (friends/family), so filtering is client-side over the full
// user list fetched once — no server search endpoint needed yet.
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase(); const t = text.toLowerCase();
  if (!q) return true; if (t.includes(q)) return true;
  let qi = 0; for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
  return qi === q.length;
}
function AdminView() {
  const [adminUser, setAdminUser] = useState<any>(null);
  const [adminToken, setAdminTokenState] = useState<string | null>(() => getAdminToken());
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<any>(null); const [copyStatus, setCopyStatus] = useState('');
  async function loadUsers(tok: string) { const d = await adminApi('/api/admin/users', 'GET', undefined, tok); setUsers(d.users || []); }
  useEffect(() => {
    if (!adminToken) return;
    adminApi('/api/admin/users', 'GET', undefined, adminToken).then(d => setUsers(d.users || [])).catch(() => { setAdminToken(null); setAdminTokenState(null); setAdminUser(null); });
  }, []);
  async function doAdminLogin() {
    setError(''); setLoading(true);
    try {
      const d = await adminApi('/api/admin/login', 'POST', { email, password });
      setAdminToken(d.token); setAdminTokenState(d.token); setAdminUser(d.user); await loadUsers(d.token);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  function doAdminLogout() { setAdminToken(null); setAdminTokenState(null); setAdminUser(null); setUsers([]); setResetResult(null); }
  if (!adminUser) return (<div style={S}><h1>Admin</h1><p style={{color:'#a3a3a3'}}>Separate admin login — this is not the regular Don't Ngiao login. Only an admin account can sign in here.</p>
    <div style={homeCard}>
    {error && <p style={{color:'#f87171',marginTop:0}}>{error}</p>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} />
    <label>Password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={doAdminLogin}>{loading ? 'Logging in…' : 'Log in as admin'}</button>
    </div>
    <p><button style={btn} onClick={()=>{ window.location.href = '/'; }}>← Back to Don't Ngiao</button></p>
  </div>);
  const filtered = users.filter((u:any) => fuzzyMatch(search, u.name || '') || fuzzyMatch(search, u.email || ''));
  async function doReset(u: any) {
    setError(''); setCopyStatus(''); setResettingId(u.id);
    try {
      const d = await adminApi(`/api/admin/users/${u.id}/reset`, 'POST');
      const link = `${window.location.origin}/?reset=${d.token}`;
      setResetResult({ user: u, link, expiresAt: d.expiresAt });
      try { await navigator.clipboard.writeText(link); setCopyStatus('Copied to clipboard — send this link to the user yourself.'); }
      catch { setCopyStatus('Could not copy automatically — select the link below and copy it manually.'); }
    } catch (e: any) { setError(e.message); } finally { setResettingId(null); }
  }
  return (<div style={S}><h1>Admin</h1><p style={{color:'#a3a3a3'}}>Signed in as {adminUser.name} ({adminUser.email}) · Modules: Users</p>
    <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}><div style={tabTrack}><button style={tabPillActive}>Users</button></div><button style={btn} onClick={doAdminLogout}>Log out</button><button style={btn} onClick={()=>{ window.location.href = '/'; }}>← Back to app</button></div>
    {error && <p style={{color:'#f87171'}}>{error}</p>}
    {resetResult && <div style={homeCard}><strong>Reset link for {resetResult.user.name} ({resetResult.user.email})</strong><p style={{fontSize:13,color:'#a3a3a3'}}>Single-use, expires {new Date(resetResult.expiresAt).toLocaleString()}. Send this link to the user yourself — the app does not email it.</p><input readOnly style={input} value={resetResult.link} onFocus={e=>e.target.select()} /><button style={btn} onClick={async()=>{ try { await navigator.clipboard.writeText(resetResult.link); setCopyStatus('Copied to clipboard.'); } catch { setCopyStatus('Could not copy automatically.'); } }}>Copy link again</button>{copyStatus && <p style={{fontSize:13,color:'#a3a3a3'}}>{copyStatus}</p>}</div>}
    <label>Search users</label><input style={input} placeholder="Name or email (fuzzy: wk matches Wai Kit)" value={search} onChange={e=>setSearch(e.target.value)} />
    {filtered.length === 0 && <p style={{color:'#a3a3a3'}}>No users match.</p>}
    {filtered.length>0 && <div style={balCard}>{filtered.map((u:any,ui:number,arr:any[])=>(<div key={u.id} style={{...balRow,borderBottom:ui===arr.length-1?'none':balHairline}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,width:'100%'}}><div style={{flex:1,minWidth:0}}><strong>{u.name}</strong>{u.isAdmin ? <span style={{fontSize:12,background:'#134e4a',padding:'2px 6px',borderRadius:99,marginLeft:8}}>Admin</span> : null}<div style={{fontSize:13,color:'#a3a3a3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div><div style={{fontSize:13,color:'#a3a3a3'}}>Joined {new Date(u.createdAt).toLocaleDateString()}</div></div><button style={{...btn,flexShrink:0}} disabled={resettingId===u.id} onClick={()=>doReset(u)}>{resettingId===u.id ? 'Creating…' : 'Reset'}</button></div></div>))}</div>}
  </div>);
}

// ---- Password reset (link the admin sent manually) ----
function ResetPasswordView({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [done, setDone] = useState(false);
  async function doReset() {
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try { await api('/api/auth/reset-password', 'POST', { token, newPassword }); setDone(true); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  if (done) return (<div style={S}><h1>Password reset</h1><div style={homeCard}><p style={{marginTop:0}}>Your password has been changed. You can now log in with the new password.</p><button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{ window.location.href = '/'; }}>Go to log in</button></div></div>);
  return (<div style={S}><h1>Reset password</h1><p style={{color:'#a3a3a3'}}>Choose a new password. This link is single-use and expires after 24 hours.</p>
    <div style={homeCard}>
    {error && <p style={{color:'#f87171',marginTop:0}}>{error}</p>}
    <label>New password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={newPassword} onChange={e=>setNewPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <label>Confirm new password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={confirm} onChange={e=>setConfirm(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={doReset}>{loading ? 'Resetting…' : 'Reset password'}</button>
    </div>
  </div>);
}

function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [detailExpense, setDetailExpense] = useState<any>(null);
  const [settle, setSettle] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  // Member detail sheet (option C, 2026-11-05): tapping a member row opens
  // a bottom sheet, like You's tappable rows (Edit name, Archive Groups).
  // Edit email + Remove live inside the sheet, NOT on the row and NOT
  // inline — Edit/Remove are infrequent, so the extra tap is fine, and
  // the list never jumps when an editor opens. Own rows and archived
  // rows have no actions, so they are not tappable (no chevron), like
  // You's disabled Change password row.
  const [detailMember, setDetailMember] = useState<any>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [memberSheetError, setMemberSheetError] = useState('');
  // HYBRID REMOVE RULE (mirror of the worker guard, 2026-11-05):
  // placeholder -> anyone; account member -> creator only; creator ->
  // nobody. Tappable iff the sheet would have an action: Edit email
  // (placeholders) or Remove (per this rule). Own row never tappable.
  // If createdByUserId is missing (legacy group), fall back to the old
  // peer behaviour so the UI never hides a Remove the server allows.
  const creatorMemberId = group.createdByUserId ? (group.members.find((m:any)=>m.user_id===group.createdByUserId)?.id || null) : null;
  const isGroupCreator = !!group.createdByUserId && group.myMemberId === creatorMemberId;
  const canRemoveMember = (m:any) => !group.isArchived && m.id !== group.myMemberId && (!m.user_id || !group.createdByUserId || isGroupCreator);
  const [catView, setCatView] = useState<'group'|'mine'>('group');
  const [catChart, setCatChart] = useState<'pie'|'bar'>('pie');
  // Activity pagination, 50/page: group.activity is the first page from
  // groupDetail, extraActivity holds older pages appended below it.
  // hasMoreActivity comes from groupDetail (51st row exists); after
  // each older page, the endpoint's hasMore takes over. A write reloads
  // group.activity to a fresh first 50, which shifts the window by the
  // new entries — so if the base page changed since older pages were
  // loaded, the next Load older re-cursors from the fresh last row and
  // merges by id, instead of continuing from the stale tail and
  // skipping the entry that slid out of the first page.
  const [extraActivity, setExtraActivity] = useState<any[]>([]);
  const [activityHasMore, setActivityHasMore] = useState<boolean | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityBaseLastId, setActivityBaseLastId] = useState<string | null>(null);
  const displayedActivity = (() => {
    const seen = new Set<string>(); const out: any[] = [];
    for (const a of [...(group.activity || []), ...extraActivity]) { if (!seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    out.sort((a,b) => a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1));
    return out;
  })();
  const activityMore = activityHasMore !== null ? activityHasMore : !!group.hasMoreActivity;
  async function loadOlderActivity() {
    if (activityLoading) return;
    const baseLast = group.activity?.[group.activity.length - 1];
    const staleBase = extraActivity.length > 0 && activityBaseLastId && baseLast && activityBaseLastId !== baseLast.id;
    const cursor = staleBase ? baseLast : displayedActivity[displayedActivity.length - 1];
    if (!cursor) return;
    setActivityLoading(true); setActivityError('');
    try {
      const d = await api(`/api/groups/${group.id}/activity?before=${encodeURIComponent(cursor.created_at)}&beforeId=${encodeURIComponent(cursor.id)}`, 'GET');
      const merged = (() => { const seen = new Set<string>(); const out: any[] = []; for (const a of [...(group.activity || []), ...extraActivity, ...(d.activity || [])]) { if (!seen.has(a.id)) { seen.add(a.id); out.push(a); } } out.sort((a,b) => a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1)); return out; })();
      setExtraActivity(merged.slice((group.activity || []).length));
      setActivityHasMore(!!d.hasMore);
      setActivityBaseLastId(baseLast?.id || null);
    } catch (e: any) { setActivityError(e.message); } finally { setActivityLoading(false); }
  }
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
  // CHUNK 1, Nov 2026: catCur persists across groups (GroupView state
  // is not reset when a new group loads), so a currency picked in one
  // group could be absent from the next, rendering a blank chart with
  // no explanation. Clamp per render: use the picked currency only if
  // this group actually has it, otherwise fall back to the group's
  // first currency. The preference itself is kept (not cleared), so
  // returning to a group that has that currency restores it.
  const cur = (catCur && currencies.includes(catCur)) ? catCur : (currencies[0] || group.defaultCurrency);
  const catData = (catView==='group' ? group.categoryGroup?.[cur] : group.categoryMine?.[cur]) || {};
  return (<div style={S}>
    {/* Top bar, Nov 2026: ← Groups stays left alone; Settings moves to
    the right as a gear icon only, grouped with the theme toggle
    placeholder. The theme button is a PLACEHOLDER only — disabled, no
    theme switching yet (the app is dark-only; light mode was deferred
    in the UI/UX audit) — so it reserves the spot and the grouping
    without promising a working toggle. Icon buttons are 40px circles
    (same shape as the Home avatar button) so both stay tappable. */}
    <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
      <button style={btn} onClick={back}>← Groups</button>
      <span style={{display:'flex',gap:8,alignItems:'center'}}>
        {/* Theme toggle PLACEHOLDER, Nov 2026: segmented pill like the
        reference image — sun left, moon right, current mode highlighted.
        The app is dark-only, so this shows the dark state (moon side
        highlighted, sun dim), exactly like the bottom half of the
        reference. Icons are line SVGs (feather sun/moon), not emoji, so
        they match the reference's outline style. Still disabled: no
        light mode exists yet, so tapping it must not promise a switch
        that does nothing — when light mode is built, this same pill
        becomes the working toggle and the highlighted side flips. */}
        <button type="button" aria-label="Dark / light mode (coming soon)" title="Dark / light mode — coming soon" disabled style={{width:88,height:40,borderRadius:999,border:'1px solid #333',background:'#242424',padding:3,boxSizing:'border-box',display:'flex',alignItems:'stretch',cursor:'not-allowed',flexShrink:0}}>
          <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,color:'#a3a3a3'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>
          <span aria-hidden="true" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,background:'#3f4756',color:'#ffffff'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg></span>
        </button>
        <button type="button" aria-label="Group settings" title="Group settings" onClick={()=>setShowSettings(true)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
      </span>
    </div>
    <h1 style={{marginBottom:2}}>{group.name}</h1>
    {group.isArchived && <p style={{background:'#422006',padding:8,borderRadius:8}}>This group is archived. Restore it from Settings or You → Groups → Archive Groups to edit it again.</p>}
    {/* Sub-header as a metadata row, not a sentence (2026-11-05):
    left = default currency, right = member count, both muted 13px.
    No avatar stack (Wai's choice) and no currency pill — pills were
    just removed from Balances for the same repetition reason. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,color:'#a3a3a3',fontSize:13,lineHeight:1.4,marginTop:0,marginBottom:16}}>
      <span>Default: {group.defaultCurrency}</span>
      <span style={{whiteSpace:'nowrap'}}>{group.members.length} members</span>
    </div>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'#f87171'}}>{error}</span><button style={btn} onClick={()=>reload()}>Retry</button></div>}
    <div style={tabTrack}>
      {(['expenses','balances','members','activity'] as const).map(t=>(<button key={t} onClick={()=>changeTab(t)} style={{flex:1,padding:'10px 4px',fontSize:14,color:tab===t?'#0f172a':'#a3a3a3',background:tab===t?'#fff':'transparent',border:'none',borderRadius:999,fontWeight:tab===t?600:400,textTransform:'capitalize'}}>{t}</button>))}
    </div>
    {tab==='expenses' && <>
      <div style={card}><h3 style={{marginTop:0}}>Spend by category</h3>
        {/* Chart controls, 2026-11-05: Group/Mine now use the same segmented
        pill language as the group tabs and Auth tabs (dark track, white
        active pill) instead of the old separate teal rectangles — the
        old catControl rectangles were a second segment language on the
        same screen. Currency stays a native picker (tap opens the iOS
        picker list, same data/fallback as before, hidden when only one
        currency), but restyled as quiet text 'SGD ▾' on the right, not
        a rectangle button: Group/Mine is binary (segment fits), currency
        is N-ary (picker fits). appearance:none + custom chevron, so the
        native select arrows don't double up with the chevron. */}
        <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
          <div style={{display:'flex',background:'#242424',borderRadius:999,padding:3,flexShrink:0}}>
            <button style={catView==='group'?{...tabPillActive,flex:'none',padding:'8px 16px'}:{...tabPill,flex:'none',padding:'8px 16px'}} onClick={()=>setCatView('group')}>Group</button>
            <button style={catView==='mine'?{...tabPillActive,flex:'none',padding:'8px 16px'}:{...tabPill,flex:'none',padding:'8px 16px'}} onClick={()=>setCatView('mine')}>Mine</button>
          </div>
          {currencies.length>1 && <span style={{display:'flex',alignItems:'center',gap:4,marginLeft:'auto'}}><select aria-label="Chart currency" style={{background:'transparent',border:'none',color:'#fff',fontSize:14,padding:'8px 0',appearance:'none',cursor:'pointer',outline:'none'}} value={cur} onChange={e=>setCatCur(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select><span aria-hidden="true" style={{color:'#a3a3a3',pointerEvents:'none'}}>▾</span></span>}
        </div>
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
        {/* Chart explanation paragraph REMOVED 2026-11-05: it restated
        what was already visible (Group/Mine labels, dots, currency
        picker). Only the non-obvious Mine distinction is kept, shortened
        to one clause — Group needs no explanation at all. */}
        {catView==='mine' && <p style={{fontSize:12,color:'#a3a3a3'}}>Mine = your shares only.</p>}
      </div>
      {group.expenses.length===0 && <p>No expenses yet.</p>}
      {group.expenses.length>0 && <div style={balCard}>{group.expenses.map((e:any,ei:number,arr:any[])=>{const mySplit = group.myMemberId ? e.splits.find((s:any)=>s.member_id===group.myMemberId) : null; return (<div key={e.id} style={{...balRow,cursor:'pointer',borderBottom:ei===arr.length-1?'none':balHairline}} onClick={()=>setDetailExpense(e)}>
        <span style={{width:36,height:36,borderRadius:10,background:EXP_CAT_COLORS[e.category] || '#a3a3a3',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{catIcon(e.category)}</span>
        <div style={{flex:1,minWidth:0,lineHeight:1.4}}><div style={{fontWeight:600}}>{e.description}</div><div style={{fontSize:13,color:'#a3a3a3'}}>Paid by {e.payerName} · {fmtDate(e.date)}</div></div>
        <div style={{textAlign:'right',flexShrink:0,lineHeight:1.4}}><strong style={{whiteSpace:'nowrap'}}>{e.display}</strong><div style={{fontSize:13,color:'#a3a3a3'}}>{mySplit ? `your share ${fmt(mySplit.amount_minor,e.currency)}` : 'Not involved'}</div></div>
      </div>);})}</div>}
      {!showExpense && !group.isArchived && <div style={{position:'fixed',left:0,right:0,bottom:0,background:'#1c1c1e',borderTop:'1px solid #333',padding:12,textAlign:'center'}}><button style={primary} onClick={()=>setShowExpense(true)}>+ Add expense</button></div>}
    </>}
    {tab==='balances' && <>
      {group.balances.length===0 && <p>No balances yet.</p>}
      {(() => {
        const mine = group.balances.filter((b:any)=>b.memberId===group.myMemberId);
        if (!mine.length) return null;
        // Currency pills are hidden when the group has exactly one balance
        // currency (2026-11-05): the amount already carries its symbol
        // (S$, ¥, ...) and the group header states the default currency,
        // so a single-currency pill just repeats itself down the tab.
        // Multi-currency groups keep the pills — USD and SGD both show $.
        const singleCurrency = new Set(group.balances.map((b:any)=>b.currency)).size===1;
        return (<div style={balCard}>
          <div style={{padding:'14px 14px 6px',fontSize:12,letterSpacing:1,color:'#a3a3a3',fontWeight:600}}>YOUR POSITION IN THIS GROUP</div>
          {mine.map((b:any,i:number)=>(<div key={b.currency} style={{...balRow,justifyContent:'space-between',borderBottom:i===mine.length-1?'none':balHairline}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}><span>{b.balance>0?'You are owed':b.balance<0?'You owe':'Settled'}</span>{!singleCurrency && <span style={currencyChip}>{b.currency}</span>}</div>
            <strong style={{color:b.balance>0?'#2dd4bf':b.balance<0?'#f5f5f5':'#a3a3a3',fontSize:16,whiteSpace:'nowrap'}}>{b.balance===0?'Settled':fmt(Math.abs(b.balance), b.currency)}</strong>
          </div>))}
        </div>);
      })()}
      {(() => {
        const balCurrencies: string[] = [];
        for (const b of group.balances) if (!balCurrencies.includes(b.currency)) balCurrencies.push(b.currency);
        return balCurrencies.map((cur, ci) => {
          const spent = group.expenses.filter((e:any)=>e.currency===cur).reduce((sum:number,e:any)=>sum+e.amount_minor, 0);
          return (<div key={cur}>
            <div style={{display:'flex',alignItems:'center',justifyContent:balCurrencies.length===1?'flex-end':'space-between',gap:8,margin:`${ci===0?0:16}px 0 8px`}}>
              {balCurrencies.length>1 && <span style={currencyChip}>{cur}</span>}
              <span style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>spent {fmt(spent, cur)}</span>
            </div>
            <div style={balCard}>{group.balances.filter((b:any)=>b.currency===cur).map((b:any,bi:number,arr:any[])=>{
              const member = group.members.find((x:any)=>x.id===b.memberId);
              const displayName = b.memberId===group.myMemberId ? `You (${b.memberName})` : b.memberName;
              return (<div key={b.memberId+b.currency} style={{...balRow,borderBottom:bi===arr.length-1?'none':balHairline}}>
                <div style={{...avatar,background:memberDotColor(group, b.memberId)}}>{initials(b.memberName)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,lineHeight:1.4}}>{displayName}{member && !member.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
                  <div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Paid {fmt(b.paid ?? 0, cur)} · Share {fmt(b.share ?? 0, cur)}</div>
                </div>
                <strong style={{color:b.balance>0?'#5eead4':b.balance<0?'#f87171':'#a3a3a3',fontSize:16,whiteSpace:'nowrap',flexShrink:0,textAlign:'right'}}>{b.balance>0?'+':''}{b.display}</strong>
              </div>);
            })}</div>
          </div>);
        });
      })()}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,margin:'20px 0 8px'}}><h3 style={{margin:0,fontSize:17}}>Settle up</h3><span style={{fontSize:13,color:'#a3a3a3'}}>Simplified debts</span></div>
      {group.suggestions.length===0 && <p>All settled.</p>}
      {group.suggestions.length>0 && <div style={balCard}>{group.suggestions.map((s:any,i:number)=>{
        const from = personDisplay(group, s.fromMemberId, s.fromName);
        const to = personDisplay(group, s.toMemberId, s.toName);
        // SETTLE AUTH, Nov 2026: mirror the server rule in the UI — only
        // the creditor can settle, except when the creditor is a
        // placeholder (no account), in which case the debtor may. Anyone
        // else gets a disabled button + an explanation, not a hidden
        // button, so a debtor is not left wondering why there is no
        // Settle button (same pattern as the Leave grey-out).
        const toMember = group.members.find((m:any)=>m.id===s.toMemberId);
        const canSettle = group.myMemberId === s.toMemberId || (toMember && !toMember.user_id && group.myMemberId === s.fromMemberId);
        return (<div key={i} style={{...balRow,justifyContent:'space-between',borderBottom:i===group.suggestions.length-1?'none':balHairline}}>
          {/* Settle rows now match Recorded payments (2026-11-05): overlapping
          avatar pair, debtor first, creditor second, in memberDotColor —
          the single debtor dot is dropped, since avatars now carry the
          same sequential colour and also show the creditor. */}
          <div style={{display:'flex',alignItems:'center',flexShrink:0}}><span style={{...avatar,width:28,height:28,fontSize:12,background:memberDotColor(group, from.memberId)}}>{initials(from.name)}</span><span style={{...avatar,width:28,height:28,fontSize:12,marginLeft:-10,border:'2px solid #1c1c1e',background:memberDotColor(group, to.memberId)}}>{initials(to.name)}</span></div>
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div>{from.label} <span style={{color:'#a3a3a3'}}>{from.memberId===group.myMemberId?'owe':'owes'}</span> {to.memberId===group.myMemberId?'you':to.label}</div>
            <div style={{marginTop:4}}><strong>{s.display}</strong></div>
          </div>
          {!group.isArchived && <button style={{...primary,flexShrink:0,background:canSettle?'#2dd4bf':'#1f4d4a',borderColor:canSettle?'#2dd4bf':'#1f4d4a',color:canSettle?'#0f172a':'#0f172a',cursor:canSettle?'pointer':'not-allowed'}} disabled={!canSettle} onClick={()=>setSettle(s)}>Settle</button>}
        </div>);
      })}</div>}
      <p style={{fontSize:13,color:'#a3a3a3',lineHeight:1.45,margin:'8px 0 0'}}>Only the creditor can settle a debt — if a Settle button is dark, you're not part of that pair. Settling records a payment between the two people — partial amounts are fine, edit the amount in the sheet.</p>
      <h3 style={{margin:'20px 0 8px',fontSize:17}}>Recorded payments</h3>
      {group.payments.length>0 && <div style={balCard}>{group.payments.map((p:any,pi:number)=>{
        const from = personDisplay(group, p.from_member_id, p.fromName);
        const to = personDisplay(group, p.to_member_id, p.toName);
        return (<div key={p.id} style={{...balRow,justifyContent:'space-between',borderBottom:pi===group.payments.length-1?'none':balHairline}}>
          <div style={{display:'flex',alignItems:'center',flexShrink:0}}><span style={{...avatar,width:28,height:28,fontSize:12,background:memberDotColor(group, from.memberId)}}>{initials(from.name)}</span><span style={{...avatar,width:28,height:28,fontSize:12,marginLeft:-10,border:'2px solid #1c1c1e',background:memberDotColor(group, to.memberId)}}>{initials(to.name)}</span></div>
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div>{from.label} <span style={{color:'#a3a3a3'}}>paid</span> {to.memberId===group.myMemberId?'you':to.label}</div>
            <div style={{fontSize:13,lineHeight:1.4,marginTop:4}}><strong>{p.display}</strong> <span style={{color:'#a3a3a3'}}>· {fmtDate(p.date).replace(/ \d{4}$/,'')}</span></div>
            {paymentErrors[p.id] && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:4,marginBottom:0}}>{paymentErrors[p.id]}</p>}
          </div>
          {!group.isArchived && (group.myMemberId === p.from_member_id || group.myMemberId === p.to_member_id) && <button style={{...btn,flexShrink:0,background:'#422006',borderColor:'#422006',color:'#f87171',fontWeight:600}} onClick={()=>setConfirm({title:'Delete payment?',message:`Delete the ${p.display} payment from ${from.label} to ${to.label} on ${fmtDate(p.date)}? This cannot be undone.`,onError:(msg:string)=>setPaymentErrors(prev=>({...prev,[p.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/payments/${p.id}`,'DELETE'); reload(d);}})}>Delete</button>}
        </div>);
      })}</div>}
      <p style={{fontSize:13,color:'#a3a3a3',lineHeight:1.45,margin:'8px 0 0'}}>Delete shows only on payments you're part of — as the person who paid or the person who was paid.</p>
    </>}
    {tab==='members' && <>
      {group.members.length>0 && <div style={balCard}>{group.members.map((m:any,mi:number,arr:any[])=>{
        const tappable = canRemoveMember(m);
        return (<div key={m.id} style={{...balRow,borderBottom:mi===arr.length-1?'none':balHairline,cursor:tappable?'pointer':'default'}} onClick={tappable?()=>{setDetailMember(m); setEmailDraft(m.email || ''); setMemberSheetError('');}:undefined}>
        <div style={{...avatar,background:memberDotColor(group, m.id)}}>{initials(m.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,lineHeight:1.4}}>{m.id === group.myMemberId ? `You (${m.name})` : m.name}{!m.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
          {m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>) : (!m.user_id ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>No email set — can't be claimed yet</div>) : null)}
          {!m.user_id && m.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Can be claimed with this email</div>) : null}
        </div>
        {tappable && <span style={{color:'#a3a3a3',flexShrink:0}}>›</span>}
      </div>);})}</div>}
      {!group.isArchived && <div style={{marginTop:12}}><AddMember groupId={group.id} reload={reload} /></div>}
    </>}
    {detailMember && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#1c1c1e',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'#333',margin:'0 auto 12px'}} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Member</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setDetailMember(null)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:16}}>
          <div style={{...avatar,background:memberDotColor(group, detailMember.id)}}>{initials(detailMember.name)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,lineHeight:1.4}}>{detailMember.id === group.myMemberId ? `You (${detailMember.name})` : detailMember.name}{!detailMember.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
            {detailMember.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{detailMember.email}</div>) : (!detailMember.user_id ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>No email set — can't be claimed yet</div>) : null)}
            {!detailMember.user_id && detailMember.email ? (<div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>Can be claimed with this email</div>) : null}
          </div>
        </div>
        {/* Edit email: placeholders only, as before — an account member's
        email is their account email, not a per-group field. */}
        {!detailMember.user_id && <>
          <label style={{display:'block',marginTop:16}}>Email</label>
          <input style={input} placeholder="Email" value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} aria-label="Member email" />
          <p style={{fontSize:13,color:'#a3a3a3',lineHeight:1.45,marginTop:0}}>Attach an email later to link their account — they can claim this member by signing up with the same email.</p>
          {memberSheetError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{memberSheetError}</p>}
          <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setMemberSheetError(''); try{const d = await api(`/api/groups/${group.id}/members/${detailMember.id}`,'PATCH',{email:emailDraft}); setDetailMember(null); reload(d);}catch(er:any){setMemberSheetError(er.message);}}}>Save email</AsyncButton>
        </>}
        {/* Remove: per the hybrid rule (see GroupView helpers). Confirm
        button is labelled 'Remove', not the ConfirmSheet default
        'Delete' — the action is called Remove everywhere else here. */}
        {canRemoveMember(detailMember) && <div style={{marginTop:20}}>
          <AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'#422006',borderColor:'#422006',color:'#f87171'}} onClick={()=>{setDetailMember(null); setConfirm({title:'Remove member?',message:`Remove ${detailMember.name} from this group? This cannot be undone.`,confirmLabel:'Remove',onError:(msg:string)=>setMemberErrors(prev=>({...prev,[detailMember.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/members/${detailMember.id}`,'DELETE'); reload(d);}});}}>Remove member</AsyncButton>
        </div>}
      </div>
    </div>)}
    {tab==='activity' && <>
      {displayedActivity.length===0 && <p>No activity yet.</p>}
      {displayedActivity.length>0 && <div style={balCard}>{displayedActivity.map((a:any,ai:number,arr:any[])=>{const d = new Date(a.created_at); const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB',{month:'short'})} · ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`; return (<div key={a.id} style={{...balRow,flexDirection:'column',alignItems:'stretch',gap:2,borderBottom:ai===arr.length-1?'none':balHairline}}><div style={{fontWeight:600,lineHeight:1.4}}>{activityTitle(a)}{a.amount_minor!=null ? ` · ${fmt(a.amount_minor,a.currency)}` : ''}</div><div style={{fontSize:13,color:'#a3a3a3',lineHeight:1.4}}>{a.actor_name} · {dateStr}{a.detail?` · ${a.detail}`:''}</div></div>);})}</div>}
      {activityMore && <AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:4}} onClick={loadOlderActivity}>{activityLoading ? 'Loading…' : 'Load older activity'}</AsyncButton>}
      {!activityMore && displayedActivity.length>0 && <p style={{fontSize:13,color:'#a3a3a3'}}>That's all the activity for this group.</p>}
      {activityError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{activityError}</p>}
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
  const [show, setShow] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [addError, setAddError] = useState('');
  return (<>
    <button style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{setName(''); setEmail(''); setAddError(''); setShow(true);}}>+ Add member</button>
    {show && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#1c1c1e',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'#333',margin:'0 auto 12px'}} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Add member</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setShow(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <label style={{display:'block',marginTop:16}}>Name</label>
        <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <label>Email (optional)</label>
        <input style={input} placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
        <p style={{fontSize:13,color:'#a3a3a3',lineHeight:1.45,marginTop:0}}>Email is optional — add a placeholder now and attach an email later to link their account.</p>
        {addError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{addError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setAddError(''); try{const d = await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); reload(d); setShow(false);}catch(e:any){setAddError(e.message);}}}>Add member</AsyncButton>
      </div>
    </div>)}
  </>);
}

function ExpenseModal({ group, onClose, reload }: any) {
  // Add expense as a BOTTOM SHEET (revamp, dark only), not the old
  // full-screen modal. All logic/state unchanged: description, amount,
  // currency (19, group default pre-select), date, payer, category,
  // split equal/exact/percent + member ticking, modal-local error.
  // Prototype sheet features, restored to full real detail:
  // - amount header: fixed currency symbol prefix (not editable, symbol
  //   changes with currency) + numeric input only, select-all on focus,
  //   so typing replaces the amount and never clears the symbol.
  // - tap the amount header to pick currency (19, not prototype's 4).
  // - Split and Date are tappable summary cards opening their editors
  //   inside the sheet (split editor + calendar), not display-only.
  // - Category as pills (full names, incl. Uncategorized), not a select.
  const [modalError, setModalError] = useState('');
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState(group.defaultCurrency);
  const [date, setDate] = useState(todayIso()); const [payer, setPayer] = useState(group.members[0]?.id || ''); const [category, setCategory] = useState('Uncategorized');
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'>('equal');
  const [selected, setSelected] = useState<string[]>(group.members.map((m:any)=>m.id));
  const [percents, setPercents] = useState<Record<string,string>>({}); const [exact, setExact] = useState<Record<string,string>>({});
  const [showCurrency, setShowCurrency] = useState(false); const [showSplit, setShowSplit] = useState(false); const [showDate, setShowDate] = useState(false);
  const toggle = (id:string)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const payerName = group.members.find((m:any)=>m.id===payer)?.name || '';
  const splitLabel = splitType==='equal' ? 'Equally' : splitType==='exact' ? 'Exact amounts' : 'Percentages';
  const sym = (cur:string) => { const m:any = {SGD:'S$',USD:'$',EUR:'€',GBP:'£',AUD:'A$',CAD:'C$',JPY:'¥',KRW:'₩',VND:'₫',HKD:'HK$',TWD:'NT$',CNY:'¥',INR:'₹',MYR:'RM',THB:'฿',IDR:'Rp',PHP:'₱',NZD:'NZ$',CHF:'CHF'}; return m[cur] || cur; };
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div style={{background:'#1c1c1e',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'#333',margin:'0 auto 12px'}} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Add expense</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <button type="button" onClick={()=>setShowCurrency(v=>!v)} style={{display:'block',width:'100%',background:'transparent',border:'none',padding:'12px 0 4px',cursor:'pointer'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'center',gap:4}}><span style={{fontSize:36,fontWeight:700}}>{sym(currency)}</span><input style={{width:170,background:'transparent',border:'none',color:'#fff',fontSize:36,fontWeight:700,textAlign:'left',outline:'none'}} inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} onFocus={e=>e.target.select()} onClick={e=>e.stopPropagation()} aria-label="Amount" /></div>
        <div style={{fontSize:13,color:'#a3a3a3',marginTop:4}}>{group.name} · {currency} · paid by {payerName || 'you'}</div>
      </button>
      {showCurrency && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>{CURRENCIES.map(c=><button key={c} type="button" style={c===currency?catControlActive:catControl} onClick={()=>{setCurrency(c); setShowCurrency(false);}}>{c}</button>)}</div>}
      <label>Description</label><input style={input} placeholder="What was it for?" value={description} onChange={e=>setDescription(e.target.value)} />
      <div style={{marginBottom:10}}><div style={{fontSize:13,color:'#a3a3a3',marginBottom:6}}>Category</div><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{CATEGORIES.map(c=><button key={c} type="button" style={c===category?catControlActive:catControl} onClick={()=>setCategory(c)}>{c}</button>)}</div></div>
      <button type="button" onClick={()=>setShowSplit(v=>!v)} style={{width:'100%',textAlign:'left',background:'#242424',border:'1px solid #333',borderRadius:16,padding:14,marginBottom:12,color:'#fff',cursor:'pointer'}}><div style={{fontSize:12,color:'#a3a3a3'}}>Split</div><div style={{marginTop:2}}>{splitLabel} · {selected.length} people</div></button>
      {showSplit && <div style={{marginBottom:12}}><label>Split</label><select style={input} value={splitType} onChange={e=>setSplitType(e.target.value as any)}><option value="equal">Equal</option><option value="exact">Exact amounts</option><option value="percent">Percentages</option></select>
      {group.members.map((m:any)=>(<label key={m.id} style={{display:'block',marginBottom:6}}><input type="checkbox" checked={selected.includes(m.id)} onChange={()=>toggle(m.id)} /> {m.name}
        {selected.includes(m.id) && splitType==='percent' && <input style={{...input,width:120,marginLeft:8}} placeholder="%" value={percents[m.id]||''} onChange={e=>setPercents({...percents,[m.id]:e.target.value})} />}
        {selected.includes(m.id) && splitType==='exact' && <input style={{...input,width:140,marginLeft:8}} placeholder={currency} value={exact[m.id]||''} onChange={e=>setExact({...exact,[m.id]:e.target.value})} />}
      </label>))}</div>}
      <button type="button" onClick={()=>setShowDate(v=>!v)} style={{width:'100%',textAlign:'left',background:'#242424',border:'1px solid #333',borderRadius:16,padding:14,marginBottom:12,color:'#fff',cursor:'pointer'}}><div style={{fontSize:12,color:'#a3a3a3'}}>Date</div><div style={{marginTop:2}}>{date===todayIso() ? `Today · ${fmtDate(date)}` : fmtDate(date)}</div></button>
      {showDate && <div style={{marginBottom:12}}><DateField id="exp-date" value={date} onChange={setDate} /></div>}
      <label>Paid by</label><select style={input} value={payer} onChange={e=>setPayer(e.target.value)}>{group.members.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
      {modalError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{modalError}</p>}
      <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16, marginTop:8}} onClick={async()=>{
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
        <div style={{...avatar,background:memberDotColor(group, pd.memberId)}}>{initials(pd.name)}</div>
        <div style={{flex:1,minWidth:0,fontWeight:600,lineHeight:1.4}}>{pd.label}{member && !member.user_id ? <span style={noAccountChip}>No account yet</span> : null}</div>
        <strong style={{color:isMine?'#5eead4':'#f5f5f5',whiteSpace:'nowrap',flexShrink:0}}>{fmt(s.amount_minor,e.currency)}</strong>
      </div>);})}</div>
      {sheetError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{sheetError}</p>}
      <div style={{display:'flex',gap:8,marginTop:12}}>
        {!group.isArchived && <button style={btn} onClick={()=>setConfirm({title:'Delete expense?',message:`Delete '${e.description}' (${e.display})? This will also remove its splits. This cannot be undone.`,onError:(msg:string)=>setSheetError(msg),action:async()=>{const d = await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); onClose(); reload(d);}})}>Delete expense</button>}
        <button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
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
  if (group.isArchived) return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <p style={{fontSize:13,color:'#a3a3a3'}}>This group is archived and read-only. Restore it to edit it again.</p>
      <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
      {settingsError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
    </div>
  </div>);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'#111111',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid #333',background:'#242424',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <label>Group name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency (new expenses only — existing expenses keep their currency)</label><select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: dirty?1:0.5, cursor: dirty?'pointer':'not-allowed'}} disabled={!dirty} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}`,'PATCH',{name,defaultCurrency:cur}); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Save settings</AsyncButton>
        {group.isArchived
          ? <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
          : <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/archive`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Archive group</AsyncButton>}
      </div>
      {settingsError && <p style={{color:'#f87171',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
      <p style={{fontSize:13,color:'#a3a3a3'}}>Archiving hides the group from the active list and preserves all expenses, payments, members and activity. It can be restored.</p>
      <div style={{marginTop:20}}>
        <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16, background:'#422006', borderColor:'#422006', color:'#f87171', opacity: hasExpense?0.5:1, cursor: hasExpense?'not-allowed':'pointer'}} disabled={hasExpense} aria-disabled={hasExpense} onClick={async()=>{setSettingsError(''); try{const r = await api(`/api/groups/${group.id}/leave`,'POST'); if (r.groupDeleted || r.groupArchived) back(); else reload();}catch(e:any){setSettingsError(e.message);}}}>Leave group</AsyncButton>
        {hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled. The server enforces the same rule.</p>}
        {!hasExpense && <p style={{fontSize:13,color:'#a3a3a3'}}>You have no expenses in this group, so you can leave. If you are the last member, the group is deleted (it has no expenses to preserve).</p>}
      </div>
    </div>
  </div>);
}
