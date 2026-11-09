// Deploy trigger: 2026-11-04 — no logic change, only to trigger a Workers Builds deployment
// Don't Ngiao — Cloudflare Worker API (TypeScript, D1 SQLite, no external deps)
// All money is integer minor units; zero-decimal currencies in whole units.
// Balances/suggestions are per currency, never converted. Activity log is append-only.
import { CURRENCIES, CATEGORIES, equalSplit, percentSplit, balanceOf, simplify, formatAmount } from './logic';

export interface Env { DB: D1Database; }
type Row = Record<string, any>;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const nowIso = () => new Date().toISOString();
// CORS: the ONE place to edit when the frontend origin changes. This list
// holds exactly one origin: the current frontend,
// https://dont-ngiao-web.wk-io.workers.dev (workers.dev subdomain wk-io).
// No localhost or other origins are allowed. Requests with no Origin
// header (curl, non-browser) get no Allow-Origin header — that is correct,
// they are not browser-CORS-gated, and auth still applies to them.
const ALLOWED_ORIGINS = ['https://dont-ngiao-web.wk-io.workers.dev'];
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Vary': 'Origin' };
}
const json = (data: any, status = 200, origin: string | null = null) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
const err = (message: string, status = 400, origin: string | null = null) => json({ error: message }, status, origin);
// Group icon REMOVED 2026-11-04, per Wai: "i rather user inputs the emoji
// into the group name itself". The frontend icon picker was reverted first
// (commit 69ed0f47); this removes the server side too, so group writes no
// longer require a groups.icon column — a database without migration 0003
// applied works fine (that migration is now optional/legacy, not required).
// Reads still return icon: g.icon || null from SELECT * (undefined -> null
// when the column is absent, the stored value when it is present), so old
// data is never deleted and old group_icon_changed activity entries still
// render; the frontend simply ignores the field. Any body.icon sent by an
// old client is ignored, not validated and not stored.
// Session expiry: 14-day sliding (idle) window. A session is expired when
// it has been idle longer than this since its last activity (last_seen_at,
// falling back to created_at). The last_seen_at update below is throttled
// to once per hour so an active session does not cost a D1 write per request.
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
// Rate limits (see rate-limit helpers below; all D1-backed, no dashboard
// rules, Durable Objects, or KV). Tunable constants — change here only.
const REGISTER_LIMIT_PER_HOUR = 5;
const REGISTER_LIMIT_PER_DAY = 20;
const LOGIN_FAILED_LIMIT = 5;
const LOGIN_FAILED_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;

async function hashPassword(password: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
function newSalt(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}
async function authUser(req: Request, env: Env): Promise<Row | null> {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return null;
  // MEDIUM FIX, Nov 2026: sessions + users used to be two sequential
  // queries on EVERY request. One JOIN does it in one round-trip.
  // MIGRATION SAFETY (unchanged): sessions.last_seen_at only exists
  // after migration 0002. Selecting it before then throws, so fall
  // back to a JOIN without it — expiry then uses the session's
  // created_at (a fixed 14 days) instead of the sliding window.
  // Aliases matter: users.created_at and sessions.created_at are
  // different dates; expiry uses the SESSION's dates only.
  let s: Row | null = null;
  try { s = await env.DB.prepare('SELECT u.id, u.name, u.email, u.created_at, u.is_admin, s.created_at AS session_created_at, s.last_seen_at AS session_last_seen_at FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token=?').bind(tok).first<Row>(); }
  catch { s = await env.DB.prepare('SELECT u.id, u.name, u.email, u.created_at, s.created_at AS session_created_at FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token=?').bind(tok).first<Row>(); }
  if (!s) return null;
  const lastActivity = s.session_last_seen_at || s.session_created_at;
  const lastMs = Date.parse(String(lastActivity));
  if (Number.isFinite(lastMs) && Date.now() - lastMs > SESSION_TTL_MS) {
    // Expired: delete so the token cannot be reused, then 401 downstream.
    try { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run(); } catch {}
    return null;
  }
  // Sliding window: refresh last_seen_at, but at most once an hour, so an
  // active session does not cost a D1 write on every request. The UPDATE
  // is wrapped so a pre-0002 database (no column) cannot break auth.
  if (Number.isFinite(lastMs) && Date.now() - lastMs > SESSION_TOUCH_INTERVAL_MS) {
    try { await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token=?').bind(nowIso(), tok).run(); } catch {}
  }
  return { id: s.id, name: s.name, email: s.email, created_at: s.created_at, is_admin: Number(s.is_admin || 0) };
}
// ADMIN, Nov 2026: separate admin user, separate login page. Admin
// endpoints must check this server-side on every call — hiding the
// admin UI in the frontend is not protection, since anyone can call
// the API directly. A regular user (is_admin=0, or pre-0005 where the
// column does not exist yet) gets the same generic 403 as an
// unauthenticated caller gets 401 elsewhere; the admin login endpoint
// below returns a generic error for the same reason (it must not leak
// whether an account exists or just is not admin).
async function authAdmin(req: Request, env: Env): Promise<Row | null> {
  const user = await authUser(req, env);
  if (!user || !user.is_admin) return null;
  return user;
}
async function myMember(env: Env, groupId: string, userId: string): Promise<Row | null> {
  return env.DB.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?').bind(groupId, userId).first<Row>();
}
async function requireMember(req: Request, env: Env, groupId: string, origin: string | null = null): Promise<{ user: Row; member: Row } | Response> {
  const user = await authUser(req, env);
  if (!user) return err('Unauthorized', 401, origin);
  const member = await myMember(env, groupId, user.id);
  if (!member) return err('Not a group member', 403, origin);
  return { user, member };
}
// ---- Rate limiting (D1-backed, fails open) ----
// All helpers swallow errors: if migration 0002 has not been applied yet
// the rate_limits table does not exist, and a missing table must never
// break login/register — enforcement is simply absent until 0002 lands.
function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') || 'unknown';
}
async function ratePrune(env: Env, now: number): Promise<void> {
  try { await env.DB.prepare('DELETE FROM rate_limits WHERE created_ms < ?').bind(now - RATE_LIMIT_DAY_MS).run(); } catch {}
}
async function rateCount(env: Env, kind: string, key: string, windowMs: number, now: number): Promise<number> {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM rate_limits WHERE kind=? AND key=? AND created_ms >= ?').bind(kind, key, now - windowMs).first<Row>();
    return Number(r?.c || 0);
  } catch { return 0; }
}
async function rateRecord(env: Env, kind: string, key: string, now: number): Promise<void> {
  try { await env.DB.prepare('INSERT INTO rate_limits (key, kind, created_ms) VALUES (?,?,?)').bind(key, kind, now).run(); } catch {}
}
async function rateClear(env: Env, kind: string, key: string): Promise<void> {
  try { await env.DB.prepare('DELETE FROM rate_limits WHERE kind=? AND key=?').bind(kind, key).run(); } catch {}
}
// LOG IDENTITY, Nov 2026: the Log is a payment audit log (expenses +
// settles), so the people in it are identified by MEMBER id, like
// everywhere else (expenses, splits, payments, balances) — not by name
// strings. Names are resolved live at read time (enrichActivity), so a
// rename relabels the log; the audit facts (who-by-id, amount, currency,
// when) never change, only the display label does. actor_name/detail are
// still written as fallback for rows whose member is gone, and old rows
// (all three ids NULL) keep rendering from those strings.
// MONEY EVENTS ONLY: only expense_added/expense_edited/
// expense_deleted/payment_recorded/payment_deleted are written.
// Group/member admin entries (group_created, member_added, ...) are
// not money and are no longer logged.
// MEDIUM FIX, Nov 2026: batched writes need the activity INSERT as a
// prepared statement, not an executed one, so it can go into the same
// env.DB.batch() call as the main write. D1 batch() runs its statements
// in a single transaction: if any statement fails, all roll back —
// that is what makes the batched writes below atomic, not just faster.
const MONEY_ACTIVITY_TYPES_SQL = "'expense_added','expense_edited','expense_deleted','payment_recorded','payment_deleted'";
function activityStmt(env: Env, groupId: string, actorId: string | null, actorName: string, type: string, amountMinor: number | null, currency: string | null, detail: string, fromId: string | null = null, toId: string | null = null) {
  return env.DB.prepare('INSERT INTO activity_log (id, group_id, actor_member_id, actor_name, from_member_id, to_member_id, type, amount_minor, currency, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(uid(), groupId, actorId, actorName, fromId, toId, type, amountMinor, currency, detail, nowIso());
}
// Resolve log names live from member ids. Old rows (all three ids NULL)
// and rows whose member is gone fall back to the stored strings, so the
// log stays readable for its whole history. Payment detail ("X -> Y")
// is rebuilt from resolved ids only when BOTH sides resolve; otherwise
// the stored detail stands, so a half-resolved row never shows
// "Name -> Unknown member".
function enrichActivity(members: any[], rows: any[]) {
  const byId = new Map((members||[]).map((m:any)=>[m.id, m.name]));
  const name = (id: string|null|undefined, fb: string|undefined) => (id && byId.get(id)) || fb || 'Unknown member';
  return rows.map((a:any)=>{
    const actorName = name(a.actor_member_id, a.actor_name);
    let detail = a.detail;
    if (a.type==='payment_recorded' || a.type==='payment_deleted') {
      if (a.from_member_id && a.to_member_id && byId.has(a.from_member_id) && byId.has(a.to_member_id)) {
        detail = `${byId.get(a.from_member_id)} -> ${byId.get(a.to_member_id)}`;
      } else if (a.detail) {
        // OLD ROWS (pre-refactor): the detail is the raw "uuid -> uuid"
        // string, because the member ids were never stored in columns.
        // Resolve each side to its member name so the Log shows names,
        // not UUIDs. A side that isn't a known member id is left as-is
        // (it may already be a name, or its member is gone).
        detail = a.detail.split(' -> ').map((pp: string) => byId.get(pp) || pp).join(' -> ');
      }
    }
    return {...a, actorName, detail};
  });
}
// RESET TOKENS, Nov 2026: 32 random bytes -> base64url (256-bit, not
// guessable). Only the SHA-256 hash is stored in password_resets; the
// plain token only ever appears in the link the admin copies and sends.
// Single-use is enforced by deletion: a successful reset deletes all
// tokens for that user, and generating a new token deletes the old ones
// first, so an old link cannot be reused after a newer one is issued.
function newResetToken(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  let bin = ''; for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}
const RESET_TTL_MS = 24 * 60 * 60 * 1000;
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Outer catch: without this, ANY throw inside a handler (e.g. a D1
    // error on a write) becomes a Cloudflare 500 HTML page with NO CORS
    // headers, which the browser blocks and Safari reports as only
    // "Load failed" — hiding the real server error. With this, a throw
    // returns a JSON error WITH the frontend origin, so the app shows
    // the actual message (e.g. "no such column: groups.icon") instead.
    // This does not fix a failing write; it makes the failure readable.
    try { return await handleRequest(req, env); }
    catch (e: any) { return err(e?.message || 'Internal error', 500, req.headers.get('Origin')); }
  }
};
async function handleRequest(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    let body: any = {};
    if (req.method !== 'GET') { try { body = await req.json(); } catch { body = {}; } }

    // ---- Auth ----
    if (path === '/api/auth/register' && req.method === 'POST') {
      const { name, email, password } = body;
      if (!name || !email || !password || String(password).length < 6) return err('Name, email and a password of at least 6 characters are required', 400, origin);
      // Rate limit: 5 accounts/hour, 20/day per IP. Fails open if the
      // rate_limits table does not exist yet (migration 0002 not applied).
      {
        const ip = clientIp(req); const now = Date.now();
        await ratePrune(env, now);
        if (await rateCount(env, 'register', ip, 60 * 60 * 1000, now) >= REGISTER_LIMIT_PER_HOUR) return err('Too many accounts created from this network, try again later', 429, origin);
        if (await rateCount(env, 'register', ip, RATE_LIMIT_DAY_MS, now) >= REGISTER_LIMIT_PER_DAY) return err('Too many accounts created from this network, try again later', 429, origin);
        await rateRecord(env, 'register', ip, now);
      }
      const salt = newSalt(); const hash = await hashPassword(password, salt);
      const createdAt = nowIso();
      // ONE-ENTITY USER, Nov 2026: if this email already belongs to a
      // placeholder user (added by a group member, no password yet),
      // ACTIVATE that row — set the password and the name they entered
      // — instead of creating a new user. The placeholder IS the user,
      // so they are already a member of every group it was in, with its
      // history intact, and the name syncs to the account name. A real
      // account with this email is still a 409.
      const existing = await env.DB.prepare('SELECT id, password_hash FROM users WHERE email=?').bind(String(email).toLowerCase()).first<Row>();
      let id: string;
      if (existing && !existing.password_hash) {
        id = String(existing.id);
        await env.DB.prepare('UPDATE users SET name=?, password_salt=?, password_hash=? WHERE id=?').bind(name, salt, hash, id).run();
      } else {
        id = uid();
        try { await env.DB.prepare('INSERT INTO users (id,name,email,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id, name, email.toLowerCase(), salt, hash, createdAt).run(); }
        catch { return err('Email already registered', 409, origin); }
      }
      // Include created_at: YouView's "User since" line needs it, and a
      // fresh register session never calls /api/me to fill it in (same
      // omission as login, fixed below).
      const user = { id, name, email: email.toLowerCase(), created_at: createdAt, is_admin: 0 };
      const token = uid();
      await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').bind(token, id, nowIso()).run();
      return json({ user, token }, 200, origin);
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = body;
      // Rate limit: 5 failed attempts per 15 min per IP+email. Checked
      // BEFORE the password, so a blocked attempt never leaks whether the
      // email exists or the password was right. Fails open pre-0002.
      const loginKey = `${clientIp(req)}:${String(email || '').toLowerCase()}`;
      {
        const now = Date.now();
        await ratePrune(env, now);
        if (await rateCount(env, 'login_failed', loginKey, LOGIN_FAILED_WINDOW_MS, now) >= LOGIN_FAILED_LIMIT) return err('Too many failed attempts, try again in a few minutes', 429, origin);
      }
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(String(email||'').toLowerCase()).first<Row>();
      if (!u) { await rateRecord(env, 'login_failed', loginKey, Date.now()); return err('Invalid email or password', 401, origin); }
      if (!u.password_hash || !u.password_salt) { await rateRecord(env, 'login_failed', loginKey, Date.now()); return err('Invalid email or password', 401, origin); }
      if ((await hashPassword(password, u.password_salt)) !== u.password_hash) { await rateRecord(env, 'login_failed', loginKey, Date.now()); return err('Invalid email or password', 401, origin); }
      await rateClear(env, 'login_failed', loginKey);
      // Include created_at (u.created_at): same "User since" reason as
      // register — a fresh login session never calls /api/me, so without
      // this the line silently disappears until the next page reload.
      const user = { id: u.id, name: u.name, email: u.email, created_at: u.created_at, is_admin: Number(u.is_admin || 0) };
      const token = uid();
      await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').bind(token, u.id, nowIso()).run();
      return json({ user, token }, 200, origin);
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run();
      return json({ ok: true }, 200, origin);
    }
    if (path === '/api/me' && req.method === 'GET') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin); return json({ user }, 200, origin);
    }
    if (path === '/api/me' && req.method === 'PATCH') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin);
      if (!body.name) return err('Name is required', 400, origin);
      await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(body.name, user.id).run();
      return json({ user: { ...user, name: body.name } }, 200, origin);
    }

    // ---- Change password (authenticated) ----
    // POST /api/me/password { currentPassword, newPassword }
    // The user changes their own password. Verifies the current
    // password (PBKDF2, same as login), then stores a new salt +
    // hash (min 6 chars, must differ from the current password).
    // Deletes ALL sessions for the user — the change logs them out
    // everywhere, including the current session, same as the reset
    // flow, so a lost/stolen session cannot keep working after the
    // change. The frontend clears the token and shows Auth.
    if (path === '/api/me/password' && req.method === 'POST') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin);
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) return err('Current and new password are required', 400, origin);
      if (String(newPassword).length < 6) return err('New password must be at least 6 characters', 400, origin);
      if (String(newPassword) === String(currentPassword)) return err('New password must be different from the current password', 400, origin);
      const u = await env.DB.prepare('SELECT password_salt, password_hash FROM users WHERE id=?').bind(user.id).first<Row>();
      if (!u || !u.password_hash || !u.password_salt) return err('Current password is incorrect', 401, origin);
      if ((await hashPassword(String(currentPassword), u.password_salt)) !== u.password_hash) return err('Current password is incorrect', 401, origin);
      const salt = newSalt(); const hash = await hashPassword(String(newPassword), salt);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_salt=?, password_hash=? WHERE id=?').bind(salt, hash, user.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
      ]);
      return json({ ok: true }, 200, origin);
    }

    // ---- Password reset (public, token is the auth) ----
    // POST /api/auth/reset-password { token, newPassword }
    // Generic error for every failure (unknown / expired / already-used
    // token all look identical) so the endpoint cannot be used to probe
    // whether a token exists. On success: new salt + PBKDF2 hash, all
    // reset tokens for the user deleted (single-use), and all sessions
    // for the user deleted (the reset logs them out everywhere, so a
    // lost/stolen session cannot keep working after the reset).
    if (path === '/api/auth/reset-password' && req.method === 'POST') {
      const { token, newPassword } = body;
      if (!token || !newPassword || String(newPassword).length < 6) return err('This reset link is invalid or expired', 400, origin);
      const tokenHash = await hashToken(String(token));
      const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash=?').bind(tokenHash).first<Row>();
      if (!row || Date.parse(String(row.expires_at)) <= Date.now()) return err('This reset link is invalid or expired', 400, origin);
      const salt = newSalt(); const hash = await hashPassword(String(newPassword), salt);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_salt=?, password_hash=? WHERE id=?').bind(salt, hash, row.user_id),
        env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(row.user_id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.user_id),
      ]);
      return json({ ok: true }, 200, origin);
    }

    // ---- Group invite links (public resolve + join) ----
    // An invite link is a bearer token for JOINING a group (not account
    // access). The token is stored in PLAINTEXT in group_invites (see
    // migration 0007) so any member can view and copy the current link
    // at any time — a hash would make the link unrecoverable. It is 32
    // random bytes (newResetToken), unguessable, and revocable.
    const inv = path.match(/^\/api\/invites\/([^/]+)(?:\/(.*))?$/);
    if (inv) {
      const token = decodeURIComponent(inv[1]); const sub = inv[2] || '';
      const invite = await env.DB.prepare('SELECT * FROM group_invites WHERE token=?').bind(token).first<Row>();
      if (!invite) return err('This invite link is invalid or has been revoked', 404, origin);
      const g = await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(invite.group_id).first<Row>();
      if (!g || g.is_archived) return err('This invite link is invalid or has been revoked', 404, origin);
      if (sub === '' && req.method === 'GET') {
        // Resolve the inviter's name: the member name if they are still
        // in the group, else their account name, else a generic label.
        let inviterName = 'Someone';
        if (invite.created_by_member_id) {
          const m = await env.DB.prepare('SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.id=?').bind(invite.created_by_member_id).first<Row>();
          if (m) inviterName = String(m.name);
        }
        if (inviterName === 'Someone' && invite.created_by_user_id) {
          const u = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(invite.created_by_user_id).first<Row>();
          if (u) inviterName = String(u.name);
        }
        // ALREADY A MEMBER, Nov 2026: if the caller is logged in and
        // already a member, say so — the frontend opens the group instead
        // of showing the generic join screen (a link should land a member
        // in the group, not ask them to join it again).
        let alreadyMember = false;
        const au = await authUser(req, env);
        if (au) {
          const ex = await env.DB.prepare('SELECT id FROM group_members WHERE group_id=? AND user_id=?').bind(g.id, au.id).first<Row>();
          alreadyMember = !!ex;
        }
        return json({ groupId: g.id, groupName: g.name, inviterName, alreadyMember }, 200, origin);
      }
      if (sub === 'join' && req.method === 'POST') {
        const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin);
        // Already a member? Join is a no-op — return the group detail
        // so the frontend can open the group.
        const existing = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?').bind(g.id, user.id).first<Row>();
        if (existing) return json({ ok: true, alreadyMember: true, group: await groupDetail(env, g, user.id) }, 200, origin);
        // No placeholder claim any more: if this email matched a
        // placeholder, register activated THAT user row, so the caller IS
        // that user and alreadyMember (checked above) is true. Join just
        // inserts the membership; the UNIQUE(group_id, user_id) backstop
        // handles a double-tap race: if the INSERT fails, re-check — a
        // member row now exists.
        try {
          await env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,created_at) VALUES (?,?,?,?)').bind(uid(), g.id, user.id, nowIso()).run();
        } catch {
          const again = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?').bind(g.id, user.id).first<Row>();
          if (!again) throw new Error('Could not join this group');
        }
        return json({ ok: true, group: await groupDetail(env, g, user.id) }, 200, origin);
      }
      return err('Not found', 404, origin);
    }

    // ---- Admin (separate user, separate page) ----
    if (path === '/api/admin/login' && req.method === 'POST') {
      const { email, password } = body;
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(String(email || '').toLowerCase()).first<Row>();
      // Generic error for all failures: wrong email, wrong password, or
      // a real user who is not admin must be indistinguishable.
      if (!u) return err('Invalid admin credentials', 401, origin);
      if (!u.password_hash || !u.password_salt) return err('Invalid admin credentials', 401, origin);
      if ((await hashPassword(String(password || ''), u.password_salt)) !== u.password_hash) return err('Invalid admin credentials', 401, origin);
      if (!Number(u.is_admin || 0)) return err('Invalid admin credentials', 401, origin);
      const token = uid();
      await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').bind(token, u.id, nowIso()).run();
      return json({ user: { id: u.id, name: u.name, email: u.email }, token }, 200, origin);
    }
    // ADMIN SESSION RESTORE, Nov 2026: the admin token persists in
    // localStorage but adminUser was only ever set by a fresh login, so
    // a reload always dropped the admin back to the login form (the
    // stored token was never used to restore the session). The frontend
    // now calls this on load when a token exists: it validates the
    // token (authAdmin) and returns the admin user, so a reload keeps
    // the admin signed in. A dead token gets a 403 and the frontend
    // clears it, same as before.
    if (path === '/api/admin/me' && req.method === 'GET') {
      const admin = await authAdmin(req, env); if (!admin) return err('Admin access required', 403, origin);
      return json({ user: { id: admin.id, name: admin.name, email: admin.email } }, 200, origin);
    }
    if (path === '/api/admin/users' && req.method === 'GET') {
      const admin = await authAdmin(req, env); if (!admin) return err('Admin access required', 403, origin);
      const users = await env.DB.prepare('SELECT id, name, email, is_admin, created_at FROM users WHERE LENGTH(password_hash) > 0 ORDER BY created_at').bind().all<Row>();
      return json({ users: (users.results || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.is_admin, createdAt: u.created_at })) }, 200, origin);
    }
    const ar = path.match(/^\/api\/admin\/users\/([^/]+)\/reset$/);
    if (ar && req.method === 'POST') {
      const admin = await authAdmin(req, env); if (!admin) return err('Admin access required', 403, origin);
      const targetId = decodeURIComponent(ar[1]);
      const target = await env.DB.prepare('SELECT id, name, email FROM users WHERE id=?').bind(targetId).first<Row>();
      if (!target) return err('User not found', 404, origin);
      // Invalidate any previous links for this user, then issue one new
      // link. The plain token is returned ONCE, here, for the admin to
      // copy and send himself — it is never stored, and never returned
      // again. The frontend builds the full link from its own origin.
      const token = newResetToken();
      const tokenHash = await hashToken(token);
      const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(targetId),
        env.DB.prepare('INSERT INTO password_resets (id,user_id,token_hash,expires_at,created_at,created_by_admin_id) VALUES (?,?,?,?,?,?)').bind(uid(), targetId, tokenHash, expiresAt, nowIso(), admin.id),
      ]);
      return json({ user: { id: target.id, name: target.name, email: target.email }, token, expiresAt }, 200, origin);
    }

    // ---- Admin: Groups module ----
    // The admin sees and manages EVERY group (not just their own), for
    // cleanup and stuck-member fixes. All endpoints require the admin
    // token (authAdmin). Delete follows the Option A rule: it never
    // destroys money history (hard-delete if clean, archive if the
    // group has expenses/payments). Remove reuses the member-facing
    // money guards (the admin does not bypass those) but overrides the
    // 'only the creator can remove account members' role check; the
    // creator still cannot be removed, and the admin cannot remove
    // their own membership here (that goes through Leave).
    if (path === '/api/admin/groups' && req.method === 'GET') {
      const admin = await authAdmin(req, env); if (!admin) return err('Admin access required', 403, origin);
      const [groupsRes, memRes, expRes, payRes] = await Promise.all([
        env.DB.prepare('SELECT g.*, u.name AS creator_name FROM groups g LEFT JOIN users u ON u.id = g.created_by_user_id ORDER BY g.created_at DESC').bind().all<Row>(),
        env.DB.prepare('SELECT group_id, COUNT(*) AS c FROM group_members GROUP BY group_id').bind().all<Row>(),
        env.DB.prepare('SELECT group_id, COUNT(*) AS c FROM expenses GROUP BY group_id').bind().all<Row>(),
        env.DB.prepare('SELECT group_id, COUNT(*) AS c FROM payments GROUP BY group_id').bind().all<Row>(),
      ]);
      const countMap = (rows: Row[]) => { const m: Record<string, number> = {}; for (const r of rows) m[String(r.group_id)] = Number(r.c || 0); return m; };
      const memCount = countMap(memRes.results || []); const expCount = countMap(expRes.results || []); const payCount = countMap(payRes.results || []);
      const groups = (groupsRes.results || []).map((g: any) => ({ id: g.id, name: g.name, defaultCurrency: g.default_currency, isArchived: !!g.is_archived, createdAt: g.created_at, createdByUserId: g.created_by_user_id, creatorName: g.creator_name || 'Someone', memberCount: memCount[g.id] || 0, expenseCount: expCount[g.id] || 0, paymentCount: payCount[g.id] || 0 }));
      return json({ groups }, 200, origin);
    }
    const ag = path.match(/^\/api\/admin\/groups\/([^/]+)(?:\/(.*))?$/);
    if (ag) {
      const admin = await authAdmin(req, env); if (!admin) return err('Admin access required', 403, origin);
      const groupId = decodeURIComponent(ag[1]); const sub = ag[2] || '';
      const g = await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(groupId).first<Row>();
      if (!g) return err('Group not found', 404, origin);
      if (sub === '' && req.method === 'GET') {
        const detail = await adminGroupDetail(env, groupId, admin.id);
        if (!detail) return err('Group not found', 404, origin);
        return json(detail, 200, origin);
      }
      if (sub === 'archive' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
        return json(await adminGroupDetail(env, groupId, admin.id), 200, origin);
      }
      if (sub === 'restore' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=0 WHERE id=?').bind(groupId).run();
        return json(await adminGroupDetail(env, groupId, admin.id), 200, origin);
      }
      if (sub === '' && req.method === 'DELETE') {
        const exps = await env.DB.prepare('SELECT COUNT(*) AS c FROM expenses WHERE group_id=?').bind(groupId).first<Row>();
        const pays = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=?').bind(groupId).first<Row>();
        if (Number(exps?.c || 0) === 0 && Number(pays?.c || 0) === 0) {
          await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(groupId).run();
          return json({ deleted: true }, 200, origin);
        }
        await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
        return json({ archived: true }, 200, origin);
      }
      if (sub === 'invite/revoke' && req.method === 'POST') {
        // Revoke + regenerate, same as the member flow: the old link
        // stops working at once and a fresh link is returned. The admin
        // is not a member, so created_by_member_id is NULL (nullable).
        const token = newResetToken();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM group_invites WHERE group_id=?').bind(groupId),
          env.DB.prepare('INSERT INTO group_invites (id,group_id,token,created_by_user_id,created_by_member_id,created_at) VALUES (?,?,?,?,?,?)').bind(uid(), groupId, token, admin.id, null, nowIso()),
        ]);
        return json({ token }, 200, origin);
      }
      const arm = sub.match(/^members\/([^/]+)$/);
      if (arm && req.method === 'DELETE') {
        const targetId = decodeURIComponent(arm[1]);
        const target = await env.DB.prepare('SELECT gm.*, u.password_hash FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.id=? AND gm.group_id=?').bind(targetId, groupId).first<Row>();
        if (!target) return err('Member not found', 404, origin);
        if (target.user_id === admin.id) return err('Use Leave group in Settings to remove yourself from a group', 400, origin);
        if (g.created_by_user_id && target.user_id === g.created_by_user_id) return err('The group creator cannot be removed', 403, origin);
        if (await hasAnyExpense(env, groupId, targetId)) return err('Member has expenses and cannot be removed', 403, origin);
        const payCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=? AND (from_member_id=? OR to_member_id=?)').bind(groupId, targetId, targetId).first<Row>();
        if (Number(payCount?.c || 0) > 0) return err('Member has payments and cannot be removed', 403, origin);
        const summary = await groupSummary(env, groupId, admin.id);
        const bal = summary.balances.find((b: any) => b.memberId === targetId);
        if (bal && bal.balance !== 0) return err('Member must have a zero balance to be removed', 403, origin);
        await env.DB.prepare('DELETE FROM group_members WHERE id=?').bind(targetId).run();
        return json(await adminGroupDetail(env, groupId, admin.id), 200, origin);
      }
      return err('Not found', 404, origin);
    }

    // ---- Groups list / create ----
    if (path === '/api/groups' && req.method === 'GET') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin);
      const memberships = await env.DB.prepare('SELECT group_id FROM group_members WHERE user_id=?').bind(user.id).all<Row>();
      const active: any[] = []; const archived: any[] = []; const totals: Record<string, number> = {};
      // PERFORMANCE, Nov 2026: this loop used to await each group's
      // summary sequentially, so Home load cost was N x one-group cost.
      // Promise.all runs all groups in parallel; it preserves input
      // order, so active/archived order below is unchanged, and the
      // response shape is unchanged.
      const groupItems = await Promise.all((memberships.results || []).map(async (m) => {
        const g = await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(m.group_id).first<Row>();
        if (!g) return null;
        const detail = await groupSummary(env, g.id, user.id);
        // Additive fields only: balances (existing shape) is unchanged.
        // totals previously summed ALL members' balances, which nets to ~0 per
        // currency; it now sums only the requesting user's balances, so the
        // home hero ("owed to you" / "you owe") is meaningful.
        const myMember = (detail.members || []).find((mm: any) => mm.user_id === user.id) || null;
        const myBalances = myMember ? detail.balances.filter((b: any) => b.memberId === myMember.id) : [];
        const spentMap: Record<string, number> = {};
        for (const e of detail.expenses || []) spentMap[e.currency] = (spentMap[e.currency] || 0) + e.amount_minor;
        const item = {
          id: g.id, name: g.name, icon: g.icon || null, defaultCurrency: g.default_currency, isArchived: !!g.is_archived, createdByUserId: g.created_by_user_id || null, balances: detail.balances,
          memberCount: (detail.members || []).length, expenseCount: (detail.expenses || []).length,
          spent: Object.entries(spentMap).map(([currency, amount]) => ({ currency, amount })),
          myBalances: myBalances.map((b: any) => ({ currency: b.currency, balance: b.balance })),
        };
        return { item, isArchived: !!g.is_archived, myBalances };
      }));
      for (const entry of groupItems) {
        if (!entry) continue;
        if (entry.isArchived) archived.push(entry.item);
        else { active.push(entry.item); for (const b of entry.myBalances) totals[b.currency] = (totals[b.currency] || 0) + b.balance; }
      }
      return json({ active, archived, totals: Object.entries(totals).map(([currency, balance]) => ({ currency, balance })) }, 200, origin);
    }
    if (path === '/api/groups' && req.method === 'POST') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401, origin);
      const name = String(body.name || '').trim(); const currency = String(body.defaultCurrency || 'SGD');
      if (!name) return err('Group name is required', 400, origin);
      if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency', 400, origin);
      const gid = uid();
      // Batched + atomic: group + creator member in one transaction.
      // Previously, if the member INSERT failed, the group row stayed
      // behind as an orphan no one belonged to. Group creation is not
      // a money event, so the Log gets no entry for it.
      await env.DB.batch([
        env.DB.prepare('INSERT INTO groups (id,name,default_currency,is_archived,created_at,created_by_user_id) VALUES (?,?,?,?,?,?)').bind(gid, name, currency, 0, nowIso(), user.id),
        env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,created_at) VALUES (?,?,?,?)').bind(uid(), gid, user.id, nowIso()),
      ]);
      return json({ id: gid, name, icon: null, defaultCurrency: currency, isArchived: false }, 201, origin);
    }

    // ---- Group-scoped routes ----
    const gm = path.match(/^\/api\/groups\/([^/]+)(?:\/(.*))?$/);
    if (gm) {
      const groupId = decodeURIComponent(gm[1]); const sub = gm[2] || '';
      // MEDIUM FIX, Nov 2026: the group lookup is independent of auth,
      // so run it concurrently with requireMember (auth + member lookup)
      // instead of sequentially before it. Error precedence is preserved
      // in code below (404 checked before the auth response), even
      // though the queries run in parallel.
      const [g, auth] = await Promise.all([
        env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(groupId).first<Row>(),
        requireMember(req, env, groupId, origin),
      ]);
      if (!g) return err('Group not found', 404, origin);
      if (auth instanceof Response) return auth;
      const { user, member } = auth;
      // ARCHIVED READ-ONLY, Nov 2026: an archived group is view-only.
      // GET and POST /restore are allowed; every other write is 403.
      // This is the server enforcement — the frontend hiding buttons
      // is not the protection. Leave is also blocked: restore first,
      // then leave, so a restore-then-leave sequence is explicit.
      if (g.is_archived && req.method !== 'GET' && !(sub === 'restore' && req.method === 'POST')) {
        return err('This group is archived. Restore it to edit it again.', 403, origin);
      }

      if (sub === '' && req.method === 'GET') return json(await groupDetail(env, g, user.id), 200, origin);
      if (sub === 'activity' && req.method === 'GET') {
        // Cursor pagination, 50/page: before = created_at of the last
        // row shown, beforeId = its id (tie-break, since created_at
        // is ms-resolution and several rows can share it). Order must
        // match groupDetail: created_at DESC, id DESC, and the cursor
        // condition must match that order, otherwise a page boundary
        // can skip or repeat a row.
        const url = new URL(req.url);
        const before = url.searchParams.get('before'); const beforeId = url.searchParams.get('beforeId');
        if (!before || !beforeId) return err('before and beforeId are required', 400, origin);
        const rows = await env.DB.prepare(`SELECT * FROM activity_log WHERE group_id=? AND type IN (${MONEY_ACTIVITY_TYPES_SQL}) AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 51`).bind(groupId, before, before, beforeId).all<Row>();
        const list = rows.results || [];
        const members = await env.DB.prepare('SELECT gm.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=?').bind(groupId).all<Row>();
        return json({ activity: enrichActivity(members.results||[], list.slice(0, 50)), hasMore: list.length > 50 }, 200, origin);
      }
      if (sub === '' && req.method === 'PATCH') {
        const name = body.name !== undefined ? String(body.name).trim() : g.name;
        const currency = body.defaultCurrency !== undefined ? String(body.defaultCurrency) : g.default_currency;
        if (!name) return err('Group name is required', 400, origin);
        if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency', 400, origin);
        await env.DB.prepare('UPDATE groups SET name=?, default_currency=? WHERE id=?').bind(name, currency, groupId).run();
        return json(await groupDetail(env, { ...g, name, default_currency: currency }, user.id), 200, origin);
      }
      if (sub === 'archive' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
        // Return full detail (not just {ok}) so the frontend can use it
        // directly instead of refetching — same pattern as every other
        // group write. Note the is_archived flag must be passed explicitly:
        // g is the pre-archive row, so groupDetail(g) would wrongly report
        // isArchived: false.
        return json(await groupDetail(env, { ...g, is_archived: 1 }, user.id), 200, origin);
      }
      if (sub === 'restore' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=0 WHERE id=?').bind(groupId).run();
        return json(await groupDetail(env, { ...g, is_archived: 0 }, user.id), 200, origin);
      }
      // ---- Group invite link (any member) ----
      // One active link per group, multi-use, no expiry, revocable.
      // GET returns the current token (or null); POST creates (or
      // replaces) it; DELETE revokes it. The token is stored in
      // plaintext (see migration 0007) so any member can copy the
      // current link. The archived-group guard above already blocks
      // POST/DELETE on an archived group; GET is read-only.
      if (sub === 'invite' && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT token FROM group_invites WHERE group_id=?').bind(groupId).first<Row>();
        return json({ token: row ? String(row.token) : null }, 200, origin);
      }
      if (sub === 'invite' && req.method === 'POST') {
        const token = newResetToken();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM group_invites WHERE group_id=?').bind(groupId),
          env.DB.prepare('INSERT INTO group_invites (id,group_id,token,created_by_user_id,created_by_member_id,created_at) VALUES (?,?,?,?,?,?)').bind(uid(), groupId, token, user.id, member.id, nowIso()),
        ]);
        return json({ token }, 200, origin);
      }
      if (sub === 'invite' && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM group_invites WHERE group_id=?').bind(groupId).run();
        return json({ ok: true }, 200, origin);
      }
      if (sub === 'leave' && req.method === 'POST') {
        const blocked = await hasAnyExpense(env, groupId, member.id);
        if (blocked) return err("You can't leave this group because you have an expense here, as payer or as a split participant, even if balances are settled.", 403, origin);
        // LEAVE GUARD, 2026-11-06: Leave was blocked only by expenses,
        // but deleting the member row also fails (FOREIGN KEY) while any
        // payment still references it — payments.from/to_member_id ->
        // group_members(id) has no cascade — and a non-zero balance
        // would be orphaned. So Leave now matches Remove: blocked by
        // expenses, payments, or a non-zero balance, with a clear
        // message instead of a raw D1 error. The member deletes the
        // payment(s) (they're a party to them) and settles, then leaves.
        const payCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=? AND (from_member_id=? OR to_member_id=?)').bind(groupId, member.id, member.id).first<Row>();
        if (Number(payCount?.c || 0) > 0) return err('You have payments in this group and cannot leave — delete the recorded payments first.', 403, origin);
        const summary = await groupSummary(env, groupId, user.id);
        if (summary.balances.some((b:any) => b.memberId === member.id && b.balance !== 0)) return err('You must have a zero balance to leave this group', 403, origin);
        await env.DB.prepare('DELETE FROM group_members WHERE id=?').bind(member.id).run();
        // OPTION A, 2026-11-06: 'remaining' counts ACCOUNT members only
        // (user has a password). A group with only placeholders has no
        // real users — no one can open it, and no member can clean it up
        // — so it is treated as empty: the delete/archive branch below
        // runs (delete if clean, archive if it somehow has money
        // history), instead of leaving an orphan behind. This also makes
        // the creator-transfer NULL crash impossible: the transfer only
        // runs when other account members remain, so a next account
        // member always exists (the 'skip the UPDATE when none' guard
        // stays as a belt-and-braces safety net).
        const remaining = await env.DB.prepare('SELECT COUNT(*) AS c FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=? AND LENGTH(u.password_hash) > 0').bind(groupId).first<Row>();
        // CREATOR TRANSFER, 2026-11-05: if the leaver was the creator
        // and account members remain, creator passes to the earliest
        // remaining ACCOUNT member (created_at, then id for ties).
        // Placeholders cannot be creator (no user_id).
        if (Number(remaining?.c || 0) > 0 && g.created_by_user_id && user.id === g.created_by_user_id) {
          const next = await env.DB.prepare('SELECT gm.user_id FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=? AND LENGTH(u.password_hash) > 0 ORDER BY gm.created_at ASC, gm.id ASC LIMIT 1').bind(groupId).first<Row>();
          if (next?.user_id) await env.DB.prepare('UPDATE groups SET created_by_user_id=? WHERE id=?').bind(next.user_id, groupId).run();
        }
        if (Number(remaining?.c || 0) === 0) {
          const exps = await env.DB.prepare('SELECT COUNT(*) AS c FROM expenses WHERE group_id=?').bind(groupId).first<Row>();
          const pays = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=?').bind(groupId).first<Row>();
          if (Number(exps?.c || 0) === 0 && Number(pays?.c || 0) === 0) {
            await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(groupId).run();
            return json({ ok: true, groupDeleted: true }, 200, origin);
          }
          await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
          return json({ ok: true, groupArchived: true }, 200, origin);
        }
        return json({ ok: true }, 200, origin);
      }
      if (sub === 'members' && req.method === 'POST') {
        // ONE-ENTITY USER, Nov 2026: manual add is ONLY for placeholders
        // (a real user joins via an invite link). This creates a
        // placeholder USER row (name + optional email, no password) and
        // a membership for it, in one batch. If the email matches an
        // existing user (real or placeholder), add THAT user instead —
        // their account name is used and the entered name is ignored
        // (one name per user). The UNIQUE(group_id, user_id) backstop
        // gives the 409 when they are already a member.
        const name = String(body.name || '').trim(); const email = body.email ? String(body.email).toLowerCase() : null;
        if (!name) return err('Member name is required', 400, origin);
        let userId: string | null = null;
        if (email) { const u = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first<Row>(); if (u) userId = String(u.id); }
        try {
          if (userId) {
            await env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,created_at) VALUES (?,?,?,?)').bind(uid(), groupId, userId, nowIso()).run();
          } else {
            const phId = uid();
            const phEmail = email || ('placeholder-' + phId + '@placeholder.invalid');
            await env.DB.batch([
              env.DB.prepare('INSERT INTO users (id,name,email,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').bind(phId, name, phEmail, '', '', nowIso()),
              env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,created_at) VALUES (?,?,?,?)').bind(uid(), groupId, phId, nowIso()),
            ]);
          }
        } catch { return err('That email is already a member of this group', 409, origin); }
        return json(await groupDetail(env, g, user.id), 201, origin);
      }
      const rm = sub.match(/^members\/([^/]+)$/);
      if (rm && req.method === 'PATCH') {
        // ONE-ENTITY USER, Nov 2026: the email lives on the USER row,
        // so this updates users.email for the member's user. Only a
        // placeholder user (no password yet) can have its email changed
        // — a real account's email is theirs. The duplicate check is
        // global (users.email is UNIQUE), not group-scoped.
        const targetId = decodeURIComponent(rm[1]);
        const target = await env.DB.prepare('SELECT gm.*, u.password_hash FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.id=? AND gm.group_id=?').bind(targetId, groupId).first<Row>();
        if (!target) return err('Member not found', 404, origin);
        if (target.password_hash) return err('Only placeholder members can have their email changed', 400, origin);
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const at = email.indexOf('@'); const dot = email.lastIndexOf('.');
        if (!email || at <= 0 || dot <= at + 1 || dot >= email.length - 1) return err('A valid email is required', 400, origin);
        const dup = await env.DB.prepare('SELECT id FROM users WHERE email=? AND id!=?').bind(email, target.user_id).first<Row>();
        if (dup) return err('That email belongs to another account', 409, origin);
        try { await env.DB.prepare('UPDATE users SET email=? WHERE id=?').bind(email, target.user_id).run(); }
        catch { return err('That email belongs to another account', 409, origin); }
        return json(await groupDetail(env, g, user.id), 200, origin);
      }
      if (rm && req.method === 'DELETE') {
        const targetId = decodeURIComponent(rm[1]);
        // SERVER GUARD, 2026-11-04: self-removal must go through Leave
        // (POST /leave), not DELETE /members/:id. Leave has the
        // last-member cleanup (delete the group if empty, else archive
        // it) and the frontend navigates back to Home on it. DELETE on
        // your own row used to succeed in a solo group and leave a
        // 0-member orphan group in D1 that no one could see, restore
        // or delete. Rejecting here makes the API match the UI, where
        // your own row now has no Remove button at all.
        if (targetId === member.id) return err('Use Leave group in Settings to remove yourself from a group', 400, origin);
        const target = await env.DB.prepare('SELECT gm.*, u.password_hash FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.id=? AND gm.group_id=?').bind(targetId, groupId).first<Row>();
        if (!target) return err('Member not found', 404, origin);
        // HYBRID REMOVE RULE, 2026-11-05 (Wai): placeholders (no
        // password yet) may be removed by any member; account members
        // may be removed only by the group creator; the creator may
        // never be removed by anyone (creator leaves via Leave, which
        // transfers creator to the earliest remaining account member,
        // below).
        // This is IN ADDITION to, not instead of, the expense/payment/
        // balance guards below — a member with any expense, payment or
        // non-zero balance cannot be removed by anyone, creator included.
        // ONE-ENTITY USER, Nov 2026: placeholder-ness is "the user has
        // no password yet" (user_id is now always set). The creator
        // checks still key off user_id.
        const targetIsPlaceholder = !target.password_hash;
        if (!targetIsPlaceholder) {
          if (g.created_by_user_id && target.user_id === g.created_by_user_id) return err('The group creator cannot be removed', 403, origin);
          if (g.created_by_user_id && user.id !== g.created_by_user_id) return err('Only the group creator can remove account members', 403, origin);
        }
        if (await hasAnyExpense(env, groupId, targetId)) return err('Member has expenses and cannot be removed', 403, origin);
        const payCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=? AND (from_member_id=? OR to_member_id=?)').bind(groupId, targetId, targetId).first<Row>();
        if (Number(payCount?.c || 0) > 0) return err('Member has payments and cannot be removed', 403, origin);
        const summary = await groupSummary(env, groupId, user.id);
        const bal = summary.balances.find(b => b.memberId === targetId);
        if (bal && bal.balance !== 0) return err('Member must have a zero balance to be removed', 403, origin);
        await env.DB.prepare('DELETE FROM group_members WHERE id=?').bind(targetId).run();
        return json(await groupDetail(env, g, user.id), 200, origin);
      }
      if (sub === 'expenses' && req.method === 'POST') return addExpense(env, g, user, body, origin);
      const de = sub.match(/^expenses\/([^/]+)$/);
      if (de && req.method === 'DELETE') {
        const e = await env.DB.prepare('SELECT * FROM expenses WHERE id=? AND group_id=?').bind(decodeURIComponent(de[1]), groupId).first<Row>();
        if (!e) return err('Expense not found', 404, origin);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM expenses WHERE id=?').bind(e.id),
          activityStmt(env, groupId, member.id, user.name, 'expense_deleted', e.amount_minor, e.currency, e.description),
        ]);
        return json(await groupDetail(env, g, user.id), 200, origin);
      }
      const pe = sub.match(/^expenses\/([^/]+)$/);
      if (pe && req.method === 'PATCH') {
        const e = await env.DB.prepare('SELECT * FROM expenses WHERE id=? AND group_id=?').bind(decodeURIComponent(pe[1]), groupId).first<Row>();
        if (!e) return err('Expense not found', 404, origin);
        return editExpense(env, g, user, e, body, origin);
      }
      if (sub === 'payments' && req.method === 'POST') return recordPayment(env, g, user, body, origin);
      const dp = sub.match(/^payments\/([^/]+)$/);
      if (dp && req.method === 'DELETE') {
        const p = await env.DB.prepare('SELECT * FROM payments WHERE id=? AND group_id=?').bind(decodeURIComponent(dp[1]), groupId).first<Row>();
        if (!p) return err('Payment not found', 404, origin);
        // LOG IDENTITY, Nov 2026: the from/to member IDs go in the
        // from_member_id/to_member_id COLUMNS now (resolved to names at
        // read time), not in the detail string — an earlier version put
        // raw IDs in the detail and the Log showed UUIDs. The names
        // below are only the fallback detail string, for rows read
        // before their members resolve (or if a member row is gone).
        // DELETE AUTH, Nov 2026: only the two parties to the payment
        // (debtor from_member_id, creditor to_member_id) may delete it.
        // An uninvolved member cannot erase someone else's settlement.
        // Same server-enforcement principle as the Settle guard: the
        // frontend hiding the button is not the protection.
        if (member.id !== p.from_member_id && member.id !== p.to_member_id) return err('Only the debtor or creditor can delete this payment', 403, origin);
        const payMembers = await env.DB.prepare('SELECT gm.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=?').bind(groupId).all<Row>();
        const payFromName = (payMembers.results || []).find((m: any) => m.id === p.from_member_id)?.name || p.from_member_id;
        const payToName = (payMembers.results || []).find((m: any) => m.id === p.to_member_id)?.name || p.to_member_id;
        await env.DB.batch([
          env.DB.prepare('DELETE FROM payments WHERE id=?').bind(p.id),
          activityStmt(env, groupId, member.id, user.name, 'payment_deleted', p.amount_minor, p.currency, `${payFromName} -> ${payToName}`, p.from_member_id, p.to_member_id),
        ]);
        return json(await groupDetail(env, g, user.id), 200, origin);
      }
      return err('Not found', 404, origin);
    }
    return err('Not found', 404, origin);
}


async function hasAnyExpense(env: Env, groupId: string, memberId: string): Promise<boolean> {
  const paid = await env.DB.prepare('SELECT COUNT(*) AS c FROM expenses WHERE group_id=? AND paid_by_member_id=?').bind(groupId, memberId).first<Row>();
  if (Number(paid?.c || 0) > 0) return true;
  const split = await env.DB.prepare('SELECT COUNT(*) AS c FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE e.group_id=? AND s.member_id=?').bind(groupId, memberId).first<Row>();
  return Number(split?.c || 0) > 0;
}

async function groupSummary(env: Env, groupId: string, _userId: string) {
  // PERFORMANCE, Nov 2026: this used to be O(members x currencies x
  // expenses) SEQUENTIAL D1 queries — for every member, for every
  // currency, for every expense, it re-queried expense_splits for that
  // expense. A group with 5 members, 2 currencies and 15 expenses did
  // ~150 sequential D1 round-trips per groupDetail call, and every write
  // (Save, Add expense) returned a groupDetail AND the frontend then
  // re-fetched it, doubling it again. On a Singapore phone hitting a
  // far-away D1, that was tens of seconds per update — the video at
  // 19:23 SGT shows exactly that: Save/Add-expense spinners spinning
  // for ages, then the user having to refresh the whole page to see
  // the (already persisted) data. Now: 4 queries, fetched in parallel,
  // all aggregation in memory. Response shape is unchanged.
  const [membersRes, expensesRes, paymentsRes, splitsRes] = await Promise.all([
    env.DB.prepare("SELECT gm.*, u.name, CASE WHEN u.email LIKE '%@placeholder.invalid' THEN NULL ELSE u.email END AS email, (LENGTH(u.password_hash) > 0) AS hasAccount FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=? ORDER BY gm.created_at").bind(groupId).all<Row>(),
    env.DB.prepare('SELECT * FROM expenses WHERE group_id=? ORDER BY date DESC, created_at DESC').bind(groupId).all<Row>(),
    env.DB.prepare('SELECT * FROM payments WHERE group_id=? ORDER BY date DESC, created_at DESC').bind(groupId).all<Row>(),
    env.DB.prepare('SELECT s.* FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE e.group_id=? ORDER BY s.rowid').bind(groupId).all<Row>(),
  ]);
  const members = membersRes.results || [];
  const expenses = expensesRes.results || [];
  const payments = paymentsRes.results || [];
  const splits = splitsRes.results || [];
  const currencies = new Set<string>();
  expenses.forEach(e=>currencies.add(e.currency)); payments.forEach(p=>currencies.add(p.currency));
  const expenseById = new Map<string, Row>(expenses.map((e: any) => [e.id, e]));
  const splitsByExpense: Record<string, Row[]> = {};
  for (const sp of splits) { (splitsByExpense[sp.expense_id] = splitsByExpense[sp.expense_id] || []).push(sp); }
  // In-memory aggregates, keyed memberId + currency. Share uses the
  // expense's currency (a split has no currency of its own).
  const key = (memberId: string, cur: string) => memberId + '\0' + cur;
  const paidMap = new Map<string, number>(); const shareMap = new Map<string, number>();
  const sentMap = new Map<string, number>(); const receivedMap = new Map<string, number>();
  for (const e of expenses) paidMap.set(key(e.paid_by_member_id, e.currency), (paidMap.get(key(e.paid_by_member_id, e.currency)) || 0) + e.amount_minor);
  for (const sp of splits) { const cur = expenseById.get(sp.expense_id)?.currency; if (!cur) continue; shareMap.set(key(sp.member_id, cur), (shareMap.get(key(sp.member_id, cur)) || 0) + sp.amount_minor); }
  for (const pay of payments) { sentMap.set(key(pay.from_member_id, pay.currency), (sentMap.get(key(pay.from_member_id, pay.currency)) || 0) + pay.amount_minor); receivedMap.set(key(pay.to_member_id, pay.currency), (receivedMap.get(key(pay.to_member_id, pay.currency)) || 0) + pay.amount_minor); }
  const balances: any[] = [];
  for (const m of members) {
    for (const cur of currencies) {
      const paid = paidMap.get(key(m.id, cur)) || 0; const share = shareMap.get(key(m.id, cur)) || 0;
      const sent = sentMap.get(key(m.id, cur)) || 0; const received = receivedMap.get(key(m.id, cur)) || 0;
      const bal = balanceOf({memberId:m.id, paid, share, sent, received});
      if (paid||share||sent||received||bal!==0) balances.push({ memberId: m.id, memberName: m.name, currency: cur, balance: bal, paid, share });
    }
  }
  return { members, expenses, payments, balances, splitsByExpense };

}

// ADMIN GROUP DETAIL, Nov 2026 (Groups module): the admin sees every
// group, not just their own. Summary-only money: counts + totals per
// currency, never individual expense rows, per-member balances, or the
// activity log — enough to act, not friends' individual expenses in
// groups the admin is not a member of. Per-member remove guards are
// computed from the summary data (no extra queries): a member has an
// expense if they paid one or are a split participant; a payment if
// they are from/to on one; a non-zero balance if any balance row is
// non-zero. isClean (no expenses, no payments) drives whether the UI
// shows Delete.
async function adminGroupDetail(env: Env, groupId: string, adminUserId: string) {
  const g = await env.DB.prepare('SELECT g.*, u.name AS creator_name FROM groups g LEFT JOIN users u ON u.id = g.created_by_user_id WHERE g.id=?').bind(groupId).first<Row>();
  if (!g) return null;
  const s = await groupSummary(env, groupId, '');
  const inv = await env.DB.prepare('SELECT token FROM group_invites WHERE group_id=?').bind(groupId).first<Row>();
  const totals: Record<string, number> = {};
  for (const e of s.expenses) totals[e.currency] = (totals[e.currency] || 0) + e.amount_minor;
  const paidBy = new Set(s.expenses.map((e: any) => e.paid_by_member_id));
  const splitBy = new Set<string>(); for (const k of Object.keys(s.splitsByExpense)) for (const sp of s.splitsByExpense[k]) splitBy.add(sp.member_id);
  const payBy = new Set<string>(); for (const p of s.payments) { payBy.add(p.from_member_id); payBy.add(p.to_member_id); }
  const nonZero = new Set(s.balances.filter((b: any) => b.balance !== 0).map((b: any) => b.memberId));
  const members = s.members.map((m: any) => {
    const hasExpense = paidBy.has(m.id) || splitBy.has(m.id);
    const hasPayment = payBy.has(m.id);
    const hasBalance = nonZero.has(m.id);
    const isCreator = !!g.created_by_user_id && m.user_id === g.created_by_user_id;
    let removeBlocked: string | null = null;
    if (m.user_id === adminUserId) removeBlocked = 'Use Leave group to remove yourself';
    else if (isCreator) removeBlocked = 'The group creator cannot be removed';
    else if (hasExpense) removeBlocked = 'Member has expenses and cannot be removed';
    else if (hasPayment) removeBlocked = 'Member has payments and cannot be removed';
    else if (hasBalance) removeBlocked = 'Member must have a zero balance to be removed';
    return { id: m.id, userId: m.user_id, name: m.name, email: m.email, hasAccount: !!m.hasAccount, isCreator, createdAt: m.created_at, canRemove: !removeBlocked, removeBlocked };
  });
  return {
    id: g.id, name: g.name, defaultCurrency: g.default_currency, isArchived: !!g.is_archived,
    createdAt: g.created_at, createdByUserId: g.created_by_user_id, creatorName: g.creator_name || 'Someone',
    memberCount: members.length, expenseCount: s.expenses.length, paymentCount: s.payments.length,
    totals, members, inviteToken: inv ? String(inv.token) : null,
    isClean: s.expenses.length === 0 && s.payments.length === 0,
  };
}

async function groupDetail(env: Env, g: Row, userId: string) {
  const s = await groupSummary(env, g.id, userId);
  const myMemberRow = s.members.find(m=>m.user_id===userId) || null;
  // Reuse the splits already fetched by groupSummary — do NOT re-query
  // per expense here (that was a second N-query loop on top of the first).
  const splitsByExpense = s.splitsByExpense;
  // MEDIUM FIX, Nov 2026: activity and myHasExpense are independent
  // (both need only the group id + my member id, both already known
  // here), so fetch them in parallel instead of sequentially. They are
  // NOT removed from groupDetail: the frontend needs activity on the
  // Activity tab, myHasExpense for the Leave grey-out, and the category
  // breakdowns on Expenses — a true lazy load would need new endpoints
  // + frontend tab-triggered fetches, which is a bigger change for a
  // saving of only ~2 queries; the parallel fetch gets most of it.
  const [activity, myHas] = await Promise.all([
    env.DB.prepare(`SELECT * FROM activity_log WHERE group_id=? AND type IN (${MONEY_ACTIVITY_TYPES_SQL}) ORDER BY created_at DESC, id DESC LIMIT 51`).bind(g.id).all<Row>(),
    myMemberRow ? hasAnyExpense(env, g.id, myMemberRow.id) : Promise.resolve(false),
  ]);
  const suggestions: any[] = [];
  const byCur = new Map<string, {memberId:string; balance:number}[]>();
  for (const b of s.balances) { if (!byCur.has(b.currency)) byCur.set(b.currency, []); byCur.get(b.currency)!.push({memberId:b.memberId, balance:b.balance}); }
  for (const [cur, bals] of byCur) for (const sug of simplify(bals, cur)) {
    const from = s.members.find(m=>m.id===sug.fromMemberId); const to = s.members.find(m=>m.id===sug.toMemberId);
    suggestions.push({ ...sug, fromName: from?.name, toName: to?.name, display: formatAmount(sug.amountMinor, cur) });
  }
  // Category breakdowns, per currency. Mine is server-computed from requester's shares only.
  const catGroup: Record<string, Record<string, number>> = {}; const catMine: Record<string, Record<string, number>> = {};
  for (const e of s.expenses) {
    const cat = e.category === 'Uncategorized' ? 'Other' : (e.category || 'Other');
    catGroup[e.currency] = catGroup[e.currency] || {}; catGroup[e.currency][cat] = (catGroup[e.currency][cat]||0) + e.amount_minor;
    if (myMemberRow) { catMine[e.currency] = catMine[e.currency] || {}; for (const sp of splitsByExpense[e.id]||[]) if (sp.member_id===myMemberRow.id) catMine[e.currency][cat] = (catMine[e.currency][cat]||0) + sp.amount_minor; }
  }
  const expensesOut = s.expenses.map(e=>({ ...e, category: e.category === 'Uncategorized' ? 'Other' : (e.category || 'Other'), splits: splitsByExpense[e.id]||[], payerName: s.members.find(m=>m.id===e.paid_by_member_id)?.name, display: formatAmount(e.amount_minor, e.currency) }));
  const paymentsOut = s.payments.map(p=>({ ...p, fromName: s.members.find(m=>m.id===p.from_member_id)?.name, toName: s.members.find(m=>m.id===p.to_member_id)?.name, display: formatAmount(p.amount_minor, p.currency) }));
  const balancesOut = s.balances.map(b=>({ ...b, display: formatAmount(b.balance, b.currency) }));
  return {
    id: g.id, name: g.name, icon: g.icon || null, defaultCurrency: g.default_currency, isArchived: !!g.is_archived,
    members: s.members, expenses: expensesOut, payments: paymentsOut, balances: balancesOut, suggestions,
    categoryGroup: catGroup, categoryMine: catMine,
    activity: enrichActivity(s.members, (activity.results||[]).slice(0, 50)),
    hasMoreActivity: (activity.results||[]).length > 50,
    myMemberId: myMemberRow?.id || null,
    myHasExpense: myHas,
  };
}

async function addExpense(env: Env, g: Row, user: Row, body: any, origin: string | null = null) {
  const members = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=?').bind(g.id).all<Row>();
  const memberIds = new Set((members.results||[]).map(m=>m.id));
  const myMember = (members.results||[]).find((m:any)=>m.user_id===user.id);
  const currency = String(body.currency || g.default_currency);
  if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency', 400, origin);
  const amountMinor = typeof body.amountMinor === 'number' ? body.amountMinor : null;
  if (!amountMinor || amountMinor <= 0) return err('Amount must be positive', 400, origin);
  const paidBy = String(body.paidByMemberId || '');
  if (!memberIds.has(paidBy)) return err('Payer must be a group member', 400, origin);
  const description = String(body.description || '').trim(); if (!description) return err('Description is required', 400, origin);
  const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : 'Other';
  const date = String(body.date || '').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Date must be YYYY-MM-DD', 400, origin);
  const splitType = body.splitType || 'equal';
  const participants: string[] = Array.isArray(body.participants) ? body.participants.filter((id:string)=>memberIds.has(id)) : [];
  if (participants.length === 0) return err('At least one split participant is required', 400, origin);
  let amounts: number[];
  if (splitType === 'equal') amounts = equalSplit(amountMinor, participants.length, participants.indexOf(paidBy));
  else if (splitType === 'percent') {
    const percents = (body.percents || []) as number[];
    if (percents.length !== participants.length || Math.abs(percents.reduce((a:number,b:number)=>a+b,0) - 100) > 0.001) return err('Percentages must cover all participants and sum to 100', 400, origin);
    amounts = percentSplit(amountMinor, percents);
  } else if (splitType === 'exact') {
    const exact = (body.exactAmounts || []) as number[];
    if (exact.length !== participants.length || exact.reduce((a:number,b:number)=>a+b,0) !== amountMinor) return err('Exact amounts must cover all participants and sum to the total', 400, origin);
    amounts = exact;
  } else return err('Split type must be equal, exact or percent (shares are not supported)', 400, origin);
  if (amounts.reduce((a,b)=>a+b,0) !== amountMinor) return err('Splits do not sum to the total', 400, origin);
  const eid = uid();
  // MEDIUM FIX, Nov 2026: splits were inserted one sequential D1 write
  // per participant (5 participants = 5 write round-trips), and the
  // expense + splits + activity were not atomic — a mid-loop failure
  // left an expense with partial splits. One batch() call does all of
  // them in a single transaction: one round-trip, all-or-nothing.
  await env.DB.batch([
    env.DB.prepare('INSERT INTO expenses (id,group_id,paid_by_member_id,description,amount_minor,currency,category,date,created_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(eid, g.id, paidBy, description, amountMinor, currency, category, date, nowIso(), user.id),
    ...participants.map((pid, i) => env.DB.prepare('INSERT INTO expense_splits (id,expense_id,member_id,amount_minor) VALUES (?,?,?,?)').bind(uid(), eid, pid, amounts[i])),
    activityStmt(env, g.id, myMember?.id || null, user.name, 'expense_added', amountMinor, currency, description),
  ]);
  return json(await groupDetail(env, g, user.id), 201, origin);
}

// EDIT EXPENSE, Nov 2026: any member may edit any expense (same rule
// as delete — payments are not linked to specific expenses and balances
// are derived, so editing cannot break a settlement linkage; the audit
// trail is the safety net). Validation mirrors addExpense exactly. The
// expense row is UPDATED in place (no updated_at column — the activity
// log is the audit trail), its splits are replaced wholesale, and an
// expense_edited event is logged with the new description plus old ->
// new amount when the amount changed. One batch() = one transaction.
async function editExpense(env: Env, g: Row, user: Row, e: Row, body: any, origin: string | null = null) {
  const members = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=?').bind(g.id).all<Row>();
  const memberIds = new Set((members.results||[]).map(m=>m.id));
  const myMember = (members.results||[]).find((m:any)=>m.user_id===user.id);
  const currency = String(body.currency || g.default_currency);
  if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency', 400, origin);
  const amountMinor = typeof body.amountMinor === 'number' ? body.amountMinor : null;
  if (!amountMinor || amountMinor <= 0) return err('Amount must be positive', 400, origin);
  const paidBy = String(body.paidByMemberId || '');
  if (!memberIds.has(paidBy)) return err('Payer must be a group member', 400, origin);
  const description = String(body.description || '').trim(); if (!description) return err('Description is required', 400, origin);
  const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : 'Other';
  const date = String(body.date || '').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Date must be YYYY-MM-DD', 400, origin);
  const splitType = body.splitType || 'equal';
  const participants: string[] = Array.isArray(body.participants) ? body.participants.filter((id:string)=>memberIds.has(id)) : [];
  if (participants.length === 0) return err('At least one split participant is required', 400, origin);
  let amounts: number[];
  if (splitType === 'equal') amounts = equalSplit(amountMinor, participants.length, participants.indexOf(paidBy));
  else if (splitType === 'percent') {
    const percents = (body.percents || []) as number[];
    if (percents.length !== participants.length || Math.abs(percents.reduce((a:number,b:number)=>a+b,0) - 100) > 0.001) return err('Percentages must cover all participants and sum to 100', 400, origin);
    amounts = percentSplit(amountMinor, percents);
  } else if (splitType === 'exact') {
    const exact = (body.exactAmounts || []) as number[];
    if (exact.length !== participants.length || exact.reduce((a:number,b:number)=>a+b,0) !== amountMinor) return err('Exact amounts must cover all participants and sum to the total', 400, origin);
    amounts = exact;
  } else return err('Split type must be equal, exact or percent (shares are not supported)', 400, origin);
  if (amounts.reduce((a,b)=>a+b,0) !== amountMinor) return err('Splits do not sum to the total', 400, origin);
  const amountChanged = amountMinor !== e.amount_minor || currency !== e.currency;
  const detail = amountChanged ? `${description} \u00b7 ${formatAmount(e.amount_minor, e.currency)} \u2192 ${formatAmount(amountMinor, currency)}` : description;
  await env.DB.batch([
    env.DB.prepare('UPDATE expenses SET paid_by_member_id=?, description=?, amount_minor=?, currency=?, category=?, date=? WHERE id=?')
      .bind(paidBy, description, amountMinor, currency, category, date, e.id),
    env.DB.prepare('DELETE FROM expense_splits WHERE expense_id=?').bind(e.id),
    ...participants.map((pid, i) => env.DB.prepare('INSERT INTO expense_splits (id,expense_id,member_id,amount_minor) VALUES (?,?,?,?)').bind(uid(), e.id, pid, amounts[i])),
    activityStmt(env, g.id, myMember?.id || null, user.name, 'expense_edited', amountMinor, currency, detail),
  ]);
  return json(await groupDetail(env, g, user.id), 200, origin);
}

async function recordPayment(env: Env, g: Row, user: Row, body: any, origin: string | null = null) {
  const members = await env.DB.prepare('SELECT gm.*, u.name, (LENGTH(u.password_hash) > 0) AS hasAccount FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id=?').bind(g.id).all<Row>();
  const ids = new Set((members.results||[]).map(m=>m.id));
  const from = String(body.fromMemberId||''); const to = String(body.toMemberId||'');
  const currency = String(body.currency||''); const amountMinor = body.amountMinor;
  if (!ids.has(from) || !ids.has(to) || from===to) return err('Payment must be between two different group members', 400, origin);
  // SETTLE AUTH, Nov 2026: only the creditor (the person owed, toMemberId)
  // may record a payment — not the debtor, and not an uninvolved member.
  // This is the server enforcement; hiding/disabling the button in the
  // frontend alone would not stop a direct API call. Exception: if the
  // creditor is a placeholder (no password yet), they cannot log in to
  // confirm at all, so the debtor may record instead — the activity log
  // still records who did it (created_by_user_id).
  const myMemberRow = (members.results || []).find((m: any) => m.user_id === user.id);
  const toMemberRow = (members.results || []).find((m: any) => m.id === to);
  const creditorIsPlaceholder = toMemberRow && !toMemberRow.hasAccount;
  const allowed = myMemberRow && (myMemberRow.id === to || (creditorIsPlaceholder && myMemberRow.id === from));
  if (!allowed) return err('Only the person owed can record this payment (or the debtor, if the person owed has no account yet)', 403, origin);
  if (!amountMinor || amountMinor <= 0) return err('Amount must be positive', 400, origin);
  const date = String(body.date||'').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Date must be YYYY-MM-DD', 400, origin);
  // Guard: payment must not exceed the outstanding simplified suggestion for that pair+currency at this moment (partial allowed, overpayment rejected).
  // MEDIUM FIX, Nov 2026: this used to call full groupDetail() just to
  // check the suggestion — paying for activity, hasAnyExpense and
  // category work that the check never uses — then call groupDetail()
  // AGAIN to return the result. Now the check runs on groupSummary
  // only (balances + simplify, in memory), and only the return call
  // is a full groupDetail. The from/to names come from the members
  // query already made above, not from a detail object.
  const summary = await groupSummary(env, g.id, user.id);
  const byCur = new Map<string, {memberId:string; balance:number}[]>();
  for (const b of summary.balances) { if (!byCur.has(b.currency)) byCur.set(b.currency, []); byCur.get(b.currency)!.push({memberId:b.memberId, balance:b.balance}); }
  let sug: any = null;
  for (const [cur, bals] of byCur) for (const sg of simplify(bals, cur)) if (sg.fromMemberId===from && sg.toMemberId===to && sg.currency===currency) sug = sg;
  if (!sug || amountMinor > sug.amountMinor) return err('Payment exceeds the outstanding amount for this pair and currency', 400, origin);
  const pid = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO payments (id,group_id,from_member_id,to_member_id,amount_minor,currency,date,created_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(pid, g.id, from, to, amountMinor, currency, date, nowIso(), user.id),
    activityStmt(env, g.id, myMemberRow?.id || null, user.name, 'payment_recorded', amountMinor, currency, `${summary.members.find((m:any)=>m.id===from)?.name} -> ${summary.members.find((m:any)=>m.id===to)?.name}`, from, to),
  ]);
  return json(await groupDetail(env, g, user.id), 201, origin);
}
