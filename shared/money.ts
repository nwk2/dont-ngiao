// Money rules shared by the Worker (worker/src) and the web app (web/src).
// One copy of the currency list, symbols, whole-unit currencies, amount
// parsing/formatting and the split maths, so the frontend can never drift
// from what the server stores. Pure functions only: no DOM, no Worker APIs.
//
// DEPLOYS: both Workers import this file, so add `shared/*` to the build
// watch paths of duesy and duesy-api (Workers Builds settings). Without
// it, a commit touching only shared/ redeploys neither.

export const CURRENCIES = [
  'SGD','USD','EUR','GBP','AUD','CAD','JPY','KRW','VND','HKD','TWD','CNY',
  'INR','MYR','THB','IDR','PHP','NZD','CHF',
] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CATEGORIES = ['Food & Drink','Transport','Accommodation','Activities','Shopping','Other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Symbol + full name per currency. `spaced` puts a space between a
 *  letter-only symbol and the number ("CHF 10.00"). */
export const CURRENCY_INFO: Record<string, { sym: string; name: string; spaced?: boolean }> = {
  SGD: { sym: 'S$', name: 'Singapore Dollar' },
  USD: { sym: '$', name: 'US Dollar' },
  EUR: { sym: '€', name: 'Euro' },
  GBP: { sym: '£', name: 'British Pound' },
  AUD: { sym: 'A$', name: 'Australian Dollar' },
  CAD: { sym: 'C$', name: 'Canadian Dollar' },
  JPY: { sym: '¥', name: 'Japanese Yen' },
  KRW: { sym: '₩', name: 'South Korean Won' },
  VND: { sym: '₫', name: 'Vietnamese Dong' },
  HKD: { sym: 'HK$', name: 'Hong Kong Dollar' },
  TWD: { sym: 'NT$', name: 'New Taiwan Dollar' },
  CNY: { sym: '¥', name: 'Chinese Yuan' },
  INR: { sym: '₹', name: 'Indian Rupee' },
  MYR: { sym: 'RM', name: 'Malaysian Ringgit' },
  THB: { sym: '฿', name: 'Thai Baht' },
  IDR: { sym: 'Rp', name: 'Indonesian Rupiah' },
  PHP: { sym: '₱', name: 'Philippine Peso' },
  NZD: { sym: 'NZ$', name: 'New Zealand Dollar' },
  CHF: { sym: 'CHF', name: 'Swiss Franc', spaced: true },
};

const ZERO_DECIMAL = new Set(['JPY','KRW','VND']);
/** JPY/KRW/VND are stored in whole units; everything else in cents. */
export function isZeroDecimal(c: string) { return ZERO_DECIMAL.has(c); }

/** The prefix written before an amount: "S$", "CHF ", or the code + space for an unknown currency. */
export function currencySymbol(c: string): string {
  const i = CURRENCY_INFO[c];
  if (!i) return c + ' ';
  return i.spaced ? i.sym + ' ' : i.sym;
}

/** "S$1,234.56", "-$5.00", "¥6,100". The Worker uses the en-US default
 *  (push bodies, activity text, the `display` fields); the web app passes
 *  the device locale and formats every on-screen amount itself, so
 *  "S$1.234,56" on a German phone is consistent across the whole screen. */
export function formatAmount(minor: number, currency: string, locale = 'en-US'): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const opts = isZeroDecimal(currency) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const num = (isZeroDecimal(currency) ? abs : abs / 100).toLocaleString(locale, opts);
  return `${sign}${currencySymbol(currency)}${num}`;
}

/** User input -> minor units; null for empty, zero, negative or junk. Commas are ignored. */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const n = Number(String(input).replace(/,/g,'').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return isZeroDecimal(currency) ? Math.round(n) : Math.round(n*100);
}

/** Minor units -> the plain number a user would type ("12.50", "6100"). */
export function minorToInput(minor: number, currency: string): string {
  return isZeroDecimal(currency) ? String(minor) : (minor/100).toFixed(2);
}

export function minorToMajor(minor: number, currency: string): number {
  return isZeroDecimal(currency) ? minor : minor/100;
}

// Equal split: the PAYER absorbs the entire remainder (up to count-1
// minor units); everyone else pays exactly the base. payerIndex is the
// payer's position in the participants array; out of range (payer not
// splitting) puts the remainder on the first participant.
export function equalSplit(total: number, count: number, payerIndex = 0): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total - base*count;
  const payer = payerIndex >= 0 && payerIndex < count ? payerIndex : 0;
  return Array.from({length: count}, (_,i) => base + (i === payer ? rem : 0));
}

// Percent split: floor each share, distribute the remainder to the
// largest fractional parts.
export function percentSplit(total: number, percents: number[]): number[] {
  const raw = percents.map(p => total * p / 100);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a,b)=>a+b,0);
  const order = raw.map((r,i)=>({i, frac: r - Math.floor(r)})).sort((a,b)=>b.frac-a.frac);
  for (const {i} of order) { if (rem <= 0) break; out[i]++; rem--; }
  return out;
}
