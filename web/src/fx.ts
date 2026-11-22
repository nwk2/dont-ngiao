// HOME CURRENCY ESTIMATES. Display only: nothing in a group is ever
// converted, netted across currencies or saved converted. A person picks a
// home currency (users.home_currency; 'none' = off, null = not chosen yet);
// amounts in other currencies then get a rough "≈ S$36" beside them, using
// today's mid-market rate from /api/fx (Frankfurter via the Worker).
//
// A tiny store (useSyncExternalStore) so any screen can read the rates and
// open the rate sheet without threading props through every component.
import { useSyncExternalStore } from 'react';
import { api, fmt, CURRENCIES } from './api';

export type Fx = {
  home: string | null;            // null when off or not chosen
  rates: Record<string, number>;  // units of X per 1 home
  date: string | null;            // the rate's date from the source
  fetchedAt: number | null;
  sheet: string[] | null;         // currencies the rate sheet is showing, or null when closed
};
let state: Fx = { home: null, rates: {}, date: null, fetchedAt: null, sheet: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Fx>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useFx(): Fx { return useSyncExternalStore(subscribe, () => state); }

const CACHE_KEY = (base: string) => `dont-ngiao:fx:${base}`;
const ZERO = ['JPY', 'KRW', 'VND'];

/** Called by App whenever the signed-in user's home currency is known or changes. */
export async function setHomeCurrency(code: string | null | undefined) {
  const home = code && code !== 'none' && (CURRENCIES as string[]).includes(code) ? code : null;
  if (home === state.home && (home === null || Object.keys(state.rates).length)) return;
  if (!home) { set({ home: null, rates: {}, date: null, fetchedAt: null }); return; }
  // Paint from the device cache first (works offline), then refresh.
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY(home)) || 'null');
    set({ home, rates: cached?.rates || {}, date: cached?.date || null, fetchedAt: cached?.fetchedAt || null });
  } catch { set({ home, rates: {}, date: null, fetchedAt: null }); }
  await refreshRates();
}
export async function refreshRates() {
  const home = state.home; if (!home) return;
  if (state.fetchedAt && Date.now() - state.fetchedAt < 60 * 60 * 1000) return;
  try {
    const d = await api(`/api/fx?base=${home}`);
    if (state.home !== home) return;
    set({ rates: d.rates || {}, date: d.date || null, fetchedAt: d.fetchedAt || Date.now() });
    try { localStorage.setItem(CACHE_KEY(home), JSON.stringify({ rates: d.rates, date: d.date, fetchedAt: d.fetchedAt })); } catch { /* ignore */ }
  } catch { /* keep cached rates; estimates simply don't show if there are none */ }
}

/** Value of `minor` units of `cur` in the home currency (major units), or null if there's nothing to show. */
export function toHome(fx: Fx, minor: number, cur: string): number | null {
  if (!fx.home || cur === fx.home) return null;
  const r = fx.rates[cur]; if (!(r > 0)) return null;
  const major = ZERO.includes(cur) ? minor : minor / 100;
  return major / r;
}
/** "S$36" for 100 and up (whole units signal it's rough), "S$14.75" below. */
export function fmtEstimate(home: string, major: number): string {
  const abs = Math.abs(major);
  const minor = ZERO.includes(home) ? Math.round(abs) : abs >= 100 ? Math.round(abs) * 100 : Math.round(abs * 100);
  const s = fmt(minor, home);
  return abs >= 100 && !ZERO.includes(home) ? s.replace(/\.00$/, '') : s;
}
/** "≈ S$36", or null when no estimate applies. */
export function estimate(fx: Fx, minor: number, cur: string): string | null {
  const v = toHome(fx, minor, cur);
  return v === null ? null : `≈ ${fmtEstimate(fx.home as string, v)}`;
}
/** Sum of several currency amounts in home currency; null if any can't be estimated or all are already home. */
export function totalInHome(fx: Fx, items: { minor: number; cur: string }[]): number | null {
  if (!fx.home || !items.some(i => i.cur !== fx.home)) return null;
  let sum = 0;
  for (const i of items) {
    if (i.cur === fx.home) { sum += ZERO.includes(i.cur) ? i.minor : i.minor / 100; continue; }
    const v = toHome(fx, i.minor, i.cur); if (v === null) return null; sum += v;
  }
  return sum;
}
/** "1 MYR ≈ S$0.30" for headers. */
export function unitRate(fx: Fx, cur: string): string | null {
  if (!fx.home || cur === fx.home) return null;
  const r = fx.rates[cur]; if (!(r > 0)) return null;
  const v = 1 / r;
  const shown = v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(v >= 0.1 ? 2 : 3) : v.toPrecision(2);
  return `1 ${cur} ≈ ${fmt(0, fx.home).replace(/[\d.,]+$/, '')}${shown}`;
}
export function openRateSheet(currencies: string[]) { set({ sheet: currencies }); refreshRates(); }
export function closeRateSheet() { set({ sheet: null }); }

/** Best guess of someone's home currency from the device (locale region, then time zone). */
export function guessHomeCurrency(): string {
  const byRegion: Record<string, string> = { SG: 'SGD', MY: 'MYR', US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD', JP: 'JPY', KR: 'KRW', VN: 'VND', HK: 'HKD', TW: 'TWD', CN: 'CNY', IN: 'INR', TH: 'THB', ID: 'IDR', PH: 'PHP', NZ: 'NZD', CH: 'CHF',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR' };
  const byZone: Record<string, string> = { 'Asia/Singapore': 'SGD', 'Asia/Kuala_Lumpur': 'MYR', 'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Ho_Chi_Minh': 'VND', 'Asia/Hong_Kong': 'HKD', 'Asia/Taipei': 'TWD', 'Asia/Shanghai': 'CNY', 'Asia/Kolkata': 'INR', 'Asia/Bangkok': 'THB', 'Asia/Jakarta': 'IDR', 'Asia/Manila': 'PHP', 'Europe/London': 'GBP', 'Europe/Zurich': 'CHF', 'Pacific/Auckland': 'NZD', 'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD' };
  try {
    for (const lang of navigator.languages || [navigator.language]) {
      const region = (lang.split('-')[1] || '').toUpperCase();
      if (byRegion[region]) return byRegion[region];
    }
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (byZone[zone]) return byZone[zone];
  } catch { /* ignore */ }
  return 'SGD';
}
