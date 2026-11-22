import React, { useState } from 'react';
import { CURRENCIES, toMinor } from '../api';
import { closeRateSheet, estimate, fmtEstimate, guessHomeCurrency, openRateSheet, toHome, unitRate, useFx } from '../fx';
import { CURRENCY_INFO, S, Sheet, input, pickCheck, primary } from '../ui';

const infoIcon = (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>);

/** A muted "≈ S$36" that opens today's rate. Renders nothing when there's no estimate. */
export function Estimate({ minor, cur, style, suffix }: { minor: number; cur: string; style?: React.CSSProperties; suffix?: string }) {
  const fx = useFx();
  const text = estimate(fx, Math.abs(minor), cur);
  if (!text) return null;
  return (<button type="button" onClick={(e)=>{ e.stopPropagation(); openRateSheet([cur]); }} aria-label={`${text}${suffix ? ' ' + suffix : ''}. Show today's rate`}
    style={{background:'transparent',border:0,padding:0,font:'inherit',fontSize:13,fontWeight:400,color:'var(--muted)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4,fontVariantNumeric:'tabular-nums',...style}}>
    {text}{suffix ? ` ${suffix}` : ''}
  </button>);
}

/** "1 MYR ≈ S$0.30 ⓘ" for a group header; nothing when the group is all in your home currency. */
export function RateLine({ currencies }: { currencies: string[] }) {
  const fx = useFx();
  const foreign = currencies.filter(c => c !== fx.home);
  const line = foreign.length ? unitRate(fx, foreign[0]) : null;
  if (!line) return null;
  return (<button type="button" onClick={()=>openRateSheet(foreign)} aria-label={`${line}. Show today's rates`}
    style={{background:'transparent',border:0,padding:0,font:'inherit',fontSize:14,color:'var(--muted)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}>
    {line}{foreign.length > 1 ? ` +${foreign.length - 1}` : ''} {infoIcon}
  </button>);
}

const when = (fx: { date: string | null; fetchedAt: number | null }) => {
  const t = fx.fetchedAt ? new Date(fx.fetchedAt) : fx.date ? new Date(fx.date) : null;
  if (!t || isNaN(t.getTime())) return '';
  return `${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${t.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`;
};

/** Today's rates for the currencies in view, with a small converter. Mounted once in App. */
export function RateSheet() {
  const fx = useFx();
  const [cur, setCur] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  if (!fx.sheet || !fx.home) return null;
  const list = fx.sheet.filter(c => c !== fx.home);
  const active = cur && list.includes(cur) ? cur : list[0];
  const minor = active ? toMinor(amount, active) : null;
  const converted = active && minor ? toHome(fx, minor, active) : null;
  const home = fx.home;
  return (<Sheet title="Today’s rates" onClose={()=>{ closeRateSheet(); setAmount(''); setCur(null); }}>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:12}}>
      {list.map(c => {
        const r = fx.rates[c];
        return (<div key={c} style={{background:'var(--card)',border:'var(--border-w) solid var(--border)',borderRadius:'var(--radius-card)',padding:'12px 14px'}}>
          {r > 0 ? (<>
            <div style={{fontWeight:700}}>1 {c} = {(1 / r).toPrecision(4)} {home}</div>
            <div style={{fontSize:13,color:'var(--muted)'}}>1 {home} = {r.toPrecision(4)} {c}</div>
          </>) : <div style={{color:'var(--muted)'}}>No rate for {c} right now.</div>}
        </div>);
      })}
    </div>
    <p style={{fontSize:13,color:'var(--muted)',margin:'10px 0 0'}}>Mid-market rate{when(fx) ? ` · updated ${when(fx)}` : ''} · source: Frankfurter</p>
    <p style={{fontSize:13,color:'var(--muted)',margin:'4px 0 14px'}}>Your bank or card will charge a little more. Estimates never change what anyone owes.</p>
    {active && fx.rates[active] > 0 && (<div style={{display:'flex',alignItems:'center',gap:8}}>
      <label style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontWeight:600,flexShrink:0}}>{CURRENCY_INFO[active]?.sym || active}</span>
        <input inputMode="decimal" placeholder="Amount" aria-label={`Amount in ${active}`} value={amount} onChange={e=>setAmount(e.target.value)} style={{...input,margin:0}} />
      </label>
      <span aria-live="polite" style={{flexShrink:0,minWidth:90,textAlign:'right',fontWeight:700}}>{converted !== null ? `≈ ${fmtEstimate(home, converted)}` : `≈ ${CURRENCY_INFO[home]?.sym || home}…`}</span>
    </div>)}
    {list.length > 1 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>{list.map(c => (<button key={c} type="button" aria-pressed={c===active} onClick={()=>setCur(c)} style={{minHeight:36,padding:'0 14px',borderRadius:18,border:'1px solid var(--muted)',background:c===active?'var(--text)':'var(--card)',color:c===active?'var(--bg)':'var(--text)',font:'inherit',fontSize:13,fontWeight:600,cursor:'pointer'}}>{c}</button>))}</div>}
  </Sheet>);
}

function CurrencyList({ value, onPick, includeOff }: { value: string | null; onPick: (c: string) => void; includeOff?: boolean }) {
  const suggested = guessHomeCurrency();
  const order = [suggested, ...(CURRENCIES as string[]).filter(c => c !== suggested)];
  return (<div role="radiogroup" aria-label="Home currency" className="flat-list" style={{background:'var(--card)',border:'var(--border-w) solid var(--border)',borderRadius:'var(--radius-card)',overflow:'hidden'}}>
    {order.map(c => (<button key={c} type="button" role="radio" aria-checked={value===c} className="flat-row" onClick={()=>onPick(c)}>
      <span style={{display:'flex',alignItems:'center',gap:12}}><strong style={{width:42}}>{c}</strong><span>{CURRENCY_INFO[c]?.name || c}</span>{c===suggested && <span style={{fontSize:12,fontWeight:600,color:'var(--tint-text)'}}>Suggested</span>}</span>
      {value===c && pickCheck}
    </button>))}
    {includeOff && (<button type="button" role="radio" aria-checked={value==='none'} className="flat-row" onClick={()=>onPick('none')}>
      <span style={{display:'flex',flexDirection:'column'}}><strong>Off</strong><span style={{fontSize:13,color:'var(--muted)'}}>Don’t show estimates</span></span>
      {value==='none' && pickCheck}
    </button>)}
  </div>);
}

/** First sign-in: pick a home currency (one tap with the suggestion preselected). */
export function HomeCurrencyPrompt({ onDone }: { onDone: (code: string) => Promise<void> }) {
  const [value, setValue] = useState(guessHomeCurrency());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (<div style={{...S,display:'flex',flexDirection:'column',gap:16,paddingTop:40,paddingBottom:0}}>
    <div>
      <div style={{fontSize:13,fontWeight:600,color:'var(--muted)'}}>One quick thing</div>
      <h1 style={{margin:'6px 0 8px'}}>What’s your home currency?</h1>
      <p style={{margin:0,color:'var(--muted)',lineHeight:1.5}}>When a group uses other currencies, we’ll show a rough estimate in yours. Balances and settling always stay in the original currency.</p>
    </div>
    <CurrencyList value={value} onPick={setValue} />
    {error && <p style={{color:'var(--danger-text)',margin:0}}>{error}</p>}
    <div style={{position:'sticky',bottom:0,background:'var(--bg)',padding:'12px 0 calc(12px + env(safe-area-inset-bottom, 0px))',display:'flex',flexDirection:'column',gap:8}}>
    <button type="button" disabled={busy} style={{...primary,width:'100%'}} onClick={async()=>{ setBusy(true); setError(''); try { await onDone(value); } catch (e: any) { setError(e.message || 'Couldn’t save. Try again.'); setBusy(false); } }}>Continue</button>
    <p style={{textAlign:'center',fontSize:13,color:'var(--muted)',margin:0}}>You can change this anytime in Settings.</p>
    </div>
  </div>);
}

/** Settings › Home currency. */
export function HomeCurrencySheet({ value, onPick, onClose }: { value: string | null; onPick: (c: string) => void; onClose: () => void }) {
  return (<Sheet title="Home currency" onClose={onClose} maxHeight="88vh">
    <p style={{fontSize:13,color:'var(--muted)',margin:'8px 0 12px'}}>Other currencies get a rough estimate in this one. Balances and settling stay in the original currency.</p>
    <CurrencyList value={value} onPick={(c)=>{ onPick(c); onClose(); }} includeOff />
  </Sheet>);
}

