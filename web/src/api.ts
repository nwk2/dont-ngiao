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
import { CATEGORIES as SHARED_CATEGORIES, CURRENCIES as SHARED_CURRENCIES, formatAmount, minorToInput, parseAmountToMinor } from '../../shared/money';
export { CURRENCY_INFO, isZeroDecimal } from '../../shared/money';
// Widened to string[] for the UI, which mixes these with API strings.
export const CURRENCIES: string[] = [...SHARED_CURRENCIES];
export const CATEGORIES: string[] = [...SHARED_CATEGORIES];
// PUSH NOTIFICATIONS (Web Push), Nov 2026: the VAPID public key the
// browser subscribes with. PUBLIC by design — it is not a secret. The
// matching private key is the VAPID_PRIVATE_KEY Worker secret (runtime
// secret, never in the repo or the frontend). Pass it to
// PushManager.subscribe as the applicationServerKey string (the Push
// API accepts the base64url key directly, no byte conversion needed).
export const VAPID_PUBLIC_KEY = 'BDpvEhNXtb2WZt6aaAOiac_uhut9H0006cTKpmspwcWWmSrsVeZAmF-SjIAzWkBLHoErrNG24FYXgnAlrF7HxAg';
// ONBOARDING, Nov 2026: two-stage setup for new family members.
// Stage 1 is Add to Home Screen (the prerequisite on iPhone, where
// push only works from the Home Screen app); Stage 2 is Enable
// notifications (only once the app is launched from the Home Screen).
// isStandalone() tells them apart: iOS exposes navigator.standalone,
// and the standard display-mode media query covers Android + modern iOS.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as any).standalone === true) return true;
  try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
}
// Rough platform detection, only for the Add-to-Home-Screen steps
// (Share -> Add to Home Screen on iOS, menu -> Add to Home screen on
// Android). Falls back to the generic wording when it cannot tell.
export function installPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}
// The current push subscription on THIS device/browser, or null.
// A subscription existing means notifications are on for this device.
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
// Subscribe this device to push: request permission, subscribe with the
// VAPID public key, and store the subscription on the server. Throws
// when permission is denied/blocked or the subscribe fails, so callers
// can show the message. The browser permission prompt only appears on
// a user gesture — there is no way to trigger it without a tap.
export async function subscribePush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked — allow them in your browser settings, then try again.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
  await api('/api/me/push-subscription', 'POST', sub.toJSON());
  return sub;
}
// Unsubscribe this device from push: remove the server row, then drop
// the browser subscription. The server delete runs first so a row is
// never left behind when the browser unsubscribe fails.
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await api('/api/me/push-subscription', 'DELETE', { endpoint: sub.endpoint }); } catch { /* server row may already be gone */ }
  await sub.unsubscribe();
}
// UPDATE CHECK, Nov 2026: fetch the build-time version.json and return
// its buildId, or null when unreachable. The file is written fresh by
// generate-version.mjs on every build and is never cached (the service
// worker skips /version.json, and the fetch uses no-store), so it always
// reports the latest deployed build. The app compares it against the
// version it started with to detect a newer deploy for the update
// banner. Same-origin fetch — version.json is served by the frontend
// Worker, not the API Worker.
export async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d?.buildId === 'string' ? d.buildId : null;
  } catch { return null; }
}
// Money helpers: thin names over shared/money.ts. fmt() formats in the
// device's locale; the app formats every on-screen amount from minor
// units with it and does not show the Worker's en-US `display` strings,
// so one screen never mixes "1,234.56" and "1.234,56".
const LOCALE = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
export const fmt = (minor: number, cur: string) => formatAmount(minor, cur, LOCALE);
export const toMinor = (input: string, cur: string) => parseAmountToMinor(input, cur);
export const fromMinor = (minor: number, cur: string) => minorToInput(minor, cur);
