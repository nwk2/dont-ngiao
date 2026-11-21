import React, { useEffect, useRef, useState } from 'react';
import { CATEGORIES, CURRENCIES } from './api';

export const S = { maxWidth: 640, margin: '0 auto', padding: '16px', paddingBottom: 90 } as const; // DESKTOP CAP, Nov 2026: maxW was a typo (not a real CSS property), so the 640px cap never applied and the main content stretched full-width on desktop. maxWidth makes every view using S a centred 640px column on wide screens, matching the sheets (which already cap at 640) — on a phone (<640px) it is full-width as before.
export const card: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--hairline)', borderRadius:16, padding:14, marginBottom:12, color:'var(--text)', lineHeight:1.45 };
export const rowCard: React.CSSProperties = { ...card, padding:'12px 14px', lineHeight:1.4 };
// BALANCES REVAMP 2026-11-05 (dark only, restyle only): rows inside one
// borderless card (radius 20, no var(--hairline) border) with hairline dividers,
// matching the approved prototype Balances look. Shared card/rowCard are
// untouched, so Expenses/Members/Activity keep their current cards.
// Logic below is unchanged: net-only Your position, per-member Paid/share,
// creditor-only Settle (with placeholder-debtor exception), debtor-or-
// creditor-only payment deletion.
export const balCard: React.CSSProperties = { background:'var(--card)', borderRadius:20, padding:'6px 0', marginBottom:12, color:'var(--text)', lineHeight:1.45 };
export const balRow: React.CSSProperties = { display:'flex', alignItems:'center', gap:12, padding:'12px 14px' };
export const balHairline = '1px solid var(--hairline)';
// HOME + TABS REVAMP 2026-11-05 (dark only, restyle only): borderless
// radius-20 cards (same language as balCard) for Home group cards, and a
// segmented pill track for group tabs, matching the approved prototype.
// Shared card/rowCard untouched, so Expenses/Members/Activity rows keep
// their current cards until their own chunks. Logic unchanged everywhere:
// Home group list, archived Restore/Open, account menu, Edit name,
// group header, changeTab behaviour, tab keys.
// Chip backgrounds (soft tints). The charts in pie.tsx use the stronger --cat-x colours.
export const EXP_CAT_COLORS: Record<string,string> = { 'Food & Drink':'var(--cat-food-bg)', 'Transport':'var(--cat-transport-bg)', 'Accommodation':'var(--cat-accommodation-bg)', 'Activities':'var(--cat-activities-bg)', 'Shopping':'var(--cat-shopping-bg)', 'Other':'var(--cat-other-bg)' };
// Category glyph colours: white in dark, a darker shade of the
// category colour in light (white on the light pastels is unreadable).
export const CAT_GLYPH_VARS: Record<string,string> = { 'Food & Drink':'var(--cat-food-glyph)', 'Transport':'var(--cat-transport-glyph)', 'Accommodation':'var(--cat-accommodation-glyph)', 'Activities':'var(--cat-activities-glyph)', 'Shopping':'var(--cat-shopping-glyph)', 'Other':'var(--cat-other-glyph)' };
export function catIcon(cat: string) {
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
export function logIcon(type: string) {
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
export const homeCard: React.CSSProperties = { background:'var(--card)', borderRadius:20, padding:16, marginBottom:12, color:'var(--text)', lineHeight:1.45 };
export const tabTrack: React.CSSProperties = { display:'flex', gap:0, background:'var(--field)', borderRadius:999, padding:3, marginBottom:16 };
export const tabPill: React.CSSProperties = { flex:1, padding:'10px 4px', fontSize:14, color:'var(--muted)', background:'transparent', border:'none', borderRadius:999, fontWeight:400, cursor:'pointer' };
export const tabPillActive: React.CSSProperties = { ...tabPill, color:'var(--text)', background:'var(--pill-active)', fontWeight:600 };
export const avatar: React.CSSProperties = { width:40, height:40, borderRadius:'50%', background:'var(--avatar-green)', color:'var(--on-avatar)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 };
export const noAccountChip: React.CSSProperties = { fontSize:11, background:'var(--warn-bg)', color:'var(--warn-text)', padding:'2px 8px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
// PAYER PILL, Nov 2026: marks the payer in the expense detail split rows
// (the "Paid by" subline was dropped — the pill is now the payer
// indicator). Bordered teal so it reads on both the card background and
// the tinted "You" row; labelled "Payer" (not "Paid") so it is not
// confused with settling.
export const payerChip: React.CSSProperties = { fontSize:11, background:'transparent', border:'1px solid var(--tint-text)', color:'var(--tint-text)', padding:'1px 7px', borderRadius:99, fontWeight:600, whiteSpace:'nowrap', marginLeft:8, verticalAlign:'middle' };
export const currencyChip: React.CSSProperties = { fontSize:12, background:'var(--tint-bg)', padding:'3px 10px', borderRadius:99, color:'var(--tint-text)', fontWeight:600, whiteSpace:'nowrap' };
export const btn: React.CSSProperties = { padding:'9px 14px', borderRadius:999, border:'1px solid var(--border)', background:'var(--field)', color:'var(--text)' };
export const primary: React.CSSProperties = { ...btn, background:'var(--accent)', color:'var(--accent-text)', borderColor:'var(--accent)', fontWeight:600 };
// Chunk 9: one shared compact style for the Spend by category controls, so
// Group, Mine, and the currency select look like a set. Compact (down from
// the inherited ~16px button size), explicit height so the native select
// matches the buttons. Other buttons in the app keep btn/primary untouched.
export const catControl: React.CSSProperties = { padding:'8px 14px', fontSize:14, lineHeight:1.4, height:36, boxSizing:'border-box', borderRadius:10, border:'1px solid var(--border)', background:'var(--field)', color:'var(--text)' };
export const catControlActive: React.CSSProperties = { ...catControl, background:'var(--accent)', color:'var(--accent-text)', borderColor:'var(--accent)', fontWeight:600 };
export const input: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'10px', border:'1px solid var(--border)', borderRadius:10, margin:'4px 0 10px', background:'var(--field)', color:'var(--text)', fontSize:16 };
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
export type AsyncButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'> & {
  onClick: () => Promise<unknown> | void;
  disabled?: boolean;
};
export function AsyncButton({ onClick, children, style, disabled, ...rest }: AsyncButtonProps) {
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
export function useSheetDrag(onClose: () => void) {
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
// Bottom sheet: backdrop, drag-to-dismiss grabber, title row with a close
// button. Every sheet in the app goes through this so they look and behave
// the same; full-screen Group settings and the expense detail header are the
// two deliberate exceptions.
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (<button type="button" aria-label="Close" title="Close" onClick={onClick} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>);
}
export type SheetProps = { title?: React.ReactNode; onClose: () => void; children?: React.ReactNode; showClose?: boolean; draggable?: boolean; closeOnBackdrop?: boolean; maxHeight?: string; zIndex?: number };
export function Sheet({ title, onClose, children, showClose = true, draggable = true, closeOnBackdrop = true, maxHeight, zIndex = 50 }: SheetProps) {
  const drag = useSheetDrag(onClose);
  const grab = draggable ? { touchAction: 'none' as const, cursor: 'grab' } : {};
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={closeOnBackdrop ? (e)=>{ if (e.target===e.currentTarget) onClose(); } : undefined}>
    <div style={{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:16,paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))',width:'100%',maxWidth:640,...(maxHeight ? {maxHeight,overflowY:'auto' as const} : {}),...(draggable ? {transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'} : {})}}>
      {draggable && <div style={{width:36,height:4,borderRadius:99,background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />}
      {title !== undefined && <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,...grab}} onPointerDown={draggable ? drag.onPointerDown : undefined}><h2 style={{margin:0}}>{title}</h2>{showClose && <CloseButton onClick={onClose} />}</div>}
      {children}
    </div>
  </div>);
}
export function ConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel }: any) {
  return (<Sheet title={title} showClose={false} onClose={onCancel}>
      <p style={{color:'var(--muted)',lineHeight:1.45}}>{message}</p>
      <div style={{display:'flex',gap:8}}>
        <AsyncButton style={{...btn,background:'var(--danger-bg)',color:'var(--danger-text)',borderColor:'var(--danger-bg)',fontWeight:600}} onClick={onConfirm}>{confirmLabel || 'Delete'}</AsyncButton>
        <button style={btn} onClick={onCancel}>Cancel</button>
      </div>
  </Sheet>);
}
// Theme pill (shared, 2026-11-06 L3): the sun/moon segmented toggle,
// used in the Home header, the You screen Appearance row, and the group
// header. Tapping it flips dark <-> light and persists the choice
// (THEME_KEY). The highlighted side follows the active theme. A third
// scheme later becomes a third segment here (and one more theme key).
export function ThemePill({ theme, setTheme }: any) {
  const seg = (active: boolean) => ({flex:1,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:999,background:active?'var(--pill-active)':'transparent',color:active?'var(--text)':'var(--muted)'} as React.CSSProperties);
  return (<button type="button" aria-label="Colour scheme" title="Switch colour scheme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} style={{width:88,height:40,borderRadius:999,border:'1px solid var(--border)',background:'var(--field)',padding:3,boxSizing:'border-box',display:'flex',alignItems:'stretch',cursor:'pointer',flexShrink:0}}>
    <span aria-hidden="true" style={seg(theme==='light')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></span>
    <span aria-hidden="true" style={seg(theme==='dark')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg></span>
  </button>);
}
// FEEDBACK ENTRY, Nov 2026: the 40px circle icon button that opens
// the feedback sheet from the Home and GroupView headers, immediately
// left of the ThemePill. Icon is Feather message-square-text (square
// bubble with two lines). Neutral grey like the gear button — NOT
// accent blue (blue was tried in the mockup and dropped: too loud for
// the least-used feature). Same shape as the GroupView gear button.
export function FeedbackIconButton({ onClick }: any) {
  return (<button type="button" aria-label="Send feedback" title="Send feedback" onClick={onClick} style={{width:40,height:40,borderRadius:'50%',border:'1px solid var(--border)',background:'var(--field)',color:'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',flexShrink:0}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M13 8H7" /><path d="M17 12H7" /></svg></button>);
}

// Skeleton screens: grey blocks in the exact shape of the content that is
// loading, with a pulse animation (see .skeleton-pulse in index.html).
// No spinner, no "Loading..." text — the layout itself is the feedback,
// and because the blocks match the real layout, there is no layout shift
// when real data replaces them. Used only for first loads (auth check,
// groups list, first group tap); never for tab switches (data already
// loaded) or post-action reloads (stale content + button loader instead).
export function Sk({ w, h, r }: { w: string | number; h: number; r?: number }) {
  return <div className="skeleton-pulse" style={{width:w,height:h,borderRadius:r ?? 8,background:'var(--subtle-bg)',flexShrink:0}} />;
}

// Group tile: the first emoji in the name (e.g. "KL 2026 🍗"), else its first letter.
export function groupMark(name: string): { mark: string; isEmoji: boolean } {
  const m = (name || '').match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/u);
  if (m) return { mark: m[0], isEmoji: true };
  const letter = (name || '?').replace(/[^\p{L}\p{N}]/gu, '').charAt(0) || '?';
  return { mark: letter.toUpperCase(), isEmoji: false };
}
export function initials(name: string) {
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
export const MEMBER_DOT_COLORS = ['var(--dot-0)','var(--dot-1)','var(--dot-2)','var(--dot-3)','var(--dot-4)','var(--dot-5)','var(--dot-6)','var(--dot-7)'];
export function memberDotColor(group: any, memberId: string | null | undefined) {
  if (!memberId) return 'var(--muted)';
  // You are always --avatar-green, matching your avatar on Home and You.
  // Other members keep their sequential palette colour.
  if (group.myMemberId && memberId===group.myMemberId) return 'var(--avatar-green)';
  const idx = (group.members || []).findIndex((x:any)=>x.id===memberId);
  if (idx < 0) return 'var(--muted)';
  return MEMBER_DOT_COLORS[idx % MEMBER_DOT_COLORS.length];
}
export function personDisplay(group: any, memberId: string | null | undefined, fallbackName: string | null | undefined) {
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
export function groupBalancesByVerb(items: any[]) {
  const verb = (b: number) => b > 0 ? 'You are owed' : b < 0 ? 'You owe' : 'Settled';
  const groups: { verb: string; items: any[] }[] = [];
  for (const v of ['You are owed', 'You owe', 'Settled']) {
    const its = items.filter((t: any) => verb(t.balance) === v);
    if (its.length) groups.push({ verb: v, items: its });
  }
  return groups;
}

// CURRENCY INFO, 2026-11-06: symbol + full name per code, for the
// currency picker sheet (searchable list). Symbols mirror ExpenseModal's
// old local sym() map; names are the standard currency names.
export const CURRENCY_INFO: Record<string, {sym: string; name: string}> = {
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
export function Chev({open}: any) {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,transition:'transform 0.2s ease-out',transform:open?'rotate(90deg)':undefined}}><polyline points="9 18 15 12 9 6" /></svg>);
}
// Teal checkmark for picker rows (selected option), matching the split
// editor's teal check language without the filled circle.
export const pickCheck = (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12" /></svg>);
// Picker sheet shell, shared by the Currency/Category/Paid-by pickers:
// same grabber + backdrop-tap + swipe + X behaviour as every other sheet
// (useSheetDrag), zIndex 60 so it sits above the form sheet (zIndex 50).
export function PickerSheet({ title, onClose, children }: any) {
  return (<Sheet title={title} onClose={onClose} maxHeight="88vh" zIndex={60}>
      {children}
  </Sheet>);
}
export function CurrencyPickerSheet({ current, onPick, onClose }: any) {
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
export const pickCount: React.CSSProperties = { color:'var(--muted)', fontSize:13, fontVariantNumeric:'tabular-nums', flexShrink:0 };
export function CategoryPickerSheet({ current, onPick, onClose, allowAll, counts, allCount }: any) {
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
export function PayerPickerSheet({ group, current, onPick, onClose, allowAll, counts, allCount }: any) {
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
