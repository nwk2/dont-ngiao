// Server-side money logic. Currencies, amounts and the split maths live in
// shared/money.ts (also used by the web app); balances and the greedy
// debt simplification are server-only and stay here.
export {
  CURRENCIES, CATEGORIES, CURRENCY_INFO, isZeroDecimal, currencySymbol, formatAmount,
  parseAmountToMinor, minorToMajor, equalSplit, percentSplit,
} from '../../shared/money';
export type { Currency } from '../../shared/money';

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
