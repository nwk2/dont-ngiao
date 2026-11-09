import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, getToken, CURRENCIES, CATEGORIES, fmt, toMinor, fromMinor, VAPID_PUBLIC_KEY, isStandalone, installPlatform, pushSupported, getPushSubscription, subscribePush } from './api';
import { DateField, fmtDate, todayIso } from './calendar';
import { Pie, DailyBar } from './pie';

const S = { maxWidth: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const; // DESKTOP CAP, Nov 2026: maxW was a typo (not a real CSS property), so the 640px cap never applied and the main content stretched full-width on desktop. maxWidth makes every view using S a centred 640px column on wide screens, matching the sheets (which already cap at 640) — on a phone (<640px) it is full-width as before.
const card: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--hairline)', borderRadius:16, padding:14, marginBottom:12, color:'var(--text)', lineHeight:1.45 };
const rowCard: React.CSSProperties = { ...card, padding:'12px 14px', lineHeight:1.4 };
// BALANCES REVAMP 2026-11-05 (dark only, restyle only): rows inside one
// borderless card (radius 20, no var(--hairline) border) with hairline dividers,
// matching the approved prototype Balances look. Shared card/rowCard are
// untouched, so Expenses/Members/Activity keep their current cards.
// Logic below is unchanged: net-only Your position, per-member Paid/share,
// creditor-only Settle (with placeholder-debtor exception), debtor-or-
// creditor-only payment deletion.
const balCard: React.CSSProperties = { background:'var(--card)', borderRadius:20, padding:'6px 0', marginBottom:12, color:'var(--text)', lineHeight:1.45 };
const balRow: React.CSSProperties = { display:'flex', alignItems:'center', gap:12, padding:'12px 14px' };
const balHairline = '1px solid var(--hairline)';
// HOME + TABS REVAMP 2026-11-05 (dark only, restyle only): borderless
// radius-20 cards (same language as balCard) for Home group cards, and a
// segmented pill track for group tabs, matching the approved prototype.
// Shared card/rowCard untouched, so Expenses/Members/Activity rows keep
// their current cards until their own chunks. Logic unchanged everywhere:
// Home group list, archived Restore/Open, account menu, Edit name,
// group header, changeTab behaviour, tab keys.
const EXP_CAT_COLORS: Record<string,string> = { 'Food & Drink':'var(--cat-food)', 'Transport':'var(--cat-transport)', 'Accommodation':'var(--cat-accommodation)', 'Activities':'var(--cat-activities)', 'Shopping':'var(--cat-shopping)', 'Other':'var(--cat-other)' };
// Category glyph colours: white in dark, a darker shade of the
// category colour in light (white on the light pastels is unreadable).
const CAT_GLYPH_VARS: Record<string,string> = { 'Food & Drink':'var(--cat-food-glyph)', 'Transport':'var(--cat-transport-glyph)', 'Accommodation':'var(--cat-accommodation-glyph)', 'Activities':'var(--cat-activities-glyph)', 'Shopping':'var(--cat-shopping-glyph)', 'Other':'var(--cat-other-glyph)' };
function catIcon(cat: string) {
  // Feather-style line SVGs, glyph stroke from CAT_GLYPH_VARS on a coloured chip, matching the
  // approved prototype Expenses icon chips. Colours mirror pie.tsx
  // (theme variables: gruvbox dark, pastels light).
  const common = { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:CAT_GLYPH_VARS[cat] || 'var(--cat-other-glyph)', strokeWidth:2, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
  const paths: Record<string, React.ReactNode> = {
    'Food & Drink': (<><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></>),
    'Transport': (<><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" /><rect x="3" y="11" width="18" height="7" rx="2" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></>),
    'Accommodation': (<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>),
    'Activities': (<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>),
    'Shopping': (<><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>),
    'Other': (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  };
  return (<svg {...common}>{paths[cat] || paths['Other']}</svg>);
}
// LOG EVENT ICON, 2026-11-06 (revised 2026-11-06 ~11:34 at Wai's request):
// the 36px icon chip + avatar made each row too heavy ("kinda large and
// jarring"), so the chip and the avatar are both gone. The event is now a
// BARE 18px feather line icon in the event colour — live events
// (added/recorded) in the tint colour, deleted events in the danger
// colour — in a slim 28px fixed column so the text aligns. No avatar:
// the actor's name is in the subline and the payment from -> to is in
// the detail text, so the row is icon + text + amount, like Expenses.
function logIcon(type: string) {
  const deleted = type === 'expense_deleted' || type === 'payment_deleted';
  const common = { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:deleted ? 'var(--danger-text)' : 'var(--tint-text)', strokeWidth:2, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
  const paths: Record<string, React.ReactNode> = {
    expense_added: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>),
    expense_deleted: (<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
    payment_recorded: (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
    payment_deleted: (<><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>),
    expense_edited: (<><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></>),
  };
  return (<span style={{width:28,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg {...common}>{paths[type] || paths['expense_added']}</svg></span>);
}
const homeCard: React.CSSProperties = { background:'var(--card)', borderRadius:20, padding:16, marginBottom:12, color:'var(--text)', lineHeight:1.45 };
const tabTrack: React.CSSProperties = { display:'flex', gap:0, background:'var(--field)', borderRadius:999, padding:3, marginBottom:16 };
const tabPill: React.CSSProperties = { flex:1, padding:'10px 4px', fontSize:14, color:'var(--muted)', background:'transparent', border:'none', borderRadius:999, fontWeight:400, cursor:'pointer' };
const tabPillActive: React.CSSProperties = { ...tabPill, color:'#0f172a', background:'#fff', fontWeight:600 };
const avatar: React.CSSProperties = { width:40, height:40, borderRadius:'50%', background:'var(--avatar-green)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 };
const noAccountChip: React.CSSProperties = { fontSize:11, background:'var(--warn-bg)', color:'var(--warn-text)', padding:'2px 8px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
// PAYER PILL, Nov 2026: marks the payer in the expense detail split rows
// (the "Paid by" subline was dropped — the pill is now the payer
// indicator). Bordered teal so it reads on both the card background and
// the tinted "You" row; labelled "Payer" (not "Paid") so it is not
// confused with settling.
const payerChip: React.CSSProperties = { fontSize:11, background:'transparent', border:'1px solid var(--tint-text)', color:'var(--tint-text)', padding:'1px 7px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
const currencyChip: React.CSSProperties = { fontSize:12, background:'var(--tint-bg)', padding:'3px 10px', borderRadius:99, color:'var(--tint-text)', fontWeight:600, whiteSpace:'nowrap' };
const btn: React.CSSProperties = { padding:'9px 14px', borderRadius:999, border:'1px solid var(--border)', background:'var(--field)', color:'var(--text)' };
const primary: React.CSSProperties = { ...btn, background:'var(--accent)', color:'var(--accent-text)', borderColor:'var(--accent)', fontWeight:600 };
// Chunk 9: one shared compact style for the Spend by category controls, so
// Group, Mine, and the currency select look like a set. Compact (down from
// the inherited ~16px button size), explicit height so the native select
// matches the buttons. Other buttons in the app keep btn/primary untouched.
const catControl: React.CSSProperties = { padding:'8px 14px', fontSize:14, lineHeight:1.4, height:36, boxSizing:'border-box', borderRadius:10, border:'1px solid var(--border)', background:'var(--field)', color:'var(--text)' };
const catControlActive: React.CSSProperties = { ...catControl, background:'var(--accent)', color:'var(--accent-text)', borderColor:'var(--accent)', fontWeight:600 };
const input: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid var(--border)', borderRadius:10, margin:'4px 0 10px', background:'var(--field)', color:'var(--text)', fontSize:16 };
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
// Every sheet dismisses the same way (2026-11-06): backdrop tap and
// swipe-down via useSheetDrag, plus its own X/Cancel. Backdrop/swipe
// here just means Cancel — dismissing a confirm never confirms it.
// The confirm button is red and uses AsyncButton with a loader, like
// other async buttons. Callers pass an action that throws on failure;
// the GroupView wrapper routes that error: to the caller's onError
// callback when one is supplied (row/card-local error, Chunk 4), else
// SHEET DRAG-TO-DISMISS, 2026-11-06 (revised same night): detail sheets
// (expense, member) dismiss on swipe-down, matching iOS sheet behaviour.
// Pointer events on the handle zone (grabber + title row) only, so the
// scrollable content still scrolls. Drag past 100px, or a fast flick,
// closes; otherwise the sheet springs back. Move/up are tracked on the
// window, not the handle element — the drag leaves the handle as soon as
// it starts, so element-level handlers would miss it if pointer capture
// failed (synthetic pointer ids can throw on capture). The handlers gate
// on a ref, not on `dragging` state, so a drag still works even if React
// hasn't re-rendered between down and move. Form sheets (Add expense,
// Settle, New group, Add member) intentionally have no drag dismissal —
// a swipe there could discard half-entered input — and no grabber, so
// nothing promises it. Backdrop tap follows the same rule: detail
// sheets only, via a target check on the backdrop (a tap inside the
// sheet bubbles but is not the backdrop itself).
function useSheetDrag(onClose: () => void) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const startT = useRef(0);
  const onPointerMove = (e: PointerEvent) => {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startY.current === null) return;
    const dy = Math.max(0, e.clientY - startY.current);
    const dt = Date.now() - startT.current;
    const flick = dt > 0 && dy / dt > 0.6;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    setDragging(false); startY.current = null;
    if (dy > 100 || flick) onClose(); else setDragY(0);
  };
  const onPointerCancel = () => {
    if (startY.current === null) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    setDragging(false); startY.current = null; setDragY(0);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    startY.current = e.clientY; startT.current = Date.now();
    setDragging(true); setDragY(0);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* capture is best-effort; the window listeners track the drag either way */ }
  };
  return { dragY, dragging, onPointerDown };
}

// KEYBOARD, Nov 2026 (CSS approach, replaces the JS viewport system):
// The sheet size/position used to be driven by JS state (a hook tracking
// the visual viewport's keyboard height + height, a scrollTop reset on
// keyboard change). That system was unreliable on iOS: the viewport
// resize/scroll events fire with INTERMEDIATE heights during the keyboard
// animation and don't reliably fire when it closes, so the tracked height
// got stuck at a mid-animation value (~430px) and the sheet stayed short
// — Split / Date / Save cut off, page showing through below it —
// flip-flopping between full and short across keyboard cycles (Wai's
// 8:06 video, v131). The fix: let the browser do it. The viewport meta
// now carries interactive-widget=resizes-content, so iOS shrinks the
// LAYOUT viewport when the keyboard opens. The sheet container is plain
// position:fixed inset:0 (bottom:0) and the sheet caps at 88vh — both now
// track the shrunken viewport automatically, with no JS state to get
// stuck. When the keyboard closes the viewport expands and the sheet
// returns to full height by itself. The 16px input font-size (v123, no
// iOS zoom) stays.

// to the global setError — and closes the sheet either way.
function ConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel }: any) {
  const drag = useSheetDrag(onCancel);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onCancel(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <h2 style={{marginTop:0,touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}>{title}</h2>
      <p style={{color:'var(--muted)',lineHeight:1.45}}>{message}</p>
      <div style={{display:'flex',gap:8}}>
        <AsyncButton style={{...btn,background:'var(--danger-bg)',color:'var(--danger-text)',borderColor:'var(--danger-bg)',fontWeight:600}} onClick={onConfirm}>{confirmLabel || 'Delete'}</AsyncButton>
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
const THEME_KEY = 'dont-ngiao-theme';
const VALID_TABS = ['expenses','balances','members','log'] as const;
function readSavedGroup(): { groupId: string; tab: typeof VALID_TABS[number] } | null {
  try {
    const raw = localStorage.getItem(LAST_GROUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.groupId !== 'string' || !p.groupId) return null;
    const tab = p.tab === 'activity' ? 'log' : p.tab;
    return { groupId: p.groupId, tab: VALID_TABS.includes(tab) ? tab : 'expenses' };
  } catch { return null; }
}
// Theme pill (shared, 2026-11-06 L3): the sun/moon segmented toggle,
// used in the Home header, the You screen Appearance row, and the group
// header. Tapping it flips dark <-> light and persists the choice
// (THEME_KEY). The highlighted side follows the active theme. A third
// scheme later becomes a third segment here (and one more theme key).
function ThemePill({ theme, setTheme }: any) {
  const seg = (active: boolean) => ({flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,background:active?'var(--pill-active)':'transparent',color:active?'var(--text)':'var(--muted)'} as React.CSSProperties);
  return (<button type="button" aria-label="Colour scheme" title="Switch colour scheme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} style={{width:88,height:40,borderRadius:999,border:'1px solid var(--border)',background:'var(--field)',padding:3,boxSizing:'border-box',display:'flex',alignItems:'stretch',cursor:'pointer',flexShrink:0}}>
    <span aria-hidden="true" style={seg(theme==='light')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>
    <span aria-hidden="true" style={seg(theme==='dark')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg></span>
  </button>);
}
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authState, setAuthState] = useState<'checking'|'guest'|'authed'>(()=> getToken() ? 'checking' : 'guest');
  const [groups, setGroups] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  // ONBOARDING, Nov 2026: set when the user joins via an invite link, so
  // GroupView shows the Add-to-Home-Screen / Enable-notifications prompt
  // right after joining. Cleared when they leave the group (back) or open
  // a different group, so it does not reappear on a later visit.
  const [justJoinedId, setJustJoinedId] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const loadSeq = useRef(0);
  const restoredRef = useRef(false);
  const [tab, setTab] = useState<'expenses'|'balances'|'members'|'log'>('expenses');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // THEME, 2026-11-06 (light mode L1): the theme is a named key
  // ('dark' | 'light'), not a boolean — a third scheme later is one more
  // key, one more :root[data-theme="..."] block in index.html, and one
  // more option in the You screen picker. Colours live as CSS variables
  // in index.html (:root = dark values, [data-theme="light"] overrides);
  // inline styles reference var(--x), so no component needs the theme
  // in JS — the palette functions (memberDotColor, EXP_CAT_COLORS,
  // catIcon glyphs) return var(--dot-N) / var(--cat-x) references instead
  // of hex. First load follows the system (prefers-color-scheme); a
  // manual choice is persisted under THEME_KEY and wins after that.
  // L3: the pill (ThemePill, shared by Home/You/Group) is wired, and
  // first load follows the system; a manual choice persists under
  // THEME_KEY and wins after that.
  const [theme, setTheme] = useState<'dark'|'light'>(()=>{
    try { const saved = localStorage.getItem(THEME_KEY); if (saved==='light'||saved==='dark') return saved; } catch { /* ignore */ }
    return (typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  });
  useEffect(()=>{ document.documentElement.dataset.theme = theme; try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ } },[theme]);
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
  // AUTH NOTICE, Nov 2026: a one-line message shown on the Auth screen
  // after a forced logout (e.g. a password change logs you out
  // immediately). Set by the flow that logs you out; cleared on a
  // successful login so it never goes stale.
  const [authNotice, setAuthNotice] = useState('');
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
  async function doAuth(mode: 'login'|'register', name: string, email: string, password: string, turnstileToken?: string | null) {
    setError(''); setLoading(true);
    try { const d = await api(`/api/auth/${mode}`, 'POST', mode==='register' ? {name,email,password,turnstileToken} : {email,password}); setToken(d.token); setUser(d.user); setAuthState('authed'); setAuthNotice(''); await loadGroups(); await restoreSaved(); }
    catch(e:any){ setError(e.message); } finally { setLoading(false); }
  }
  function doLogout() { try { localStorage.removeItem(LAST_GROUP_KEY); } catch { /* ignore */ } setToken(null); setUser(null); setGroup(null); setGroups(null); setAuthState('guest'); }
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
  const [urlParams, setUrlParams] = useState(() => new URLSearchParams(window.location.search));
  const resetToken = urlParams.get('reset');
  const isAdminPage = urlParams.has('admin');
  const inviteToken = urlParams.get('invite');
  if (resetToken) return <ResetPasswordView token={resetToken} />;
  if (isAdminPage) return <AdminView />;
  if (authError) return (<div style={S}><h1>Don't Ngiao</h1><p style={{color:'var(--muted)'}}>Couldn't check your session — your login is kept, this may just be a network hiccup.</p><p style={{color:'var(--danger-text)'}}>{authError}</p><button style={{...primary, width:'100%'}} onClick={()=>checkAuth()}>Retry</button><p><button style={btn} onClick={()=>{ setToken(null); setUser(null); setAuthError(''); setAuthState('guest'); }}>Use a different account</button></p></div>);
  if (authState === 'checking') {
    if (readSavedGroup()) return <GroupSkeleton />;
    return <HomeSkeleton user={null} />;
  }
  if (authState === 'guest' || !user) return <Auth onAuth={doAuth} error={error} loading={loading} notice={authNotice} inviteToken={inviteToken} onInvalidInvite={clearInviteParam} />;
  if (inviteToken) return <InviteView token={inviteToken} onJoined={handleInviteJoined} onCancel={clearInviteParam} />;
  if (groupLoading) return <GroupSkeleton />;
  // Reload with a detail object when the write already returned one:
  // use it directly instead of refetching (the old reload() always
  // refetched, doubling every write's groupDetail cost, and reset the
  // tab to Expenses — so a Settle from Balances or an Add member from
  // Members landed back on Expenses, hiding the updated data). Refetch
  // (keepTab) is only the fallback for writes that return no detail
  // (archive/restore/leave from Settings, Home restore via loadGroups).
  if (group) return <GroupView group={group} setGroup={setGroup} tab={tab} setTab={setTab} justJoined={justJoinedId === group.id} back={()=>{setJustJoinedId(null); setGroup(null); loadGroups();}} reload={(detail?: any)=> detail && detail.id ? (setGroup(detail), setError(''), Promise.resolve(true)) : loadGroup(group.id, { keepTab: true })} error={error} setError={setError}  theme={theme} setTheme={setTheme} />;
  if (!groups) return <HomeSkeleton user={user} />;
  return <Home user={user} setUser={setUser} onLogout={doLogout} setAuthNotice={setAuthNotice} groups={groups} loadGroups={loadGroups} loadGroup={(id: string)=>loadGroup(id, { skeleton: true })} error={error} setError={setError}  theme={theme} setTheme={setTheme} />;
}

// Skeleton screens: grey blocks in the exact shape of the content that is
// loading, with a pulse animation (see .skeleton-pulse in index.html).
// No spinner, no "Loading..." text — the layout itself is the feedback,
// and because the blocks match the real layout, there is no layout shift
// when real data replaces them. Used only for first loads (auth check,
// groups list, first group tap); never for tab switches (data already
// loaded) or post-action reloads (stale content + button loader instead).
function Sk({ w, h, r }: { w: string | number; h: number; r?: number }) {
  return <div className="skeleton-pulse" style={{width:w,height:h,borderRadius:r ?? 8,background:'var(--subtle-bg)',flexShrink:0}} />;
}
function HomeSkeleton({ user }: { user: any }) {
  return (<div style={S} aria-label="Loading">
    {user ? (<><div style={{fontSize:20,fontWeight:700}}>Hi, {user.name}</div><div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>{user.email}</div></>) : (<><Sk w={180} h={24} /><div style={{marginTop:6}}><Sk w={220} h={16} /></div></>)}
    <div style={{background:'var(--card)',borderRadius:24,padding:20,marginBottom:20}}><Sk w={140} h={12} /><div style={{marginTop:16}}><Sk w="60%" h={32} /></div><div style={{marginTop:10}}><Sk w="45%" h={32} /></div></div>
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
    <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',margin:'16px 0 12px'}}>{[0,1,2,3].map(i => (<div key={i} style={{flex:1,padding:'10px 4px',display:'flex',justifyContent:'center'}}><Sk w={56} h={14} /></div>))}</div>
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
const MEMBER_DOT_COLORS = ['var(--dot-0)','var(--dot-1)','var(--dot-2)','var(--dot-3)','var(--dot-4)','var(--dot-5)','var(--dot-6)','var(--dot-7)'];
function memberDotColor(group: any, memberId: string | null | undefined) {
  if (!memberId) return 'var(--muted)';
  const idx = (group.members || []).findIndex((x:any)=>x.id===memberId);
  if (idx < 0) return 'var(--muted)';
  return MEMBER_DOT_COLORS[idx % MEMBER_DOT_COLORS.length];
}
function personDisplay(group: any, memberId: string | null | undefined, fallbackName: string | null | undefined) {
  const member = memberId ? group.members.find((x:any)=>x.id===memberId) : null;
  const name = member?.name || fallbackName || 'Unknown member';
  const label = (group.myMemberId && memberId && memberId===group.myMemberId) ? 'You' : name;
  return { name, label, memberId: memberId || null };
}

// Verb de-duplication (2026-11-05): a per-currency balance list repeats
// "You are owed"/"You owe" once per currency. Group by verb (owed, owe,
// settled) and render the verb only on the first row of its group; the
// other rows keep the amount, with an empty verb cell to preserve the
// space-between layout. Amounts and order are unchanged; hero-vs-group
// repetition is deliberate (net across groups vs net within a group)
// and is NOT touched by this.
function groupBalancesByVerb(items: any[]) {
  const verb = (b: number) => b > 0 ? 'You are owed' : b < 0 ? 'You owe' : 'Settled';
  const groups: { verb: string; items: any[] }[] = [];
  for (const v of ['You are owed', 'You owe', 'Settled']) {
    const its = items.filter((t: any) => verb(t.balance) === v);
    if (its.length) groups.push({ verb: v, items: its });
  }
  return groups;
}
// ONBOARDING PROMPTS (Add to Home Screen + Enable notifications), Nov 2026.
// Two-stage setup for new family members, shown on Home and right after
// joining a group:
// Stage 1 (NOT standalone): "Add to Home Screen" — the prerequisite on
// iPhone, where push only works from the Home Screen app. Platform-
// specific steps. Dismissible per session.
// Stage 2 (standalone, push supported, not subscribed, permission not
// denied): "Enable notifications" — one tap on Enable, then Allow on the
// system prompt. Dismissible per session (reappears on next visit); the
// You > Notifications toggle is the permanent fallback.
// Dismissal is stored in sessionStorage (one key per stage), so it hides
// for the rest of this browser session and comes back on the next visit.
// When permission is 'denied' the Stage 2 banner hides — the app cannot
// fix a browser-level denial, and the You toggle explains it instead.
// (YouView keeps its own inline toggle logic, already verified — this
// component uses the shared subscribePush/getPushSubscription helpers in
// api.ts rather than refactoring it.)
const A2HS_DISMISS_KEY = 'dont-ngiao-a2hs-dismissed';
const PUSH_PROMPT_DISMISS_KEY = 'dont-ngiao-push-prompt-dismissed';
function OnboardingPrompts() {
  const [dismissedA2hs, setDismissedA2hs] = useState(() => { try { return sessionStorage.getItem(A2HS_DISMISS_KEY) === '1'; } catch { return false; } });
  const [dismissedPush, setDismissedPush] = useState(() => { try { return sessionStorage.getItem(PUSH_PROMPT_DISMISS_KEY) === '1'; } catch { return false; } });
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const standalone = isStandalone();
  const supported = pushSupported();
  useEffect(() => {
    if (!standalone || !supported) { setPushEnabled(false); return; }
    let cancelled = false;
    getPushSubscription().then((sub) => { if (!cancelled) setPushEnabled(!!sub); }).catch(() => { if (!cancelled) setPushEnabled(false); });
    return () => { cancelled = true; };
  }, [standalone, supported]);
  function dismissA2hs() { try { sessionStorage.setItem(A2HS_DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissedA2hs(true); }
  function dismissPush() { try { sessionStorage.setItem(PUSH_PROMPT_DISMISS_KEY, '1'); } catch { /* ignore */ } setDismissedPush(true); }
  async function enablePush() {
    if (pushBusy) return;
    setPushError(''); setPushBusy(true);
    try { await subscribePush(); setPushEnabled(true); }
    catch (e: any) { setPushError(e?.message || 'Could not enable notifications.'); }
    finally { setPushBusy(false); }
  }
  // Stage 1: not standalone — Add to Home Screen comes first. On iPhone
  // push cannot work from Safari, so there is no notification prompt here.
  if (!standalone && !dismissedA2hs) {
    const platform = installPlatform();
    const steps = platform === 'ios'
      ? 'Tap the Share button (square with an arrow) at the bottom of Safari, then "Add to Home Screen", then Add.'
      : platform === 'android'
      ? 'Tap the three dots in Chrome, then "Add to Home screen", then Add.'
      : 'Use your browser\'s menu to add this site to your Home Screen.';
    return (<div style={{...homeCard, background:'var(--tint-bg)', marginBottom:12}}>
      <strong>Add Don&apos;t Ngiao to your Home Screen</strong>
      <p style={{fontSize:13, color:'var(--muted)', margin:'6px 0 12px'}}>{steps} Then open it from the new icon (the teal ÷) — notifications only work when it&apos;s launched from the Home Screen.</p>
      <div style={{display:'flex', gap:8}}><button style={{...btn, flex:1}} onClick={dismissA2hs}>Not now</button></div>
    </div>);
  }
  // Stage 2: standalone, push supported, not yet subscribed, permission
  // not denied — the one-tap Enable prompt. Hidden when already on,
  // when push is unsupported, when permission is denied (the You toggle
  // explains the browser-level block), or when dismissed this session.
  if (!standalone || !supported || pushEnabled !== false || dismissedPush) return null;
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return null;
  return (<div style={{...homeCard, background:'var(--tint-bg)', marginBottom:12}}>
    <strong>Get notified when someone adds an expense</strong>
    <p style={{fontSize:13, color:'var(--muted)', margin:'6px 0 12px'}}>New expense, edited / deleted, and settle — only for groups you&apos;re in. One tap here, then Allow.</p>
    {pushError && <p style={{color:'var(--danger-text)', fontSize:13}}>{pushError}</p>}
    <div style={{display:'flex', gap:8}}>
      <AsyncButton style={{...primary, flex:1, padding:'12px', fontSize:16}} disabled={pushBusy} onClick={enablePush}>{pushBusy ? 'Enabling…' : 'Enable notifications'}</AsyncButton>
      <button style={btn} onClick={dismissPush}>Not now</button>
    </div>
  </div>);
}

function Home({ user, setUser, onLogout, setAuthNotice, groups, loadGroups, loadGroup, error, setError, theme, setTheme }: any) {
  const [showCreate, setShowCreate] = useState(false);
  const [showYou, setShowYou] = useState(false);
  // BUG FIX, 2026-11-05: YouView used to render inline at the BOTTOM of
  // Home ({showYou && <YouView/>} after all Home content), so tapping
  // the avatar appended a second page below Home in the same scroll —
  // Home, then You, then scrolling back to Home. It now replaces Home
  // via an early return, like App replaces Home with GroupView and like
  // YouView replaces itself with the archived view.
  if (showYou) return <YouView user={user} setUser={setUser} onLogout={onLogout} setAuthNotice={setAuthNotice} groups={groups} loadGroups={loadGroups} loadGroup={loadGroup} onBack={()=>setShowYou(false)} setError={setError}  theme={theme} setTheme={setTheme} />;
    const totals: any[] = groups?.totals || [];
  return (<div style={S}>
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <button aria-label="You" style={{width:48,height:48,borderRadius:'50%',background:'var(--avatar-green)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18,flexShrink:0,border:'none',padding:0,cursor:'pointer'}} onClick={()=>setShowYou(true)}>{initials(user.name)}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:20,fontWeight:700}}>{user.name}</div>
          <div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>Mai ngiao, mai drama.</div>
        </div>
        <ThemePill theme={theme} setTheme={setTheme} />
      </div>
    </div>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'var(--danger-text)'}}>{error}</span><button style={btn} onClick={()=>loadGroups()}>Retry</button></div>}
    <OnboardingPrompts />
    <div style={{background:'linear-gradient(135deg,#0f766e,#059669,#10b981)',borderRadius:24,padding:20,marginBottom:20,color:'#fff'}}>
      <div style={{fontSize:12,letterSpacing:1.5,color:'#ccfbf1',fontWeight:600}}>ALL ACROSS {(groups?.active?.length ?? 0)} {((groups?.active?.length ?? 0) === 1) ? 'GROUP' : 'GROUPS'}</div>
      {totals.length === 0 || totals.every((t:any)=>t.balance===0) ? (<p style={{margin:'12px 0 0'}}>All settled.</p>) : groupBalancesByVerb(totals).map((g:any,gi:number)=>g.items.map((t:any,i:number)=>(<div key={t.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,marginTop:10,...(i===0 && gi>0 ? {borderTop:'1px solid rgba(255,255,255,0.25)',paddingTop:10} : {})}}>
        <span style={{color:'#ccfbf1'}}>{i===0 ? g.verb : ''}</span>
        <strong style={{fontSize:28,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(t.balance),t.currency)}</strong>
      </div>)))}
      <p style={{fontSize:13,color:'#ccfbf1',marginBottom:0}}>Kept separate per currency — no conversion. Tap a group below to see who to pay.</p>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <h2 style={{margin:0}}>Your groups</h2>
      <button style={{...primary,borderRadius:999,padding:'10px 18px'}} onClick={()=>setShowCreate(true)}>+ New group</button>
    </div>
    {groups?.active?.length === 0 && <p style={{color:'var(--muted)'}}>No groups yet — tap + New group to create one.</p>}
    {groups?.active?.map((g:any)=>{
      const spent: any[] = g.spent || [];
      const my: any[] = g.myBalances || [];
      return (<div key={g.id} style={{...homeCard,cursor:'pointer'}} onClick={()=>loadGroup(g.id)}>
        <strong style={{fontSize:17}}>{g.name}</strong>
        <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>{g.memberCount ?? '?'} {(g.memberCount===1)?'person':'people'} · {g.expenseCount ?? '?'} expenses{spent.length>0 ? ` · ${spent.map((s:any)=>fmt(s.amount,s.currency)).join(' + ')} spent` : ''}</div>
        {my.length>0 && <div style={{marginTop:8}}>{groupBalancesByVerb(my).map((g:any,gi:number)=>g.items.map((b:any,i:number)=>(<div key={b.currency} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,fontSize:14,color:b.balance>0?'var(--tint-text)':b.balance<0?'var(--danger-text)':'var(--muted)',...(i===0 && gi>0 ? {borderTop:balHairline,paddingTop:8,marginTop:8} : {})}}><span>{i===0 ? g.verb : ''}</span><span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(Math.abs(b.balance),b.currency)}</span></div>)))}</div>}
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


function YouView({ user, setUser, onLogout, setAuthNotice, groups, loadGroups, loadGroup, onBack, setError, theme, setTheme }: any) {
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
      <div style={{width:72,height:72,borderRadius:'50%',background:'var(--avatar-green)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:28}}>{initials(user.name)}</div>
      <div style={{fontSize:24,fontWeight:700,marginTop:12}}>{user.name}</div>
      <div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{user.email}</div>
      {since && <div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>User since {since} · {totalGroups} {totalGroups===1?'group':'groups'}</div>}
    </div>
    <h3 style={{marginBottom:8}}>Appearance</h3>
    <div style={{...homeCard,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><span>Theme</span><ThemePill theme={theme} setTheme={setTheme} /></div>
    <h3 style={{marginBottom:8}}>Account</h3>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:8}}>
      <button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>{setNameDraft(user.name); setEditError(''); setEditingName(true);}}><span>Edit name <span style={{color:'var(--muted)'}}>· Shown to your groups</span></span><span style={{color:'var(--muted)'}}>›</span></button>
      <button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>{setCpCurrent(''); setCpNew(''); setCpConfirm(''); setCpError(''); setShowChangePassword(true);}}><span>Change password</span><span style={{color:'var(--muted)'}}>›</span></button>
      {/* ADMIN BUTTON, Nov 2026: the admin screen was only reachable by
      typing ?admin. An Admin row now sits in the Account card, visible
      only when the current user is an admin (user.is_admin comes from
      /api/me — no BE change). It just navigates to ?admin; the admin
      session restore (or the admin login form) handles access from
      there, and the admin sign-in stays separate — this button does NOT
      promote the app session to admin. Non-admins never see it. */}
      {user.is_admin ? (<button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>{ window.location.href = '/?admin'; }}><span>Admin</span><span style={{color:'var(--muted)'}}>›</span></button>) : null}
    </div>
    <h3 style={{marginBottom:8}}>Notifications</h3>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <span>Push notifications <span style={{color:'var(--muted)'}}>· New expense, edited / deleted, settle — only for groups you're in</span></span>
        <button type="button" role="switch" aria-checked={!!pushEnabled} aria-label="Push notifications" disabled={!pushSupported || pushBusy || pushEnabled === null} onClick={togglePush} style={{flexShrink:0,width:52,height:32,borderRadius:999,border:'1px solid var(--border)',background:pushEnabled ? 'var(--accent)' : 'var(--field)',cursor:(!pushSupported || pushBusy || pushEnabled === null) ? 'default' : 'pointer',opacity:(!pushSupported || pushBusy || pushEnabled === null) ? 0.5 : 1,padding:0,position:'relative'}}>
          <span style={{position:'absolute',top:3,left:pushEnabled ? 25 : 3,width:24,height:24,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}} />
        </button>
      </div>
      {pushError && <div style={{color:'var(--danger-text)',fontSize:13}}>{pushError}</div>}
      {!pushSupported && <div style={{color:'var(--muted)',fontSize:13}}>Push notifications are not supported in this browser. On iPhone, add the app to your Home Screen first (iOS 16.4+).</div>}
    </div>
    <h3 style={{marginBottom:8}}>Groups</h3>
    <div style={{...homeCard,display:'flex',flexDirection:'column',gap:8}}>
      <button style={{...btn,width:'100%',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>setShowArchived(true)}><span>Archive Groups</span><span style={{color:'var(--muted)'}}>{archived.length===0 ? 'No archived groups' : `${archived.length} archived · ${archived[0].name}`} ›</span></button>
    </div>
    <div style={{marginTop:20}}><AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={async()=>{await api('/api/auth/logout','POST'); onLogout();}}>Log out</AsyncButton></div>
    {editingName && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Edit name</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setEditingName(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <p style={{fontSize:13,color:'var(--muted)'}}>This is the name shown to your groups.</p>
        <input style={input} value={nameDraft} onChange={e=>setNameDraft(e.target.value)} aria-label="Name" />
        {editError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{editError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{if (!nameDraft.trim()) { setEditError('Name cannot be empty'); return; } try{const d = await api('/api/me','PATCH',{name:nameDraft}); setUser(d.user); setEditingName(false);}catch(e:any){setEditError(e.message);}}}>Save</AsyncButton>
      </div>
    </div>)}
    {showChangePassword && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0}}>Change password</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setShowChangePassword(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        {/* LOGOUT-ON-SUCCESS, Nov 2026: the sheet used to show a success
        state with a 'Log in again' button, but the X still closed the
        sheet without logging out — the session was already dead
        server-side, so the app sat in a stale signed-in state until
        the next API call 401'd (a refresh kicked you out). Now a
        successful change logs out immediately (onLogout) and sets an
        auth notice, so Auth explains why you are logged out. There is
        no success state in the sheet and no way to stay in the app. */}
        <p style={{fontSize:13,color:'var(--muted)'}}>You will be logged out everywhere after changing your password.</p>
        <label>Current password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpCurrent} onChange={e=>setCpCurrent(e.target.value)} aria-label="Current password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div>
        <label>New password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpNew} onChange={e=>setCpNew(e.target.value)} aria-label="New password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div>
        <label>Confirm new password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={cpShow ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={cpConfirm} onChange={e=>setCpConfirm(e.target.value)} aria-label="Confirm new password" /><button type="button" aria-label={cpShow ? 'Hide password' : 'Show password'} aria-pressed={cpShow} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setCpShow(v=>!v)}>{cpShow ? '🙈' : '👁️'}</button></div>
        {cpError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{cpError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setCpError(''); if (!cpCurrent || !cpNew || !cpConfirm) { setCpError('Please fill in all three fields'); return; } if (cpNew.length < 6) { setCpError('New password must be at least 6 characters'); return; } if (cpNew !== cpConfirm) { setCpError('New passwords do not match'); return; } if (cpNew === cpCurrent) { setCpError('New password must be different from the current password'); return; } try { await api('/api/me/password','POST',{currentPassword:cpCurrent,newPassword:cpNew}); setShowChangePassword(false); if (setAuthNotice) setAuthNotice('Your password was changed — please log in again with your new password.'); onLogout(); } catch (e:any) { setCpError(e.message); }}}>Save</AsyncButton>
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
  const drag = useSheetDrag(onClose);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>New group</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <label>Group name</label><input style={input} placeholder="e.g. Bali Trip 🌴" value={name} onChange={e=>setName(e.target.value)} />
      <button type="button" onClick={()=>setShowCurrency(v=>!v)} style={{width:'100%',textAlign:'left',background:'var(--field)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12,color:'var(--text)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span><span style={{display:'block',fontSize:12,color:'var(--muted)'}}>Default currency</span><span style={{display:'block',marginTop:2}}>{cur}</span></span><span style={{color:'var(--muted)'}}>›</span></button>
      {showCurrency && <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>{CURRENCIES.map(c=><button key={c} type="button" style={c===cur?catControlActive:catControl} onClick={()=>{setCur(c); setShowCurrency(false);}}>{c}</button>)}</div>}
      <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setCreateError(''); try{const d = await api('/api/groups','POST',{name,defaultCurrency:cur}); onDone(d);}catch(e:any){setCreateError(e.message);}}}>Create group</AsyncButton>
      {createError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{createError}</p>}
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

function AuthBear({ focus, value, eyesClosed, oneEyePeek }: any) {
  const blink = useBlink();
  const len = (value || '').length;
  const dx = focus ? Math.min(len, 16) * 0.2 - 1.6 : 0;
  const dy = focus ? 4 : 2; // anxious look-down: down even at idle, clearly down when a field is focused
  const eyeRy = blink ? 1 : 9;

  return (<div aria-hidden="true" style={{display:'flex',justifyContent:'center',marginBottom:8}}>
    <svg width="88" height="88" viewBox="0 0 120 120">
      <circle cx="28" cy="30" r="16" fill="#8d6b4f" /><circle cx="28" cy="30" r="8" fill="#c9a88a" />
      <circle cx="92" cy="30" r="16" fill="#8d6b4f" /><circle cx="92" cy="30" r="8" fill="#c9a88a" />
      <circle cx="60" cy="66" r="44" fill="#8d6b4f" />
      <ellipse cx="60" cy="82" rx="19" ry="14" fill="#e8dcc8" />
      <ellipse cx="60" cy="76" rx="7" ry="5" fill="#3e2723" />
      <path d="M48 88 Q52 84 56 88 Q60 84 64 88 Q68 84 72 88" fill="none" stroke="#3e2723" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 46 L52 41 M68 41 L84 46" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
      <g>
        {eyesClosed ? (<>
          <path d="M35 58 Q44 52 53 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : oneEyePeek ? (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && <circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" />}
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          <ellipse cx="76" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && (<><circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /><circle cx={76 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /></>)}
        </>)}
      </g>

    </svg>
  </div>);
}

// Auth corgi (2026-11-05, comparison pick): same behaviour as AuthBear
// (focus-driven pupils, blinking, binocular on hidden password, cover
// on shown password), different face — Login shows the corgi, Register
// keeps the bear, so Wai can compare them by toggling the pill. Corgi
// markers: tall pointy ears, tan face with a white blaze, white muzzle,
// tongue out. Cover paws are white (contrast vs tan face).
function AuthCorgi({ focus, value, eyesClosed, oneEyePeek }: any) {
  const blink = useBlink();
  const len = (value || '').length;
  const dx = focus ? Math.min(len, 16) * 0.2 - 1.6 : 0;
  const dy = focus ? 4 : 2; // anxious look-down: down even at idle, clearly down when a field is focused
  const eyeRy = blink ? 1 : 9;

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
      <path d="M48 89 Q52 85 56 89 Q60 85 64 89 Q68 85 72 89" fill="none" stroke="#3e2723" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 46 L52 41 M68 41 L84 46" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
      <g>
        {eyesClosed ? (<>
          <path d="M35 58 Q44 52 53 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : oneEyePeek ? (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && <circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" />}
          <path d="M67 58 Q76 52 85 58" fill="none" stroke="#3e2723" strokeWidth="2.5" strokeLinecap="round" />
        </>) : (<>
          <ellipse cx="44" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          <ellipse cx="76" cy="58" rx="9" ry={eyeRy} fill="#fff" />
          {!blink && (<><circle cx={44 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /><circle cx={76 + dx} cy={58 + dy} r="4.5" fill="#1c1c1e" /></>)}
        </>)}
      </g>

    </svg>
  </div>);
}

// TURNSTILE, Nov 2026: the site key is PUBLIC (it is embedded in the
// frontend and visible to anyone) — only the secret stays server-side
// (TURNSTILE_SECRET Worker secret). The widget renders on the Register
// tab only; the worker verifies the token before creating an account.
const TURNSTILE_SITE_KEY = '0x4AAAAAAF53lVCZRIHYjqty';
// Resolves when the Turnstile script (loaded in index.html) is ready.
// Polls briefly because the script loads async and may land after React
// mounts; resolves to null if it never arrives (widget stays unrendered
// and the Register submit stays disabled).
function waitForTurnstile(): Promise<any> {
  return new Promise((resolve) => {
    const w = window as any;
    if (w.turnstile) return resolve(w.turnstile);
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if ((window as any).turnstile) { clearInterval(t); resolve((window as any).turnstile); }
      else if (tries >= 50) { clearInterval(t); resolve(null); }
    }, 100);
  });
}
function Auth({ onAuth, error, loading, notice, inviteToken, onInvalidInvite }: any) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<string|null>(null);
  const [lastField, setLastField] = useState<string|null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileBoxRef = useRef<any>(null);
  const turnstileWidgetRef = useRef<any>(null);
  // TURNSTILE: render the widget when the Register tab is shown. The
  // widget is Managed (it may auto-verify silently or show a check);
  // its callback stores the single-use token, and expiry/error clears
  // it so the submit stays disabled until a fresh token arrives.
  useEffect(() => {
    if (mode !== 'register') return;
    let cancelled = false;
    waitForTurnstile().then((ts: any) => {
      if (cancelled) return;
      if (!ts || !turnstileBoxRef.current) { setTurnstileFailed(true); return; }
      setTurnstileFailed(false);
      try {
        turnstileWidgetRef.current = ts.render(turnstileBoxRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileToken(null),
        });
      } catch { setTurnstileFailed(true); }
    });
    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && turnstileWidgetRef.current != null) {
        try { ts.remove(turnstileWidgetRef.current); } catch { /* already gone */ }
        turnstileWidgetRef.current = null;
      }
      setTurnstileToken(null);
      setTurnstileFailed(false);
    };
  }, [mode]);
  // TURNSTILE: a failed register consumes the single-use token, so a
  // fresh challenge is needed before retrying. Reset the widget (and
  // clear the token) whenever an error appears on the Register tab.
  useEffect(() => {
    if (!error || mode !== 'register') return;
    const ts = (window as any).turnstile;
    if (ts && turnstileWidgetRef.current != null) {
      try { ts.reset(turnstileWidgetRef.current); } catch { /* already gone */ }
    }
    setTurnstileToken(null);
  }, [error, mode]);
  // INVITE BANNER, Nov 2026: a guest opening an invite link used to see
  // only the generic login screen — nothing said they were invited, or
  // to which group, until AFTER they created an account (the join screen
  // only appears once authed). Resolve the token here (the resolve
  // endpoint is public, no auth needed) and show the invite up front,
  // so they know WHY they are creating an account before they do it.
  // If the link is dead/revoked, say so here too, with a way back to the
  // plain login — so they never register for a link that can't be used.
  const [invite, setInvite] = useState<any>(null);
  const [inviteState, setInviteState] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [inviteError, setInviteError] = useState('');
  useEffect(()=>{ if (!inviteToken) return; let cancelled = false; setInviteState('loading');
    api(`/api/invites/${encodeURIComponent(inviteToken)}`).then((d:any)=>{ if (!cancelled) { setInvite(d); setInviteState('ready'); } }).catch((e:any)=>{ if (!cancelled) { setInviteError(e.message || 'This invite link is invalid or has been revoked'); setInviteState('error'); } });
    return ()=>{ cancelled = true; };
  }, [inviteToken]);
  const passwordRef = useRef<any>(null);
  const focusValue = focus==='name' ? name : focus==='email' ? email : focus==='password' ? password : '';
  // Pet placement 2026-11-05, corrected same day: inside the form card,
  // above the FIRST field in both modes (Login: above Email, Register:
  // above Name — Wai corrected the earlier 'just above Email' placement,
  // which had put the pet after Name in Register).
  const pwFocused = focus === 'password';
  const eyesClosed = pwFocused && !showPassword;
  // Peek is sticky: it also fires when the password was the last field
  // touched and is now shown, even if focus was dropped by the toggle
  // tap or an iOS focus quirk. Focusing another field clears it via lastField.
  const oneEyePeek = showPassword && (pwFocused || lastField === 'password');
  const pet = mode==='login' ? <AuthCorgi focus={focus} value={focusValue} eyesClosed={eyesClosed} oneEyePeek={oneEyePeek} /> : <AuthBear focus={focus} value={focusValue} eyesClosed={eyesClosed} oneEyePeek={oneEyePeek} />;
  return (<div style={S}><h1>Don't Ngiao</h1><p style={{color:'var(--muted)',marginTop:0}}>Mai ngiao, mai drama.</p>
    {notice && <div style={{...homeCard,background:'var(--tint-bg)',marginBottom:16}}><div style={{fontSize:14,lineHeight:1.45}}>{notice}</div></div>}
    {inviteToken && inviteState==='loading' && <p style={{color:'var(--muted)',fontSize:13}}>Checking your invite…</p>}
    {inviteToken && inviteState==='ready' && invite && <div style={{...homeCard,background:'var(--tint-bg)',marginBottom:16}}>
      <div style={{fontSize:18,fontWeight:700,lineHeight:1.3}}>You're invited to join {invite.groupName}</div>
      <div style={{color:'var(--muted)',marginTop:4}}>{invite.inviterName} invited you to join this group.</div>
      <div style={{fontSize:13,color:'var(--muted)',marginTop:8}}>Log in or create an account to join.</div>
    </div>}
    {inviteToken && inviteState==='error' && <div style={{...homeCard,marginBottom:16}}>
      <div style={{fontWeight:700}}>Invite link</div>
      <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.45,margin:'8px 0'}}>{inviteError}</p>
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'0 0 12px'}}>The link may have been revoked, or the group may have been deleted or archived.</p>
      <button style={{...btn,width:'100%',padding:'12px',fontSize:15}} onClick={()=>{ if (onInvalidInvite) onInvalidInvite(); }}>Go to log in</button>
    </div>}
    <div style={{...tabTrack,marginBottom:16}}><button style={mode==='login'?tabPillActive:tabPill} onClick={()=>setMode('login')}>Log in</button><button style={mode==='register'?tabPillActive:tabPill} onClick={()=>setMode('register')}>Register</button></div>
    <div style={homeCard}>
    {error && <p style={{color:'var(--danger-text)',marginTop:0}}>{error}</p>}
    {pet}
    {mode==='register' && <><label>Name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} onFocus={()=>{setFocus('name'); setLastField('name');}} onBlur={()=>setFocus(null)} /></>}
    <label>Email</label><input style={input} value={email} onChange={e=>setEmail(e.target.value)} onFocus={()=>{setFocus('email'); setLastField('email');}} onBlur={()=>setFocus(null)} />
    <label>Password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input ref={passwordRef} type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={password} onChange={e=>setPassword(e.target.value)} onFocus={()=>{setFocus('password'); setLastField('password');}} onBlur={()=>setFocus(null)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onMouseDown={e=>e.preventDefault()} onClick={()=>{setShowPassword(v=>!v); passwordRef.current?.focus();}}>{showPassword ? '🙈' : '👁️'}</button></div>
    {mode==='register' && <><div ref={turnstileBoxRef} style={{margin:'4px 0 10px'}} />{turnstileFailed ? <p style={{color:'var(--danger-text)',fontSize:13,margin:'0 0 10px'}}>Verification couldn't load — check your connection and try again.</p> : (!turnstileToken ? <p style={{color:'var(--muted)',fontSize:13,margin:'0 0 10px'}}>Complete the check above to create your account.</p> : null)}</>}
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: (loading || (mode==='register' && !turnstileToken)) ? 0.6 : 1, cursor: (loading || (mode==='register' && !turnstileToken)) ? 'not-allowed' : 'pointer'}} disabled={loading || (mode==='register' && !turnstileToken)} onClick={()=>onAuth(mode,name,email,password,turnstileToken)}>{loading && <span className="btn-spinner" aria-hidden="true" />}{loading ? (mode==='login' ? 'Logging in…' : 'Creating account…') : (mode==='login' ? 'Log in' : 'Create account')}</button>
    </div>
    <p style={{color:'var(--muted)',fontSize:13}}>Forgot your password? Ask the admin for a reset link.</p>
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
  const [adminModule, setAdminModule] = useState<'users'|'groups'>('users');
  const [groups, setGroups] = useState<any[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all'|'active'|'archived'>('all');
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState('');
  const [confirm, setConfirm] = useState<any>(null);
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
  function doAdminLogout() { setAdminToken(null); setAdminTokenState(null); setAdminUser(null); setUsers([]); setResetResult(null); setGroups([]); setSelectedGroup(null); setAdminModule('users'); }
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
  return (<div style={S}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:8}}><h1 style={{margin:0}}>Admin</h1><div style={{display:'flex',gap:8,flexShrink:0}}><button style={btn} onClick={doAdminLogout}>Log out</button><button style={btn} onClick={()=>{ window.location.href = '/'; }}>← Back to app</button></div></div><p style={{color:'var(--muted)'}}>Signed in as {adminUser.name} ({adminUser.email}) · Modules: Users, Groups</p>
    {/* ADMIN MODULE BAR, Nov 2026: the module tabs are their own
        full-width segmented control row (like the group tabs in the main
        app) so more modules slot in later with no layout change. The
        actions (Log out / Back to app) live inline with the Admin title
        above, not in the tab row — they used to share a row with the
        tabTrack, which mixed a tab with standalone buttons (different
        heights/fonts, stray track margin). */}
    <div style={tabTrack}><button style={adminModule==='users'?tabPillActive:tabPill} onClick={()=>{setAdminModule('users'); setSelectedGroup(null);}}>Users</button><button style={adminModule==='groups'?tabPillActive:tabPill} onClick={()=>{setAdminModule('groups'); setSelectedGroup(null); if (groups.length===0) loadGroups();}}>Groups</button></div>
    {error && <p style={{color:'var(--danger-text)'}}>{error}</p>}
    {adminModule==='users' && (<>
    {resetResult && <div style={homeCard}><strong>Reset link for {resetResult.user.name} ({resetResult.user.email})</strong><p style={{fontSize:13,color:'var(--muted)'}}>Single-use, expires {new Date(resetResult.expiresAt).toLocaleString()}. Send this link to the user yourself — the app does not email it.</p><input readOnly style={input} value={resetResult.link} onFocus={e=>e.target.select()} /><button style={btn} onClick={async()=>{ try { await navigator.clipboard.writeText(resetResult.link); setCopyStatus('Copied to clipboard.'); } catch { setCopyStatus('Could not copy automatically.'); } }}>Copy link again</button>{copyStatus && <p style={{fontSize:13,color:'var(--muted)'}}>{copyStatus}</p>}</div>}
    <label>Search users</label><input style={input} placeholder="Name or email (fuzzy: wk matches Wai Kit)" value={search} onChange={e=>setSearch(e.target.value)} />
    {filtered.length === 0 && <p style={{color:'var(--muted)'}}>No users match.</p>}
    {filtered.length>0 && <div style={balCard}>{filtered.map((u:any,ui:number,arr:any[])=>(<div key={u.id} style={{...balRow,borderBottom:ui===arr.length-1?'none':balHairline}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,width:'100%'}}><div style={{flex:1,minWidth:0}}><strong>{u.name}</strong>{u.isAdmin ? <span style={{fontSize:12,background:'var(--tint-bg)',padding:'2px 6px',borderRadius:99,marginLeft:8}}>Admin</span> : null}<div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div><div style={{fontSize:13,color:'var(--muted)'}}>Joined {new Date(u.createdAt).toLocaleDateString()}</div></div><button style={{...btn,flexShrink:0}} disabled={resettingId===u.id} onClick={()=>doReset(u)}>{resettingId===u.id ? 'Creating…' : 'Reset'}</button></div></div>))}</div>}
    </>)}
    {adminModule==='groups' && !selectedGroup && (<>
    <div style={tabTrack}><button style={groupFilter==='all'?tabPillActive:tabPill} onClick={()=>setGroupFilter('all')}>All</button><button style={groupFilter==='active'?tabPillActive:tabPill} onClick={()=>setGroupFilter('active')}>Active</button><button style={groupFilter==='archived'?tabPillActive:tabPill} onClick={()=>setGroupFilter('archived')}>Archived</button></div>
    <label>Search groups</label><input style={input} placeholder="Group name" value={groupSearch} onChange={e=>setGroupSearch(e.target.value)} />
    {groupsLoading && <p style={{color:'var(--muted)'}}>Loading groups…</p>}
    {!groupsLoading && filteredGroups.length===0 && <p style={{color:'var(--muted)'}}>No groups match.</p>}
    {!groupsLoading && filteredGroups.length>0 && <div style={balCard}>{filteredGroups.map((gr:any,gi:number,arr:any[])=>(<div key={gr.id} style={{...balRow,borderBottom:gi===arr.length-1?'none':balHairline,cursor:'pointer'}} onClick={()=>openGroup(gr.id)}><div style={{flex:1,minWidth:0}}><strong>{gr.name}</strong>{gr.isArchived ? <span style={{fontSize:12,background:'var(--tint-bg)',padding:'2px 6px',borderRadius:99,marginLeft:8}}>Archived</span> : null}<div style={{fontSize:13,color:'var(--muted)'}}>{gr.memberCount} member{gr.memberCount===1?'':'s'} · {gr.expenseCount} expense{gr.expenseCount===1?'':'s'} · {gr.paymentCount} payment{gr.paymentCount===1?'':'s'}</div><div style={{fontSize:13,color:'var(--muted)'}}>Created {new Date(gr.createdAt).toLocaleDateString()} by {gr.creatorName}</div></div><span style={{color:'var(--muted)',flexShrink:0}}>›</span></div>))}</div>}
    </>)}
    {adminModule==='groups' && selectedGroup && (<>
    <p><button style={btn} onClick={()=>{setSelectedGroup(null); loadGroups();}}>← Back to groups</button></p>
    <h2 style={{margin:'0 0 4px'}}>{selectedGroup.name}</h2>
    <p style={{color:'var(--muted)',marginTop:0}}>Created {new Date(selectedGroup.createdAt).toLocaleDateString()} by {selectedGroup.creatorName} · Default {selectedGroup.defaultCurrency}{selectedGroup.isArchived ? ' · Archived' : ''}</p>
    <div style={homeCard}><strong>Money</strong><div style={{fontSize:13,color:'var(--muted)',marginTop:4}}>{selectedGroup.expenseCount} expense{selectedGroup.expenseCount===1?'':'s'} · {selectedGroup.paymentCount} payment{selectedGroup.paymentCount===1?'':'s'}</div>{Object.keys(selectedGroup.totals||{}).length===0 ? <div style={{fontSize:13,color:'var(--muted)'}}>No money yet.</div> : Object.keys(selectedGroup.totals).map((cur:string)=>(<div key={cur} style={{display:'flex',justifyContent:'space-between',fontSize:14,marginTop:4}}><span>{cur}</span><strong>{fmt(selectedGroup.totals[cur], cur)}</strong></div>))}</div>
    <div style={balCard}>{selectedGroup.members.map((m:any,mi:number,arr:any[])=>(<div key={m.id} style={{...balRow,borderBottom:mi===arr.length-1?'none':balHairline}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,width:'100%'}}><div style={{flex:1,minWidth:0}}><strong>{m.name}</strong>{m.isCreator ? <span style={{fontSize:12,background:'var(--tint-bg)',padding:'2px 6px',borderRadius:99,marginLeft:8}}>Creator</span> : null}{!m.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}<div style={{fontSize:13,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email || 'No email'}</div><div style={{fontSize:13,color:'var(--muted)'}}>Joined {new Date(m.createdAt).toLocaleDateString()}</div>{m.removeBlocked ? <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{m.removeBlocked}</div> : null}</div><button style={{...btn,flexShrink:0}} disabled={!m.canRemove || groupBusy===('remove:'+m.id)} onClick={()=>setConfirm({title:'Remove member?',message:`Remove ${m.name} from '${selectedGroup.name}'? This cannot be undone.`,confirmLabel:'Remove',onError:(msg:string)=>setError(msg),action:async()=>{await doRemoveMember(selectedGroup,m);}})}>{groupBusy===('remove:'+m.id) ? 'Removing…' : 'Remove'}</button></div></div>))}</div>
    <div style={homeCard}><strong>Invite link</strong>{selectedGroup.inviteToken ? <><p style={{fontSize:13,color:'var(--muted)'}}>Anyone with this link can join the group.</p><input readOnly style={input} value={`${window.location.origin}/?invite=${selectedGroup.inviteToken}`} onFocus={e=>e.target.select()} /><div style={{display:'flex',gap:8}}><button style={btn} onClick={async()=>{ try { await navigator.clipboard.writeText(`${window.location.origin}/?invite=${selectedGroup.inviteToken}`); setInviteStatus('Copied to clipboard.'); } catch { setInviteStatus('Could not copy automatically.'); } }}>Copy link</button><button style={{...btn,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)',fontWeight:600}} disabled={groupBusy==='revoke'} onClick={()=>setConfirm({title:'Revoke invite link?',message:'The current link will stop working immediately. A new link will be generated and shown here, so you can share the fresh link.',confirmLabel:'Revoke',onError:(msg:string)=>setError(msg),action:async()=>{await doInviteRevoke(selectedGroup);}})}>{groupBusy==='revoke' ? 'Revoking…' : 'Revoke'}</button></div>{inviteStatus && <p style={{fontSize:13,color:'var(--muted)'}}>{inviteStatus}</p>}</> : <p style={{fontSize:13,color:'var(--muted)'}}>No active invite link. A member can create one from the Members tab.</p>}</div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
    {selectedGroup.isArchived
      ? <button style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={groupBusy==='restore'} onClick={()=>doRestoreGroup(selectedGroup)}>{groupBusy==='restore' ? 'Restoring…' : 'Restore group'}</button>
      : <button style={{...btn,width:'100%',padding:'14px',fontSize:16}} disabled={groupBusy==='archive'} onClick={()=>doArchiveGroup(selectedGroup)}>{groupBusy==='archive' ? 'Archiving…' : 'Archive group'}</button>}
    {selectedGroup.isClean && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)',fontWeight:600}} disabled={groupBusy==='delete'} onClick={()=>setConfirm({title:'Delete group?',message:`Delete '${selectedGroup.name}'? It has no expenses or payments, so it will be permanently deleted (members, invite link and activity go with it). This cannot be undone.`,confirmLabel:'Delete',onError:(msg:string)=>setError(msg),action:async()=>{await doDeleteGroup(selectedGroup);}})}>{groupBusy==='delete' ? 'Deleting…' : 'Delete group'}</button>}
    {!selectedGroup.isClean && <p style={{fontSize:13,color:'var(--muted)'}}>Delete is only available for groups with no expenses or payments — this group has money history, so archive it instead.</p>}
    </div>
    </>)}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){if (confirm.onError) confirm.onError(er.message); else setError(er.message);}finally{setConfirm(null);}}} />}
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
  return (<div style={S}><h1>Reset password</h1><p style={{color:'var(--muted)'}}>Choose a new password. This link is single-use and expires after 24 hours.</p>
    <div style={homeCard}>
    {error && <p style={{color:'var(--danger-text)',marginTop:0}}>{error}</p>}
    <label>New password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={newPassword} onChange={e=>setNewPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <label>Confirm new password</label><div style={{position:'relative',margin:'4px 0 10px'}}><input type={showPassword ? 'text' : 'password'} style={{...input,margin:0,paddingRight:44}} value={confirm} onChange={e=>setConfirm(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',padding:4,cursor:'pointer',fontSize:18,lineHeight:1}} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? '🙈' : '👁️'}</button></div>
    <button style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer'}} disabled={loading} onClick={doReset}>{loading ? 'Resetting…' : 'Reset password'}</button>
    </div>
  </div>);
}

// INVITE LINK (?invite=<token>), Nov 2026: a public link to join a group.
// Resolves the token (no auth needed to see it), then joins (auth
// required — a guest sees the normal Auth screen first, and the token
// survives in the URL, so after login the join screen appears). After
// joining, onJoined clears the param and opens the group. Joining adds
// a membership for the account (name + email). There is no claim step:
// if the group had a placeholder with this email, registering already
// activated THAT user row, so the caller IS that user and is already a
// member — the join screen never appears for them. Joining is not a
// money event, so the Log gets no entry for it.
function InviteView({ token, onJoined, onCancel }: any) {
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading');
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  useEffect(()=>{ let cancelled = false;
    api(`/api/invites/${encodeURIComponent(token)}`).then((d:any)=>{ if (cancelled) return; if (d.alreadyMember) { onJoined(d.groupId); return; } setInvite(d); setState('ready'); }).catch((e:any)=>{ if (!cancelled) { setError(e.message || 'This invite link is invalid or has been revoked'); setState('error'); } });
    return ()=>{ cancelled = true; };
  }, [token]);
  async function join() {
    setError(''); setJoining(true);
    try { const d = await api(`/api/invites/${encodeURIComponent(token)}/join`, 'POST'); onJoined(d.group.id); }
    catch(e:any){ setError(e.message); } finally { setJoining(false); }
  }
  if (state === 'loading') return (<div style={S}><h1>Don't Ngiao</h1><p style={{color:'var(--muted)'}}>Checking your invite…</p></div>);
  if (state === 'error') return (<div style={S}><h1>Invite link</h1><div style={homeCard}><p style={{marginTop:0}}>{error}</p><p style={{fontSize:13,color:'var(--muted)'}}>The link may have been revoked, or the group may have been deleted or archived.</p><button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={onCancel}>Go to Home</button></div></div>);
  return (<div style={S}><h1>You're invited</h1><div style={homeCard}>
    <div style={{fontSize:20,fontWeight:700}}>{invite.groupName}</div>
    <p style={{color:'var(--muted)',marginTop:4}}>{invite.inviterName} invited you to join this group.</p>
    {error && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4}}>{error}</p>}
    <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={joining} onClick={join}>{joining ? 'Joining…' : 'Join group'}</AsyncButton>
    <div style={{marginTop:12}}><button style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={onCancel}>Not now</button></div>
    <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:12}}>Joining adds you to this group, using your account name and email. If someone added you as a placeholder with this email, you're already a member — the group will open instead.</p>
  </div></div>);
}

function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError, theme, setTheme, justJoined }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
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
  // Member sheet drag (2026-11-06): the hook lives here, not inside the
  // conditional sheet JSX below — hooks can't be called conditionally.
  const memberDrag = useSheetDrag(()=>setDetailMember(null));
  const [emailDraft, setEmailDraft] = useState('');
  const [memberSheetError, setMemberSheetError] = useState('');
  // Save email is disabled when there is nothing new and valid to save:
  // empty, unchanged from the member's current email, or failing the same
  // @/. check the worker enforces on PATCH /members/:id. The server still
  // 400s as a backstop; this only stops a pressable dead button.
  const emailTrimmed = emailDraft.trim().toLowerCase();
  const emailAt = emailTrimmed.indexOf('@'); const emailDot = emailTrimmed.lastIndexOf('.');
  const emailValid = !!emailTrimmed && emailAt > 0 && emailDot > emailAt + 1 && emailDot < emailTrimmed.length - 1;
  const saveEmailDisabled = !detailMember || !!detailMember.hasAccount || !emailValid || emailTrimmed === (detailMember?.email || '').toLowerCase();
  // HYBRID REMOVE RULE (mirror of the worker guard, 2026-11-05):
  // placeholder -> anyone; account member -> creator only; creator ->
  // nobody. Tappable iff the sheet would have an action: Edit email
  // (placeholders) or Remove (per this rule). Own row never tappable.
  // If createdByUserId is missing (legacy group), fall back to the old
  // peer behaviour so the UI never hides a Remove the server allows.
  const creatorMemberId = group.createdByUserId ? (group.members.find((m:any)=>m.user_id===group.createdByUserId)?.id || null) : null;
  const isGroupCreator = !!group.createdByUserId && group.myMemberId === creatorMemberId;
  const canRemoveMember = (m:any) => !group.isArchived && m.id !== group.myMemberId && (!m.hasAccount || !group.createdByUserId || isGroupCreator);
  const [catView, setCatView] = useState<'group'|'mine'|'members'>('group');
  // EXPENSE SEARCH & FILTER, Nov 2026 (item 1): frontend-only. The
  // group detail already loads every expense, so the filter is a pure
  // function over group.expenses — no BE endpoint (a BE filter only
  // earns its keep with pagination, not needed at ~30 expenses). Text
  // matches the description (substring, case-insensitive); category
  // and payer are exact (null = All). The chart is NOT filtered — it
  // stays the group totals; only the expense list narrows.
  const [expSearch, setExpSearch] = useState('');
  const [expCat, setExpCat] = useState<string | null>(null);
  const [expPayer, setExpPayer] = useState<string | null>(null);
  const [showExpCat, setShowExpCat] = useState(false);
  const [showExpPayer, setShowExpPayer] = useState(false);
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
  function changeTab(t: 'expenses'|'balances'|'members'|'log') { setTab(t); setError(''); setMemberErrors({}); setPaymentErrors({}); }
  const [catCur, setCatCur] = useState<string>('');
  const currencies = Object.keys(group.categoryGroup || {});
  // CHUNK 1, Nov 2026: catCur persists across groups (GroupView state
  // is not reset when a new group loads), so a currency picked in one
  // group could be absent from the next, rendering a blank chart with
  // no explanation. Clamp per render: use the picked currency only if
  // this group actually has it, otherwise fall back. The preference
  // itself is kept (not cleared), so returning to a group that has
  // that currency restores it.
  // CHART DEFAULT, Nov 2026 (Wai picked group default): the fallback
  // used to be currencies[0] — whichever currency appears first in
  // the category data, an accident of expense order (KL 2026 showed
  // SGD while the group default is MYR). Now the fallback prefers the
  // group's defaultCurrency when the group has data in it, and only
  // falls back to the first currency with data when the default has
  // none (so the chart is never blank). An empty group shows the
  // default currency (currencies is empty, so the last fallback wins).
  const cur = (catCur && currencies.includes(catCur)) ? catCur : (currencies.includes(group.defaultCurrency) ? group.defaultCurrency : (currencies[0] || group.defaultCurrency));
  const catData = (catView==='group' ? group.categoryGroup?.[cur] : group.categoryMine?.[cur]) || {};
  // BY MEMBER VIEW, Nov 2026: per-member total PAID (gross) in the
  // selected currency, computed from the loaded expenses (no BE change
  // — group.expenses already carries payer + amount + currency).
  // Sorted descending, so the member who fronted the most is first.
  // This is gross paid, NOT the net balance (Balances shows net); a
  // member can have paid the most and still owe money.
  const memberTotals: { memberId: string; name: string; total: number; count: number }[] = (() => {
    const byId = new Map<string, { total: number; count: number }>();
    for (const e of (group.expenses || [])) {
      if (e.currency !== cur) continue;
      const p = e.paid_by_member_id; if (!p) continue;
      const acc = byId.get(p) || { total: 0, count: 0 };
      acc.total += e.amount_minor || 0; acc.count += 1; byId.set(p, acc);
    }
    const rows: { memberId: string; name: string; total: number; count: number }[] = (group.members || []).map((m: any) => {
      const t = byId.get(m.id) || { total: 0, count: 0 };
      return { memberId: m.id, name: m.name, total: t.total, count: t.count };
    });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  })();
  const memberGrandTotal = memberTotals.reduce((a, r) => a + r.total, 0);
  const expFiltersActive = expSearch.trim() !== '' || expCat !== null || expPayer !== null;
  const filteredExpenses = (group.expenses || []).filter((e: any) => {
    if (expSearch.trim() && !String(e.description || '').toLowerCase().includes(expSearch.trim().toLowerCase())) return false;
    if (expCat && e.category !== expCat) return false;
    if (expPayer && e.paid_by_member_id !== expPayer) return false;
    return true;
  });
  // FILTER COUNTS, Nov 2026: faceted counts for the filter pickers. Each
  // count respects the OTHER active filters (search + the other picker)
  // but not the dimension being picked, so it predicts how many expenses
  // you get if you tap that row. E.g. with search "Bagel" active, the
  // Category picker shows Food & Drink 5 (not the group total 13).
  // Counts are expense counts only, so currency never matters.
  const expSearchQ = expSearch.trim().toLowerCase();
  const catCounts: Record<string, number> = {};
  let allCatCount = 0;
  const payerCounts: Record<string, number> = {};
  let allPayerCount = 0;
  (group.expenses || []).forEach((e: any) => {
    if (expSearchQ && !String(e.description || '').toLowerCase().includes(expSearchQ)) return;
    if (!expPayer || e.paid_by_member_id === expPayer) { allCatCount++; catCounts[e.category] = (catCounts[e.category] || 0) + 1; }
    if (!expCat || e.category === expCat) { allPayerCount++; payerCounts[e.paid_by_member_id] = (payerCounts[e.paid_by_member_id] || 0) + 1; }
  });
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
        <ThemePill theme={theme} setTheme={setTheme} />
        <button type="button" aria-label="Group settings" title="Group settings" onClick={()=>setShowSettings(true)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
      </span>
    </div>
    {justJoined && <OnboardingPrompts />}
    <h1 style={{marginBottom:2}}>{group.name}</h1>
    {group.isArchived && <p style={{background:'var(--danger-bg)',padding:8,borderRadius:8}}>This group is archived. Restore it from Settings or You → Groups → Archive Groups to edit it again.</p>}
    {/* Sub-header as a metadata row, not a sentence (2026-11-05):
    left = default currency, right = member count, both muted 13px.
    No avatar stack (Wai's choice) and no currency pill — pills were
    just removed from Balances for the same repetition reason. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,color:'var(--muted)',fontSize:13,lineHeight:1.4,marginTop:0,marginBottom:16}}>
      <span>Default: {group.defaultCurrency}</span>
      <span style={{whiteSpace:'nowrap'}}>{group.members.length} members</span>
    </div>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'var(--danger-text)'}}>{error}</span><button style={btn} onClick={()=>reload()}>Retry</button></div>}
    <div style={tabTrack}>
      {(['expenses','balances','members','log'] as const).map(t=>(<button key={t} onClick={()=>changeTab(t)} style={{flex:1,padding:'10px 4px',fontSize:14,color:tab===t?'#0f172a':'var(--muted)',background:tab===t?'#fff':'transparent',border:'none',borderRadius:999,fontWeight:tab===t?600:400,textTransform:'capitalize'}}>{t}</button>))}
    </div>
    {tab==='expenses' && <>
      <div style={card}><h3 style={{marginTop:0}}>{catView==='members' ? 'Paid by member' : 'Spend by category'}</h3>
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
          <div style={{display:'flex',background:'var(--field)',borderRadius:999,padding:3,flexShrink:0}}>
            <button style={catView==='group'?{...tabPillActive,flex:'none',padding:'8px 16px'}:{...tabPill,flex:'none',padding:'8px 16px'}} onClick={()=>setCatView('group')}>Group</button>
            <button style={catView==='mine'?{...tabPillActive,flex:'none',padding:'8px 16px'}:{...tabPill,flex:'none',padding:'8px 16px'}} onClick={()=>setCatView('mine')}>Mine</button>
            <button style={catView==='members'?{...tabPillActive,flex:'none',padding:'8px 16px'}:{...tabPill,flex:'none',padding:'8px 16px'}} onClick={()=>setCatView('members')}>Members</button>
          </div>
          {currencies.length>1 && <span style={{display:'flex',alignItems:'center',gap:4,marginLeft:'auto'}}><select aria-label="Chart currency" style={{background:'transparent',border:'none',color:'var(--text)',fontSize:14,padding:'8px 0',appearance:'none',cursor:'pointer',outline:'none'}} value={cur} onChange={e=>setCatCur(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select><span aria-hidden="true" style={{color:'var(--muted)',pointerEvents:'none'}}>▾</span></span>}
        </div>
        {/* BY MEMBER VIEW, Nov 2026: the pie/bar carousel is category-
        specific, so it (and the dots) are hidden when Members is
        selected and replaced by a ranked per-member list. The carousel
        stays mounted for Group/Mine only, so DailyBar's view prop
        (typed 'group' | 'mine') still type-checks — TypeScript narrows
        catView inside the catView!=='members' branch. */}
        {catView!=='members' && (<>
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
          <button type="button" aria-label="Show pie chart" style={{width:8,height:8,borderRadius:'50%',border:'none',padding:0,cursor:'pointer',background:catChart==='pie' ? 'var(--accent)' : 'var(--border)'}} onClick={()=>setCatChart('pie')} />
          <button type="button" aria-label="Show bar chart" style={{width:8,height:8,borderRadius:'50%',border:'none',padding:0,cursor:'pointer',background:catChart==='bar' ? 'var(--accent)' : 'var(--border)'}} onClick={()=>setCatChart('bar')} />
        </div>
        </>)}
        {catView==='members' && (<div style={{width:'100%',maxWidth:360}}>
          {memberGrandTotal===0 ? <p style={{color:'var(--muted)'}}>No spend in {cur} yet.</p> : memberTotals.map((r) => {
            const pct = (r.total / memberGrandTotal) * 100;
            const label = (group.myMemberId && r.memberId===group.myMemberId) ? 'You' : r.name;
            return (<div key={r.memberId} style={{padding:'6px 0'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                  <span style={{width:10,height:10,borderRadius:'50%',background:memberDotColor(group, r.memberId),flexShrink:0}} />
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
                  <span style={{fontSize:12,color:'var(--muted)',whiteSpace:'nowrap'}}>· {r.count} {r.count===1 ? 'expense' : 'expenses'}</span>
                </span>
                <span style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(r.total, cur)} ({pct.toFixed(1)}%)</span>
              </div>
              <div style={{height:6,borderRadius:999,background:'var(--field)',marginTop:4,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:memberDotColor(group, r.memberId),borderRadius:999}} /></div>
            </div>);
          })}
        </div>)}
        {/* Chart explanation paragraph REMOVED 2026-11-05: it restated
        what was already visible (Group/Mine labels, dots, currency
        picker). Only the non-obvious Mine distinction is kept, shortened
        to one clause — Group needs no explanation at all. */}
        {catView==='mine' && <p style={{fontSize:12,color:'var(--muted)'}}>Mine = your shares only.</p>}
        {catView==='members' && <p style={{fontSize:12,color:'var(--muted)'}}>Members = total paid by each member (gross, not net balance).</p>}
      </div>
      {group.expenses.length===0 && <p>No expenses yet.</p>}
      {group.expenses.length>0 && (<div style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--field)',borderRadius:10,padding:'10px 12px'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:16,padding:0}} placeholder="Search expenses" value={expSearch} onChange={e=>setExpSearch(e.target.value)} aria-label="Search expenses" />
          {expSearch && <button type="button" aria-label="Clear search" onClick={()=>setExpSearch('')} style={{background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:18,lineHeight:1,padding:0}}>×</button>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
          <button style={btn} onClick={()=>setShowExpCat(true)}>Category: {expCat || 'All'} ▾</button>
          <button style={btn} onClick={()=>setShowExpPayer(true)}>Paid by: {expPayer ? personDisplay(group, expPayer, null).label : 'All'} ▾</button>
          {expFiltersActive && <button style={btn} onClick={()=>{setExpSearch(''); setExpCat(null); setExpPayer(null);}}>Clear filters</button>}
        </div>
        {expFiltersActive && <p style={{fontSize:13,color:'var(--muted)',marginTop:8,marginBottom:0}}>{filteredExpenses.length} of {group.expenses.length} expenses</p>}
      </div>)}
      {group.expenses.length>0 && filteredExpenses.length===0 && <div style={{textAlign:'center',padding:'16px 0'}}><p style={{color:'var(--muted)'}}>No expenses match your filters.</p><button style={btn} onClick={()=>{setExpSearch(''); setExpCat(null); setExpPayer(null);}}>Clear filters</button></div>}
      {group.expenses.length>0 && filteredExpenses.length>0 && <div style={balCard}>{filteredExpenses.map((e:any,ei:number,arr:any[])=>{const mySplit = group.myMemberId ? e.splits.find((s:any)=>s.member_id===group.myMemberId) : null; return (<div key={e.id} style={{...balRow,cursor:'pointer',borderBottom:ei===arr.length-1?'none':balHairline}} onClick={()=>setDetailExpense(e)}>
        <span style={{width:36,height:36,borderRadius:10,background:EXP_CAT_COLORS[e.category] || 'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{catIcon(e.category)}</span>
        <div style={{flex:1,minWidth:0,lineHeight:1.4}}><div style={{fontWeight:600}}>{e.description}</div><div style={{fontSize:13,color:'var(--muted)'}}>Paid by {e.payerName} · {fmtDate(e.date)}</div></div>
        <div style={{textAlign:'right',flexShrink:0,lineHeight:1.4}}><strong style={{whiteSpace:'nowrap'}}>{e.display}</strong><div style={{fontSize:13,color:'var(--muted)'}}>{mySplit ? `your share ${fmt(mySplit.amount_minor,e.currency)}` : 'Not involved'}</div></div>
      </div>);})}</div>}
      {!showExpense && !group.isArchived && <div style={{position:'fixed',left:0,right:0,bottom:0,maxWidth:640,margin:'0 auto',background:'var(--card)',borderTop:'1px solid var(--border)',padding:12,textAlign:'center'}}><button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>setShowExpense(true)}>+ Add expense</button></div>}
      {showExpCat && <CategoryPickerSheet current={expCat} allowAll counts={catCounts} allCount={allCatCount} onPick={(c:any)=>{setExpCat(c); setShowExpCat(false);}} onClose={()=>setShowExpCat(false)} />}
      {showExpPayer && <PayerPickerSheet group={group} current={expPayer} allowAll counts={payerCounts} allCount={allPayerCount} onPick={(m:any)=>{setExpPayer(m); setShowExpPayer(false);}} onClose={()=>setShowExpPayer(false)} />}
    </>}
    {tab==='balances' && <>
      {/* EMPTY STATE, 2026-11-05: a group with no balances, no settle
      suggestions and no payments gets ONE designed zero-state card
      instead of "No balances yet." + "All settled." plus a bare
      "Recorded payments" header — a bare header with nothing under
      it reads as "still loading", not "zero rows". The guidance
      notes below only make sense once their sections have content,
      so they stay with the non-empty render; unchanged there.
      "No balances yet." is deleted outright: balances empty always
      implies suggestions empty, so "All settled." already covers it. */}
      {group.balances.length===0 && group.suggestions.length===0 && group.payments.length===0 ? (<div style={balCard}>
        <div style={{padding:'16px 14px',textAlign:'center'}}>
          <div style={{fontWeight:600,fontSize:16}}>All settled.</div>
          {!group.isArchived && (
            <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>Add an expense from the Expenses tab to start tracking balances.</div>
          )}
        </div>
      </div>) : (<>
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
          <div style={{padding:'14px 14px 6px',fontSize:12,letterSpacing:1,color:'var(--muted)',fontWeight:600}}>YOUR POSITION IN THIS GROUP</div>
          {mine.map((b:any,i:number)=>(<div key={b.currency} style={{...balRow,justifyContent:'space-between',borderBottom:i===mine.length-1?'none':balHairline}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}><span>{b.balance>0?'You are owed':b.balance<0?'You owe':'Settled'}</span>{!singleCurrency && <span style={currencyChip}>{b.currency}</span>}</div>
            <strong style={{color:b.balance>0?'var(--tint-text)':b.balance<0?'var(--danger-text)':'var(--muted)',fontSize:16,whiteSpace:'nowrap'}}>{b.balance===0?'Settled':fmt(Math.abs(b.balance), b.currency)}</strong>
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
              <span style={{fontSize:13,color:'var(--muted)',lineHeight:1.4,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>spent {fmt(spent, cur)}</span>
            </div>
            <div style={balCard}>{group.balances.filter((b:any)=>b.currency===cur).map((b:any,bi:number,arr:any[])=>{
              const member = group.members.find((x:any)=>x.id===b.memberId);
              const displayName = b.memberId===group.myMemberId ? `You (${b.memberName})` : b.memberName;
              return (<div key={b.memberId+b.currency} style={{...balRow,borderBottom:bi===arr.length-1?'none':balHairline}}>
                <div style={{...avatar,background:memberDotColor(group, b.memberId)}}>{initials(b.memberName)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,lineHeight:1.4}}>{displayName}{member && !member.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}</div>
                  <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4}}>Paid {fmt(b.paid ?? 0, cur)} · Share {fmt(b.share ?? 0, cur)}</div>
                </div>
                <strong style={{color:b.balance>0?'var(--tint-text)':b.balance<0?'var(--danger-text)':'var(--muted)',fontSize:16,whiteSpace:'nowrap',flexShrink:0,textAlign:'right'}}>{b.balance>0?'+':''}{b.display}</strong>
              </div>);
            })}</div>
          </div>);
        });
      })()}
      {(() => {
        // SETTLE UP IS YOURS ONLY, Nov 2026 (Wai): the Settle up section
        // shows only the debts involving the current user (as debtor or
        // creditor). Debts between two other members are hidden — they
        // are not yours to settle. The per-currency balance cards above
        // still show the whole group's balances, and Recorded payments
        // below is unchanged (the audit log shows every payment).
        const mySuggestions = group.suggestions.filter((s:any)=>s.fromMemberId===group.myMemberId || s.toMemberId===group.myMemberId);
        return (<>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,margin:'20px 0 8px'}}><h3 style={{margin:0,fontSize:17}}>Settle up</h3><span style={{fontSize:13,color:'var(--muted)'}}>Simplified debts</span></div>
      {mySuggestions.length===0 && <p>{group.suggestions.length===0 ? 'All settled.' : "You're all settled."}</p>}
      {mySuggestions.length>0 && <div style={balCard}>{mySuggestions.map((s:any,i:number)=>{
        const from = personDisplay(group, s.fromMemberId, s.fromName);
        const to = personDisplay(group, s.toMemberId, s.toName);
        // SETTLE AUTH, Nov 2026: mirror the server rule in the UI — only
        // the creditor can settle, except when the creditor is a
        // placeholder (no account), in which case the debtor may. Anyone
        // else gets a disabled button + an explanation, not a hidden
        // button, so a debtor is not left wondering why there is no
        // Settle button (same pattern as the Leave grey-out).
        const toMember = group.members.find((m:any)=>m.id===s.toMemberId);
        const canSettle = group.myMemberId === s.toMemberId || (toMember && !toMember.hasAccount && group.myMemberId === s.fromMemberId);
        return (<div key={i} style={{...balRow,justifyContent:'space-between',borderBottom:i===mySuggestions.length-1?'none':balHairline}}>
          {/* Settle rows now match Recorded payments (2026-11-05): overlapping
          avatar pair, debtor first, creditor second, in memberDotColor —
          the single debtor dot is dropped, since avatars now carry the
          same sequential colour and also show the creditor. */}
          <div style={{display:'flex',alignItems:'center',flexShrink:0}}><span style={{...avatar,width:28,height:28,fontSize:12,background:memberDotColor(group, from.memberId)}}>{initials(from.name)}</span><span style={{...avatar,width:28,height:28,fontSize:12,marginLeft:-10,border:'2px solid var(--card)',background:memberDotColor(group, to.memberId)}}>{initials(to.name)}</span></div>
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div>{from.label} <span style={{color:'var(--muted)'}}>{from.memberId===group.myMemberId?'owe':'owes'}</span> {to.memberId===group.myMemberId?'you':to.label}</div>
            <div style={{marginTop:4}}><strong>{s.display}</strong></div>
          </div>
          {!group.isArchived && <button style={{...primary,flexShrink:0,background:canSettle?'var(--accent)':'var(--accent-disabled)',borderColor:canSettle?'var(--accent)':'var(--accent-disabled)',color:canSettle?'var(--accent-text)':'var(--accent-text-disabled)',cursor:canSettle?'pointer':'not-allowed'}} disabled={!canSettle} onClick={()=>setSettle(s)}>Settle</button>}
        </div>);
      })}</div>}
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'8px 0 0'}}>Only the creditor can settle a debt — if a Settle button is dark, you're the one who owes, so only the other person can settle it. Settling records a payment between the two people — partial amounts are fine, edit the amount in the sheet.</p>
        </>);
      })()}
      <h3 style={{margin:'20px 0 8px',fontSize:17}}>Recorded payments</h3>
      {group.payments.length>0 ? <div style={balCard}>{group.payments.map((p:any,pi:number)=>{
        const from = personDisplay(group, p.from_member_id, p.fromName);
        const to = personDisplay(group, p.to_member_id, p.toName);
        return (<div key={p.id} style={{...balRow,justifyContent:'space-between',borderBottom:pi===group.payments.length-1?'none':balHairline}}>
          <div style={{display:'flex',alignItems:'center',flexShrink:0}}><span style={{...avatar,width:28,height:28,fontSize:12,background:memberDotColor(group, from.memberId)}}>{initials(from.name)}</span><span style={{...avatar,width:28,height:28,fontSize:12,marginLeft:-10,border:'2px solid var(--card)',background:memberDotColor(group, to.memberId)}}>{initials(to.name)}</span></div>
          <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
            <div>{from.label} <span style={{color:'var(--muted)'}}>paid</span> {to.memberId===group.myMemberId?'you':to.label}</div>
            <div style={{fontSize:13,lineHeight:1.4,marginTop:4}}><strong>{p.display}</strong> <span style={{color:'var(--muted)'}}>· {fmtDate(p.date).replace(/ \d{4}$/,'')}</span></div>
            {paymentErrors[p.id] && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:4,marginBottom:0}}>{paymentErrors[p.id]}</p>}
          </div>
          {!group.isArchived && (group.myMemberId === p.from_member_id || group.myMemberId === p.to_member_id) && <button style={{...btn,flexShrink:0,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)',fontWeight:600}} onClick={()=>setConfirm({title:'Delete payment?',message:`Delete the ${p.display} payment from ${from.label} to ${to.label} on ${fmtDate(p.date)}? This cannot be undone.`,onError:(msg:string)=>setPaymentErrors(prev=>({...prev,[p.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/payments/${p.id}`,'DELETE'); reload(d);}})}>Delete</button>}
        </div>);
      })}</div> : <div style={balCard}><div style={{...balRow,color:'var(--muted)'}}>No recorded payments yet.</div></div>}
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'8px 0 0'}}>Delete shows only on payments you're part of — as the person who paid or the person who was paid.</p>
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'16px 0 0'}}>Balances are per currency and never converted. Recording a payment never moves real money — it just records that money changed hands. Settle up above, one currency at a time.</p>
      </>)}
    </>}
    {tab==='members' && <>
      {group.members.length>0 && <div style={balCard}>{group.members.map((m:any,mi:number,arr:any[])=>{
        const tappable = canRemoveMember(m);
        return (<div key={m.id} style={{...balRow,borderBottom:mi===arr.length-1?'none':balHairline,cursor:tappable?'pointer':'default'}} onClick={tappable?()=>{setDetailMember(m); setEmailDraft(m.email || ''); setMemberSheetError('');}:undefined}>
        <div style={{...avatar,background:memberDotColor(group, m.id)}}>{initials(m.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,lineHeight:1.4}}>{m.id === group.myMemberId ? `You (${m.name})` : m.name}{!m.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}</div>
          {m.email ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>) : (!m.hasAccount ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4}}>No email set — add one so they can register with it</div>) : null)}
          {!m.hasAccount && m.email ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4}}>They can register with this email to join</div>) : null}
        </div>
        {tappable && <span style={{color:'var(--muted)',flexShrink:0}}>›</span>}
      </div>);})}</div>}
      {!group.isArchived && <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:12}}><InviteMember groupId={group.id} setConfirm={setConfirm} /><AddMember groupId={group.id} reload={reload} /></div>}
    </>}
    {detailMember && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) setDetailMember(null); }}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:memberDrag.dragY?`translateY(${memberDrag.dragY}px)`:undefined,transition:memberDrag.dragging?'none':'transform 0.2s ease-out'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={memberDrag.onPointerDown} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={memberDrag.onPointerDown}><h2 style={{margin:0}}>Member</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setDetailMember(null)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:16}}>
          <div style={{...avatar,background:memberDotColor(group, detailMember.id)}}>{initials(detailMember.name)}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,lineHeight:1.4}}>{detailMember.id === group.myMemberId ? `You (${detailMember.name})` : detailMember.name}{!detailMember.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}</div>
            {detailMember.email ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{detailMember.email}</div>) : (!detailMember.hasAccount ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4}}>No email set — add one so they can register with it</div>) : null)}
            {!detailMember.hasAccount && detailMember.email ? (<div style={{fontSize:13,color:'var(--muted)',lineHeight:1.4}}>They can register with this email to join</div>) : null}
          </div>
        </div>
        {/* Edit email: placeholders only, as before — an account member's
        email is their account email, not a per-group field. */}
        {!detailMember.hasAccount && <>
          <label style={{display:'block',marginTop:16}}>Email</label>
          <input style={input} placeholder="Email" value={emailDraft} onChange={e=>setEmailDraft(e.target.value)} aria-label="Member email" />
          <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:0}}>Attach an email so they can register with it — signing up with this email sets up this same person, keeping their expenses.</p>
          {memberSheetError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{memberSheetError}</p>}
          <AsyncButton disabled={saveEmailDisabled} style={{...primary,width:'100%',padding:'14px',fontSize:16,opacity:saveEmailDisabled?0.5:1}} onClick={async()=>{setMemberSheetError(''); try{const d = await api(`/api/groups/${group.id}/members/${detailMember.id}`,'PATCH',{email:emailDraft.trim()}); setDetailMember(null); reload(d);}catch(er:any){setMemberSheetError(er.message);}}}>Save email</AsyncButton>
        </>}
        {/* Remove: per the hybrid rule (see GroupView helpers). Confirm
        button is labelled 'Remove', not the ConfirmSheet default
        'Delete' — the action is called Remove everywhere else here. */}
        {canRemoveMember(detailMember) && <div style={{marginTop:20}}>
          <AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={()=>{setDetailMember(null); setConfirm({title:'Remove member?',message:`Remove ${detailMember.name} from this group? This cannot be undone.`,confirmLabel:'Remove',onError:(msg:string)=>setMemberErrors(prev=>({...prev,[detailMember.id]:msg})),action:async()=>{const d = await api(`/api/groups/${group.id}/members/${detailMember.id}`,'DELETE'); reload(d);}});}}>Remove member</AsyncButton>
        </div>}
      </div>
    </div>)}
    {tab==='log' && <>
      {displayedActivity.length===0 && <p>No log entries yet.</p>}
      {/* LOG ROWS, 2026-11-06 (all four enhancements): Expenses-style rows —
      icon chip (live = dark teal, deleted = destructive red) + actor avatar
      (36px) or, for payments, the overlapping from→to avatar pair (28px,
      debtor first, as in Settle/Recorded payments) + text + amount in its
      own right-aligned tabular-nums column. The pair's fallback names come
      from the "X -> Y" detail string, so old rows (ids NULL) still show
      the right people; memberDotColor falls back to grey when an id is
      missing. Subline and title text unchanged. */}
      {displayedActivity.length>0 && <div style={balCard}>{displayedActivity.map((a:any,ai:number,arr:any[])=>{const d = new Date(a.created_at); const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB',{month:'short'})} · ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`; return (<div key={a.id} style={{...balRow,borderBottom:ai===arr.length-1?'none':balHairline}}>{logIcon(a.type)}<div style={{flex:1,minWidth:0,lineHeight:1.4}}><div style={{fontWeight:600}}>{activityTitle(a)}</div><div style={{fontSize:13,color:'var(--muted)'}}>{a.actorName || a.actor_name} · {dateStr}{a.detail?` · ${a.detail}`:''}</div></div>{a.amount_minor!=null && <div style={{textAlign:'right',flexShrink:0,lineHeight:1.4}}><strong style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{fmt(a.amount_minor,a.currency)}</strong></div>}</div>);})}</div>}
      {activityMore && <AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:4}} onClick={loadOlderActivity}>{activityLoading ? 'Loading…' : 'Load older entries'}</AsyncButton>}
      {!activityMore && displayedActivity.length>0 && <p style={{fontSize:13,color:'var(--muted)'}}>That's all the log for this group.</p>}
      {activityError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{activityError}</p>}
    </>}
    {detailExpense && <ExpenseDetailSheet group={group} expense={detailExpense} onClose={()=>setDetailExpense(null)} setConfirm={setConfirm} reload={reload} onEdit={()=>{setDetailExpense(null); setEditExpense(detailExpense);}} />}
    {showExpense && <ExpenseModal group={group} onClose={()=>setShowExpense(false)} reload={(d?:any)=>{setShowExpense(false); reload(d);}} />}
    {editExpense && <ExpenseModal group={group} expense={editExpense} onClose={()=>setEditExpense(null)} reload={(d?:any)=>{setEditExpense(null); reload(d);}} />}
    {settle && <SettleModal group={group} suggestion={settle} onClose={()=>setSettle(null)} reload={(d?:any)=>{setSettle(null); reload(d);}} setError={setError} />}
    {showSettings && <SettingsModal group={group} onClose={()=>setShowSettings(false)} reload={(d?:any)=>{setShowSettings(false); reload(d);}} back={back} />}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){if (confirm.onError) confirm.onError(er.message); else setError(er.message);}finally{setConfirm(null);}}} />}
  </div>);
}
function activityTitle(a:any) {
  const map: Record<string,string> = { expense_added:'Expense added', expense_edited:'Expense edited', expense_deleted:'Expense deleted', payment_recorded:'Payment recorded', payment_deleted:'Payment deleted' };
  return map[a.type] || a.type;
}
function AddMember({ groupId, reload }: any) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [addError, setAddError] = useState('');
  const drag = useSheetDrag(()=>setShow(false));
  return (<>
    <button style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{setName(''); setEmail(''); setAddError(''); setShow(true);}}>+ Add placeholder</button>
    {show && (<div role="dialog" aria-modal="true" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) setShow(false); }}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>Add placeholder</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setShow(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <label style={{display:'block',marginTop:16}}>Name</label>
        <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <label>Email (optional)</label>
        <input style={input} placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
        <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:0}}>For someone without an account — like an elderly relative. They'll use their own name when they register and join; email is optional, and can be added later.</p>
        {addError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{addError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setAddError(''); try{const d = await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); reload(d); setShow(false);}catch(e:any){setAddError(e.message);}}}>Add placeholder</AsyncButton>
      </div>
    </div>)}
  </>);
}

// INVITE LINK, Nov 2026: any member can generate the group's invite link
// (one active link per group, multi-use, no expiry, revocable). The sheet
// follows the Add member sheet (same grabber / backdrop / swipe / X) and
// the admin reset-link pattern (readonly input + Copy button + status).
// The link is built from the app's own origin, like the reset link.
// Revoke asks for confirmation (ConfirmSheet, like Remove) and leaves no
// link until a new one is generated.
function InviteMember({ groupId, setConfirm }: any) {
  const [show, setShow] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const drag = useSheetDrag(()=>setShow(false));
  const link = token ? `${window.location.origin}/?invite=${token}` : '';
  async function loadInvite() {
    setError('');
    try { const d = await api(`/api/groups/${groupId}/invite`); setToken(d.token); } catch(e:any){ setError(e.message); } finally { setLoaded(true); }
  }
  async function generate() {
    setError(''); setCopyStatus(''); setGenerating(true);
    try {
      const d = await api(`/api/groups/${groupId}/invite`, 'POST'); setToken(d.token);
      const l = `${window.location.origin}/?invite=${d.token}`;
      try { await navigator.clipboard.writeText(l); setCopyStatus('Copied to clipboard — share it with whoever you want to invite.'); }
      catch { setCopyStatus('Link created — tap Copy link to copy it.'); }
    } catch(e:any){ setError(e.message); } finally { setGenerating(false); }
  }
  async function copyLink() {
    setCopyStatus('');
    try { await navigator.clipboard.writeText(link); setCopyStatus('Copied to clipboard.'); }
    catch { setCopyStatus('Could not copy automatically — select the link above and copy it manually.'); }
  }
  function revoke() {
    // REVOKE + REGENERATE, 2026-11-06: revoking immediately generates a
    // fresh link and shows it (auto-copied, like Generate). The old link
    // stops working at once — so a leaked link can't be used to join —
    // and the member always has a valid link to share, with no extra
    // tap. Revoke stops NEW joins via the old link; it does not remove
    // anyone who already joined through it.
    setConfirm({ title: 'Revoke invite link?', message: 'The current link will stop working immediately. A new link will be generated and shown here, so you can share the fresh link.', confirmLabel: 'Revoke', onError: (msg: string) => setError(msg), action: async () => {
      await api(`/api/groups/${groupId}/invite`, 'DELETE');
      const d = await api(`/api/groups/${groupId}/invite`, 'POST'); setToken(d.token);
      const l = `${window.location.origin}/?invite=${d.token}`;
      try { await navigator.clipboard.writeText(l); setCopyStatus('Old link revoked. New link copied to clipboard — share it with whoever you want to invite.'); }
      catch { setCopyStatus('Old link revoked. A new link was generated — tap Copy link to copy it.'); }
    }});
  }
  return (<>
    <button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{ setError(''); setCopyStatus(''); setLoaded(false); setShow(true); loadInvite(); }}>Share invite link</button>
    {show && (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) setShow(false); }}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>Invite members</h2><button type="button" aria-label="Close" title="Close" onClick={()=>setShow(false)} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:12}}>Anyone with this link can join the group. It doesn't expire — revoke it any time to stop it working.</p>
        {error && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{error}</p>}
        {!loaded && <p style={{fontSize:13,color:'var(--muted)'}}>Loading…</p>}
        {loaded && token && <>
          <input readOnly style={input} value={link} onFocus={e=>e.target.select()} aria-label="Invite link" />
          <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={copyLink}><span style={{display:'inline-flex',alignItems:'center',gap:8}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy link</span></AsyncButton>
          {copyStatus && <p style={{fontSize:13,color:'var(--muted)',marginTop:8,marginBottom:0}}>{copyStatus}</p>}
          <div style={{marginTop:20}}><AsyncButton style={{...btn,width:'100%',padding:'14px',fontSize:16,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={revoke}>Revoke link</AsyncButton></div>
        </>}
        {loaded && !token && <>
          <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} disabled={generating} onClick={generate}>{generating ? 'Generating…' : 'Generate invite link'}</AsyncButton>
          {copyStatus && <p style={{fontSize:13,color:'var(--muted)',marginTop:8,marginBottom:0}}>{copyStatus}</p>}
        </>}
      </div>
    </div>)}
  </>);
}

// CURRENCY INFO, 2026-11-06: symbol + full name per code, for the
// currency picker sheet (searchable list). Symbols mirror ExpenseModal's
// old local sym() map; names are the standard currency names.
const CURRENCY_INFO: Record<string, {sym: string; name: string}> = {
  SGD: {sym: 'S$', name: 'Singapore Dollar'},
  USD: {sym: '$', name: 'US Dollar'},
  EUR: {sym: '€', name: 'Euro'},
  GBP: {sym: '£', name: 'British Pound'},
  AUD: {sym: 'A$', name: 'Australian Dollar'},
  CAD: {sym: 'C$', name: 'Canadian Dollar'},
  JPY: {sym: '¥', name: 'Japanese Yen'},
  KRW: {sym: '₩', name: 'South Korean Won'},
  VND: {sym: '₫', name: 'Vietnamese Dong'},
  HKD: {sym: 'HK$', name: 'Hong Kong Dollar'},
  TWD: {sym: 'NT$', name: 'New Taiwan Dollar'},
  CNY: {sym: '¥', name: 'Chinese Yuan'},
  INR: {sym: '₹', name: 'Indian Rupee'},
  MYR: {sym: 'RM', name: 'Malaysian Ringgit'},
  THB: {sym: '฿', name: 'Thai Baht'},
  IDR: {sym: 'Rp', name: 'Indonesian Rupiah'},
  PHP: {sym: '₱', name: 'Philippine Peso'},
  NZD: {sym: 'NZ$', name: 'New Zealand Dollar'},
  CHF: {sym: 'CHF', name: 'Swiss Franc'},
};
// Chevron for grouped-form rows (line SVG, not the text '›' — the old
// currency pill's text chevron was part of the amateur look). Rotates
// 90° when the row's inline editor is open (Split/Date).
function Chev({open}: any) {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,transition:'transform 0.2s ease-out',transform:open?'rotate(90deg)':undefined}}><polyline points="9 18 15 12 9 6" /></svg>);
}
// Teal checkmark for picker rows (selected option), matching the split
// editor's teal check language without the filled circle.
const pickCheck = (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12" /></svg>);
// Picker sheet shell, shared by the Currency/Category/Paid-by pickers:
// same grabber + backdrop-tap + swipe + X behaviour as every other sheet
// (useSheetDrag), zIndex 60 so it sits above the form sheet (zIndex 50).
function PickerSheet({ title, onClose, children }: any) {
  const drag = useSheetDrag(onClose);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:60,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>{title}</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      {children}
    </div>
  </div>);
}
function CurrencyPickerSheet({ current, onPick, onClose }: any) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const list = CURRENCIES.filter(c => !ql || c.toLowerCase().includes(ql) || (CURRENCY_INFO[c]?.name || '').toLowerCase().includes(ql) || (CURRENCY_INFO[c]?.sym || '').toLowerCase().includes(ql));
  return (<PickerSheet title="Currency" onClose={onClose}>
    <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--field)',borderRadius:10,padding:'10px 12px',margin:'12px 0 6px'}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:16,padding:0}} placeholder="Search currencies" value={q} onChange={e=>setQ(e.target.value)} aria-label="Search currencies" />
    </div>
    {list.length===0 && <p style={{fontSize:14,color:'var(--muted)',padding:'12px 0'}}>No currencies match "{q}".</p>}
    {list.map((c, i) => (<button key={c} type="button" onClick={()=>onPick(c)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:i===0?'none':balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
      <span style={{width:44,fontSize:15,fontWeight:600,color:'var(--muted)',flexShrink:0}}>{CURRENCY_INFO[c]?.sym || c}</span>
      <span style={{flex:1,minWidth:0,lineHeight:1.35}}><span style={{display:'block',fontWeight:600}}>{c}</span><span style={{display:'block',fontSize:13,color:'var(--muted)'}}>{CURRENCY_INFO[c]?.name || ''}</span></span>
      {c===current && pickCheck}
    </button>))}
  </PickerSheet>);
}
// FILTER COUNT, Nov 2026: muted right-aligned count in a picker row.
const pickCount: React.CSSProperties = { color:'var(--muted)', fontSize:13, fontVariantNumeric:'tabular-nums', flexShrink:0 };
function CategoryPickerSheet({ current, onPick, onClose, allowAll, counts, allCount }: any) {
  // FILTER, Nov 2026: allowAll adds an 'All categories' row at the top
  // (onPick(null)) so the expense filter can clear the category. The
  // Add expense form does not pass allowAll (or counts), so it is
  // unaffected. COUNTS, Nov 2026: when `counts` is passed (filter only),
  // each row shows a muted faceted count (see GroupView: it respects the
  // other active filters). The All row has a grid icon — it had none,
  // which read as a broken/missing icon.
  const rows: (string | null)[] = allowAll ? [null, ...CATEGORIES] : [...CATEGORIES];
  return (<PickerSheet title="Category" onClose={onClose}>
    <div style={{marginTop:6}}>{rows.map((c, i) => (<button key={c || '__all'} type="button" onClick={()=>onPick(c)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:i===0?'none':balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
      {c ? (<><span style={{width:36,height:36,borderRadius:10,background:EXP_CAT_COLORS[c] || 'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{catIcon(c)}</span><span style={{flex:1,minWidth:0,fontWeight:600}}>{c}</span>{counts && <span style={pickCount}>{counts[c] || 0}</span>}</>) : (<><span style={{width:36,height:36,borderRadius:10,background:'var(--field)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg></span><span style={{flex:1,minWidth:0,fontWeight:600}}>All categories</span>{counts && <span style={pickCount}>{allCount ?? 0}</span>}</>)}
      {c===current && pickCheck}
    </button>))}</div>
  </PickerSheet>);
}
function PayerPickerSheet({ group, current, onPick, onClose, allowAll, counts, allCount }: any) {
  // FILTER, Nov 2026: allowAll adds an 'All members' row at the top
  // (onPick(null)) so the expense filter can clear the payer. The Add
  // expense form does not pass allowAll (or counts), so it is unaffected.
  // COUNTS, Nov 2026: when `counts` is passed (filter only), each row
  // shows a muted faceted count (see GroupView). The All row has a users
  // icon — it had none, which read as a broken/missing icon.
  const rows: (any | null)[] = allowAll ? [null, ...(group.members || [])] : [...(group.members || [])];
  return (<PickerSheet title="Paid by" onClose={onClose}>
    <div style={{marginTop:6}}>{rows.map((m, i) => {
      if (m === null) {
        return (<button key="__all" type="button" onClick={()=>onPick(null)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:i===0?'none':balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
          <span style={{...avatar,width:36,height:36,fontSize:14,background:'var(--field)'}}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>
          <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>All members</span>
          {counts && <span style={pickCount}>{allCount ?? 0}</span>}
          {current===null && pickCheck}
        </button>);
      }
      const p = personDisplay(group, m.id, m.name);
      return (<button key={m.id} type="button" onClick={()=>onPick(m.id)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:i===0?'none':balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
        <span style={{...avatar,width:36,height:36,fontSize:14,background:memberDotColor(group,m.id)}}>{initials(m.name)}</span>
        <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.label}</span>
        {counts && <span style={pickCount}>{counts[m.id] || 0}</span>}
        {m.id===current && pickCheck}
      </button>);
    })}</div>
  </PickerSheet>);
}
function ExpenseModal({ group, expense, onClose, reload }: any) {
  // Add expense as a BOTTOM SHEET (revamp, dark only). REDESIGN 2026-11-06:
  // one grouped card with hairline rows (Description, Category, Currency,
  // Paid by, Split, Date) — a single field language, replacing the three
  // the old form mixed (bordered input, wrapping pills, big cards) and
  // the inline 19-currency pill grid with its redundant 'SGD ▾' text-
  // chevron pill. Currency/Category/Paid by open picker sheets (searchable
  // for currency); Split/Date expand their editors inline below their
  // row. Amount header, submit logic, split math and validation unchanged.
  // - amount header: fixed currency symbol prefix (not editable, symbol
  //   changes with currency) + numeric input only, select-all on focus.
  //   The input is sized to its content (ch) so the symbol + digits
  //   centre as one group (2026-11-06).
  const [modalError, setModalError] = useState('');
  // EDIT, Nov 2026: when `expense` is passed, every field pre-fills from
  // it. The original split mode is not stored on the expense row, so an
  // edit always starts as 'exact' with the stored per-person amounts —
  // the faithful reproduction of the split; switching to Equal/Percent
  // re-derives it. Any member may edit any expense (same rule as delete).
  const [description, setDescription] = useState(expense ? expense.description : ''); const [amount, setAmount] = useState(expense ? fromMinor(expense.amount_minor, expense.currency) : ''); const [currency, setCurrency] = useState(expense ? expense.currency : group.defaultCurrency);
  const [date, setDate] = useState(expense ? expense.date : todayIso()); const [payer, setPayer] = useState(expense ? expense.paid_by_member_id : (group.myMemberId || group.members[0]?.id || '')); const [category, setCategory] = useState(expense ? expense.category : 'Other');
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'>(expense ? 'exact' : 'equal');
  const [selected, setSelected] = useState<string[]>(expense ? expense.splits.map((s:any)=>s.member_id) : group.members.map((m:any)=>m.id));
  const [percents, setPercents] = useState<Record<string,string>>({}); const [exact, setExact] = useState<Record<string,string>>(expense ? Object.fromEntries(expense.splits.map((s:any)=>[s.member_id, fromMinor(s.amount_minor, expense.currency)])) : {});
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false); const [showCategoryPicker, setShowCategoryPicker] = useState(false); const [showPayerPicker, setShowPayerPicker] = useState(false); const [showSplit, setShowSplit] = useState(false); const [showDate, setShowDate] = useState(false);
  const toggle = (id:string)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const splitLabel = splitType==='equal' ? 'Equally' : splitType==='exact' ? 'Exact amounts' : 'Percentages';
  const sym = (cur:string) => CURRENCY_INFO[cur]?.sym || cur;
  const drag = useSheetDrag(onClose);
  const payerPerson = personDisplay(group, payer, group.members.find((m:any)=>m.id===payer)?.name);
  const rowBtn: React.CSSProperties = {display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:balHairline,padding:'13px 14px',color:'var(--text)',cursor:'pointer',textAlign:'left'};
  return (<>
    <div role="dialog" aria-modal="true" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
      <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'88vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
        <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><h2 style={{margin:0}}>{expense ? 'Edit expense' : 'Add expense'}</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'12px 0 4px'}}><span style={{fontSize:36,fontWeight:700,lineHeight:1}}>{sym(currency)}</span><input style={{width:`${Math.max((amount || '0.00').length, 1)}ch`,background:'transparent',border:'none',color:'var(--text)',fontSize:36,fontWeight:700,lineHeight:1,padding:0,textAlign:'center',outline:'none'}} inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} onFocus={e=>e.target.select()} aria-label="Amount" /></div>
        <div style={{...balCard,marginBottom:12}}>
          <label style={{display:'flex',alignItems:'center',gap:12,padding:'13px 14px'}}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Description</span><input style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:16,padding:0,textAlign:'right'}} placeholder="What was it for?" value={description} onChange={e=>setDescription(e.target.value)} aria-label="Description" /></label>
          <button type="button" onClick={()=>setShowCategoryPicker(true)} style={rowBtn}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Category</span><span style={{flex:1}} /><span style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:28,height:28,borderRadius:8,background:EXP_CAT_COLORS[category] || 'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{catIcon(category)}</span><span style={{fontSize:15}}>{category}</span></span><Chev /></button>
          <button type="button" onClick={()=>setShowCurrencyPicker(true)} style={rowBtn}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Currency</span><span style={{flex:1}} /><span style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:15}}>{currency}</span><span style={{fontSize:15,color:'var(--muted)'}}>· {CURRENCY_INFO[currency]?.name || ''}</span></span><Chev /></button>
          <button type="button" onClick={()=>setShowPayerPicker(true)} style={rowBtn}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Paid by</span><span style={{flex:1}} /><span style={{display:'flex',alignItems:'center',gap:8}}><span style={{...avatar,width:28,height:28,fontSize:12,background:memberDotColor(group,payer)}}>{initials(payerPerson.name)}</span><span style={{fontSize:15}}>{payerPerson.label}</span></span><Chev /></button>
          <button type="button" onClick={()=>setShowSplit(v=>!v)} style={rowBtn}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Split</span><span style={{flex:1}} /><span style={{fontSize:15}}>{splitLabel} · {selected.length} people</span><Chev open={showSplit} /></button>
          {showSplit && <div style={{borderTop:balHairline,padding:14}}>
            <select style={{...input,marginTop:0}} value={splitType} onChange={e=>setSplitType(e.target.value as any)}><option value="equal">Equal</option><option value="exact">Exact amounts</option><option value="percent">Percentages</option></select>
            {group.members.map((m:any,mi:number)=>{
              const isSel = selected.includes(m.id);
              return (<button key={m.id} type="button" onClick={()=>toggle(m.id)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:mi===0?'none':balHairline,padding:'12px 0',color:'var(--text)',cursor:'pointer',textAlign:'left'}}>
                <span style={{...avatar,width:36,height:36,fontSize:14,background:memberDotColor(group,m.id)}}>{initials(m.name)}</span>
                <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</span>
                {isSel && splitType==='percent' && <input style={{...input,width:80,margin:0,padding:'6px 8px',fontSize:16}} placeholder="%" value={percents[m.id]||''} onChange={e=>setPercents({...percents,[m.id]:e.target.value})} onClick={e=>e.stopPropagation()} aria-label={`Percent for ${m.name}`} />}
                {isSel && splitType==='exact' && <input style={{...input,width:100,margin:0,padding:'6px 8px',fontSize:16}} placeholder={currency} value={exact[m.id]||''} onChange={e=>setExact({...exact,[m.id]:e.target.value})} onClick={e=>e.stopPropagation()} aria-label={`Exact amount for ${m.name}`} />}
                <span aria-hidden="true" style={{width:24,height:24,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:isSel?'var(--accent)':'transparent',border:isSel?'none':'1px solid var(--check-border)'}}>{isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
              </button>);
            })}
          </div>}
          <button type="button" onClick={()=>setShowDate(v=>!v)} style={rowBtn}><span style={{fontSize:15,color:'var(--muted)',flexShrink:0}}>Date</span><span style={{flex:1}} /><span style={{fontSize:15}}>{date===todayIso() ? `Today · ${fmtDate(date)}` : fmtDate(date)}</span><Chev open={showDate} /></button>
          {showDate && <div style={{borderTop:balHairline,padding:14}}><DateField id="exp-date" value={date} onChange={setDate} autoOpen /></div>}
        </div>
        {expense && group.payments && group.payments.length > 0 && <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:12,marginBottom:0}}>People have already settled in this group — editing this expense will change balances.</p>}
        {modalError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{modalError}</p>}
        <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16, marginTop:8}} onClick={async()=>{
          setModalError('');
          const amountMinor = toMinor(amount, currency); if (amountMinor===null) { setModalError('Enter a valid positive amount'); return; }
          const body: any = { description, amountMinor, currency, date, paidByMemberId: payer, category, splitType, participants: selected };
          if (splitType==='percent') body.percents = selected.map(id=>Number(percents[id]||0));
          if (splitType==='exact') { const arr = selected.map(id=>toMinor(exact[id]||'', currency)); if (arr.some(v=>v===null)) { setModalError('Enter valid exact amounts'); return; } body.exactAmounts = arr; }
          try { const d = expense ? await api(`/api/groups/${group.id}/expenses/${expense.id}`,'PATCH',body) : await api(`/api/groups/${group.id}/expenses`,'POST',body); reload(d); } catch(e:any){ setModalError(e.message); }
        }}>Save</AsyncButton>
      </div>
    </div>
    {showCurrencyPicker && <CurrencyPickerSheet current={currency} onClose={()=>setShowCurrencyPicker(false)} onPick={(c:string)=>{setCurrency(c); setShowCurrencyPicker(false);}} />}
    {showCategoryPicker && <CategoryPickerSheet current={category} onClose={()=>setShowCategoryPicker(false)} onPick={(c:string)=>{setCategory(c); setShowCategoryPicker(false);}} />}
    {showPayerPicker && <PayerPickerSheet group={group} current={payer} onClose={()=>setShowPayerPicker(false)} onPick={(id:string)=>{setPayer(id); setShowPayerPicker(false);}} />}
  </>);
}
// Expense detail sheet (Chunk 2): the compact list row opens this bottom
// sheet, following the SettleModal/ConfirmSheet pattern. It is the only
// place Delete expense lives — the list card has no splits line and no
// Delete button. EDIT, Nov 2026: the Edit button lives here too — it
// opens ExpenseModal pre-filled (GroupView's editExpense state).
// HEADER, Nov 2026: title + amount share one baseline row
// (alignItems baseline — the amount used to sit low because it was
// centred in the 40px X-button group); the subline drops "Paid by"
// (the payer is marked by a "Payer" pill in the split rows) and the
// date is right-aligned.
// AMOUNT, Nov 2026: the amount sits on its own line below the title
// (left-aligned, 20px) instead of sharing the title row — a long title
// used to wrap against the amount + X and crowd the top-right.
// Delete here opens the Chunk 1 ConfirmSheet, so nothing
// is deleted directly from the sheet either; on a confirmed delete the
// detail sheet closes and the group reloads. Cancel on the confirm sheet
// leaves this sheet open (the GroupView confirm wrapper only clears the
// confirm state). The sheet scrolls internally so a 10-person split fits.
function ExpenseDetailSheet({ group, expense: e, onClose, setConfirm, reload, onEdit }: any) {
  // Chunk 4: a failed confirmed delete shows here, inside the sheet, and
  // the sheet stays open (the action throws before onClose(), so the
  // confirm wrapper's onError is what displays it — not the global error).
  const [sheetError, setSheetError] = useState('');
  const drag = useSheetDrag(onClose);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,maxHeight:'80vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><div style={{flex:1,minWidth:0}}><h2 style={{margin:0,marginBottom:4}}>{e.description}</h2><div style={{marginBottom:6}}><strong style={{fontSize:20}}>{e.display}</strong></div><div><span style={{fontSize:12,background:EXP_CAT_COLORS[e.category] || 'var(--muted)',color:CAT_GLYPH_VARS[e.category] || 'var(--text)',padding:'2px 6px',borderRadius:99}}>{e.category}</span></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,fontSize:13,color:'var(--muted)',marginTop:6}}><span style={{minWidth:0}}>Split between {e.splits.length} people</span><span style={{whiteSpace:'nowrap',flexShrink:0}}>{fmtDate(e.date)}</span></div></div><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <div style={{marginTop:12}}>{e.splits.map((s:any)=>{const member = group.members.find((x:any)=>x.id===s.member_id); const pd = personDisplay(group, s.member_id, member?.name); const isMine = group.myMemberId && s.member_id===group.myMemberId; return (<div key={s.member_id} style={{...rowCard,display:'flex',alignItems:'center',gap:12,background:isMine?'var(--tint-bg)':'var(--card)'}}>
        <div style={{...avatar,background:memberDotColor(group, pd.memberId)}}>{initials(pd.name)}</div>
        <div style={{flex:1,minWidth:0,fontWeight:600,lineHeight:1.4}}>{pd.label}{s.member_id===e.paid_by_member_id ? <span style={payerChip}>Payer</span> : null}{member && !member.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}</div>
        <strong style={{color:isMine?'var(--tint-text)':'var(--text)',whiteSpace:'nowrap',flexShrink:0}}>{fmt(s.amount_minor,e.currency)}</strong>
      </div>);})}</div>
      {sheetError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{sheetError}</p>}
      {!group.isArchived && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:12}} onClick={onEdit}>Edit expense</button>}
      {!group.isArchived && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:12,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={()=>setConfirm({title:'Delete expense?',message:`Delete '${e.description}' (${e.display})? This will also remove its splits. This cannot be undone.`,onError:(msg:string)=>setSheetError(msg),action:async()=>{const d = await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); onClose(); reload(d);}})}>Delete expense</button>}
    </div>
  </div>);
}
function SettleModal({ group, suggestion, onClose, reload, setError }: any) {
  const [amount, setAmount] = useState(fromMinor(suggestion.amountMinor, suggestion.currency));
  const [date, setDate] = useState(todayIso());
  const minor = toMinor(amount, suggestion.currency);
  const remaining = minor===null ? null : suggestion.amountMinor - minor;
  const drag = useSheetDrag(onClose);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,width:'100%',maxWidth:640,transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <h2 style={{marginTop:0,touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}>Settle</h2><p>{suggestion.fromName} → {suggestion.toName} · {suggestion.currency}</p>
      <p style={{color:'var(--muted)'}}>Recording a payment never moves real money — it just records that money changed hands.</p>
      <label>Amount ({suggestion.currency})</label><input style={input} value={amount} onChange={e=>setAmount(e.target.value)} />
      {remaining!==null && remaining>0 && <p style={{color:'var(--warn-text)'}}>Partial payment: {fmt(remaining, suggestion.currency)} will remain outstanding.</p>}
      {remaining!==null && remaining<0 && <p style={{color:'var(--danger-text)'}}>Amount exceeds the outstanding {fmt(suggestion.amountMinor, suggestion.currency)}.</p>}
      <label>Date</label><div style={{marginBottom:10}}><DateField id="pay-date" value={date} onChange={setDate} /></div>
      <AsyncButton style={primary} disabled={minor===null || minor<=0 || minor>suggestion.amountMinor} onClick={async()=>{try{const d = await api(`/api/groups/${group.id}/payments`,'POST',{fromMemberId:suggestion.fromMemberId,toMemberId:suggestion.toMemberId,amountMinor:minor,currency:suggestion.currency,date}); reload(d);}catch(e:any){setError(e.message);}}}>Settle</AsyncButton>{' '}<button style={btn} onClick={onClose}>Cancel</button>
    </div>
  </div>);
}
function SettingsModal({ group, onClose, reload, back }: any) {
  const [name, setName] = useState(group.name); const [cur, setCur] = useState(group.defaultCurrency);
  const hasExpense = !!group.myHasExpense;
  // LEAVE BLOCKERS, 2026-11-06: the server now blocks Leave on
  // payments and a non-zero balance too (not just expenses), because
  // deleting the member row fails on the payment foreign keys. The
  // frontend mirrors the guard so the button is greyed out with the
  // right reason before the tap, instead of a server error after it.
  // groupDetail already returns payments, balances and myMemberId.
  const hasPayment = (group.payments||[]).some((pp:any) => pp.from_member_id===group.myMemberId || pp.to_member_id===group.myMemberId);
  const hasNonZeroBalance = (group.balances||[]).some((bb:any) => bb.memberId===group.myMemberId && bb.balance!==0);
  const leaveBlocked = hasExpense || hasPayment || hasNonZeroBalance;
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
  if (group.isArchived) return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <p style={{fontSize:13,color:'var(--muted)'}}>This group is archived and read-only. Restore it to edit it again.</p>
      <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
      {settingsError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
    </div>
  </div>);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><button type="button" aria-label="Close" title="Close" onClick={onClose} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
      <label>Group name</label><input style={input} value={name} onChange={e=>setName(e.target.value)} />
      <label>Default currency</label><select style={input} value={cur} onChange={e=>setCur(e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <AsyncButton style={{...primary, width:'100%', padding:'14px', fontSize:16, opacity: dirty?1:0.5, cursor: dirty?'pointer':'not-allowed'}} disabled={!dirty} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}`,'PATCH',{name,defaultCurrency:cur}); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Save settings</AsyncButton>
        {group.isArchived
          ? <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
          : <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/archive`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Archive group</AsyncButton>}
      </div>
      {settingsError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
      <p style={{fontSize:13,color:'var(--muted)'}}>Archiving hides the group from the active list and preserves all expenses, payments, members and activity. It can be restored.</p>
      <div style={{marginTop:20}}>
        <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16, background:'var(--danger-bg)', borderColor:'var(--danger-bg)', color:'var(--danger-text)', opacity: leaveBlocked?0.5:1, cursor: leaveBlocked?'not-allowed':'pointer'}} disabled={leaveBlocked} aria-disabled={leaveBlocked} onClick={async()=>{setSettingsError(''); try{await api(`/api/groups/${group.id}/leave`,'POST'); back();}catch(e:any){ if (e.message === 'Not a group member') { back(); return; } setSettingsError(e.message);}}}>Leave group</AsyncButton>
        {hasExpense && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled. The server enforces the same rule.</p>}
        {!hasExpense && hasPayment && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because you have a payment in this group. Delete the recorded payment first, then leave. The server enforces the same rule.</p>}
        {!hasExpense && !hasPayment && hasNonZeroBalance && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because your balance in this group isn't zero. Settle it first, then leave. The server enforces the same rule.</p>}
        {!leaveBlocked && <p style={{fontSize:13,color:'var(--muted)'}}>You have no expenses, payments or outstanding balance in this group, so you can leave. If you are the last member, the group is deleted (it has nothing to preserve).</p>}
      </div>
    </div>
  </div>);
}
