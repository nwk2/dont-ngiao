const BASE = (import.meta as any).env?.VITE_API_URL || '';
export function getToken() { return localStorage.getItem('dont-ngiao-token') || ''; }
export function setToken(t: string | null) { if (t) localStorage.setItem('dont-ngiao-token', t); else localStorage.removeItem('dont-ngiao-token'); }
export async function api(path: string, method = 'GET', body?: any) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const CURRENCIES = ['SGD','USD','EUR','GBP','AUD','CAD','JPY','KRW','VND','HKD','TWD','CNY','INR','MYR','THB','IDR','PHP','NZD','CHF'];
export const CATEGORIES = ['Food & Drink','Transport','Accommodation','Activities','Shopping','Other','Uncategorized'];
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
