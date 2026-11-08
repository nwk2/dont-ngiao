export const CURRENCIES = [
  'SGD','USD','EUR','GBP','AUD','CAD','JPY','KRW','VND','HKD','TWD','CNY',
  'INR','MYR','THB','IDR','PHP','NZD','CHF',
] as const;
export type Currency = (typeof CURRENCIES)[number];
const ZERO_DECIMAL = new Set(['JPY','KRW','VND']);
export const CATEGORIES = ['Food & Drink','Transport','Accommodation','Activities','Shopping','Other'] as const;

export function isZeroDecimal(c: string) { return ZERO_DECIMAL.has(c); }
export function currencySymbol(c: string): string {
  const m: Record<string,string> = { SGD:'S$', USD:'$', EUR:'€', GBP:'£', AUD:'A$', CAD:'C$', JPY:'¥', KRW:'₩', VND:'₫', HKD:'HK$', TWD:'NT$', CNY:'¥', INR:'₹', MYR:'RM', THB:'฿', IDR:'Rp', PHP:'₱', NZD:'NZ$', CHF:'CHF ' };
  return m[c] ?? c + ' ';
}
export function formatAmount(minor: number, currency: string): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  if (isZeroDecimal(currency)) return `${sign}${currencySymbol(currency)}${abs.toLocaleString('en-US')}`;
  return `${sign}${currencySymbol(currency)}${(abs/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export function parseAmountToMinor(input: string, currency: string): number | null {
  const n = Number(String(input).replace(/,/g,'').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return isZeroDecimal(currency) ? Math.round(n) : Math.round(n*100);
}
export function minorToMajor(minor: number, currency: string): number {
  return isZeroDecimal(currency) ? minor : minor/100;
}

// Equal split: remainder cents go to the PAYER first, then the next
// members in order (wrapping). The payer fronted the odd total, so they
// absorb the rounding; over many expenses with different payers it
// spreads out, instead of always landing on the first member (the old
// behaviour — Wai spotted it on Bagel brunch, 2026-11-08: S$60.43/6
// gave Kevyn, first in the list, S$10.08 while everyone else got
// S$10.07). payerIndex is the payer's position in the participants
// array; if they are not a participant (out of range) the remainder
// starts at the first participant.
export function equalSplit(total: number, count: number, payerIndex = 0): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total - base*count;
  const first = payerIndex >= 0 && payerIndex < count ? payerIndex : 0;
  return Array.from({length: count}, (_,i) => base + (((i - first + count) % count) < rem ? 1 : 0));
}
// Percent split: floor each share, distribute remainder to largest fractional parts.
export function percentSplit(total: number, percents: number[]): number[] {
  const raw = percents.map(p => total * p / 100);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a,b)=>a+b,0);
  const order = raw.map((r,i)=>({i, frac: r - Math.floor(r)})).sort((a,b)=>b.frac-a.frac);
  for (const {i} of order) { if (rem <= 0) break; out[i]++; rem--; }
  return out;
}

export interface BalanceInput { memberId: string; paid: number; share: number; sent: number; received: number; }
export function balanceOf(b: BalanceInput): number { return b.paid - b.share + b.sent - b.received; }

export interface Suggestion { fromMemberId: string; toMemberId: string; amountMinor: number; currency: string; }
// Greedy creditor/debtor matching, per currency, largest first. Never converts currency.
export function simplify(balances: {memberId: string; balance: number}[], currency: string): Suggestion[] {
  const creditors = balances.filter(b=>b.balance>0).map(b=>({...b})).sort((a,b)=>b.balance-a.balance);
  const debtors = balances.filter(b=>b.balance<0).map(b=>({...b, balance:-b.balance})).sort((a,b)=>b.balance-a.balance);
  const out: Suggestion[] = [];
  let i=0, j=0;
  while (i<creditors.length && j<debtors.length) {
    const amt = Math.min(creditors[i].balance, debtors[j].balance);
    if (amt > 0) out.push({fromMemberId: debtors[j].memberId, toMemberId: creditors[i].memberId, amountMinor: amt, currency});
    creditors[i].balance -= amt; debtors[j].balance -= amt;
    if (creditors[i].balance===0) i++;
    if (debtors[j].balance===0) j++;
  }
  return out;
}
