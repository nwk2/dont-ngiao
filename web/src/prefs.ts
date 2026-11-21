// Saved app preferences: last opened group/tab and theme.
// Navigation restoration, localStorage version (not hash routing): after a
// refresh, return to the group + tab you were on, instead of always landing
// on Home. Why localStorage and not a hash URL: it is the smallest change
// that fixes refresh (the reported pain), with no hashchange listener, no
// browser-back history semantics to get wrong, and no Worker SPA-fallback
// requirement. Trade-off, stated plainly: it is private to this browser —
// it does NOT give shareable/bookmarkable group links (a hash URL would).
// The saved value is just {groupId, tab}; it contains no auth data, no
// group content, and the API still enforces membership on restore, so a
// stale or forged id simply fails to load and falls back to Home.
export const LAST_GROUP_KEY = 'dont-ngiao-last-group';
export const THEME_KEY = 'dont-ngiao-theme';
export const VALID_TABS = ['expenses','balances','members','log'] as const;
export function readSavedGroup(): { groupId: string; tab: typeof VALID_TABS[number] } | null {
  try {
    const raw = localStorage.getItem(LAST_GROUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.groupId !== 'string' || !p.groupId) return null;
    const tab = p.tab === 'activity' ? 'log' : p.tab;
    return { groupId: p.groupId, tab: VALID_TABS.includes(tab) ? tab : 'expenses' };
  } catch { return null; }
}
