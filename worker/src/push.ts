// Push notifications (Web Push), Nov 2026.
// Sends encrypted Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) to a
// user's subscribed devices, using Web Crypto via
// @block65/webcrypto-web-push (v2: aes128gcm + the draft-02 `vapid`
// auth form, which FCM and Apple both accept). The VAPID private key
// lives in the VAPID_PRIVATE_KEY Worker secret (runtime secret, never
// in the repo); the public key is a public constant. Sending runs after
// the response via ctx.waitUntil, so a slow push service never delays
// the API call. A failure for one device never blocks the others, and
// a 404/410 (subscription gone) deletes that row so we stop sending
// to a dead endpoint.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { Env } from './index';

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

// VAPID subject: identifies this application server to the push service.
// A URL (not a personal email) so no one's address is exposed.
export const VAPID_SUBJECT = 'https://deusy.wk-io.workers.dev';
// VAPID public key (base64url, 65-byte uncompressed P-256 point).
// PUBLIC by design — the browser uses it to subscribe. The matching
// private key is the VAPID_PRIVATE_KEY Worker secret.
export const VAPID_PUBLIC_KEY = 'BDpvEhNXtb2WZt6aaAOiac_uhut9H0006cTKpmspwcWWmSrsVeZAmF-SjIAzWkBLHoErrNG24FYXgnAlrF7HxAg';

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

async function sendToSubscription(env: Env, sub: Sub, payload: PushPayload): Promise<void> {
  if (!env.VAPID_PRIVATE_KEY) return; // push not configured — silent no-op
  const vapid = { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const subscription = { endpoint: sub.endpoint, expirationTime: null, keys: sub.keys };
  let req: { headers: Record<string, string>; method: string; body: Uint8Array };
  try {
    req = await buildPushPayload({ data: payload }, subscription, vapid) as any;
  } catch {
    return; // bad subscription data — drop it silently
  }
  let res: Response;
  try {
    res = await fetch(subscription.endpoint, { method: req.method, headers: req.headers as any, body: req.body as any });
  } catch {
    return; // push service unreachable — drop silently, retry next event
  }
  // 404/410 = the subscription is gone (user uninstalled / revoked).
  // Delete it so we stop sending to a dead endpoint.
  if (res.status === 404 || res.status === 410) {
    try { await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run(); } catch { /* ignore */ }
  }
}

// Notify every subscriber of the given users (each user may have several
// devices). A failure for one device never blocks the others.
export async function notifyUsers(env: Env, userIds: string[], payload: PushPayload): Promise<void> {
  if (!env.VAPID_PRIVATE_KEY || userIds.length === 0) return;
  const uniq = [...new Set(userIds)];
  const placeholders = uniq.map(() => '?').join(',');
  let rows: any[] = [];
  try {
    const r = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`).bind(...uniq).all();
    rows = (r as any).results || [];
  } catch { return; }
  await Promise.all(rows.map((row: any) => sendToSubscription(env, { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload)));
}

// Notify all current members of a group except the actor. "Only for
// those groups user is in": membership is read live here, so someone
// who left (or was never in) the group is never notified, and a user
// who is not a member of this group gets nothing.
export async function notifyGroupMembers(env: Env, groupId: string, actorUserId: string, payload: PushPayload): Promise<void> {
  let members: any[] = [];
  try {
    const r = await env.DB.prepare('SELECT user_id FROM group_members WHERE group_id=?').bind(groupId).all();
    members = (r as any).results || [];
  } catch { return; }
  const userIds = members.map((m: any) => m.user_id).filter((id: string) => id && id !== actorUserId);
  await notifyUsers(env, userIds, payload);
}
