const BASE = (import.meta as any).env?.VITE_API_URL || '';
export function getToken() { return localStorage.getItem('dont-ngiao-token') || ''; }
export function setToken(t: string | null) { if (t) localStorage.setItem('dont-ngiao-token', t); else localStorage.removeItem('dont-ngiao-token'); }
export async function api(path: string, method = 'GET', body?: any) {
  // Network failures carry the method + path, not just the browser's
  // bare message: Safari reports a fetch rejection as only "Load
  // failed", which on its own does not say WHICH request failed — the
  // Settings Save failure in Nov 2026 was diagnosed only by screenshot
  // context, not by the error text. A server error still throws
  // data.error unchanged; only a fetch rejection gets the suffix, so
  // existing server-error strings are not altered.
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e: any) {
    // /api/me fix, Nov 2026: a network failure has no HTTP status.
    // Attach status 0 so callers can tell it apart from a real 401
    // (expired/deleted session) — previously every thrown error was
    // just a message string, so the auth check could not distinguish
    // "session gone" from "network hiccup" and cleared the token for
    // both.
    const err: any = new Error(`${e?.message || 'Network error'} (${method} ${path})`); err.status = 0; throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err: any = new Error(data.error || `Request failed (${res.status})`); err.status = res.status; throw err; }
  return data;
}
export const CURRENCIES = ['SGD','USD','EUR','GBP','AUD','CAD','JPY','KRW','VND','HKD','TWD','CNY','INR','MYR','THB','IDR','PHP','NZD','CHF'];
export const CATEGORIES = ['Food & Drink','Transport','Accommodation','Activities','Shopping','Other'];
// PUSH NOTIFICATIONS (Web Push), Nov 2026: the VAPID public key the
// browser subscribes with. PUBLIC by design — it is not a secret. The
// matching private key is the VAPID_PRIVATE_KEY Worker secret (runtime
// secret, never in the repo or the frontend). Pass it to
// PushManager.subscribe as the applicationServerKey string (the Push
// API accepts the base64url key directly, no byte conversion needed).
export const VAPID_PUBLIC_KEY = 'BDpvEhNXtb2WZt6aaAOiac_uhut9H0006cTKpmspwcWWmSrsVeZAmF-SjIAzWkBLHoErrNG24FYXgnAlrF7HxAg';
const SYM: Record<string,string> = { SGD:'S$', USD:'$', EUR:'€', GBP:'£', AUD:'A$', CAD:'C$', JPY:'¥', KRW:'₩', VND:'₫', HKD:'HK$', TWD:'NT$', CNY:'¥', INR:'₹', MYR:'RM', THB:'฿', IDR:'Rp', PHP:'₱', NZD:'NZ$', CHF:'CHF ' };
export function fmt(minor: number, cur: string) {
  const zero = ['JPY','KRW','VND'].includes(cur);
  const sign = minor < 0 ? '-' : ''; const abs = Math.abs(minor);
  return zero ? `${sign}${SYM[cur]||cur+' '}${abs.toLocaleString()}` : `${sign}${SYM[cur]||cur+' '}${(abs/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export function toMinor(input: string, cur: string): number | null {
  const n = Number(String(input).replace(/,/g,'').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return ['JPY','KRW','VND'].includes(cur) ? Math.round(n) : Math.round(n*100);
}
export function fromMinor(minor: number, cur: string): string { return ['JPY','KRW','VND'].includes(cur) ? String(minor) : (minor/100).toFixed(2); }
