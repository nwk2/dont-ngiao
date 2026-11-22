// Appearance, the same model as nwk2/haven: a theme plus a mode, saved to
// the account (PATCH /api/me) and applied on every device. Palettes, radii,
// border widths and fonts live in themes.json (generated into themes.css).
//
// Base theme and the sign-in handoff (as in Haven): signed-out screens
// always use the base theme. Signed-in screens use the account's choice,
// cached per user on this device so the next launch paints it before the
// app loads (see the script in index.html), then confirmed from /api/me.
export type ThemeId = 'kopitiam' | 'market' | 'tomato' | 'night';
export type Mode = 'system' | 'light' | 'dark';
export type Appearance = { theme: ThemeId; mode: Mode };

export const THEMES: { id: ThemeId; name: string; tag: string }[] = [
  { id: 'kopitiam', name: 'Kopitiam', tag: 'Warm and local' },
  { id: 'market', name: 'Market Green', tag: 'Calm and practical' },
  { id: 'tomato', name: 'Tomato & Ink', tag: 'Loud and friendly' },
  { id: 'night', name: 'Night Utility', tag: 'Dense and quiet' },
];
export const BASE: Appearance = { theme: 'kopitiam', mode: 'system' };

const LAST_USER_KEY = 'dont-ngiao:lastUser';
const cacheKey = (userId: string) => `dont-ngiao:appearance:${userId}`;
const LEGACY_THEME_KEY = 'dont-ngiao-theme'; // older builds saved just 'dark' | 'light' on the device

const isTheme = (v: unknown): v is ThemeId => THEMES.some(t => t.id === v);
const isMode = (v: unknown): v is Mode => v === 'system' || v === 'light' || v === 'dark';

/** The account's appearance from a /api/me user (falls back to base for older Workers). */
export function fromUser(u: any): Appearance {
  return { theme: isTheme(u?.theme) ? u.theme : BASE.theme, mode: isMode(u?.mode) ? u.mode : BASE.mode };
}
/** Remember the member's choice so the next launch paints it before React loads. */
export function cacheAppearance(userId: string, a: Appearance) {
  try { localStorage.setItem(LAST_USER_KEY, userId); localStorage.setItem(cacheKey(userId), JSON.stringify(a)); } catch { /* storage can be unavailable */ }
}
export function forgetAppearance() {
  try { localStorage.removeItem(LAST_USER_KEY); } catch { /* ignore */ }
  applyAppearance(BASE);
}
/** One-time pickup of a light/dark choice made on this device before appearance moved to the account. */
export function takeLegacyChoice(): Appearance | null {
  try {
    const v = localStorage.getItem(LEGACY_THEME_KEY);
    localStorage.removeItem(LEGACY_THEME_KEY);
    return v === 'light' || v === 'dark' ? { theme: 'kopitiam', mode: v } : null;
  } catch { return null; }
}
export function resolvedMode(mode: Mode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
/** Apply to <html>, instantly — no view transition. Haven tried one and the
  default cross-fade blends dark<->light through grey (the 150 ms CSS was
  never written there either); Haven's fix was to drop the call, and this
  does the same. */
let applied = '';
export function applyAppearance(a: Appearance) {
  const key = `${a.theme}/${a.mode}`;
  if (key === applied) return;
  applied = key;
  const html = document.documentElement;
  html.dataset.theme = a.theme;
  html.dataset.mode = a.mode;
}
