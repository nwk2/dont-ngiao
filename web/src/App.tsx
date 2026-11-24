import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { api, fetchVersion, getToken, setToken } from './api';
import { FeedbackSheet } from './components/FeedbackSheet';
import { HomeCurrencyPrompt, RateSheet } from './components/Fx';
import { refreshRates, setHomeCurrency } from './fx';
import { LAST_GROUP_KEY, readSavedGroup } from './prefs';
import { GOOGLE_STATE_KEY } from './google';
import { Appearance, BASE, applyAppearance, cacheAppearance, forgetAppearance, fromUser, takeLegacyChoice } from './themes';
// Admin and the signed-out screens load on demand, so signed-in users don't
// download them. If a chunk fails to load (usually because a new build
// replaced its hashed file while this tab was open), reload to pick up the
// new build instead of leaving a blank screen.
function lazyScreen<T extends React.ComponentType<any>>(load: () => Promise<T>) {
  return lazy(() => load().then(c => ({ default: c })).catch(() => { window.location.reload(); return new Promise<{ default: T }>(() => {}); }));
}
const AdminView = lazyScreen(() => import('./screens/Admin').then(m => m.AdminView));
const Auth = lazyScreen(() => import('./screens/Auth').then(m => m.Auth));
const InviteView = lazyScreen(() => import('./screens/Auth').then(m => m.InviteView));
const ResetPasswordView = lazyScreen(() => import('./screens/Auth').then(m => m.ResetPasswordView));
import { GroupSkeleton, GroupView } from './screens/Group';
import { Home, HomeSkeleton } from './screens/Home';
import { S, btn, primary } from './ui';

// Loading state, explained: the old code had only two states — user null
// (render Auth) or user set (render Home/Group). On refresh, the first
// paint always had user null, so it flashed Auth even with a valid token,
// until /api/me returned. Now there are three states: 'checking' (token
// present, /api/me in flight — render a skeleton, never Auth), 'guest' (no
// token, or /api/me failed — render Auth), 'authed' (render Home/Group).
// A failed /api/me still clears the token, exactly as before; the only
// change is what the user sees while the check is in flight.
export default function App() {
  const [user, setUser] = useState<any>(null);
  // From /api/me alongside the user (Haven-style): the active admin
  // announcements (live now or starting within a day, minus the ones you
  // dismissed) and how many feedback replies you haven't read.
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [authState, setAuthState] = useState<'checking'|'guest'|'authed'>(()=> getToken() ? 'checking' : 'guest');
  const [groups, setGroups] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  // ONBOARDING, Nov 2026: set when the user joins via an invite link, so
  // GroupView shows the Add-to-Home-Screen / Enable-notifications prompt
  // right after joining. Cleared when they leave the group (back) or open
  // a different group, so it does not reappear on a later visit.
  const [justJoinedId, setJustJoinedId] = useState<string | null>(null);
  // FEEDBACK, Nov 2026: the shared sheet state lives here (not in
  // GroupView/SettingsView) because both doors open the same
  // sheet. openFeedback(groupId) sets the default group for the
  // sheet: the current group from GroupView, null from Settings (the
  // sheet then falls back to the last-opened group, else the first
  // active group). The sheet mounts fresh on every open, so the form
  // always starts fresh.
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackGroupId, setFeedbackGroupId] = useState<string | null>(null);
  function openFeedback(groupId: string | null) { setFeedbackGroupId(groupId); setShowFeedback(true); }
  // FORCE RELOAD ON OPEN, Nov 2026: a bookmarked PWA usually resumes
  // from its suspended state instead of doing a fresh load, so users
  // can run a stale version for days — and the service worker only
  // checks for an update when sw.js itself changes, which is rare.
  // The app therefore polls version.json (written fresh at every
  // build, never cached) and RELOADS immediately when the deployed
  // build differs from the one this instance started with. The check
  // runs on mount and whenever the app returns to the foreground
  // (visibilitychange + focus). Wai's call (2026-11-10): reload on
  // open, always, even if a form/sheet is open — no banner, no
  // "actively using" check, no periodic check. The trade-off is that
  // an unsaved form draft is lost if a new version deploys while the
  // user has a form open and backgrounds the app; deploys are
  // infrequent, so the window is narrow, and Wai accepted it for the
  // automatic update. (An earlier v160–v162 banner version was
  // replaced by this: the banner asked the user to tap Update on
  // open, which Wai found unnecessary — opening the app should just
  // update it.) seenVersionRef = the build this instance started
  // with (baseline, set on the first successful fetch). A reload only
  // happens when a LATER fetch returns a different buildId, so there
  // is no reload loop: after the reload the app loads the latest
  // version and the baseline matches it.
  const seenVersionRef = useRef<string | null>(null);
  const reloadingRef = useRef(false);
  useEffect(() => {
    let alive = true;
    const checkVersion = async () => {
      const v = await fetchVersion();
      if (!alive || !v) return; // offline or no version file — skip silently
      if (seenVersionRef.current === null) { seenVersionRef.current = v; return; } // establish the baseline, no reload yet
      if (v !== seenVersionRef.current && !reloadingRef.current) { reloadingRef.current = true; window.location.reload(); } // a newer deploy exists — reload to it now. The guard is because visibilitychange and focus can fire together on resume, so two concurrent checks could both see the newer version and both call reload; the first reload wins and the second is a no-op.
    };
    checkVersion();
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, []);
  const [groupLoading, setGroupLoading] = useState(false);
  const loadSeq = useRef(0);
  const restoredRef = useRef(false);
  const [tab, setTab] = useState<'expenses'|'balances'>('expenses');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // APPEARANCE (same model as nwk2/haven): theme + System/Light/Dark,
  // saved to the account and applied on every device. The applying effect
  // sits below, next to the URL checks it depends on.
  const setAppearance = (next: Appearance) => {
    setUser((u: any) => u ? { ...u, theme: next.theme, mode: next.mode } : u);
    api('/api/me', 'PATCH', next).catch(() => { /* offline: the local change still applies; it saves next time */ });
  };
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
    // Members/Log were tabs until Nov 2026 and may be the saved value
    // from an older build — they are sheets now and don't persist, so
    // restore those to Expenses.
    if (ok) setTab(saved.tab === 'balances' ? 'balances' : 'expenses');
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
  // AUTH NOTICE, Nov 2026: a one-line message shown on the Auth screen
  // after a forced logout (e.g. a password change logs you out
  // immediately). Set by the flow that logs you out; cleared on a
  // successful login so it never goes stale.
  const [authNotice, setAuthNotice] = useState('');
  async function checkAuth() {
    if (!getToken()) return;
    setAuthError('');
    try { const d = await api('/api/me'); setUser(d.user); setAnnouncements(Array.isArray(d.announcements) ? d.announcements : []); setUnreadReplies(Number(d.unreadReplies || 0)); setAuthState('authed'); await loadGroups(); await restoreSaved(); }
    catch (e: any) {
      if (e?.status === 401) { setToken(null); setUser(null); setAuthState('guest'); }
      else { setAuthError(e.message || 'Could not reach the server'); }
    }
  }
  useEffect(()=>{
    // A Google redirect back (?code=...&state=...) takes precedence
    // over the normal session check — the callback handles auth, so
    // checkAuth must not also run and race it.
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) { handleGoogleCallback(code, state); return; }
    checkAuth();
  }, []);
  async function doAuth(mode: 'login'|'register', name: string, email: string, password: string, turnstileToken?: string | null) {
    setError(''); setLoading(true);
    try { const d = await api(`/api/auth/${mode}`, 'POST', mode==='register' ? {name,email,password,turnstileToken} : {email,password}); setToken(d.token); setUser(d.user); setAuthState('authed'); setAuthNotice(''); await loadGroups(); await restoreSaved(); }
    catch(e:any){ setError(e.message); } finally { setLoading(false); }
  }
  // GOOGLE CALLBACK, Nov 2026: Google redirected back to the app root
  // with ?code=...&state=.... Verify the state (CSRF — the code is
  // useless without it, and a forged callback cannot guess the nonce),
  // clear the code from the URL at once (codes are single-use, a
  // refresh must not re-submit one), then exchange the code. If the
  // user is already signed in (a token exists) this is a LINK — they
  // tapped "Link Google account" in You view — so POST
  // /api/me/google/link. Otherwise it is a SIGN-IN — POST
  // /api/auth/google. The mount effect calls this instead of
  // checkAuth when a code is present, so the two never race.
  // LINK FIX, Nov 2026: the linking branch used to only setUser() —
  // it never set authState('authed'), loadGroups(), or restoreSaved(),
  // so a successful link left the app stuck on the 'checking'
  // skeleton even though the server had linked the account, and a
  // failed link left the same skeleton with the error invisible.
  // Linking now finishes exactly like a sign-in. On any linking
  // failure (state mismatch or a rejected code) the existing session
  // is restored via checkAuth() instead of dropping to Auth or
  // stranding the skeleton — checkAuth re-validates the token, and
  // only a real 401 clears it and goes to guest.
  // ERROR ORDERING, Nov 2026: the error must be set AFTER checkAuth()
  // returns, not before. checkAuth() -> loadGroups() / restoreSaved()
  // call setError('') on success, so an error set first is wiped
  // before Home ever renders it (that is what the v166 live check
  // caught: Home came back, but no error text was visible). checkAuth
  // now awaits loadGroups() too, so by the time it returns there is
  // no in-flight load left to wipe the error set after it.
  async function handleGoogleCallback(code: string, state: string) {
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    setUrlParams(new URLSearchParams(window.location.search));
    let storedState: string | null = null;
    try { storedState = localStorage.getItem(GOOGLE_STATE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(GOOGLE_STATE_KEY); } catch { /* ignore */ }
    const linking = !!getToken();
    if (!storedState || storedState !== state) {
      if (linking) { await checkAuth(); setError('Google sign-in failed — please try again.'); } else { setError('Google sign-in failed — please try again.'); setAuthState('guest'); }
      return;
    }
    setError(''); setLoading(true);
    try {
      if (linking) {
        const d = await api('/api/me/google/link', 'POST', { code });
        setUser(d.user); setAuthState('authed'); await loadGroups(); await restoreSaved();
      } else {
        const d = await api('/api/auth/google', 'POST', { code });
        setToken(d.token); setUser(d.user); setAuthState('authed'); setAuthNotice(''); await loadGroups(); await restoreSaved();
      }
    } catch (e: any) {
      const msg = e.message || 'Google sign-in failed, try again.';
      if (linking) { await checkAuth(); setError(msg); } else { setError(msg); setAuthState('guest'); }
    } finally { setLoading(false); }
  }
  // Refresh the announcement + unread replies: after signing in, when the
  // app comes back to the foreground, and after reading a thread.
  async function refreshMeta() {
    if (!getToken()) return;
    try { const d = await api('/api/me'); setAnnouncements(Array.isArray(d.announcements) ? d.announcements : []); setUnreadReplies(Number(d.unreadReplies || 0)); } catch { /* keep what we have */ }
  }
  const metaUser = useRef<string | null>(null);
  useEffect(()=>{
    if (authState !== 'authed' || !user?.id) { metaUser.current = null; return; }
    if (metaUser.current !== user.id) { const first = metaUser.current === null && (announcements.length > 0 || unreadReplies > 0); metaUser.current = user.id; if (!first) refreshMeta(); }
    // Coming back to the app re-checks announcements and replies, at most once a minute (Haven).
    let last = Date.now();
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last > 60_000) { last = Date.now(); refreshMeta(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authState, user?.id]);
  // Home-currency estimates follow the signed-in user's setting.
  useEffect(()=>{ setHomeCurrency(authState === 'authed' ? user?.home_currency : null); },[authState, user?.home_currency]);
  useEffect(()=>{
    const onVisible = () => { if (document.visibilityState === 'visible') refreshRates(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  },[]);
  function doLogout() { try { localStorage.removeItem(LAST_GROUP_KEY); } catch { /* ignore */ } forgetAppearance(); setAnnouncements([]); setUnreadReplies(0); setToken(null); setUser(null); setGroup(null); setGroups(null); setAuthState('guest'); }
  // INVITE LINK (?invite=<token>), Nov 2026: the token survives the
  // login/register flow because it stays in the URL — a guest sees the
  // normal Auth screen, and once authed the invite check below shows
  // the join screen. After joining (or cancelling), the param is
  // cleared from the URL *and* from state, so a refresh does not
  // re-show the invite.
  function clearInviteParam() {
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    setUrlParams(new URLSearchParams(window.location.search));
  }
  async function handleInviteJoined(groupId: string) {
    clearInviteParam();
    setJustJoinedId(groupId);
    // HOME REFRESH, Nov 2026 (same pattern as create-group): joining
    // used to leave the Home list stale — loadGroup(groupId) only sets
    // the single group detail, never the list, so when the user tapped
    // back Home showed the pre-join list ("No groups yet" for a fresh
    // account) until the back-navigation fetch completed or a reload.
    // Refresh the list HERE, in the background while the user is inside
    // the newly joined group — by the time they tap back, Home is
    // already correct. back() still refetches too (belt and braces).
    loadGroups();
    await loadGroup(groupId, { skeleton: true });
  }
  // Destination-aware checking skeleton: during auth checking we do not
  // yet know the user, but we DO know the saved destination synchronously
  // from localStorage. If a group was saved, show a GroupSkeleton from the
  // very first paint — NOT HomeSkeleton, whose real "Duesy" title
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
  const [urlParams, setUrlParams] = useState(() => new URLSearchParams(window.location.search));
  const resetToken = urlParams.get('reset');
  const isAdminPage = urlParams.has('admin');
  const inviteToken = urlParams.get('invite');
  // Signed-out screens (sign-in, password reset, the separate admin login)
  // always use the base theme; signed in, the account's choice. While the
  // session is still being checked, leave whatever index.html painted from
  // the cache. A light/dark choice saved on this device by an older build
  // is moved to the account once.
  const signedIn = authState === 'authed' && !!user && !resetToken && !isAdminPage;
  const appearance: Appearance = signedIn ? fromUser(user) : BASE;
  useEffect(()=>{
    if (authState === 'checking' && !resetToken && !isAdminPage) return;
    applyAppearance(appearance);
    if (signedIn) {
      cacheAppearance(user.id, appearance);
      const legacy = takeLegacyChoice();
      if (legacy && appearance.theme === BASE.theme && appearance.mode === BASE.mode) setAppearance(legacy);
    }
    // Status bar / address bar / app switcher colour follows the theme's
    // background, including when the device flips light/dark under System.
    const syncThemeColor = () => requestAnimationFrame(()=>{
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#15110D');
    });
    syncThemeColor();
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    mq?.addEventListener?.('change', syncThemeColor);
    return () => mq?.removeEventListener?.('change', syncThemeColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authState, signedIn, user?.id, appearance.theme, appearance.mode]);
  if (resetToken) return <Suspense fallback={<div style={S} />}><ResetPasswordView token={resetToken} /></Suspense>;
  if (isAdminPage) return <Suspense fallback={<div style={S} />}><AdminView /></Suspense>;
  if (authError) return (<div style={S}><h1>Duesy</h1><p style={{color:'var(--muted)'}}>Couldn't check your session — your login is kept, this may just be a network hiccup.</p><p style={{color:'var(--danger-text)'}}>{authError}</p><button style={{...primary, width:'100%'}} onClick={()=>checkAuth()}>Retry</button><p><button style={btn} onClick={()=>{ setToken(null); setUser(null); setAuthError(''); setAuthState('guest'); }}>Use a different account</button></p></div>);
  if (authState === 'checking') {
    if (readSavedGroup()) return <GroupSkeleton />;
    return <HomeSkeleton user={null} />;
  }
  if (authState === 'guest' || !user) return <Suspense fallback={<div style={S} />}><Auth onAuth={doAuth} error={error} loading={loading} notice={authNotice} inviteToken={inviteToken} onInvalidInvite={clearInviteParam} /></Suspense>;
  // New accounts choose a home currency once (existing ones were set to
  // SGD by migration 0014). undefined means an older Worker: don't ask.
  if (user.home_currency === null) return <HomeCurrencyPrompt onDone={async (code) => { const d = await api('/api/me', 'PATCH', { homeCurrency: code }); setUser(d.user); }} />;
  if (inviteToken) return <Suspense fallback={<div style={S} />}><InviteView token={inviteToken} onJoined={handleInviteJoined} onCancel={clearInviteParam} /></Suspense>;
  if (groupLoading) return <GroupSkeleton />;
  // Reload with a detail object when the write already returned one:
  // use it directly instead of refetching (the old reload() always
  // refetched, doubling every write's groupDetail cost, and reset the
  // tab to Expenses — so a Settle from Balances or an Add member from
  // Members landed back on Expenses, hiding the updated data). Refetch
  // (keepTab) is only the fallback for writes that return no detail
  // (archive/restore/leave from Settings, Home restore via loadGroups).
  if (group) return (<><GroupView group={group} setGroup={setGroup} tab={tab} setTab={setTab} justJoined={justJoinedId === group.id} back={()=>{setJustJoinedId(null); setGroup(null); loadGroups();}} reload={(detail?: any)=> detail && detail.id ? (setGroup(detail), setError(''), Promise.resolve(true)) : loadGroup(group.id, { keepTab: true })} error={error} setError={setError}  onFeedback={()=>openFeedback(group.id)} />{showFeedback && <FeedbackSheet initialGroupId={feedbackGroupId} groups={groups?.active || []} onClose={()=>setShowFeedback(false)} />}<RateSheet /></>);
  if (!groups) return <HomeSkeleton user={user} />;
  return (<><Home user={user} setUser={setUser} onLogout={doLogout} setAuthNotice={setAuthNotice} groups={groups} loadGroups={loadGroups} loadGroup={(id: string)=>loadGroup(id, { skeleton: true })} error={error} setError={setError}  appearance={appearance} setAppearance={setAppearance} announcements={announcements} unreadReplies={unreadReplies} refreshMeta={refreshMeta} openMessages={urlParams.get('messages')==='1'} onMessagesOpened={()=>{ const q = new URLSearchParams(window.location.search); if (q.has('messages')) { q.delete('messages'); const s = q.toString(); window.history.replaceState(null, '', window.location.pathname + (s ? `?${s}` : '')); setUrlParams(q); } }} onFeedback={openFeedback} />{showFeedback && <FeedbackSheet initialGroupId={feedbackGroupId} groups={groups?.active || []} onClose={()=>setShowFeedback(false)} />}<RateSheet /></>);
}
