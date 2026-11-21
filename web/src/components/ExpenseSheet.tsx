import React, { useState } from 'react';
import { api, fromMinor, toMinor } from '../api';
import { DateField, fmtDate, todayIso } from '../calendar';
import { AsyncButton, CURRENCY_INFO, CategoryPickerSheet, Chev, CurrencyPickerSheet, EXP_CAT_COLORS, PayerPickerSheet, Sheet, avatar, balCard, balHairline, catIcon, initials, input, memberDotColor, personDisplay, primary } from '../ui';

// New expenses start on the category most recently entered in this group
// (by created_at, not expense date), falling back to Other.
export function lastCategory(group: any): string {
  let best: any = null;
  for (const e of group.expenses || []) if (!best || String(e.created_at) > String(best.created_at)) best = e;
  return best?.category || 'Other';
}
export function ExpenseModal({ group, expense, onClose, reload }: any) {
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
  const [date, setDate] = useState(expense ? expense.date : todayIso()); const [payer, setPayer] = useState(expense ? expense.paid_by_member_id : (group.myMemberId || group.members[0]?.id || '')); const [category, setCategory] = useState(expense ? expense.category : lastCategory(group));
  const [splitType, setSplitType] = useState<'equal'|'exact'|'percent'>(expense ? 'exact' : 'equal');
  const [selected, setSelected] = useState<string[]>(expense ? expense.splits.map((s:any)=>s.member_id) : group.members.map((m:any)=>m.id));
  const [percents, setPercents] = useState<Record<string,string>>({}); const [exact, setExact] = useState<Record<string,string>>(expense ? Object.fromEntries(expense.splits.map((s:any)=>[s.member_id, fromMinor(s.amount_minor, expense.currency)])) : {});
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false); const [showCategoryPicker, setShowCategoryPicker] = useState(false); const [showPayerPicker, setShowPayerPicker] = useState(false); const [showSplit, setShowSplit] = useState(false); const [showDate, setShowDate] = useState(false);
  const toggle = (id:string)=> setSelected(s=> s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const splitLabel = splitType==='equal' ? 'Equally' : splitType==='exact' ? 'Exact amounts' : 'Percentages';
  // RESCALE, Nov 2026: in 'exact' mode the per-person amounts are frozen
  // at the values they had when the split was set, so changing the total
  // used to break the sum (116.50 + 116.50 != 1.00) and the server
  // rejected the save with 'Exact amounts must cover all participants
  // and sum to the total'. Now, when the total changes, the exact
  // amounts re-scale proportionally to the new total — the ratio is
  // preserved, an equal split stays equal, and the rounding remainder
  // goes to the payer (same rule as equalSplit). The base is the SUM of
  // the current exact amounts, not the previous total, so it still works
  // when the user clears the field first (select-all + delete leaves the
  // amount temporarily empty/invalid — the exact amounts still encode
  // the old total via their sum). Skips when the new total is invalid,
  // when any selected participant lacks a valid exact amount, or when
  // the old sum is zero. Only applies in 'exact' mode — 'equal' and
  // 'percent' already re-derive from the total at save time.
  const rescaleExact = (newAmountStr: string) => {
    if (splitType !== 'exact') return;
    const newTotal = toMinor(newAmountStr, currency);
    if (newTotal === null) return;
    const ids = selected;
    const oldMinors = ids.map(id => toMinor(exact[id] || '', currency));
    if (oldMinors.some(v => v === null)) return;
    const oldSum = (oldMinors as number[]).reduce((a, b) => a + b, 0);
    if (oldSum <= 0) return;
    const scaled = (oldMinors as number[]).map(v => Math.round(v * newTotal / oldSum));
    const diff = newTotal - scaled.reduce((a, b) => a + b, 0);
    const adjustIdx = ids.indexOf(payer) >= 0 ? ids.indexOf(payer) : 0;
    scaled[adjustIdx] += diff;
    const next: Record<string, string> = { ...exact };
    ids.forEach((id, i) => { next[id] = fromMinor(scaled[i], currency); });
    setExact(next);
  };
  const sym = (cur:string) => CURRENCY_INFO[cur]?.sym || cur;
  const payerPerson = personDisplay(group, payer, group.members.find((m:any)=>m.id===payer)?.name);
  const rowBtn: React.CSSProperties = {display:'flex',alignItems:'center',gap:12,width:'100%',background:'transparent',border:'none',borderTop:balHairline,padding:'13px 14px',color:'var(--text)',cursor:'pointer',textAlign:'left'};
  return (<>
    <Sheet title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose} maxHeight="88vh">
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'12px 0 4px'}}><span style={{fontSize:36,fontWeight:700,lineHeight:1}}>{sym(currency)}</span><input style={{width:`${Math.max((amount || '0.00').length, 1)}ch`,background:'transparent',border:'none',color:'var(--text)',fontSize:36,fontWeight:700,lineHeight:1,padding:0,textAlign:'center',outline:'none'}} inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>{ setAmount(e.target.value); rescaleExact(e.target.value); }} onFocus={e=>e.target.select()} aria-label="Amount" /></div>
        <div style={{...balCard,marginBottom:12}}>
          <label style={{display:'block',padding:'10px 14px 12px'}}><span style={{display:'block',fontSize:13,color:'var(--muted)',marginBottom:6}}>Description</span><input style={{width:'100%',boxSizing:'border-box',background:'var(--field)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text)',fontSize:16,padding:'11px 12px'}} placeholder="What was it for?" value={description} onChange={e=>setDescription(e.target.value)} aria-label="Description" /></label>
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
    </Sheet>
    {showCurrencyPicker && <CurrencyPickerSheet current={currency} onClose={()=>setShowCurrencyPicker(false)} onPick={(c:string)=>{setCurrency(c); setShowCurrencyPicker(false);}} />}
    {showCategoryPicker && <CategoryPickerSheet current={category} onClose={()=>setShowCategoryPicker(false)} onPick={(c:string)=>{setCategory(c); setShowCategoryPicker(false);}} />}
    {showPayerPicker && <PayerPickerSheet group={group} current={payer} onClose={()=>setShowPayerPicker(false)} onPick={(id:string)=>{setPayer(id); setShowPayerPicker(false);}} />}
  </>);
}
