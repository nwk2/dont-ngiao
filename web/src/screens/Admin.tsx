import React, { useEffect, useState } from 'react';
import { fmt } from '../api';
import { AsyncButton, ConfirmSheet, PickerSheet, S, Sk, avatar, balCard, balHairline, balRow, btn, homeCard, initials, input, noAccountChip, primary, tabPill, tabPillActive, tabTrack } from '../ui';

// ---- Admin (separate user, separate page) ----
// Admin token lives under its own localStorage key, NOT the regular
// dont-ngiao-token, so an admin session and a regular session can
// coexist in the same browser without logging each other out.
// Modules scaffold: AdminView renders a module bar; today there is one
// module (Users). Adding a module later = adding a tab + a view
// component here, plus its server endpoints — no restructuring.
export const ADMIN_TOKEN_KEY = 'dont-ngiao-admin-token';
export function getAdminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; } }
export function setAdminToken(t: string | null) { try { if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t); else localStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* ignore */ } }
export async function adminApi(path: string, method = 'GET', body?: any, token?: string | null) {
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
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase(); const t = text.toLowerCase();
  if (!q) return true; if (t.includes(q)) return true;
  let qi = 0; for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
  return qi === q.length;
}
// Admin-only helpers: unambiguous dates ("4 Nov 2026"), neutral chips,
// filter chips, and a search field with an icon.
export function fmtDay(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
export const adminChip: React.CSSProperties = { fontSize:12, background:'var(--field)', color:'var(--muted)', padding:'2px 8px', borderRadius:'var(--radius-pill)', marginLeft:8, fontWeight:600, verticalAlign:'middle' };
export const filterChip = (on: boolean): React.CSSProperties => ({ height:34, padding:'0 14px', borderRadius:'var(--radius-pill)', border:`1px solid ${on ? 'var(--text)' : 'var(--border)'}`, background:on ? 'var(--text)' : 'transparent', color:on ? 'var(--bg)' : 'var(--text)', fontSize:14, fontWeight:on ? 600 : 400, cursor:'pointer' });
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (<div style={{display:'flex',alignItems:'center',gap:8,background:'var(--field)',borderRadius:12,padding:'10px 12px',margin:'0 0 12px'}}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{flexShrink:0}}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    <input style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:16,padding:0}} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} aria-label={placeholder} />
    {value && <button type="button" aria-label="Clear search" onClick={()=>onChange('')} style={{background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:18,lineHeight:1,padding:0}}>×</button>}
  </div>);
}
export function AdminSkeleton() {
  return (<div style={balCard} aria-label="Loading">{[0,1,2].map(i=>(<div key={i} style={{...balRow,flexDirection:'column',alignItems:'flex-start',gap:8,borderBottom:i===2?'none':balHairline}}><Sk w="45%" h={16} /><Sk w="70%" h={12} /></div>))}</div>);
}
export function AdminView() {
  const [adminUser, setAdminUser] = useState<any>(null);
  const [adminToken, setAdminTokenState] = useState<string | null>(() => getAdminToken());
  const [adminChecking, setAdminChecking] = useState<boolean>(() => !!getAdminToken());
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<any>(null); const [copyStatus, setCopyStatus] = useState('');
  // GROUPS MODULE, Nov 2026: adminModule switches the tab; groups is
  // the list (loaded on first visit to the tab); selectedGroup is the
  // detail object (null = list). groupBusy names the in-flight admin
  // action ('archive' | 'restore' | 'delete' | 'revoke' |
  // 'remove:<memberId>') so its button can disable + show progress.
  const [adminModule, setAdminModule] = useState<'users'|'groups'|'feedback'|'banner'>('users');
  const [groups, setGroups] = useState<any[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all'|'active'|'archived'>('all');
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState('');
  const [confirm, setConfirm] = useState<any>(null);
  // FEEDBACK MODULE, Nov 2026: triage for the in-app feedback
  // submissions. List (All / Open / Done, newest first) + detail with
  // the sender, group, build and the thread. You can reply in the app
  // (Haven-style: it lands in their Your messages, with a push) and
  // Mark done / Reopen.
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<'all'|'open'|'done'>('open');
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [reply, setReply] = useState('');
  // Four module tabs with counts: keep each label on one line on a phone.
  const modTab: React.CSSProperties = { whiteSpace:'nowrap', fontSize:13, padding:'10px 2px' };
  // ANNOUNCEMENTS (Haven-style banner): current + upcoming, and a form to
  // schedule one. The active one shows at the top of Home for everyone.
  const [announcements, setAnnouncements] = useState<any[] | null>(null);
  const [annText, setAnnText] = useState('');
  const [annFrom, setAnnFrom] = useState('');
  const [annUntil, setAnnUntil] = useState('');
  async function loadAnnouncements() {
    try { const d = await adminApi('/api/admin/announcements', 'GET'); setAnnouncements(d.announcements || []); }
    catch (e: any) { setError(e.message); setAnnouncements([]); }
  }
  async function scheduleAnnouncement() {
    setError('');
    try {
      await adminApi('/api/admin/announcements', 'POST', { text: annText, startsAt: new Date(annFrom).getTime(), endsAt: new Date(annUntil).getTime() });
      setAnnText(''); setAnnFrom(''); setAnnUntil(''); await loadAnnouncements();
    } catch (e: any) { setError(e.message); }
  }
  async function removeAnnouncement(id: string) {
    setError('');
    try { await adminApi(`/api/admin/announcements/${id}`, 'DELETE'); await loadAnnouncements(); }
    catch (e: any) { setError(e.message); }
  }
  async function openFeedback(f: any) {
    setSelectedFeedback(f); setReply('');
    try { const d = await adminApi(`/api/admin/feedback/${f.id}`, 'GET'); setSelectedFeedback(d); }
    catch (e: any) { setError(e.message); }
  }
  async function sendReply() {
    if (!selectedFeedback || !reply.trim()) return;
    setError('');
    try {
      const d = await adminApi(`/api/admin/feedback/${selectedFeedback.id}/reply`, 'POST', { text: reply });
      setSelectedFeedback(d); setReply('');
      setFeedback((list:any[])=>list.map((x:any)=>x.id===d.id ? { ...x, replied: true, replyCount: d.replyCount, updatedAt: d.updatedAt } : x));
    } catch (e: any) { setError(e.message); }
  }
  async function loadFeedback() {
    setFeedbackLoading(true);
    try { const d = await adminApi('/api/admin/feedback', 'GET'); setFeedback(d.feedback || []); }
    catch (e: any) { setError(e.message); }
    finally { setFeedbackLoading(false); }
  }
  async function doFeedbackStatus(f: any, status: 'open'|'done') {
    setError('');
    try {
      const d = await adminApi(`/api/admin/feedback/${f.id}`, 'PATCH', { status });
      setSelectedFeedback((cur:any)=>({ ...cur, ...d, replied: cur?.replied, replyCount: cur?.replyCount, messages: cur?.messages }));
      setFeedback((list:any[])=>list.map((x:any)=>x.id===d.id ? { ...x, status: d.status } : x));
    } catch (e: any) { setError(e.message); }
  }
  const fbTypeBadge = (t: string) => t==='bug' ? <span style={{fontSize:12,background:'var(--danger-bg)',color:'var(--danger-text)',padding:'2px 8px',borderRadius:'var(--radius-pill)'}}>Bug</span> : t==='idea' ? <span style={{fontSize:12,background:'var(--field)',color:'var(--text)',padding:'2px 8px',borderRadius:'var(--radius-pill)'}}>Idea</span> : <span style={{fontSize:12,background:'var(--field)',color:'var(--muted)',padding:'2px 8px',borderRadius:'var(--radius-pill)'}}>Question</span>;
  const fbStatusPill = (s: string) => s==='open' ? <span style={{fontSize:12,background:'var(--warn-bg)',color:'var(--warn-text)',padding:'2px 8px',borderRadius:'var(--radius-pill)'}}>Open</span> : <span style={{fontSize:12,background:'var(--tint-bg)',color:'var(--tint-text)',padding:'2px 8px',borderRadius:'var(--radius-pill)'}}>Done</span>;
  const filteredFeedback = feedback.filter((f:any) => feedbackFilter==='all' || f.status===feedbackFilter);
  const fbOpenCount = feedback.filter((f:any)=>f.status==='open').length;
  const fbDoneCount = feedback.filter((f:any)=>f.status==='done').length;
  async function loadUsers(tok: string) { const d = await adminApi('/api/admin/users', 'GET', undefined, tok); setUsers(d.users || []); }
  useEffect(() => {
    if (!adminToken) return;
    // ADMIN SESSION RESTORE, Nov 2026: the token persists in
    // localStorage but adminUser was only ever set by a fresh login, so
    // a reload always dropped the admin back to the login form. Now the
    // stored token is validated via /api/admin/me on load and the admin
    // user is restored, so a reload keeps the admin signed in. A dead
    // token clears itself, as before. adminChecking avoids flashing the
    // login form while the restore is in flight.
    adminApi('/api/admin/me', 'GET', undefined, adminToken).then(async (d) => { setAdminUser(d.user); await loadUsers(adminToken); }).catch(() => { setAdminToken(null); setAdminTokenState(null); setAdminUser(null); }).finally(() => setAdminChecking(false));
  }, []);
  async function doAdminLogin() {
    setError(''); setLoading(true);
    try {
      const d = await adminApi('/api/admin/login', 'POST', { email, password });
      setAdminToken(d.token); setAdminTokenState(d.token); setAdminUser(d.user); await loadUsers(d.token);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  function doAdminLogout() { setAdminToken(null); setAdminTokenState(null); setAdminUser(null); setUsers([]); setResetResult(null); setGroups([]); setSelectedGroup(null); setFeedback([]); setSelectedFeedback(null); setAdminModule('users'); }
  async function loadGroups() {
    setGroupsLoading(true);
    try { const d = await adminApi('/api/admin/groups', 'GET'); setGroups(d.groups || []); }
    catch (e: any) { setError(e.message); }
    finally { setGroupsLoading(false); }
  }
  async function openGroup(id: string) {
    setError(''); setInviteStatus('');
    try { const d = await adminApi(`/api/admin/groups/${id}`, 'GET'); setSelectedGroup(d); }
    catch (e: any) { setError(e.message); }
  }
  async function doArchiveGroup(g: any) {
    setGroupBusy('archive'); setError('');
    try { const d = await adminApi(`/api/admin/groups/${g.id}/archive`, 'POST'); setSelectedGroup(d); await loadGroups(); }
    catch (e: any) { setError(e.message); }
    finally { setGroupBusy(null); }
  }
  async function doRestoreGroup(g: any) {
    setGroupBusy('restore'); setError('');
    try { const d = await adminApi(`/api/admin/groups/${g.id}/restore`, 'POST'); setSelectedGroup(d); await loadGroups(); }
    catch (e: any) { setError(e.message); }
    finally { setGroupBusy(null); }
  }
  async function doDeleteGroup(g: any) {
    setGroupBusy('delete'); setError('');
    try {
      const d = await adminApi(`/api/admin/groups/${g.id}`, 'DELETE');
      if (d.deleted) { setSelectedGroup(null); await loadGroups(); }
      else if (d.archived) { const det = await adminApi(`/api/admin/groups/${g.id}`, 'GET'); setSelectedGroup(det); await loadGroups(); }
    } catch (e: any) { setError(e.message); }
    finally { setGroupBusy(null); }
  }
  async function doRemoveMember(g: any, m: any) {
    setGroupBusy('remove:' + m.id); setError('');
    try { const d = await adminApi(`/api/admin/groups/${g.id}/members/${m.id}`, 'DELETE'); setSelectedGroup(d); await loadGroups(); }
    catch (e: any) { setError(e.message); }
    finally { setGroupBusy(null); }
  }
  async function doInviteRevoke(g: any) {
    setGroupBusy('revoke'); setError(''); setInviteStatus('');
    try {
      const d = await adminApi(`/api/admin/groups/${g.id}/invite/revoke`, 'POST');
      const link = `${window.location.origin}/?invite=${d.token}`;
      setSelectedGroup({ ...g, inviteToken: d.token });
      try { await navigator.clipboard.writeText(link); setInviteStatus('Old link revoked. New link copied to clipboard.'); }
      catch { setInviteStatus('Old link revoked. New link below — copy it manually.'); }
    } catch (e: any) { setError(e.message); }
    finally { setGroupBusy(null); }
  }
  if (adminChecking) return (<div style={S}><p style={{color:'var(--muted)'}}>Loading…</p></div>);
  if (!adminUser) return (<div style={S}><h1>Admin</h1><p style={{color:'var(--muted)'}}>Separate admin login — this is not the regular Don't Ngiao login. Only an admin account can sign in here.</p>
    <div style={homeCard}>
    {error && <p style={{color:'var(--danger-text)',marginTop:0}}>{error}</p>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} />
    <label>Password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={password} onChange={e=>setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={doAdminLogin}>{loading ? 'Logging in…' : 'Log in as admin'}</button>
    </div>
    <p><button style={btn} onClick={()=>{ window.location.href = '/'; }}>← Back to Don't Ngiao</button></p>
  </div>);
  const filtered = users.filter((u:any) => fuzzyMatch(search, u.name || '') || fuzzyMatch(search, u.email || ''));
  const filteredGroups = groups.filter((gr:any) => {
    if (groupFilter === 'active' && gr.isArchived) return false;
    if (groupFilter === 'archived' && !gr.isArchived) return false;
    if (groupSearch.trim() && !fuzzyMatch(groupSearch, gr.name || '')) return false;
    return true;
  });
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
  return (<div style={S}><div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
    <button type="button" aria-label="Back to app" onClick={()=>{ window.location.href = '/'; }} style={{width:44,height:44,borderRadius:'50%',border:'none',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
    <h1 style={{margin:0,flex:1}}>Admin</h1>
    <button type="button" aria-label="Admin menu" onClick={()=>setShowAdminMenu(true)} style={{width:44,height:44,borderRadius:'50%',border:'none',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button>
  </div>
    {showAdminMenu && <PickerSheet title="Admin" onClose={()=>setShowAdminMenu(false)}>
      <p style={{color:'var(--muted)',fontSize:14,margin:'8px 0 12px'}}>Signed in as {adminUser.name} ({adminUser.email})</p>
      <div className="flat-list" style={{background:'var(--field)',borderRadius:'var(--radius-card)',overflow:'hidden'}}>
        <button className="flat-row" onClick={()=>{ window.location.href = '/'; }}><span>Back to app</span><span style={{color:'var(--muted)'}}>›</span></button>
        <button className="flat-row" style={{color:'var(--danger-text)'}} onClick={()=>{ setShowAdminMenu(false); doAdminLogout(); }}><span>Log out of admin</span></button>
      </div>
    </PickerSheet>}
    {/* ADMIN MODULE BAR, Nov 2026: the module tabs are their own
        full-width segmented control row (like the group tabs in the main
        app) so more modules slot in later with no layout change. The
        actions (Log out / Back to app) live inline with the Admin title
        above, not in the tab row — they used to share a row with the
        tabTrack, which mixed a tab with standalone buttons (different
        heights/fonts, stray track margin). */}
    <div style={tabTrack}><button style={adminModule==='users'?{...tabPillActive,...modTab}:{...tabPill,...modTab}} onClick={()=>{setError(''); setAdminModule('users'); setSelectedGroup(null); setSelectedFeedback(null);}}>Users · {users.length}</button><button style={adminModule==='groups'?{...tabPillActive,...modTab}:{...tabPill,...modTab}} onClick={()=>{setError(''); setAdminModule('groups'); setSelectedGroup(null); setSelectedFeedback(null); if (groups.length===0) loadGroups();}}>Groups{groups.length ? ` · ${groups.length}` : ''}</button><button style={adminModule==='feedback'?{...tabPillActive,...modTab}:{...tabPill,...modTab}} onClick={()=>{setError(''); setAdminModule('feedback'); setSelectedGroup(null); setSelectedFeedback(null); if (feedback.length===0) loadFeedback();}}>Feedback{feedback.length ? ` · ${fbOpenCount}` : ''}</button><button style={adminModule==='banner'?{...tabPillActive,...modTab}:{...tabPill,...modTab}} onClick={()=>{setError(''); setAdminModule('banner'); setSelectedGroup(null); setSelectedFeedback(null); if (announcements===null) loadAnnouncements();}}>Banner</button></div>
    {error && <p style={{color:'var(--danger-text)'}}>{error}</p>}
    {adminModule==='users' && (<>
    {resetResult && <div style={homeCard}><strong>Reset link for {resetResult.user.name} ({resetResult.user.email})</strong><p style={{fontSize:13,color:'var(--muted)'}}>Single-use, expires {fmtDay(resetResult.expiresAt)}, {new Date(resetResult.expiresAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}. Send this link to the user yourself — the app does not email it.</p><input readOnly style={input} value={resetResult.link} onFocus={e=>e.target.select()} /><button style={btn} onClick={async()=>{ try { await navigator.clipboard.writeText(resetResult.link); setCopyStatus('Copied to clipboard.'); } catch { setCopyStatus('Could not copy automatically.'); } }}>Copy link again</button>{copyStatus && <p style={{fontSize:13,color:'var(--muted)'}}>{copyStatus}</p>}</div>}
    <SearchField value={search} onChange={setSearch} placeholder="Search by name or email" />
    {filtered.length === 0 && <p style={{color:'var(--muted)'}}>No users match.</p>}
    {selectedUser && <PickerSheet title={selectedUser.name} onClose={()=>setSelectedUser(null)}>
      <div style={{fontSize:14,lineHeight:1.6,marginTop:12}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'8px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Email</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selectedUser.email}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'8px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Joined</span><span>{fmtDay(selectedUser.createdAt)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'8px 0',borderTop:balHairline,borderBottom:balHairline}}><span style={{color:'var(--muted)'}}>Role</span><span>{selectedUser.isAdmin ? 'Admin' : 'Member'}</span></div>
      </div>
      <p style={{fontSize:13,color:'var(--muted)'}}>Creates a single-use reset link and copies it. Send it to them yourself; the app doesn't email it.</p>
      <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={resettingId===selectedUser.id} onClick={async()=>{ await doReset(selectedUser); setSelectedUser(null); }}>Create password reset link</AsyncButton>
    </PickerSheet>}
    {filtered.length>0 && <div style={balCard}>{filtered.map((u:any,ui:number,arr:any[])=>(<div key={u.id} style={{...balRow,borderBottom:ui===arr.length-1?'none':balHairline,cursor:'pointer'}} onClick={()=>setSelectedUser(u)}><div style={{flex:1,minWidth:0}}><strong>{u.name}</strong>{u.isAdmin ? <span style={adminChip}>Admin</span> : null}<div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div><div style={{fontSize:13,color:'var(--muted)'}}>Joined {fmtDay(u.createdAt)}</div></div><span style={{color:'var(--muted)',flexShrink:0}}>›</span></div>))}</div>}
    </>)}
    {adminModule==='groups' && !selectedGroup && (<>
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><button style={filterChip(groupFilter==='all')} onClick={()=>setGroupFilter('all')}>All</button><button style={filterChip(groupFilter==='active')} onClick={()=>setGroupFilter('active')}>Active</button><button style={filterChip(groupFilter==='archived')} onClick={()=>setGroupFilter('archived')}>Archived</button></div>
    <SearchField value={groupSearch} onChange={setGroupSearch} placeholder="Search groups" />
    {groupsLoading && <AdminSkeleton />}
    {!groupsLoading && filteredGroups.length===0 && <p style={{color:'var(--muted)'}}>No groups match.</p>}
    {!groupsLoading && filteredGroups.length>0 && <div style={balCard}>{filteredGroups.map((gr:any,gi:number,arr:any[])=>(<div key={gr.id} style={{...balRow,borderBottom:gi===arr.length-1?'none':balHairline,cursor:'pointer'}} onClick={()=>openGroup(gr.id)}><div style={{flex:1,minWidth:0}}><strong>{gr.name}</strong>{gr.isArchived ? <span style={adminChip}>Archived</span> : null}<div style={{fontSize:13,color:'var(--muted)'}}>{gr.memberCount} member{gr.memberCount===1?'':'s'} · {gr.expenseCount} expense{gr.expenseCount===1?'':'s'} · {gr.paymentCount} payment{gr.paymentCount===1?'':'s'}</div><div style={{fontSize:13,color:'var(--muted)'}}>Created {fmtDay(gr.createdAt)} by {gr.creatorName}</div></div><span style={{color:'var(--muted)',flexShrink:0}}>›</span></div>))}</div>}
    </>)}
    {adminModule==='groups' && selectedGroup && (<>
    <p><button style={btn} onClick={()=>{setSelectedGroup(null); loadGroups();}}>← Back to groups</button></p>
    <h2 style={{margin:'0 0 4px'}}>{selectedGroup.name}</h2>
    <p style={{color:'var(--muted)',marginTop:0}}>Created {fmtDay(selectedGroup.createdAt)} by {selectedGroup.creatorName} · Default {selectedGroup.defaultCurrency}{selectedGroup.isArchived ? ' · Archived' : ''}</p>
    <div style={homeCard}><strong>Money</strong><div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{selectedGroup.expenseCount} expense{selectedGroup.expenseCount===1?'':'s'} · {selectedGroup.paymentCount} payment{selectedGroup.paymentCount===1?'':'s'}</div>{Object.keys(selectedGroup.totals||{}).length===0 ? <div style={{fontSize:13,color:'var(--muted)'}}>No money yet.</div> : Object.keys(selectedGroup.totals).map((cur:string)=>(<div key={cur} style={{display:'flex',justifyContent:'space-between',fontSize:14,marginTop:4}}><span>{cur}</span><strong>{fmt(selectedGroup.totals[cur], cur)}</strong></div>))}</div>
    <div style={balCard}>{selectedGroup.members.map((m:any,mi:number,arr:any[])=>(<div key={m.id} style={{...balRow,borderBottom:mi===arr.length-1?'none':balHairline}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,width:'100%'}}><div style={{flex:1,minWidth:0}}><strong>{m.name}</strong>{m.isCreator ? <span style={adminChip}>Creator</span> : null}{!m.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}<div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email || 'No email'}</div><div style={{fontSize:13,color:'var(--muted)'}}>Joined {fmtDay(m.createdAt)}</div>{m.removeBlocked ? <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{m.removeBlocked}</div> : null}</div><button style={{...btn,flexShrink:0}} disabled={!m.canRemove || groupBusy===('remove:'+m.id)} onClick={()=>setConfirm({title:'Remove member?',message:`Remove ${m.name} from '${selectedGroup.name}'? This cannot be undone.`,confirmLabel:'Remove',onError:(msg:string)=>setError(msg),action:async()=>{await doRemoveMember(selectedGroup,m);}})}>{groupBusy===('remove:'+m.id) ? 'Removing…' : 'Remove'}</button></div></div>))}</div>
    <div style={homeCard}><strong>Invite link</strong>{selectedGroup.inviteToken ? <><p style={{fontSize:13,color:'var(--muted)'}}>Anyone with this link can join the group.</p><input readOnly style={input} value={`${window.location.origin}/?invite=${selectedGroup.inviteToken}`} onFocus={e=>e.target.select()} /><div style={{display:'flex',gap:8}}><button style={btn} onClick={async()=>{ try { await navigator.clipboard.writeText(`${window.location.origin}/?invite=${selectedGroup.inviteToken}`); setInviteStatus('Copied to clipboard.'); } catch { setInviteStatus('Could not copy automatically.'); } }}>Copy link</button><button style={{...btn,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)',fontWeight:600}} disabled={groupBusy==='revoke'} onClick={()=>setConfirm({title:'Revoke invite link?',message:'The current link stops working right away. A new one appears here — share that instead.',confirmLabel:'Revoke',onError:(msg:string)=>setError(msg),action:async()=>{await doInviteRevoke(selectedGroup);}})}>{groupBusy==='revoke' ? 'Revoking…' : 'Revoke'}</button></div>{inviteStatus && <p style={{fontSize:13,color:'var(--muted)'}}>{inviteStatus}</p>}</> : <p style={{fontSize:13,color:'var(--muted)'}}>No active invite link. A member can create one from the Members tab.</p>}</div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
    {selectedGroup.isArchived
      ? <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>doRestoreGroup(selectedGroup)}>Restore group</AsyncButton>
      : <AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={()=>doArchiveGroup(selectedGroup)}>Archive group</AsyncButton>}
    {selectedGroup.isClean && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)',fontWeight:600}} disabled={groupBusy==='delete'} onClick={()=>setConfirm({title:'Delete group?',message:`Delete '${selectedGroup.name}'? It has no expenses or payments, so it will be permanently deleted (members, invite link and activity go with it). This cannot be undone.`,confirmLabel:'Delete',onError:(msg:string)=>setError(msg),action:async()=>{await doDeleteGroup(selectedGroup);}})}>{groupBusy==='delete' ? 'Deleting…' : 'Delete group'}</button>}
    {!selectedGroup.isClean && <p style={{fontSize:13,color:'var(--muted)'}}>Delete is only available for groups with no expenses or payments — this group has money history, so archive it instead.</p>}
    </div>
    </>)}
    {adminModule==='banner' && (<>
    <p style={{color:'var(--muted)',fontSize:14,marginTop:0}}>A short message at the top of Home for everyone, between the times you set. Only one shows at a time: the latest to start.</p>
    {announcements===null && <AdminSkeleton />}
    {announcements!==null && announcements.length>0 && <div style={balCard}>{announcements.map((a:any,ai:number,arr:any[])=>{
      const live = a.startsAt <= Date.now();
      return (<div key={a.id} style={{...balRow,borderBottom:ai===arr.length-1?'none':balHairline,alignItems:'flex-start'}}>
        <div style={{flex:1,minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}><span style={adminChip}>{live ? 'Showing now' : 'Scheduled'}</span></div><div style={{fontSize:15,whiteSpace:'pre-wrap'}}>{a.text}</div><div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{fmtDay(new Date(a.startsAt).toISOString())}, {new Date(a.startsAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} – {fmtDay(new Date(a.endsAt).toISOString())}, {new Date(a.endsAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></div>
        <AsyncButton style={{...btn,flexShrink:0}} onClick={()=>removeAnnouncement(a.id)}>Remove</AsyncButton>
      </div>);
    })}</div>}
    <div style={homeCard}>
      <label style={{display:'block'}}><span style={{display:'block',fontSize:13,color:'var(--muted)',marginBottom:6}}>Message (up to 280 characters)</span>
        <textarea value={annText} onChange={e=>setAnnText(e.target.value)} rows={3} maxLength={280} style={{...input,resize:'vertical',fontFamily:'inherit'}} /></label>
      <div style={{fontSize:12,color:'var(--muted)',textAlign:'right',marginTop:-6,marginBottom:8}}>{annText.length}/280</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gap:10}}>
        <label><span style={{display:'block',fontSize:13,color:'var(--muted)',marginBottom:6}}>Show from</span><input type="datetime-local" value={annFrom} onChange={e=>setAnnFrom(e.target.value)} style={{...input,margin:0}} /></label>
        <label><span style={{display:'block',fontSize:13,color:'var(--muted)',marginBottom:6}}>Until</span><input type="datetime-local" value={annUntil} onChange={e=>setAnnUntil(e.target.value)} style={{...input,margin:0}} /></label>
      </div>
      <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16,marginTop:14}} disabled={!annText.trim() || !annFrom || !annUntil} onClick={scheduleAnnouncement}>Schedule</AsyncButton>
    </div>
    </>)}
    {adminModule==='feedback' && !selectedFeedback && (<>
    {/* REBUILD 2026-11-14: no build fired for c8b07d0b — re-trigger. */}
    {/* FEEDBACK FILTER, Nov 2026: Open / Done / All, default Open (Wai
    2026-11-13) — the triage view is the open items, so it leads. */}
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><button style={filterChip(feedbackFilter==='open')} onClick={()=>setFeedbackFilter('open')}>Open · {fbOpenCount}</button><button style={filterChip(feedbackFilter==='done')} onClick={()=>setFeedbackFilter('done')}>Done · {fbDoneCount}</button><button style={filterChip(feedbackFilter==='all')} onClick={()=>setFeedbackFilter('all')}>All · {feedback.length}</button></div>
    {feedbackLoading && <AdminSkeleton />}
    {!feedbackLoading && filteredFeedback.length===0 && <div style={{...homeCard,textAlign:'center',padding:'24px 16px'}}><div style={{fontWeight:600}}>{feedbackFilter==='open' ? 'No open feedback' : feedbackFilter==='done' ? 'Nothing marked done yet' : 'No feedback yet'}</div><div style={{fontSize:14,color:'var(--muted)',marginTop:6}}>Anything people send from the app shows up here.</div></div>}
    {!feedbackLoading && filteredFeedback.length>0 && <div style={balCard}>{filteredFeedback.map((f:any,fi:number,arr:any[])=>(<div key={f.id} style={{...balRow,borderBottom:fi===arr.length-1?'none':balHairline,cursor:'pointer'}} onClick={()=>openFeedback(f)}><div style={{flex:1,minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:8}}>{fbTypeBadge(f.type)}<strong>{f.senderName}</strong>{fbStatusPill(f.status)}{f.replied && <span style={adminChip}>Replied</span>}</div><div style={{fontSize:13,color:'var(--muted)'}}>{f.groupName || 'General (no group)'} · {fmtDay(f.createdAt)}</div><div style={{fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.message}</div></div><span style={{color:'var(--muted)',flexShrink:0}}>›</span></div>))}</div>}
    </>)}
    {adminModule==='feedback' && selectedFeedback && (<>
    <p><button style={btn} onClick={()=>{setSelectedFeedback(null); loadFeedback();}}>← Back to feedback</button></p>
    <div style={homeCard}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <div style={{...avatar,background:'var(--field)',color:'var(--text)'}}>{initials(selectedFeedback.senderName)}</div>
        <div style={{flex:1,minWidth:0}}><strong style={{fontSize:17}}>{selectedFeedback.senderName}</strong><div style={{fontSize:13,color:'var(--muted)'}}>Member since {fmtDay(selectedFeedback.senderCreatedAt)}</div></div>
        {fbStatusPill(selectedFeedback.status)}
      </div>
      <div style={{marginTop:12,fontSize:14,lineHeight:1.6}}>
        <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Type</span>{fbTypeBadge(selectedFeedback.type)}</div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Group</span><span>{selectedFeedback.groupName || 'General (no group)'}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Build</span><span style={{fontFamily:'ui-monospace,monospace',fontSize:13}}>{selectedFeedback.buildId || '—'}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:balHairline}}><span style={{color:'var(--muted)'}}>Sent</span><span>{fmtDay(selectedFeedback.createdAt)}, {new Date(selectedFeedback.createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></div>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
      {(selectedFeedback.messages || [{ id:'orig', author:'user', text: selectedFeedback.message, createdAt: selectedFeedback.createdAt }]).map((m:any)=>(<div key={m.id} style={{...homeCard,marginBottom:0,background:m.author==='admin'?'var(--info-bg)':'var(--card)',marginLeft:m.author==='admin'?32:0,marginRight:m.author==='admin'?0:32}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--muted)',marginBottom:4}}>{m.author==='admin' ? 'You (Don\u2019t Ngiao team)' : selectedFeedback.senderName} · {fmtDay(m.createdAt)}, {new Date(m.createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
        <div style={{fontSize:15,lineHeight:1.55,whiteSpace:'pre-wrap'}}>{m.text}</div>
      </div>))}
    </div>
    <label style={{display:'block',marginBottom:12}}>
      <span style={{display:'block',fontSize:13,color:'var(--muted)',marginBottom:6}}>Reply to {selectedFeedback.senderName} (shows in their Your messages, with a notification)</span>
      <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={3} maxLength={2000} style={{...input,resize:'vertical',margin:0,fontFamily:'inherit'}} />
    </label>
    <AsyncButton style={{...btn,width:'100%',padding:'12px',fontSize:15,marginBottom:10}} disabled={!reply.trim()} onClick={sendReply}>Send reply</AsyncButton>
    <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{ await doFeedbackStatus(selectedFeedback, selectedFeedback.status==='open' ? 'done' : 'open'); }}>{selectedFeedback.status==='open' ? 'Mark done' : 'Reopen'}</AsyncButton>

    </>)}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){if (confirm.onError) confirm.onError(er.message); else setError(er.message);}finally{setConfirm(null);}}} />}
  </div>);
}
