// GOOGLE SIGN-IN, Nov 2026: authorization-code flow. The Client ID is
// public by design (it is in the auth URL); the secret lives only in
// the Worker (GOOGLE_CLIENT_SECRET runtime secret). The redirect URI
// is the app root — it must match the URI registered in Google Cloud
// Console exactly, and the Worker uses the same value when it
// exchanges the code. The state is a one-time CSRF nonce, kept in
// localStorage (not sessionStorage) so it survives the round-trip
// even if iOS relaunches the PWA on the way back from Google.
export const GOOGLE_CLIENT_ID = '710021216622-44ldbet58qcftfakusmu9i24qto6nr40.apps.googleusercontent.com';
export const GOOGLE_REDIRECT_URI = 'https://dont-ngiao-web.wk-io.workers.dev/';
export const GOOGLE_STATE_KEY = 'dont-ngiao-google-state';
export function googleAuthUrl(): string {
  const state = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try { localStorage.setItem(GOOGLE_STATE_KEY, state); } catch { /* ignore */ }
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}
