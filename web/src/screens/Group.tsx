import { Estimate, RateLine } from '../components/Fx';
import { fmtEstimate, totalInHome, useFx } from '../fx';
import React, { useEffect, useRef, useState } from 'react';
import { CURRENCIES, api, fmt, fromMinor, toMinor } from '../api';
import { DateField, fmtDate, todayIso } from '../calendar';
import { ExpenseModal } from '../components/ExpenseSheet';
import { OnboardingPrompts } from '../components/Onboarding';
import { DailyBar, Pie } from '../pie';
import { AsyncButton, CAT_GLYPH_VARS, CategoryPickerSheet, Chev, CloseButton, ConfirmSheet, EXP_CAT_COLORS, PayerPickerSheet, PickerSheet, S, Sheet, Sk, avatar, balCard, balHairline, balRow, btn, card, catIcon, currencyChip, emptyBox, homeCard, iconBtn, initials, input, logIcon, memberDotColor, noAccountChip, payerChip, personDisplay, primary, rowCard, tabPill, tabPillActive, tabTrack, useSheetDrag } from '../ui';

// GroupSkeleton is ALL skeleton, no real buttons: the ← Groups button
// used to be a real, tappable button (so a user could cancel a pending
// group load), while Settings and everything else were grey blocks —
// which read as a half-loaded page, not a skeleton. Now the top row is
// two grey pills, matching the real top row's sizes, and Back works
// immediately after the group loads. Trade-off, stated plainly: you can
// no longer cancel a group load mid-flight from the skeleton; loads are
// normally <1s, so waiting for the real back button is the cheaper
// consistency cost.
export function GroupSkeleton() {
  return (<div style={S} aria-label="Loading group">
    <div style={{display:'flex',gap:8,alignItems:'center'}}><Sk w={140} h={38} r={999} /><Sk w={90} h={38} r={999} /></div>
    <div style={{marginTop:16}}><Sk w="60%" h={28} /></div>
    <div style={{marginTop:8}}><Sk w="45%" h={16} /></div>
    <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',margin:'16px 0 12px'}}>{[0,1,2,3].map(i => (<div key={i} style={{flex:1,padding:'10px 4px',display:'flex',justifyContent:'center'}}><Sk w={56} h={14} /></div>))}</div>
    {[0,1,2].map(i => (<div key={i} style={rowCard}><Sk w="70%" h={18} /><div style={{marginTop:8}}><Sk w="50%" h={14} /></div></div>))}
  </div>);
}

export function GroupView({ group, setGroup, tab, setTab, back, reload, error, setError, justJoined, onFeedback }: any) {
  const [showExpense, setShowExpense] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  // MEMBERS/LOG ARE SHEETS NOW, Nov 2026: they used to be tabs with a
  // Done button — the only way back, and the only menu items that
  // navigated away instead of opening over the group like Group
  // settings and Send feedback. Now they open as sheets (X, backdrop
  // tap, swipe) and the tabs are expenses/balances only.
  const [showMembers, setShowMembers] = useState(false);
  const [showLog, setShowLog] = useState(false);
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
  const [showInsights, setShowInsights] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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
  function changeTab(t: 'expenses'|'balances') { setTab(t); setError(''); setMemberErrors({}); setPaymentErrors({}); }
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
    // Hide the $0 members (24 Nov 2026): a member who paid nothing in
    // this currency renders as 'S$0.00 (0.0%)' with an empty bar — noise,
    // and in a big group it fills the list with dead rows. The all-zero
    // case is still covered: memberGrandTotal is 0, so the render falls
    // back to 'No spend in {cur} yet.'
    return rows.filter(r => r.total > 0);
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
  // Your position, shown above the tabs: non-zero balances and the
  // simplified debts that involve you.
  const myOpen = (group.balances || []).filter((b:any)=>b.memberId===group.myMemberId && b.balance!==0);
  const mySuggestions = (group.suggestions || []).filter((s:any)=>s.fromMemberId===group.myMemberId || s.toMemberId===group.myMemberId);
  // Insights line: total spent per currency, and the top category in the chart currency.
  const spentByCur = currencies.map((c:string)=>({ c, total: Object.values(group.categoryGroup?.[c] || {}).reduce((a:number,b:any)=>a+Number(b||0),0) })).filter((x:any)=>x.total>0);
  const topCat = (() => {
    const d: Record<string, number> = group.categoryGroup?.[cur] || {};
    const tot = Object.values(d).reduce((a,b)=>a+Number(b||0),0);
    let best: string | null = null;
    for (const k of Object.keys(d)) if (!best || d[k] > d[best]) best = k;
    return best && tot>0 ? { name: best, pct: Math.round(d[best]/tot*100) } : null;
  })();
  const fx = useFx();
  const spentHome = totalInHome(fx, spentByCur.map((x:any)=>({ minor: x.total, cur: x.c })));
  // Day groups for the expense list (expenses arrive sorted by date desc).
  const dayGroups: { date: string; items: any[]; totals: Record<string, number> }[] = [];
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
      <button type="button" aria-label="Back to groups" onClick={back} style={iconBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
      <button type="button" aria-label="Group menu" onClick={()=>setShowMenu(true)} style={iconBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button>
    </div>
    {justJoined && <OnboardingPrompts />}
    <h1 style={{marginBottom:2,marginTop:16}}>{group.name}</h1>
    {group.isArchived && <p style={{background:'var(--danger-bg)',padding:8,borderRadius:8}}>This group is archived. Restore it from the ⋯ menu or Settings → Archived groups to edit it again.</p>}
    {/* Sub-header as a metadata row, not a sentence (2026-11-05):
    left = default currency, right = member count, both muted 13px.
    No avatar stack (Wai's choice) and no currency pill — pills were
    just removed from Balances for the same repetition reason. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,color:'var(--muted)',fontSize:13,lineHeight:1.4,marginTop:0,marginBottom:16}}>
      <span style={{display:'flex',flexWrap:'wrap',alignItems:'center',columnGap:8}}><span>{group.members.length} {group.members.length===1?'member':'members'} · {group.defaultCurrency}</span><RateLine currencies={[group.defaultCurrency, ...currencies.filter((c:string)=>c!==group.defaultCurrency)]} /></span>
    </div>
    {error && <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:12}}><span style={{color:'var(--danger-text)'}}>{error}</span><button style={btn} onClick={()=>reload()}>Retry</button></div>}
    {group.expenses.length>0 && (<div style={{...homeCard,padding:18,marginBottom:16}}>
      {myOpen.length===0 ? (<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <span>All settled in this group</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--tint-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
      </div>) : (<>
        {myOpen.map((b:any)=>(<div key={b.currency} style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:6}}>
          <span style={{color:'var(--muted)'}}>{b.balance>0 ? "You're owed" : 'You owe'}</span>
          <span style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <strong style={{fontFamily:'var(--display)',fontSize:30,fontWeight:800,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',color:b.balance>0?'var(--tint-text)':'var(--danger-text)'}}>{fmt(Math.abs(b.balance), b.currency)}</strong>
            <Estimate minor={b.balance} cur={b.currency} suffix="at today’s rate" />
          </span>
        </div>))}
      </>)}
    </div>)}
    <div style={tabTrack}>
      {(['expenses','balances'] as const).map(t=>(<button key={t} onClick={()=>changeTab(t)} style={tab===t?tabPillActive:tabPill}>{t==='expenses'?'Expenses':'Balances'}</button>))}
    </div>
    {tab==='expenses' && <>
      {spentByCur.length>0 && <button type="button" aria-expanded={showInsights} onClick={()=>setShowInsights(v=>!v)} style={{...homeCard,width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,textAlign:'left',cursor:'pointer',padding:'14px 16px'}}>
        <span style={{minWidth:0}}><strong style={{fontVariantNumeric:'tabular-nums'}}>{spentByCur.map((x:any)=>fmt(x.total,x.c)).join(' + ')}</strong> <span style={{color:'var(--muted)'}}>spent{spentHome !== null ? ` · about ${fmtEstimate(fx.home as string, spentHome)} in total` : ''}{topCat ? ` · ${topCat.name} ${topCat.pct}%` : ''}</span></span>
        <span style={{display:'flex',alignItems:'center',gap:4,color:'var(--muted)',fontSize:13,flexShrink:0}}>Insights <Chev open={showInsights} /></span>
      </button>}
      {showInsights && <div style={card}><h3 style={{marginTop:0}}>{catView==='members' ? 'Paid by member' : 'Spend by category'}</h3>
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
          <div style={{display:'flex',background:'var(--field)',borderRadius:'var(--radius-pill)',padding:3,flexShrink:0}}>
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
              <div style={{height:6,borderRadius:'var(--radius-pill)',background:'var(--field)',marginTop:4,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:memberDotColor(group, r.memberId),borderRadius:'var(--radius-pill)'}} /></div>
            </div>);
          })}
        </div>)}
        {/* Chart explanation paragraph REMOVED 2026-11-05: it restated
        what was already visible (Group/Mine labels, dots, currency
        picker). Only the non-obvious Mine distinction is kept, shortened
        to one clause — Group needs no explanation at all. */}
        {catView==='mine' && <p style={{fontSize:12,color:'var(--muted)'}}>Mine = your shares only.</p>}
        {catView==='members' && <p style={{fontSize:12,color:'var(--muted)'}}>Members = total paid by each member (gross, not net balance).</p>}
      </div>}
      {group.expenses.length===0 && <div style={emptyBox}><div style={{fontWeight:600}}>No expenses yet</div>{!group.isArchived && <div style={{fontSize:14,color:'var(--muted)',marginTop:6}}>Tap Add expense to log the first one.</div>}</div>}
      {group.expenses.length>0 && (<div style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--card)',border:'var(--border-w) solid var(--muted)',borderRadius:'var(--radius-card)',minHeight:44,boxSizing:'border-box',padding:'0 12px'}}>
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
      {group.expenses.length>0 && filteredExpenses.length>0 && (() => {
        for (const e of filteredExpenses) {
          let g = dayGroups[dayGroups.length-1];
          if (!g || g.date!==e.date) { g = { date: e.date, items: [], totals: {} }; dayGroups.push(g); }
          g.items.push(e); g.totals[e.currency] = (g.totals[e.currency] || 0) + e.amount_minor;
        }
        return dayGroups.map((dg)=>(<div key={dg.date} style={{marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:13,fontWeight:600,color:'var(--muted)',padding:'4px 4px 8px'}}>
            <span>{dg.date===todayIso() ? 'Today' : fmtDate(dg.date)}</span>
            <span style={{fontVariantNumeric:'tabular-nums'}}>{Object.keys(dg.totals).map(c=>fmt(dg.totals[c],c)).join(' + ')}</span>
          </div>
          <div style={balCard}>{dg.items.map((e:any,ei:number,arr:any[])=>{
            const mySplit = group.myMemberId ? e.splits.find((x:any)=>x.member_id===group.myMemberId) : null;
            const iPaid = !!group.myMemberId && e.paid_by_member_id===group.myMemberId;
            const myShare = mySplit ? mySplit.amount_minor : 0;
            const lent = iPaid ? e.amount_minor - myShare : 0;
            const net = iPaid ? (lent>0 ? { label:'you lent', amt:fmt(lent,e.currency), color:'var(--tint-text)' } : { label:'just you', amt:e.display, color:'var(--muted)' })
              : mySplit ? { label:'you borrowed', amt:fmt(myShare,e.currency), color:'var(--danger-text)' }
              : { label:'not involved', amt:e.display, color:'var(--muted)' };
            return (<div key={e.id} style={{...balRow,cursor:'pointer',borderBottom:ei===arr.length-1?'none':balHairline}} onClick={()=>setDetailExpense(e)}>
              <span style={{width:40,height:40,borderRadius:12,background:EXP_CAT_COLORS[e.category] || 'var(--field)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{catIcon(e.category)}</span>
              <div style={{flex:1,minWidth:0,lineHeight:1.4}}><div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description}</div><div style={{fontSize:13,color:'var(--muted)'}}>{iPaid ? 'You' : e.payerName} paid {e.display}</div></div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0,lineHeight:1.4}}><div style={{fontSize:12,color:net.color}}>{net.label}</div><strong style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',color:net.color}}>{net.amt}</strong><Estimate minor={e.amount_minor} cur={e.currency} style={{fontSize:12}} /></div>
            </div>);
          })}</div>
        </div>));
      })()}
      {!showExpense && !group.isArchived && <button type="button" onClick={()=>setShowExpense(true)} style={{position:'fixed',zIndex:20,right:'max(16px, calc((100vw - 640px) / 2 + 16px))',bottom:'calc(20px + env(safe-area-inset-bottom, 0px))',height:56,padding:'0 22px 0 18px',borderRadius:'var(--radius-pill)',border:'none',background:'var(--text)',color:'var(--bg)',display:'flex',alignItems:'center',gap:8,fontWeight:700,fontSize:15,boxShadow:'0 8px 24px rgba(0,0,0,0.25)',cursor:'pointer'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add expense</button>}
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
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'8px 0 0'}}>Only the creditor can settle. If a Settle button is dark, you're the one who owes — the other person has to settle it. Edit the amount in the sheet to pay part of it.</p>
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
      <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,margin:'16px 0 0'}}>This only records the payment.</p>
      </>)}
    </>}
    {showMembers && (<Sheet title="Members" onClose={()=>setShowMembers(false)} maxHeight="88vh"><div style={{marginTop:16}}>
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
    </div></Sheet>)}
    {detailMember && (<Sheet title="Member" onClose={()=>setDetailMember(null)} maxHeight="88vh">
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
    </Sheet>)}
    {showLog && (<Sheet title="Log" onClose={()=>setShowLog(false)} maxHeight="88vh"><div style={{marginTop:16}}>
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
    </div></Sheet>)}
    {showMenu && <PickerSheet title={group.name} onClose={()=>setShowMenu(false)}>
      <div className="flat-list" style={{marginTop:12,background:'var(--field)',borderRadius:'var(--radius-card)',overflow:'hidden'}}>
        <button className="flat-row" onClick={()=>{setShowMenu(false); setShowMembers(true);}}><span>Members</span><span style={{color:'var(--muted)'}}>{group.members.length} ›</span></button>
        <button className="flat-row" onClick={()=>{setShowMenu(false); setShowLog(true);}}><span>Log</span><span style={{color:'var(--muted)'}}>›</span></button>
        <button className="flat-row" onClick={()=>{setShowMenu(false); setShowSettings(true);}}><span>Group settings</span><span style={{color:'var(--muted)'}}>›</span></button>
        <button className="flat-row" onClick={()=>{setShowMenu(false); onFeedback();}}><span>Send feedback</span><span style={{color:'var(--muted)'}}>›</span></button>
      </div>
    </PickerSheet>}
    {detailExpense && <ExpenseDetailSheet group={group} expense={detailExpense} onClose={()=>setDetailExpense(null)} setConfirm={setConfirm} reload={reload} onEdit={()=>{setDetailExpense(null); setEditExpense(detailExpense);}} />}
    {showExpense && <ExpenseModal group={group} onClose={()=>setShowExpense(false)} reload={(d?:any)=>{setShowExpense(false); reload(d);}} />}
    {editExpense && <ExpenseModal group={group} expense={editExpense} onClose={()=>setEditExpense(null)} reload={(d?:any)=>{setEditExpense(null); reload(d);}} />}
    {settle && <SettleModal group={group} suggestion={settle} onClose={()=>setSettle(null)} reload={(d?:any)=>{setSettle(null); reload(d);}} setError={setError} />}
    {showSettings && <SettingsModal group={group} onClose={()=>setShowSettings(false)} reload={(d?:any)=>{setShowSettings(false); reload(d);}} back={back} />}
    {confirm && <ConfirmSheet title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onCancel={()=>setConfirm(null)} onConfirm={async()=>{try{await confirm.action();}catch(er:any){if (confirm.onError) confirm.onError(er.message); else setError(er.message);}finally{setConfirm(null);}}} />}
  </div>);
}
export function activityTitle(a:any) {
  const map: Record<string,string> = { expense_added:'Expense added', expense_edited:'Expense edited', expense_deleted:'Expense deleted', payment_recorded:'Payment recorded', payment_deleted:'Payment deleted' };
  return map[a.type] || a.type;
}
export function AddMember({ groupId, reload }: any) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [addError, setAddError] = useState('');
  return (<>
    <button style={{...btn,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{setName(''); setEmail(''); setAddError(''); setShow(true);}}>+ Add placeholder</button>
    {show && (<Sheet title="Add placeholder" onClose={()=>setShow(false)} maxHeight="88vh">
        <label style={{display:'block',marginTop:16}}>Name</label>
        <input style={input} placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <label>Email (optional)</label>
        <input style={input} placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)} />
        <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.45,marginTop:0}}>For someone without an account — like an elderly relative. They'll use their own name when they register and join; email is optional, and can be added later.</p>
        {addError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:8,marginBottom:0}}>{addError}</p>}
        <AsyncButton style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={async()=>{setAddError(''); try{const d = await api(`/api/groups/${groupId}/members`,'POST',{name,email:email||null}); reload(d); setShow(false);}catch(e:any){setAddError(e.message);}}}>Add placeholder</AsyncButton>
    </Sheet>)}
  </>);
}

// INVITE LINK, Nov 2026: any member can generate the group's invite link
// (one active link per group, multi-use, no expiry, revocable). The sheet
// follows the Add member sheet (same grabber / backdrop / swipe / X) and
// the admin reset-link pattern (readonly input + Copy button + status).
// The link is built from the app's own origin, like the reset link.
// Revoke asks for confirmation (ConfirmSheet, like Remove) and leaves no
// link until a new one is generated.
export function InviteMember({ groupId, setConfirm }: any) {
  const [show, setShow] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [generating, setGenerating] = useState(false);
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
    setConfirm({ title: 'Revoke invite link?', message: 'The current link stops working right away. A new one appears here — share that instead.', confirmLabel: 'Revoke', onError: (msg: string) => setError(msg), action: async () => {
      await api(`/api/groups/${groupId}/invite`, 'DELETE');
      const d = await api(`/api/groups/${groupId}/invite`, 'POST'); setToken(d.token);
      const l = `${window.location.origin}/?invite=${d.token}`;
      try { await navigator.clipboard.writeText(l); setCopyStatus('Old link revoked. New link copied to clipboard — share it with whoever you want to invite.'); }
      catch { setCopyStatus('Old link revoked. A new link was generated — tap Copy link to copy it.'); }
    }});
  }
  return (<>
    <button style={{...primary,width:'100%',padding:'14px',fontSize:16}} onClick={()=>{ setError(''); setCopyStatus(''); setLoaded(false); setShow(true); loadInvite(); }}>Share invite link</button>
    {show && (<Sheet title="Invite members" onClose={()=>setShow(false)} maxHeight="88vh">
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
    </Sheet>)}
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
export function ExpenseDetailSheet({ group, expense: e, onClose, setConfirm, reload, onEdit }: any) {
  // Chunk 4: a failed confirmed delete shows here, inside the sheet, and
  // the sheet stays open (the action throws before onClose(), so the
  // confirm wrapper's onError is what displays it — not the global error).
  const [sheetError, setSheetError] = useState('');
  const drag = useSheetDrag(onClose);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
    <div style={{background:'var(--bg)',borderTop:'var(--outline-w) solid var(--border)',borderRadius:'22px 22px 0 0',padding:16,paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))',width:'100%',maxWidth:640,maxHeight:'80vh',overflowY:'auto',transform:drag.dragY?`translateY(${drag.dragY}px)`:undefined,transition:drag.dragging?'none':'transform 0.2s ease-out'}}>
      <div style={{width:36,height:4,borderRadius:'var(--radius-pill)',background:'var(--border)',margin:'0 auto 12px',touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown} />
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,touchAction:'none',cursor:'grab'}} onPointerDown={drag.onPointerDown}><div style={{flex:1,minWidth:0}}><h2 style={{margin:0,marginBottom:4}}>{e.description}</h2><div style={{marginBottom:6,display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}><strong style={{fontSize:20}}>{e.display}</strong><Estimate minor={e.amount_minor} cur={e.currency} style={{fontSize:14}} /></div><div><span style={{fontSize:12,background:EXP_CAT_COLORS[e.category] || 'var(--muted)',color:CAT_GLYPH_VARS[e.category] || 'var(--text)',padding:'2px 6px',borderRadius:'var(--radius-pill)'}}>{e.category}</span></div></div><CloseButton onClick={onClose} /></div>
      {/* 22 Nov 2026: this row used to live inside the header's flex:1 column, so the date right-aligned to the column edge — measured on Wai's screenshot it ended at device x 974, ~100px short of the sheet edge, while the payer card below reaches 1073. The day header's "Today ¥6,100" total, by contrast, is flush to its container edge. The row now sits outside the header so it spans the full sheet width. The v181 1px translateY nudge is reverted with it: the baselines were already aligned (both at device row 1567), the offset was horizontal, not vertical. */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,fontSize:13,color:'var(--muted)',marginTop:6}}><span style={{minWidth:0}}>Split between {e.splits.length} people</span><span style={{whiteSpace:'nowrap',flexShrink:0}}>{fmtDate(e.date)}</span></div>
      <div style={{marginTop:12}}>{e.splits.map((s:any)=>{const member = group.members.find((x:any)=>x.id===s.member_id); const pd = personDisplay(group, s.member_id, member?.name); const isMine = group.myMemberId && s.member_id===group.myMemberId; return (<div key={s.member_id} style={{...rowCard,display:'flex',alignItems:'center',gap:12,background:isMine?'var(--tint-bg)':'var(--card)'}}>
        <div style={{...avatar,background:memberDotColor(group, pd.memberId)}}>{initials(pd.name)}</div>
        <div style={{flex:1,minWidth:0,fontWeight:600,lineHeight:1.4}}>{pd.label}{s.member_id===e.paid_by_member_id ? <span style={payerChip}>Payer</span> : null}{member && !member.hasAccount ? <span style={noAccountChip}>No account yet</span> : null}</div>
        <span style={{display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0}}><strong style={{color:isMine?'var(--tint-text)':'var(--text)',whiteSpace:'nowrap'}}>{fmt(s.amount_minor,e.currency)}</strong>{isMine && <Estimate minor={s.amount_minor} cur={e.currency} style={{fontSize:12}} />}</span>
      </div>);})}</div>
      {sheetError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{sheetError}</p>}
      {!group.isArchived && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:12}} onClick={onEdit}>Edit expense</button>}
      {!group.isArchived && <button style={{...btn,width:'100%',padding:'14px',fontSize:16,marginTop:12,background:'var(--danger-bg)',borderColor:'var(--danger-bg)',color:'var(--danger-text)'}} onClick={()=>setConfirm({title:'Delete expense?',message:`Delete '${e.description}' (${e.display})? This will also remove its splits. This cannot be undone.`,onError:(msg:string)=>setSheetError(msg),action:async()=>{const d = await api(`/api/groups/${group.id}/expenses/${e.id}`,'DELETE'); onClose(); reload(d);}})}>Delete expense</button>}
    </div>
  </div>);
}
export function SettleModal({ group, suggestion, onClose, reload, setError }: any) {
  const [amount, setAmount] = useState(fromMinor(suggestion.amountMinor, suggestion.currency));
  const [date, setDate] = useState(todayIso());
  const minor = toMinor(amount, suggestion.currency);
  const remaining = minor===null ? null : suggestion.amountMinor - minor;
  return (<Sheet title="Settle" showClose={false} onClose={onClose}>
    <p>{suggestion.fromName} → {suggestion.toName} · {suggestion.currency}</p>
      <p style={{color:'var(--muted)'}}>This only records the payment.</p>
      <label>Amount ({suggestion.currency})</label><input style={input} value={amount} onChange={e=>setAmount(e.target.value)} />
      {remaining!==null && remaining>0 && <p style={{color:'var(--warn-text)'}}>Partial payment: {fmt(remaining, suggestion.currency)} will remain outstanding.</p>}
      {remaining!==null && remaining<0 && <p style={{color:'var(--danger-text)'}}>Amount exceeds the outstanding {fmt(suggestion.amountMinor, suggestion.currency)}.</p>}
      <label>Date</label><div style={{marginBottom:10}}><DateField id="pay-date" value={date} onChange={setDate} /></div>
      <div style={{display:'flex',gap:8}}><AsyncButton style={{...primary,flex:1}} disabled={minor===null || minor<=0 || minor>suggestion.amountMinor} onClick={async()=>{try{const d = await api(`/api/groups/${group.id}/payments`,'POST',{fromMemberId:suggestion.fromMemberId,toMemberId:suggestion.toMemberId,amountMinor:minor,currency:suggestion.currency,date}); reload(d);}catch(e:any){setError(e.message);}}}>Settle</AsyncButton><button style={{...btn,flex:1}} onClick={onClose}>Cancel</button></div>
  </Sheet>);
}
export function SettingsModal({ group, onClose, reload, back }: any) {
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
    <div style={{maxWidth:640,margin:'0 auto',padding:16,paddingTop:'calc(16px + env(safe-area-inset-top, 0px))',paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><CloseButton onClick={onClose} /></div>
      <p style={{fontSize:13,color:'var(--muted)'}}>This group is archived and read-only. Restore it to edit it again.</p>
      <AsyncButton style={{...btn, width:'100%', padding:'14px', fontSize:16}} onClick={async()=>{setSettingsError(''); try{const d = await api(`/api/groups/${group.id}/restore`,'POST'); reload(d);}catch(e:any){setSettingsError(e.message);}}}>Restore group</AsyncButton>
      {settingsError && <p style={{color:'var(--danger-text)',fontSize:13,lineHeight:1.4,marginTop:12,marginBottom:0}}>{settingsError}</p>}
    </div>
  </div>);
  return (<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:50,overflowY:'auto'}}>
    <div style={{maxWidth:640,margin:'0 auto',padding:16,paddingTop:'calc(16px + env(safe-area-inset-top, 0px))',paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2>Group settings</h2><CloseButton onClick={onClose} /></div>
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
        {hasExpense && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because you have an expense in this group, as payer or as a split participant — even if balances are settled.</p>}
        {!hasExpense && hasPayment && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because you have a payment in this group. Delete the recorded payment first, then leave.</p>}
        {!hasExpense && !hasPayment && hasNonZeroBalance && <p style={{fontSize:13,color:'var(--muted)'}}>Leave is greyed out because your balance in this group isn't zero. Settle it first, then leave.</p>}
        {!leaveBlocked && <p style={{fontSize:13,color:'var(--muted)'}}>You have no expenses, payments or outstanding balance in this group, so you can leave. If you are the last member, the group is deleted (it has nothing to preserve).</p>}
      </div>
    </div>
  </div>);
}
