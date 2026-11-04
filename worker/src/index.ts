// Deploy trigger: 2026-11-04 — no logic change, only to trigger a Workers Builds deployment
// Don't Ngiao — Cloudflare Worker API (TypeScript, D1 SQLite, no external deps)
// All money is integer minor units; zero-decimal currencies in whole units.
// Balances/suggestions are per currency, never converted. Activity log is append-only.
import { CURRENCIES, CATEGORIES, equalSplit, percentSplit, balanceOf, simplify, formatAmount } from './logic';

export interface Env { DB: D1Database; }
type Row = Record<string, any>;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const nowIso = () => new Date().toISOString();
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' } });
const err = (message: string, status = 400) => json({ error: message }, status);

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
  const s = await env.DB.prepare('SELECT user_id FROM sessions WHERE token=?').bind(tok).first<Row>();
  if (!s) return null;
  return env.DB.prepare('SELECT id, name, email, created_at FROM users WHERE id=?').bind(s.user_id).first<Row>();
}
async function myMember(env: Env, groupId: string, userId: string): Promise<Row | null> {
  return env.DB.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?').bind(groupId, userId).first<Row>();
}
async function requireMember(req: Request, env: Env, groupId: string): Promise<{ user: Row; member: Row } | Response> {
  const user = await authUser(req, env);
  if (!user) return err('Unauthorized', 401);
  const member = await myMember(env, groupId, user.id);
  if (!member) return err('Not a group member', 403);
  return { user, member };
}
async function logActivity(env: Env, groupId: string, actor: string, type: string, amountMinor: number | null, currency: string | null, detail: string) {
  await env.DB.prepare('INSERT INTO activity_log (id, group_id, actor_name, type, amount_minor, currency, detail, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uid(), groupId, actor, type, amountMinor, currency, detail, nowIso()).run();
}
async function claimPlaceholders(env: Env, user: Row) {
  await env.DB.prepare('UPDATE group_members SET user_id=? WHERE email=? AND user_id IS NULL').bind(user.id, user.email).run();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' } });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    let body: any = {};
    if (req.method !== 'GET') { try { body = await req.json(); } catch { body = {}; } }

    // ---- Auth ----
    if (path === '/api/auth/register' && req.method === 'POST') {
      const { name, email, password } = body;
      if (!name || !email || !password || String(password).length < 6) return err('Name, email and a password of at least 6 characters are required');
      const salt = newSalt(); const hash = await hashPassword(password, salt);
      const id = uid();
      try { await env.DB.prepare('INSERT INTO users (id,name,email,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id, name, email.toLowerCase(), salt, hash, nowIso()).run(); }
      catch { return err('Email already registered', 409); }
      const user = { id, name, email: email.toLowerCase() };
      await claimPlaceholders(env, user as Row);
      const token = uid();
      await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').bind(token, id, nowIso()).run();
      return json({ user, token });
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = body;
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(String(email||'').toLowerCase()).first<Row>();
      if (!u) return err('Invalid email or password', 401);
      if ((await hashPassword(password, u.password_salt)) !== u.password_hash) return err('Invalid email or password', 401);
      const user = { id: u.id, name: u.name, email: u.email };
      await claimPlaceholders(env, user as Row);
      const token = uid();
      await env.DB.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').bind(token, u.id, nowIso()).run();
      return json({ user, token });
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run();
      return json({ ok: true });
    }
    if (path === '/api/me' && req.method === 'GET') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401); return json({ user });
    }
    if (path === '/api/me' && req.method === 'PATCH') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401);
      if (!body.name) return err('Name is required');
      await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(body.name, user.id).run();
      return json({ user: { ...user, name: body.name } });
    }

    // ---- Groups list / create ----
    if (path === '/api/groups' && req.method === 'GET') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401);
      const memberships = await env.DB.prepare('SELECT group_id FROM group_members WHERE user_id=?').bind(user.id).all<Row>();
      const active: any[] = []; const archived: any[] = []; const totals: Record<string, number> = {};
      for (const m of memberships.results || []) {
        const g = await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(m.group_id).first<Row>();
        if (!g) continue;
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
          id: g.id, name: g.name, defaultCurrency: g.default_currency, isArchived: !!g.is_archived, balances: detail.balances,
          memberCount: (detail.members || []).length, expenseCount: (detail.expenses || []).length,
          spent: Object.entries(spentMap).map(([currency, amount]) => ({ currency, amount })),
          myBalances: myBalances.map((b: any) => ({ currency: b.currency, balance: b.balance })),
        };
        if (g.is_archived) archived.push(item);
        else { active.push(item); for (const b of myBalances) totals[b.currency] = (totals[b.currency] || 0) + b.balance; }
      }
      return json({ active, archived, totals: Object.entries(totals).map(([currency, balance]) => ({ currency, balance })) });
    }
    if (path === '/api/groups' && req.method === 'POST') {
      const user = await authUser(req, env); if (!user) return err('Unauthorized', 401);
      const name = String(body.name || '').trim(); const currency = String(body.defaultCurrency || 'SGD');
      if (!name) return err('Group name is required');
      if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency');
      const gid = uid();
      await env.DB.prepare('INSERT INTO groups (id,name,default_currency,is_archived,created_at,created_by_user_id) VALUES (?,?,?,?,?,?)').bind(gid, name, currency, 0, nowIso(), user.id).run();
      await env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,name,email,created_at) VALUES (?,?,?,?,?,?)').bind(uid(), gid, user.id, user.name, user.email, nowIso()).run();
      await logActivity(env, gid, user.name, 'group_created', null, null, name);
      return json({ id: gid, name, defaultCurrency: currency, isArchived: false }, 201);
    }

    // ---- Group-scoped routes ----
    const gm = path.match(/^\/api\/groups\/([^/]+)(?:\/(.*))?$/);
    if (gm) {
      const groupId = decodeURIComponent(gm[1]); const sub = gm[2] || '';
      const g = await env.DB.prepare('SELECT * FROM groups WHERE id=?').bind(groupId).first<Row>();
      if (!g) return err('Group not found', 404);
      const auth = await requireMember(req, env, groupId);
      if (auth instanceof Response) return auth;
      const { user, member } = auth;

      if (sub === '' && req.method === 'GET') return json(await groupDetail(env, g, user.id));
      if (sub === '' && req.method === 'PATCH') {
        const name = body.name !== undefined ? String(body.name).trim() : g.name;
        const currency = body.defaultCurrency !== undefined ? String(body.defaultCurrency) : g.default_currency;
        if (!name) return err('Group name is required');
        if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency');
        await env.DB.prepare('UPDATE groups SET name=?, default_currency=? WHERE id=?').bind(name, currency, groupId).run();
        if (name !== g.name) await logActivity(env, groupId, user.name, 'group_renamed', null, null, `${g.name} -> ${name}`);
        if (currency !== g.default_currency) await logActivity(env, groupId, user.name, 'group_currency_changed', null, currency, `Default currency ${g.default_currency} -> ${currency} (new expenses only)`);
        return json(await groupDetail(env, { ...g, name, default_currency: currency }, user.id));
      }
      if (sub === 'archive' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
        await logActivity(env, groupId, user.name, 'group_archived', null, null, g.name);
        return json({ ok: true, isArchived: true });
      }
      if (sub === 'restore' && req.method === 'POST') {
        await env.DB.prepare('UPDATE groups SET is_archived=0 WHERE id=?').bind(groupId).run();
        await logActivity(env, groupId, user.name, 'group_restored', null, null, g.name);
        return json({ ok: true, isArchived: false });
      }
      if (sub === 'leave' && req.method === 'POST') {
        const blocked = await hasAnyExpense(env, groupId, member.id);
        if (blocked) return err("You can't leave this group because you have an expense here, as payer or as a split participant, even if balances are settled.", 403);
        await env.DB.prepare('DELETE FROM group_members WHERE id=?').bind(member.id).run();
        await logActivity(env, groupId, user.name, 'member_left', null, null, user.name);
        const remaining = await env.DB.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id=?').bind(groupId).first<Row>();
        if (Number(remaining?.c || 0) === 0) {
          const exps = await env.DB.prepare('SELECT COUNT(*) AS c FROM expenses WHERE group_id=?').bind(groupId).first<Row>();
          const pays = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=?').bind(groupId).first<Row>();
          if (Number(exps?.c || 0) === 0 && Number(pays?.c || 0) === 0) {
            await env.DB.prepare('DELETE FROM groups WHERE id=?').bind(groupId).run();
            return json({ ok: true, groupDeleted: true });
          }
          await env.DB.prepare('UPDATE groups SET is_archived=1 WHERE id=?').bind(groupId).run();
          await logActivity(env, groupId, user.name, 'group_archived', null, null, 'Last member left, data preserved');
          return json({ ok: true, groupArchived: true });
        }
        return json({ ok: true });
      }
      if (sub === 'members' && req.method === 'POST') {
        const name = String(body.name || '').trim(); const email = body.email ? String(body.email).toLowerCase() : null;
        if (!name) return err('Member name is required');
        let userId: string | null = null;
        if (email) { const u = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first<Row>(); if (u) userId = u.id; }
        try { await env.DB.prepare('INSERT INTO group_members (id,group_id,user_id,name,email,created_at) VALUES (?,?,?,?,?,?)').bind(uid(), groupId, userId, name, email, nowIso()).run(); }
        catch { return err('That email is already a member of this group', 409); }
        await logActivity(env, groupId, user.name, 'member_added', null, null, name);
        return json(await groupDetail(env, g, user.id), 201);
      }
      const rm = sub.match(/^members\/([^/]+)$/);
      if (rm && req.method === 'DELETE') {
        const targetId = decodeURIComponent(rm[1]);
        const target = await env.DB.prepare('SELECT * FROM group_members WHERE id=? AND group_id=?').bind(targetId, groupId).first<Row>();
        if (!target) return err('Member not found', 404);
        if (await hasAnyExpense(env, groupId, targetId)) return err('Member has expenses and cannot be removed', 403);
        const payCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM payments WHERE group_id=? AND (from_member_id=? OR to_member_id=?)').bind(groupId, targetId, targetId).first<Row>();
        if (Number(payCount?.c || 0) > 0) return err('Member has payments and cannot be removed', 403);
        const summary = await groupSummary(env, groupId, user.id);
        const bal = summary.balances.find(b => b.memberId === targetId);
        if (bal && bal.balance !== 0) return err('Member must have a zero balance to be removed', 403);
        await env.DB.prepare('DELETE FROM group_members WHERE id=?').bind(targetId).run();
        await logActivity(env, groupId, user.name, 'member_removed', null, null, target.name);
        return json(await groupDetail(env, g, user.id));
      }
      if (sub === 'expenses' && req.method === 'POST') return addExpense(env, g, user, body);
      const de = sub.match(/^expenses\/([^/]+)$/);
      if (de && req.method === 'DELETE') {
        const e = await env.DB.prepare('SELECT * FROM expenses WHERE id=? AND group_id=?').bind(decodeURIComponent(de[1]), groupId).first<Row>();
        if (!e) return err('Expense not found', 404);
        await env.DB.prepare('DELETE FROM expenses WHERE id=?').bind(e.id).run();
        await logActivity(env, groupId, user.name, 'expense_deleted', e.amount_minor, e.currency, e.description);
        return json(await groupDetail(env, g, user.id));
      }
      if (sub === 'payments' && req.method === 'POST') return recordPayment(env, g, user, body);
      const dp = sub.match(/^payments\/([^/]+)$/);
      if (dp && req.method === 'DELETE') {
        const p = await env.DB.prepare('SELECT * FROM payments WHERE id=? AND group_id=?').bind(decodeURIComponent(dp[1]), groupId).first<Row>();
        if (!p) return err('Payment not found', 404);
        await env.DB.prepare('DELETE FROM payments WHERE id=?').bind(p.id).run();
        await logActivity(env, groupId, user.name, 'payment_deleted', p.amount_minor, p.currency, `${p.from_member_id} -> ${p.to_member_id}`);
        return json(await groupDetail(env, g, user.id));
      }
      return err('Not found', 404);
    }
    return err('Not found', 404);
  }
};

async function hasAnyExpense(env: Env, groupId: string, memberId: string): Promise<boolean> {
  const paid = await env.DB.prepare('SELECT COUNT(*) AS c FROM expenses WHERE group_id=? AND paid_by_member_id=?').bind(groupId, memberId).first<Row>();
  if (Number(paid?.c || 0) > 0) return true;
  const split = await env.DB.prepare('SELECT COUNT(*) AS c FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE e.group_id=? AND s.member_id=?').bind(groupId, memberId).first<Row>();
  return Number(split?.c || 0) > 0;
}

async function groupSummary(env: Env, groupId: string, _userId: string) {
  const members = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=? ORDER BY created_at').bind(groupId).all<Row>();
  const expenses = await env.DB.prepare('SELECT * FROM expenses WHERE group_id=? ORDER BY date DESC, created_at DESC').bind(groupId).all<Row>();
  const payments = await env.DB.prepare('SELECT * FROM payments WHERE group_id=? ORDER BY date DESC, created_at DESC').bind(groupId).all<Row>();
  const currencies = new Set<string>();
  (expenses.results||[]).forEach(e=>currencies.add(e.currency)); (payments.results||[]).forEach(p=>currencies.add(p.currency));
  const balances: any[] = [];
  for (const m of members.results || []) {
    for (const cur of currencies) {
      let paid=0, share=0, sent=0, received=0;
      for (const e of expenses.results||[]) if (e.currency===cur) {
        if (e.paid_by_member_id===m.id) paid += e.amount_minor;
        const splits = await env.DB.prepare('SELECT * FROM expense_splits WHERE expense_id=?').bind(e.id).all<Row>();
        for (const s of splits.results||[]) if (s.member_id===m.id) share += s.amount_minor;
      }
      for (const p of payments.results||[]) if (p.currency===cur) {
        if (p.from_member_id===m.id) sent += p.amount_minor;
        if (p.to_member_id===m.id) received += p.amount_minor;
      }
      const bal = balanceOf({memberId:m.id, paid, share, sent, received});
      if (paid||share||sent||received||bal!==0) balances.push({ memberId: m.id, memberName: m.name, currency: cur, balance: bal, paid, share });
    }
  }
  return { members: members.results||[], expenses: expenses.results||[], payments: payments.results||[], balances };
}

async function groupDetail(env: Env, g: Row, userId: string) {
  const s = await groupSummary(env, g.id, userId);
  const myMemberRow = s.members.find(m=>m.user_id===userId) || null;
  const splitsByExpense: Record<string, Row[]> = {};
  for (const e of s.expenses) {
    const sp = await env.DB.prepare('SELECT * FROM expense_splits WHERE expense_id=?').bind(e.id).all<Row>();
    splitsByExpense[e.id] = sp.results||[];
  }
  const activity = await env.DB.prepare('SELECT * FROM activity_log WHERE group_id=? ORDER BY created_at DESC LIMIT 200').bind(g.id).all<Row>();
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
    const cat = e.category || 'Uncategorized';
    catGroup[e.currency] = catGroup[e.currency] || {}; catGroup[e.currency][cat] = (catGroup[e.currency][cat]||0) + e.amount_minor;
    if (myMemberRow) { catMine[e.currency] = catMine[e.currency] || {}; for (const sp of splitsByExpense[e.id]||[]) if (sp.member_id===myMemberRow.id) catMine[e.currency][cat] = (catMine[e.currency][cat]||0) + sp.amount_minor; }
  }
  const expensesOut = s.expenses.map(e=>({ ...e, splits: splitsByExpense[e.id]||[], payerName: s.members.find(m=>m.id===e.paid_by_member_id)?.name, display: formatAmount(e.amount_minor, e.currency) }));
  const paymentsOut = s.payments.map(p=>({ ...p, fromName: s.members.find(m=>m.id===p.from_member_id)?.name, toName: s.members.find(m=>m.id===p.to_member_id)?.name, display: formatAmount(p.amount_minor, p.currency) }));
  const balancesOut = s.balances.map(b=>({ ...b, display: formatAmount(b.balance, b.currency) }));
  return {
    id: g.id, name: g.name, defaultCurrency: g.default_currency, isArchived: !!g.is_archived,
    members: s.members, expenses: expensesOut, payments: paymentsOut, balances: balancesOut, suggestions,
    categoryGroup: catGroup, categoryMine: catMine,
    activity: activity.results||[],
    myMemberId: myMemberRow?.id || null,
    myHasExpense: myMemberRow ? await hasAnyExpense(env, g.id, myMemberRow.id) : false,
  };
}

async function addExpense(env: Env, g: Row, user: Row, body: any) {
  const members = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=?').bind(g.id).all<Row>();
  const memberIds = new Set((members.results||[]).map(m=>m.id));
  const currency = String(body.currency || g.default_currency);
  if (!(CURRENCIES as readonly string[]).includes(currency)) return err('Invalid currency');
  const amountMinor = typeof body.amountMinor === 'number' ? body.amountMinor : null;
  if (!amountMinor || amountMinor <= 0) return err('Amount must be positive');
  const paidBy = String(body.paidByMemberId || '');
  if (!memberIds.has(paidBy)) return err('Payer must be a group member');
  const description = String(body.description || '').trim(); if (!description) return err('Description is required');
  const category = (CATEGORIES as readonly string[]).includes(body.category) ? body.category : 'Uncategorized';
  const date = String(body.date || '').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Date must be YYYY-MM-DD');
  const splitType = body.splitType || 'equal';
  const participants: string[] = Array.isArray(body.participants) ? body.participants.filter((id:string)=>memberIds.has(id)) : [];
  if (participants.length === 0) return err('At least one split participant is required');
  let amounts: number[];
  if (splitType === 'equal') amounts = equalSplit(amountMinor, participants.length);
  else if (splitType === 'percent') {
    const percents = (body.percents || []) as number[];
    if (percents.length !== participants.length || Math.abs(percents.reduce((a:number,b:number)=>a+b,0) - 100) > 0.001) return err('Percentages must cover all participants and sum to 100');
    amounts = percentSplit(amountMinor, percents);
  } else if (splitType === 'exact') {
    const exact = (body.exactAmounts || []) as number[];
    if (exact.length !== participants.length || exact.reduce((a:number,b:number)=>a+b,0) !== amountMinor) return err('Exact amounts must cover all participants and sum to the total');
    amounts = exact;
  } else return err('Split type must be equal, exact or percent (shares are not supported)');
  if (amounts.reduce((a,b)=>a+b,0) !== amountMinor) return err('Splits do not sum to the total');
  const eid = uid();
  await env.DB.prepare('INSERT INTO expenses (id,group_id,paid_by_member_id,description,amount_minor,currency,category,date,created_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(eid, g.id, paidBy, description, amountMinor, currency, category, date, nowIso(), user.id).run();
  for (let i=0;i<participants.length;i++) await env.DB.prepare('INSERT INTO expense_splits (id,expense_id,member_id,amount_minor) VALUES (?,?,?,?)').bind(uid(), eid, participants[i], amounts[i]).run();
  await logActivity(env, g.id, user.name, 'expense_added', amountMinor, currency, description);
  return json(await groupDetail(env, g, user.id), 201);
}

async function recordPayment(env: Env, g: Row, user: Row, body: any) {
  const members = await env.DB.prepare('SELECT * FROM group_members WHERE group_id=?').bind(g.id).all<Row>();
  const ids = new Set((members.results||[]).map(m=>m.id));
  const from = String(body.fromMemberId||''); const to = String(body.toMemberId||'');
  const currency = String(body.currency||''); const amountMinor = body.amountMinor;
  if (!ids.has(from) || !ids.has(to) || from===to) return err('Payment must be between two different group members');
  if (!amountMinor || amountMinor <= 0) return err('Amount must be positive');
  const date = String(body.date||'').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Date must be YYYY-MM-DD');
  // Guard: payment must not exceed the outstanding simplified suggestion for that pair+currency at this moment (partial allowed, overpayment rejected).
  const detail = await groupDetail(env, g, user.id);
  const sug = detail.suggestions.find((s:any)=>s.fromMemberId===from && s.toMemberId===to && s.currency===currency);
  if (!sug || amountMinor > sug.amountMinor) return err('Payment exceeds the outstanding amount for this pair and currency');
  const pid = uid();
  await env.DB.prepare('INSERT INTO payments (id,group_id,from_member_id,to_member_id,amount_minor,currency,date,created_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(pid, g.id, from, to, amountMinor, currency, date, nowIso(), user.id).run();
  await logActivity(env, g.id, user.name, 'payment_recorded', amountMinor, currency, `${detail.members.find((m:any)=>m.id===from)?.name} -> ${detail.members.find((m:any)=>m.id===to)?.name}`);
  return json(await groupDetail(env, g, user.id), 201);
}
